/**
 * 朗读引擎（单例）：封装 Web Speech API / SpeechSynthesis。
 *
 * 设计要点：
 *  - 全局唯一的 SpeechSynthesis 调用入口，避免多组件竞争导致语音重叠；
 *  - 句子队列逐句朗读：onend → 推进到下一句，天然规避“整本书一次性提交”的长度限制；
 *  - generation 计数器（this.gen）作废一切过期的 utterance 回调，保证跳转后旧事件不会污染新状态；
 *  - pause() 兼容性回退：Android Chrome 的 pause 可能无效，检测后转为「硬暂停」并记录句内偏移；
 *  - 预留 TtsProvider 接口，未来可替换为云端 TTS 实现（保持 play/pause/jumpTo 等语义）。
 */

export type EngineState = 'idle' | 'playing' | 'paused';

export interface EngineEvents {
  /** 每当朗读位置确定（新句开始 / 跳转 / 加载）时触发 */
  onSentence?: (idx: number) => void;
  onState?: (state: EngineState) => void;
  onError?: (message: string) => void;
  /** 整本朗读完毕 */
  onFinish?: () => void;
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/** 未来云端 TTS 实现时可实现同款接口 */
export interface TtsProvider {
  load(sentences: string[], startIdx: number): void;
  play(fromIdx?: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
  jumpTo(idx: number): void;
  setRate(rate: number): void;
  setVoice(voice: SpeechSynthesisVoice | null): void;
  readonly state: EngineState;
  readonly currentIdx: number;
}

export class SpeechEngine implements TtsProvider {
  private sentences: string[] = [];
  private idx = 0;
  private gen = 0;
  private st: EngineState = 'idle';
  private utter: SpeechSynthesisUtterance | null = null;
  /** 当前句内字符偏移（boundary 回调），用于硬暂停后的句内恢复 */
  private charOffset = 0;
  private hardPaused = false;
  /** 暂停期间换过音色/语速：resume 时需重启当前句而非沿用旧 utterance */
  private needRestart = false;
  /** speak 被浏览器吞掉（无任何事件）时的重试计数 */
  private dropRetries = 0;
  private checkTimer: number | null = null;
  private consecutiveErrors = 0;
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  events: EngineEvents = {};

  private get synth(): SpeechSynthesis {
    return window.speechSynthesis;
  }

  get state(): EngineState {
    return this.st;
  }

  get currentIdx(): number {
    return this.idx;
  }

  private setState(s: EngineState) {
    if (this.st === s) return;
    this.st = s;
    this.events.onState?.(s);
  }

  private clearTimer() {
    if (this.checkTimer !== null) {
      window.clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
  }

  load(sentences: string[], startIdx: number) {
    this.stop();
    this.sentences = sentences;
    this.idx = Math.min(Math.max(startIdx, 0), Math.max(sentences.length - 1, 0));
  }

  play(fromIdx?: number) {
    if (!isSpeechSupported()) {
      this.events.onError?.('当前浏览器不支持语音合成（SpeechSynthesis）');
      return;
    }
    if (this.sentences.length === 0) return;
    if (fromIdx !== undefined && fromIdx !== this.idx) {
      this.idx = Math.min(Math.max(fromIdx, 0), this.sentences.length - 1);
    }
    if (this.st === 'playing') return;
    if (this.st === 'paused') {
      this.resume();
      return;
    }
    this.hardPaused = false;
    this.charOffset = 0;
    this.setState('playing');
    this.speakCurrent(0);
  }

  pause() {
    if (this.st !== 'playing') return;
    this.setState('paused');
    try {
      this.synth.pause();
    } catch {
      /* ignore */
    }
    this.clearTimer();
    // 兼容性检测：部分浏览器（Android Chrome 等）pause() 不生效
    this.checkTimer = window.setTimeout(() => {
      this.checkTimer = null;
      if (this.st !== 'paused') return;
      if (this.synth.speaking && !this.synth.paused) {
        this.hardPaused = true;
        try {
          this.synth.cancel();
        } catch {
          /* ignore */
        }
      }
    }, 350);
  }

  resume() {
    if (this.st !== 'paused') return;
    this.setState('playing');
    this.clearTimer();
    if (this.hardPaused) {
      this.hardPaused = false;
      this.speakCurrent(this.charOffset);
      return;
    }
    if (this.needRestart) {
      // 暂停期间换过音色/语速：不能用旧 utterance 续播，否则新设置听起来“不生效”
      this.needRestart = false;
      this.restartCurrent();
      return;
    }
    try {
      this.synth.resume();
    } catch {
      /* ignore */
    }
    // resume 后若实际没有声音输出（暂停期间恰好在句间隙），直接重说当前句
    this.checkTimer = window.setTimeout(() => {
      this.checkTimer = null;
      if (this.st === 'playing' && !this.synth.speaking && !this.synth.pending) {
        this.speakCurrent(0);
      }
    }, 400);
  }

  stop() {
    this.gen++;
    this.clearTimer();
    try {
      this.synth?.cancel();
    } catch {
      /* ignore */
    }
    this.utter = null;
    this.hardPaused = false;
    this.needRestart = false;
    this.dropRetries = 0;
    this.charOffset = 0;
    this.consecutiveErrors = 0;
    this.setState('idle');
  }

  /** 跳转到指定句子：播放中立即续播，暂停/停止状态仅移动位置并同步 UI。 */
  jumpTo(idx: number) {
    if (this.sentences.length === 0) return;
    const target = Math.min(Math.max(idx, 0), this.sentences.length - 1);
    const wasPlaying = this.st === 'playing';
    this.gen++;
    this.clearTimer();
    this.idx = target;
    this.hardPaused = false;
    this.needRestart = false;
    this.charOffset = 0;
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }
    if (wasPlaying) {
      this.setState('playing');
      this.restartCurrent();
    } else {
      this.setState('idle');
      this.events.onSentence?.(target);
    }
  }

