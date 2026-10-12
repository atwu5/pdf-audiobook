import { useMemo, useRef, useState } from 'react';
import { usePlayer } from '../../store/playerStore';
import { fmtPercent } from '../../utils/format';
import {
  IconArrowDownUp,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconList,
  IconLocate,
  IconPause,
  IconPlay,
  IconSliders,
} from '../Icons';

function IconBtn({
  title,
  onClick,
  active,
  disabled,
  children,
  size = 20,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full p-2 transition-colors disabled:opacity-30 ${
        active ? 'text-accent bg-accent/10' : 'text-ink hover:bg-ink/5'
      }`}
    >
      <span className="[&>svg]:block" style={{ width: size, height: size }}>
        {children}
      </span>
    </button>
  );
}

function SeekBar({ onCommit }: { onCommit: (idx: number) => void }) {
  const total = usePlayer((s) => s.total);
  const currentIdx = usePlayer((s) => s.currentIdx);
  const sentences = usePlayer((s) => s.sentences);
  const chapters = usePlayer((s) => s.chapters);
  const [preview, setPreview] = useState<number | null>(null);
  const commitRef = useRef(-1);

  const value = preview ?? currentIdx;
  const chapterTitle = useMemo(() => {
    let title = '';
    for (const c of chapters) {
      if (c.sentenceStart <= value) title = c.title;
      else break;
    }
    return title;
  }, [chapters, value]);

  if (total === 0) return null;

  return (
    <div className="relative">
      {preview !== null && (
        <div className="pointer-events-none absolute -top-12 left-0 right-0 flex justify-center">
          <div className="max-w-[85%] truncate rounded-lg bg-ink px-3 py-1.5 text-xs text-paper shadow-lg">
            {chapterTitle ? `${chapterTitle} · ` : ''}
            {sentences[value]?.trim().slice(0, 60) ?? ''}
          </div>
        </div>
      )}
      <input
        type="range"
        className="seek"
        min={0}
        max={total - 1}
        value={value}
        aria-label="朗读进度"
        style={{ ['--p' as string]: `${total > 1 ? (value / (total - 1)) * 100 : 0}%` }}
        onChange={(e) => {
          const v = Number(e.target.value);
          commitRef.current = v;
          setPreview(v);
        }}
        onPointerUp={() => {
          if (preview !== null) {
            onCommit(commitRef.current >= 0 ? commitRef.current : preview);
            setPreview(null);
            commitRef.current = -1;
          }
        }}
        onKeyUp={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
            if (preview !== null) {
              onCommit(preview);
              setPreview(null);
            }
          }
        }}
        onBlur={() => {
          if (preview !== null) {
            onCommit(preview);
            setPreview(null);
          }
        }}
      />
    </div>
  );
}

export function PlayerBar({
  onOpenToc,
  onOpenSettings,
  onBackToPosition,
  showBack,
}: {
  onOpenToc: () => void;
  onOpenSettings: () => void;
  onBackToPosition: () => void;
  showBack: boolean;
}) {
  const state = usePlayer((s) => s.state);
  const currentIdx = usePlayer((s) => s.currentIdx);
  const total = usePlayer((s) => s.total);
  const rate = usePlayer((s) => s.rate);
  const autoScroll = usePlayer((s) => s.autoScroll);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const stepSentence = usePlayer((s) => s.stepSentence);
  const stepPara = usePlayer((s) => s.stepPara);
  const setAutoScroll = usePlayer((s) => s.setAutoScroll);
  const playAt = usePlayer((s) => s.playAt);
  const chapters = usePlayer((s) => s.chapters);

  const chapterTitle = useMemo(() => {
    let title = '';
    for (const c of chapters) {
      if (c.sentenceStart <= currentIdx) title = c.title;
      else break;
    }
    return title || '正文';
  }, [chapters, currentIdx]);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-[#faf6ee]/95 backdrop-blur"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
    >
      <div className="mx-auto max-w-3xl px-3 pb-2 pt-1.5 sm:px-6">
        {/* 回到朗读位置 */}
        <div className="relative h-0">
          {showBack && (
            <button
              onClick={onBackToPosition}
              className="absolute -top-14 right-2 z-50 flex items-center gap-1.5 rounded-full bg-ink/85 px-3.5 py-2 text-xs text-paper shadow-lg hover:bg-ink"
            >
              <IconLocate width={14} height={14} />
              回到朗读位置
            </button>
          )}
        </div>

        {/* 行1：章节 + 位置 */}
        <div className="mb-0.5 flex items-center justify-between text-xs text-inkSoft">
          <button
            onClick={onOpenToc}
            className="flex min-w-0 items-center gap-1 hover:text-accent"
            title="打开目录"
          >
            <IconList width={14} height={14} />
            <span className="truncate">{chapterTitle}</span>
          </button>
          <span className="shrink-0 tabular-nums">
            第 {total ? currentIdx + 1 : 0}/{total} 句 · {fmtPercent(currentIdx, total)}
          </span>
        </div>

        {/* 行2：进度条 */}
        <SeekBar onCommit={(idx) => playAt(idx)} />

        {/* 行3：控制按钮（左下角为目录入口，右侧为语速/跟随/设置） */}
        <div className="mt-0.5 flex items-center gap-0.5 sm:gap-1.5">
          <button
            onClick={onOpenToc}
            title="章节目录"
            aria-label="章节目录"
            className="mr-1 flex shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent transition-colors hover:bg-accent hover:text-white"
          >
            <IconList width={15} height={15} />
            <span>目录</span>
          </button>
          <div className="flex-1" />
          <IconBtn title="上一段" onClick={() => stepPara(-1)} disabled={total === 0}>
            <IconChevronsLeft width={20} height={20} />
          </IconBtn>
          <IconBtn title="上一句" onClick={() => stepSentence(-1)} disabled={total === 0}>
            <IconChevronLeft width={20} height={20} />
          </IconBtn>
          <button
            title={state === 'playing' ? '暂停' : '播放'}
            aria-label={state === 'playing' ? '暂停' : '播放'}
            onClick={togglePlay}
            disabled={total === 0}
            className="mx-1 flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white shadow-md transition-transform hover:bg-accentDeep active:scale-95 disabled:opacity-40"
          >
            {state === 'playing' ? <IconPause width={22} height={22} /> : <IconPlay width={22} height={22} />}
          </button>
          <IconBtn title="下一句" onClick={() => stepSentence(1)} disabled={total === 0}>
            <IconChevronRight width={20} height={20} />
          </IconBtn>
          <IconBtn title="下一段" onClick={() => stepPara(1)} disabled={total === 0}>
            <IconChevronsRight width={20} height={20} />
          </IconBtn>
          <div className="flex-1" />
          <div className="flex items-center">
            <button
              onClick={onOpenSettings}
              title="语速与音色"
              className="mr-0.5 rounded-full border border-line px-2.5 py-1 text-xs tabular-nums text-ink hover:border-accent/60"
            >
              {rate}x
            </button>
            <IconBtn
              title={autoScroll ? '自动跟随：开' : '自动跟随：关'}
              onClick={() => setAutoScroll(!autoScroll)}
              active={autoScroll}
            >
              <IconArrowDownUp width={17} height={17} />
            </IconBtn>
            <IconBtn title="朗读设置" onClick={onOpenSettings}>
              <IconSliders width={17} height={17} />
            </IconBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
