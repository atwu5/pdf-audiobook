import { create } from 'zustand';
import type { ChapterInfo, ParsedBook } from '../types';
import { db } from '../db/database';
import { clamp } from '../utils/format';
import { EngineState, SpeechEngine, isSpeechSupported } from '../tts/speechEngine';
import { toast, useUI } from './uiStore';
import { useSettings } from './settingsStore';

export const engine = new SpeechEngine();

export interface LoadedChapter extends ChapterInfo {}

interface PlayerState {
  bookId: string | null;
  bookName: string;
  loaded: boolean;
  sentences: string[];
  /** 句子 → 段落索引 */
  sentencePara: number[];
  /** 段落 → 该段首句索引 */
  paraStartSentence: number[];
  /** 段落 → 章节索引 */
  paraChapter: number[];
  chapters: LoadedChapter[];
  total: number;
  currentIdx: number;
  state: EngineState;
  rate: number;
  voiceURI: string;
  /** 实际正在出声的音色（新语音任务启动时更新）；与 voiceURI 不一致时提示可强制生效 */
  appliedVoiceURI: string;
  autoScroll: boolean;

  loadBook(args: {
    bookId: string;
    bookName: string;
    parsed: ParsedBook;
    startIdx: number;
    rate: number;
    voiceURI: string;
    autoScroll: boolean;
  }): void;
  reset(): void;
  togglePlay(): void;
  playAt(idx: number): void;
  stepSentence(dir: 1 | -1): void;
  stepPara(dir: 1 | -1): void;
  setRate(rate: number): void;
  setVoice(voice: SpeechSynthesisVoice | null, uri: string): void;
  forceApplyVoice(): void;
  previewVoice(voice: SpeechSynthesisVoice): void;
  setAutoScroll(on: boolean): void;
}

/** 防抖持久化：朗读位置变化 700ms 后落库；暂停/切页/隐藏时立即落库 */
let persistTimer: number | null = null;
export function schedulePersist() {
  if (persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, 700);
}

export async function persistNow(): Promise<void> {
  const st = usePlayer.getState();
  if (!st.bookId || !st.loaded) return;
  const idx = clamp(st.currentIdx, 0, Math.max(st.total - 1, 0));
  const paraIdx = st.sentencePara[idx] ?? 0;
  const chapterIdx = st.paraChapter[paraIdx] ?? 0;
  const percent = st.total ? Math.round(((idx + 1) / st.total) * 1000) / 10 : 0;
  const rec = {
    bookId: st.bookId,
    sentenceIdx: idx,
    paraIdx,
    chapterIdx,
    percent,
    voiceURI: st.voiceURI || undefined,
    rate: st.rate,
    autoScroll: st.autoScroll,
    updatedAt: Date.now(),
  };
  try {
    await db.progress.put(rec);
    await db.books.update(st.bookId, { lastReadAt: Date.now() });
  } catch (e) {
    console.warn('阅读进度保存失败', e);
    useUI.getState().toast('阅读进度保存失败：浏览器存储可能已满或被禁用', 'error');
  }
}

export const usePlayer = create<PlayerState>()((set, get) => ({
  bookId: null,
  bookName: '',
  loaded: false,
  sentences: [],
  sentencePara: [],
  paraStartSentence: [],
  paraChapter: [],
  chapters: [],
  total: 0,
  currentIdx: 0,
  state: 'idle',
  rate: 1,
  voiceURI: '',
  appliedVoiceURI: '',
  autoScroll: true,

  loadBook: ({ bookId, bookName, parsed, startIdx, rate, voiceURI, autoScroll }) => {
    engine.stop();
    engine.rate = rate;
    const sentences = parsed.sentences.map((s) => s.text);
    const sentencePara = parsed.sentences.map((s) => s.paraIdx);
    const paraStartSentence = new Array<number>(parsed.paragraphs.length).fill(-1);
    parsed.sentences.forEach((s) => {
      if (paraStartSentence[s.paraIdx] < 0) paraStartSentence[s.paraIdx] = s.idx;
    });
    const paraChapter = parsed.paragraphs.map((p) => p.chapterIdx);
    engine.load(sentences, startIdx);
    set({
      bookId,
      bookName,
      loaded: true,
      sentences,
      sentencePara,
      paraStartSentence,
      paraChapter,
      chapters: parsed.chapters,
      total: sentences.length,
      currentIdx: clamp(startIdx, 0, Math.max(sentences.length - 1, 0)),
      state: 'idle',
      rate,
      voiceURI,
      autoScroll,
    });
    schedulePersist();
  },

  reset: () => {
    engine.stop();
    set({
      bookId: null,
      bookName: '',
      loaded: false,
      sentences: [],
      sentencePara: [],
      paraStartSentence: [],
      paraChapter: [],
      chapters: [],
      total: 0,
      currentIdx: 0,
      state: 'idle',
      appliedVoiceURI: '',
    });
  },

  togglePlay: () => {
    if (!isSpeechSupported()) {
      toast('当前浏览器不支持语音合成（SpeechSynthesis）', 'error');
      return;
    }
    if (get().state === 'playing') engine.pause();
    else engine.play();
  },

  playAt: (idx) => {
    engine.jumpTo(idx);
    if (engine.state !== 'playing') engine.play(idx);
  },

  stepSentence: (dir) => {
    const { currentIdx, total } = get();
    const target = clamp(currentIdx + dir, 0, Math.max(total - 1, 0));
    if (target === currentIdx) return;
    engine.jumpTo(target);
    if (engine.state !== 'playing') schedulePersist();
  },

  stepPara: (dir) => {
    const { currentIdx, sentencePara, paraStartSentence } = get();
    const paraIdx = sentencePara[currentIdx] ?? 0;
    const target = clamp(paraIdx + dir, 0, Math.max(paraStartSentence.length - 1, 0));
    const targetIdx = paraStartSentence[target];
    if (targetIdx === undefined || targetIdx === currentIdx) return;
    engine.jumpTo(targetIdx);
    if (engine.state !== 'playing') schedulePersist();
  },

  setRate: (rate) => {
    engine.setRate(rate);
    set({ rate });
    useSettings.getState().update({ rate });
    schedulePersist();
  },

  setVoice: (voice, uri) => {
    engine.setVoice(voice);
    set({ voiceURI: uri });
    useSettings.getState().update({ voiceURI: uri });
    schedulePersist();
  },

  forceApplyVoice: () => {
    engine.forceApply();
    schedulePersist();
  },

  previewVoice: (voice) => {
    set({ voiceURI: voice.voiceURI });
    useSettings.getState().update({ voiceURI: voice.voiceURI });
    engine.preview(voice);
    schedulePersist();
  },

  setAutoScroll: (on) => {
    set({ autoScroll: on });
    useSettings.getState().update({ autoScroll: on });
    schedulePersist();
  },
}));

// 引擎事件 → store 同步（模块加载时绑定一次）
engine.events = {
  onSentence: (idx) => {
    usePlayer.setState({
      currentIdx: idx,
      appliedVoiceURI: engine.voice?.voiceURI ?? '',
    });
    schedulePersist();
  },
  onState: (s) => {
    usePlayer.setState({ state: s });
    if (s !== 'playing') void persistNow();
  },
  onError: (msg) => toast(msg, 'error'),
  onFinish: () => {
    void persistNow();
    toast('已朗读到全文末尾');
  },
};