  setRate(rate: number) {
    const changed = rate !== this.rate;
    this.rate = rate;
    if (changed) this.applyChangeWhilePlaying();
  }

  setVoice(voice: SpeechSynthesisVoice | null) {
    const changed = (voice?.voiceURI ?? '') !== (this.voice?.voiceURI ?? '');
    this.voice = voice;
    if (changed) this.applyChangeWhilePlaying();
  }

  /** 播放中立即用新设置重启当前句；暂停中打标记，恢复时重启 */
  private applyChangeWhilePlaying() {
    if (this.st === 'playing') {
      this.restartCurrent();
    } else if (this.st === 'paused') {
      this.needRestart = true;
    }
  }

  private restartCurrent() {
    this.gen++;
    this.clearTimer();
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }
    // cancel 后某些引擎会残留 paused 状态，必须 resume 清掉，否则新 utterance 会被排队不发声
    try {
      this.synth.resume();
    } catch {
      /* ignore */
    }
    // 同步启动：所有调用点都在用户手势调用栈内（Safari 要求 speak 在手势内）；
    // Chrome 偶发吞句由 speakCurrent 内的看门狗重试兕底
    this.speakCurrent(0);
  }

  /** 「立即生效」：显式强制用当前选中音色从当前句重启朗读（点击按钮的手势栈内同步 speak） */
  forceApply() {
    if (this.sentences.length === 0) return;
    this.gen++;
    this.clearTimer();
    this.hardPaused = false;
    this.needRestart = false;
    this.dropRetries = 0;
    this.charOffset = 0;
    this.utter = null;
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }
    try {
      this.synth.resume();
    } catch {
      /* ignore */
    }
    this.setState('playing');
    this.speakCurrent(0);
  }

