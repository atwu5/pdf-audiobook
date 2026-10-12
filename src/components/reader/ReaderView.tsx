import { memo, useEffect, useMemo, useRef } from 'react';
import type { ParsedBook } from '../../types';
import { usePlayer } from '../../store/playerStore';

interface Props {
  parsed: ParsedBook;
  fontSize: number;
  lineHeight: number;
  onSentenceClick: (idx: number) => void;
}

/**
 * 正文渲染：
 *  - 句子 span 挂稳定 id（s-<idx>），点击即从该句开始朗读；
 *  - 高亮切换走 DOM class（ActiveHighlight），不触发整篇 React 重渲染；
 *  - 段落使用 content-visibility 懒绘制，长文档滚动流畅。
 */
export const ReaderView = memo(function ReaderView({ parsed, fontSize, lineHeight, onSentenceClick }: Props) {
  // 预构建：段落 → 该段的句子切片
  const sentencesByPara = useMemo(() => {
    const map: { idx: number; text: string }[][] = parsed.paragraphs.map(() => []);
    for (const s of parsed.sentences) {
      map[s.paraIdx]?.push({ idx: s.idx, text: s.text });
    }
    return map;
  }, [parsed]);

  return (
    <article
      className="mx-auto max-w-3xl px-5 pb-52 pt-4 sm:px-8"
      style={{ fontSize, lineHeight }}
    >
      {parsed.paragraphs.map((p) => {
        const sents = sentencesByPara[p.idx] ?? [];
        if (p.heading) {
          return (
            <h2
              key={p.idx}
              id={`p-${p.idx}`}
              className="mb-3 mt-10 break-words text-[1.35em] font-semibold leading-snug text-ink first:mt-2"
            >
              {sents.map((s) => (
                <span
                  key={s.idx}
                  id={`s-${s.idx}`}
                  className="sentence"
                  onClick={() => onSentenceClick(s.idx)}
                >
                  {s.text}
                </span>
              ))}
            </h2>
          );
        }
        return (
          <p
            key={p.idx}
            id={`p-${p.idx}`}
            className="my-3 break-words text-ink [contain-intrinsic-size:auto_8em] [content-visibility:auto] [text-indent:1.9em]"
          >
            {sents.map((s) => (
              <span key={s.idx} id={`s-${s.idx}`} className="sentence" onClick={() => onSentenceClick(s.idx)}>
                {s.text}
              </span>
            ))}
          </p>
        );
      })}
      <ActiveHighlight />
    </article>
  );
});

/** 监听 currentIdx（来自播放 store），直接切换 DOM 高亮 class */
function ActiveHighlight() {
  const prevRef = useRef(-1);
  useEffect(() => {
    const apply = (idx: number) => {
      if (prevRef.current >= 0) {
        document.getElementById(`s-${prevRef.current}`)?.classList.remove('sentence-active');
      }
      if (idx >= 0) {
        document.getElementById(`s-${idx}`)?.classList.add('sentence-active');
      }
      prevRef.current = idx;
    };
    apply(usePlayer.getState().currentIdx);
    const unsub = usePlayer.subscribe((s) => apply(s.currentIdx));
    return () => {
      unsub();
      if (prevRef.current >= 0) {
        document.getElementById(`s-${prevRef.current}`)?.classList.remove('sentence-active');
      }
    };
  }, []);
  return null;
}
