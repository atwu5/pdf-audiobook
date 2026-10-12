/**
 * 浏览器端 PDF 提取层（依赖 pdfjs-dist + Worker）。
 * extractLinesFromDoc 不直接 import pdfjs，便于 Node 侧复用做单测。
 */
import type { RawLine } from './assemble';
import { needsSpace } from './assemble';

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

export interface MinimalPdfPage {
  getTextContent(): Promise<{ items: unknown[] }>;
  getViewport(opts: { scale: number }): { width: number; height: number };
  render(opts: unknown): { promise: Promise<void> };
  cleanup(): void;
}

export interface MinimalPdfDoc {
  numPages: number;
  getPage(n: number): Promise<MinimalPdfPage>;
  destroy(): Promise<void>;
}

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = await import('pdfjs-dist');
      const WorkerCtor = (await import('pdfjs-dist/build/pdf.worker.min.mjs?worker')).default;
      pdfjs.GlobalWorkerOptions.workerPort = new WorkerCtor();
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

/** 将一个 doc 的所有页提取为「每页行列表」，行内已按从上到下排序。 */
export async function extractLinesFromDoc(
  doc: MinimalPdfDoc,
  onPage?: (page: number, total: number) => void
): Promise<{ pages: RawLine[][]; charCount: number }> {
  const pages: RawLine[][] = [];
  let charCount = 0;
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items.filter((it) => typeof it === 'object' && it !== null && 'str' in it) as PdfTextItem[];

    // 1. 按基线 y 聚类成行
    const sorted = [...items]
      .filter((it) => it.str && it.str.trim().length > 0)
      .sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    const buckets: { y: number; items: PdfTextItem[] }[] = [];
    for (const it of sorted) {
      const y = it.transform[5];
      const size = Math.hypot(it.transform[1], it.transform[3]) || it.height || 10;
      const tol = Math.max(1.2, size * 0.38);
      let bucket = buckets.length ? buckets[buckets.length - 1] : undefined;
      if (!bucket || Math.abs(bucket.y - y) > tol) {
        bucket = { y, items: [] };
        buckets.push(bucket);
      }
      bucket.items.push(it);
    }

    // 2. 行内拼接（x 从左到右，按间隙与中英文规则补空格）
    const lines: RawLine[] = [];
    for (const b of buckets) {
      b.items.sort((a, z) => a.transform[4] - z.transform[4]);
      let text = '';
      let prevEnd = -1;
      let prevChar = '';
      for (const it of b.items) {
        const s = it.str;
        if (!s) continue;
        const x = it.transform[4];
        const size = Math.hypot(it.transform[1], it.transform[3]) || it.height || 10;
        const gap = prevEnd >= 0 ? x - prevEnd : 0;
        const first = s.trim()[0] ?? '';
        if (text && gap > size * 0.2 && first && needsSpace(prevChar, first)) text += ' ';
        text += s;
        prevEnd = x + (it.width || 0);
        prevChar = s.length ? s[s.length - 1] : prevChar;
      }
      const trimmed = text.replace(/\s+/g, ' ').trim();
      if (!trimmed) continue;
      const size = Math.max(...b.items.map((i) => Math.hypot(i.transform[1], i.transform[3]) || i.height || 0));
      const x = Math.min(...b.items.map((i) => i.transform[4]));
      lines.push({ text: trimmed, x, y: b.y, size, page: p });
      charCount += trimmed.length;
    }
    lines.sort((a, z) => z.y - a.y);
    pages.push(lines);
    onPage?.(p, doc.numPages);
    page.cleanup();
  }
  return { pages, charCount };
}

/** 浏览器端：从 PDF 二进制提取全部文本行 */
export async function extractPdfText(
  buffer: ArrayBuffer,
  onPage?: (page: number, total: number) => void
): Promise<{ pages: RawLine[][]; numPages: number; charCount: number }> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: buffer, isEvalSupported: false }).promise;
  try {
    const { pages, charCount } = await extractLinesFromDoc(doc as unknown as MinimalPdfDoc, onPage);
    return { pages, numPages: doc.numPages, charCount };
  } finally {
    await doc.destroy();
  }
}

/** 渲染第 1 页为封面 dataURL（JPEG）。失败返回 undefined，不阻塞导入。 */
export async function renderPdfCover(buffer: ArrayBuffer, targetHeight = 480): Promise<string | undefined> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: buffer, isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.min(3, Math.max(0.5, targetHeight / v1.height));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/jpeg', 0.78);
  } finally {
    await doc.destroy();
  }
}