  /**
   * 音色试听：播一句固定短句，播完自动恢复原状态（原在播放则续播当前句）。
   * 用于快速验证不同音色是否真的发出不同声音。
   */
  preview(voice: SpeechSynthesisVoice | null) {
    if (!isSpeechSupported()) return;
    const prevSt = this.st;
    this.voice = voice;
    this.gen++;
    this.clearTimer();
    this.hardPaused = false;
    this.needRestart = false;
    this.dropRetries = 0;
    this.charOffset = 0;
    this.utter = null;
    try {
      this.synth.cancel();
    } catch {
      /* ignore */
    }
    try {
      this.synth.resume();
    } catch {
      /* ignore */
    }
    const myGen = ++this.gen;
    const restore = () => {
      if (myGen !== this.gen) return;
      if (prevSt === 'playing') {
        this.setState('playing');
        this.speakCurrent(0);
      } else {
        this.setState(prevSt);
        this.events.onSentence?.(this.idx);
      }
    };
    try {
      const u = new SpeechSynthesisUtterance('你好，这是音色试听。');
      this.utter = u;
      u.rate = this.rate;
      u.pitch = 1;
      u.volume = 1;
      u.lang = voice?.lang || 'zh-CN';
      if (voice) u.voice = voice;
      u.onend = () => {
        if (myGen !== this.gen) return;
        this.dropRetries = 0;
        restore();
      };
      u.onerror = (e) => {
        if (myGen !== this.gen) return;
        const err = (e as SpeechSynthesisErrorEvent).error;
        if (err === 'interrupted' || err === 'canceled') return;
        restore();
      };
      this.setState('playing');
      this.events.onSentence?.(this.idx);
      this.synth.speak(u);
      // 看门狗：试听被吞时直接恢复
      window.setTimeout(() => {
        if (myGen !== this.gen) return;
        if (!this.synth.speaking && !this.synth.pending) restore();
      }, 800);
    } catch {
      restore();
    }
  }

  private speakCurrent(offset: number, cancelFirst = false) {
    const myGen = ++this.gen;
    const start = () => {
      if (myGen !== this.gen) return;
      const text = this.sentences[this.idx];
      if (text === undefined) {
        this.setState('idle');
        return;
      }
      const speakText = offset > 0 ? text.slice(offset) : text;
      if (!speakText.trim()) {
        this.advance(myGen);
        return;
      }
      try {
        const u = new SpeechSynthesisUtterance(speakText);
        this.utter = u; // 持有引用，防止 Chrome 提前 GC
        u.rate = this.rate;
        u.pitch = 1;
        u.volume = 1;
        u.lang = this.voice?.lang || 'zh-CN';
        if (this.voice) u.voice = this.voice;

        u.onboundary = (e) => {
          if (myGen !== this.gen) return;
          this.dropRetries = 0; // 语音确实在出声，重置吞句计数
          // 记录句内偏移（部分引擎不触发 boundary，仅作尽力而为）
          if (typeof e.charIndex === 'number') {
            this.charOffset = offset + e.charIndex;
          }
        };
        u.onend = () => {
          if (myGen !== this.gen) return;
          this.charOffset = 0;
          this.dropRetries = 0;
          this.consecutiveErrors = 0;
          this.advance(myGen);
        };
        u.onerror = (e) => {
          if (myGen !== this.gen) return;
          const err = (e as SpeechSynthesisErrorEvent).error;
          if (err === 'interrupted' || err === 'canceled') return;
          this.consecutiveErrors++;
          if (this.consecutiveErrors >= 3) {
            this.events.onError?.('语音连续合成失败，已停止朗读');
            this.setState('idle');
            return;
          }
          // 单句失败：跳过继续
          this.advance(myGen);
        };

        this.charOffset = offset;
        this.events.onSentence?.(this.idx);
        this.synth.speak(u);

        // 看门狗：Chrome/Safari 在 cancel 后立即 speak 时可能吞掉整条语句
        // （不触发 onend/onerror），500ms 后仍在 playing 却没有任何声音活动则重试
        window.setTimeout(() => {
          if (myGen !== this.gen) return;
          if (this.st === 'playing' && !this.synth.speaking && !this.synth.pending) {
            this.dropRetries++;
            if (this.dropRetries >= 3) {
              this.dropRetries = 0;
              this.events.onError?.('语音启动失败，已停止朗读，请重试');
              this.setState('idle');
              return;
            }
            this.speakCurrent(0);
          }
        }, 500);
      } catch (e) {
        this.events.onError?.(`语音合成启动失败：${e instanceof Error ? e.message : String(e)}`);
        this.setState('idle');
      }
    };

    if (cancelFirst) {
      try {
        this.synth.cancel();
      } catch {
        /* ignore */
      }
      // Chrome 的 cancel() 后立即 speak() 可能吞掉新语句，稍等片刻
      window.setTimeout(start, 120);
    } else {
      start();
    }
  }

  private advance(myGen: number) {
    if (myGen !== this.gen) return;
    if (this.idx < this.sentences.length - 1) {
      this.idx++;
      this.speakCurrent(0);
    } else {
      this.setState('idle');
      this.events.onFinish?.();
    }
  }
}
