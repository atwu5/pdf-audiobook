import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import type { BookRecord, ParsedBook, ProgressRecord } from '../types';
import { usePlayer, persistNow } from '../store/playerStore';
import { useSettings } from '../store/settingsStore';
import { useVoices } from '../tts/useVoices';
import { langGroupKey, pickBestVoice } from '../tts/voiceUtils';
import { ReaderView } from '../components/reader/ReaderView';
import { TocPanelConnected } from '../components/reader/TocPanel';
import { SettingsPanel } from '../components/reader/SettingsPanel';
import { PlayerBar } from '../components/player/PlayerBar';
import { IconBookOpen, IconChevronLeft, IconSliders, IconX } from '../components/Icons';

type DrawerKind = 'none' | 'toc' | 'settings';

export default function ReaderPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const settings = useSettings();
  const voices = useVoices();

  const book = useLiveQuery(() => db.books.get(id), [id]);
  const parsed = useLiveQuery(() => db.parsed.get(id), [id]);
  const progress = useLiveQuery(() => db.progress.get(id), [id]);

  const [resume, setResume] = useState<{ idx: number; title: string; percent: number } | null>(null);
  const [drawer, setDrawer] = useState<DrawerKind>('none');
  const [following, setFollowing] = useState(true);

  const initialisedRef = useRef(false);
  const followRef = useRef(true);

  /* ---------- 书籍加载与断点恢复 ---------- */
  useEffect(() => {
    if (!book || !parsed || book.parseStatus !== 'done') return;
    if (initialisedRef.current) return;
    initialisedRef.current = true;

    const st = usePlayer.getState();
    let startIdx = 0;
    const saved = progress;
    if (saved && saved.percent >= 1 && saved.sentenceIdx < parsed.sentences.length) {
      startIdx = saved.sentenceIdx;
      const ch = parsed.chapters[saved.chapterIdx];
      setResume({
        idx: startIdx,
        title: ch?.title ?? '正文',
        percent: saved.percent,
      });
    }
    st.loadBook({
      bookId: id,
      bookName: book.name,
      parsed,
      startIdx,
      rate: saved?.rate ?? settings.rate,
      voiceURI: saved?.voiceURI ?? settings.voiceURI,
      autoScroll: saved?.autoScroll ?? settings.autoScroll,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book, parsed, id]);

  /* ---------- 音色解析（voiceschanged 异步完成后按 URI 恢复） ---------- */
  useEffect(() => {
    const st = usePlayer.getState();
    if (!st.loaded || !voices.allVoices.length) return;
    const all = [...voices.zhVoices, ...voices.otherVoices];
    let v = all.find((x) => x.voiceURI === st.voiceURI) ?? undefined;
    if (!v) {
      // 默认音色优先级：普通话 > 国语 > 粤语 > 任意中文
      const byGroup = (g: string) => pickBestVoice(voices.zhVoices.filter((x) => langGroupKey(x.lang) === g));
      v = byGroup('zh-CN') ?? byGroup('zh-TW') ?? byGroup('zh-HK') ?? pickBestVoice(voices.zhVoices) ?? undefined;
    }
    if (v) st.setVoice(v, v.voiceURI);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voices.loaded, usePlayer.getState().loaded]);

  /* ---------- 离开页面 / 隐藏页面时持久化 ---------- */
  useEffect(() => {
    const onHidden = () => {
      void persistNow();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') void persistNow();
    };
    window.addEventListener('pagehide', onHidden);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', onHidden);
      document.removeEventListener('visibilitychange', onVis);
      void persistNow();
    };
  }, []);

  /* ---------- 离开页面停止朗读 ---------- */
  useEffect(() => {
    return () => {
      usePlayer.getState().reset();
    };
  }, [id]);

  /* ---------- 自动跟随滚动 ---------- */
  const currentIdx = usePlayer((s) => s.currentIdx);
  const playing = usePlayer((s) => s.state) === 'playing';
  const autoScroll = usePlayer((s) => s.autoScroll);

  useEffect(() => {
    if (!playing || !autoScroll || !followRef.current) return;
    document.getElementById(`s-${currentIdx}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [currentIdx, playing, autoScroll]);

  useEffect(() => {
    const markUserScroll = () => {
      if (playing && autoScroll && followRef.current) {
        followRef.current = false;
        setFollowing(false);
      }
    };
    window.addEventListener('wheel', markUserScroll, { passive: true });
    window.addEventListener('touchmove', markUserScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', markUserScroll);
      window.removeEventListener('touchmove', markUserScroll);
    };
  }, [playing, autoScroll]);

  const backToPosition = useCallback(() => {
    followRef.current = true;
    setFollowing(true);
    const idx = usePlayer.getState().currentIdx;
    document.getElementById(`s-${idx}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  const onSentenceClick = useCallback((idx: number) => {
    followRef.current = true;
    setFollowing(true);
    usePlayer.getState().playAt(idx);
  }, []);

  /* ---------- 各状态渲染 ---------- */
  if (!book) {
    return (
      <CenterNotice
        title="书籍不存在或已被删除"
        action={
          <button className="mt-4 rounded-full bg-accent px-5 py-2 text-sm text-white" onClick={() => navigate('/')}>
            返回书架
          </button>
        }
      />
    );
  }

  if (book.parseStatus === 'parsing' || book.parseStatus === 'pending') {
    const p = book.parseProgress;
    return (
      <CenterNotice title={`《${book.name}》解析中${p ? ` ${p.page}/${p.total} 页` : '…'}`}>
        <div className="mt-4 h-1.5 w-56 overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: p && p.total ? `${(p.page / p.total) * 100}%` : '30%' }}
          />
        </div>
      </CenterNotice>
    );
  }

  if (book.parseStatus === 'failed') {
    return (
      <CenterNotice
        title="这本书解析失败"
        desc={book.parseError ?? '无法读取该 PDF 的文本内容。'}
        action={
          <button className="mt-4 rounded-full bg-accent px-5 py-2 text-sm text-white" onClick={() => navigate('/')}>
            返回书架
          </button>
        }
      />
    );
  }

  if (book.parseStatus === 'needs_ocr') {
    return (
      <CenterNotice
        title="当前 PDF 需要 OCR 才能朗读"
        desc="检测到这本书几乎没有可提取的文字层（通常是扫描版或图片型 PDF）。当前版本暂不支持 OCR，可选择保留这本书，等待后续版本支持。"
        action={
          <button className="mt-4 rounded-full bg-accent px-5 py-2 text-sm text-white" onClick={() => navigate('/')}>
            返回书架
          </button>
        }
      />
    );
  }

  if (!parsed) {
    return <CenterNotice title="加载中…" />;
  }

  return (
    <div className="min-h-screen">
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2.5 sm:px-6">
          <button
            onClick={() => navigate('/')}
            className="rounded-full p-2 text-ink hover:bg-ink/5"
            title="返回书架"
            aria-label="返回书架"
          >
            <IconChevronLeft width={18} height={18} />
          </button>
          <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{book.name}</h1>
          {book.charCount ? (
            <span className="hidden shrink-0 text-xs text-inkSoft/70 sm:block">{book.charCount} 字</span>
          ) : null}
          <button
            onClick={() => setDrawer('settings')}
            className="rounded-full p-2 text-ink hover:bg-ink/5 lg:hidden"
            title="朗读设置"
            aria-label="朗读设置"
          >
            <IconSliders width={18} height={18} />
          </button>
        </div>
      </header>

      {/* 正文 */}
      <ReaderView
        parsed={parsed as ParsedBook}
        fontSize={settings.fontSize}
        lineHeight={settings.lineHeight}
        onSentenceClick={onSentenceClick}
      />

      {/* 播放器 */}
      <PlayerBar
        onOpenToc={() => setDrawer('toc')}
        onOpenSettings={() => setDrawer('settings')}
        onBackToPosition={backToPosition}
        showBack={playing && autoScroll && !following}
      />

      {/* 抽屉：目录 / 设置 */}
      {drawer !== 'none' && (
        <div className="fixed inset-0 z-[60]" onClick={() => setDrawer('none')}>
          <div className="absolute inset-0 bg-black/35" />
          <div
            className={`absolute inset-y-0 ${drawer === 'toc' ? 'left-0' : 'right-0'} flex w-[86%] max-w-sm flex-col bg-paper shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold text-ink">{drawer === 'toc' ? '章节目录' : '朗读设置'}</h2>
              <button
                onClick={() => setDrawer('none')}
                className="rounded-full p-1.5 text-inkSoft hover:bg-ink/5"
                aria-label="关闭"
              >
                <IconX width={18} height={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {drawer === 'toc' ? (
                <TocPanelConnected
                  onJump={(idx) => {
                    onSentenceClick(idx);
                    setDrawer('none');
                  }}
                />
              ) : (
                <SettingsPanel />
              )}
            </div>
          </div>
        </div>
      )}

      {/* 断点恢复提示 */}
      {resume && (
        <div className="fixed left-1/2 top-16 z-50 w-[92%] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-line bg-white/95 p-4 shadow-xl backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                <IconBookOpen width={18} height={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">继续上次朗读？</p>
                <p className="mt-0.5 truncate text-xs text-inkSoft">
                  上次听到「{resume.title}」，第 {resume.idx + 1} 句（{resume.percent}%）
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    className="rounded-full bg-accent px-4 py-1.5 text-sm text-white hover:bg-accentDeep"
                    onClick={() => {
                      const idx = resume.idx;
                      setResume(null);
                      usePlayer.getState().playAt(idx);
                    }}
                  >
                    继续朗读
                  </button>
                  <button
                    className="rounded-full border border-line px-4 py-1.5 text-sm text-ink hover:border-accent/60"
                    onClick={() => {
                      setResume(null);
                      usePlayer.getState().playAt(0);
                    }}
                  >
                    从头开始
                  </button>
                  <button
                    className="ml-auto rounded-full px-2 py-1.5 text-xs text-inkSoft hover:text-ink"
                    onClick={() => setResume(null)}
                  >
                    暂不
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CenterNotice({
  title,
  desc,
  action,
  children,
}: {
  title: string;
  desc?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-base font-medium text-ink">{title}</p>
      {desc && <p className="mt-2 max-w-sm text-sm leading-relaxed text-inkSoft">{desc}</p>}
      {action ?? children}
    </div>
  );
}
