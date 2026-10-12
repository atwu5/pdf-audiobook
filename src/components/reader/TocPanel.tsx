import type { ChapterInfo } from '../../types';
import { fmtPercent } from '../../utils/format';
import { usePlayer } from '../../store/playerStore';

export function TocPanel({
  chapters,
  total,
  currentIdx,
  onJump,
}: {
  chapters: ChapterInfo[];
  total: number;
  currentIdx: number;
  onJump: (sentenceIdx: number) => void;
}) {
  const currentChapter = chapters.reduce<number>((acc, c) => (c.sentenceStart <= currentIdx ? c.idx : acc), 0);
  if (chapters.length <= 1) {
    return (
      <div className="px-4 py-6 text-sm text-inkSoft">
        未能在本书中可靠识别出章节结构，全文将按单一章节朗读。
      </div>
    );
  }
  return (
    <nav className="py-2">
      {chapters.map((c) => {
        const active = c.idx === currentChapter;
        return (
          <button
            key={c.idx}
            onClick={() => onJump(c.sentenceStart)}
            className={`flex w-full items-baseline gap-2 px-4 py-2.5 text-left text-sm leading-snug hover:bg-paperDeep ${
              active ? 'bg-paperDeep font-medium text-accent' : 'text-ink'
            }`}
          >
            <span className="line-clamp-2 flex-1">{c.title}</span>
            <span className="shrink-0 text-xs text-inkSoft/70">{fmtPercent(c.sentenceStart, total)}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** 从 store 读取的便捷封装（供抽屉直接使用） */
export function TocPanelConnected({ onJump }: { onJump: (idx: number) => void }) {
  const chapters = usePlayer((s) => s.chapters);
  const total = usePlayer((s) => s.total);
  const currentIdx = usePlayer((s) => s.currentIdx);
  return <TocPanel chapters={chapters} total={total} currentIdx={currentIdx} onJump={onJump} />;
}
