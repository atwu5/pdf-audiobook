/**
 * 解析编排：封面 → 文本提取 → 组装。供导入流程调用。
 */
import type { ParsedBook } from '../types';
import { assembleDocument } from './assemble';
import { extractPdfText, renderPdfCover } from './extract';

export { assembleDocument } from './assemble';
export { extractLinesFromDoc, extractPdfText, renderPdfCover } from './extract';

export const PARSER_VERSION = 1;

export interface ParseCallbacks {
  onProgress?: (page: number, total: number) => void;
  onCover?: (cover?: string) => void;
}

export interface FullParseResult extends Omit<ParsedBook, 'bookId'> {
  numPages: number;
  charCount: number;
  isScanned: boolean;
}

export class ScannedPdfError extends Error {
  constructor() {
    super('当前 PDF 需要 OCR 才能朗读（未检测到足够文字层）');
    this.name = 'ScannedPdfError';
  }
}

export async function parseBook(
  file: Blob,
  cbs: ParseCallbacks = {}
): Promise<FullParseResult> {
  // 封面单独读一份 buffer（pdfjs 会 transfer 掉 ArrayBuffer）
  try {
    const coverBuf = await file.arrayBuffer();
    const cover = await renderPdfCover(coverBuf);
    cbs.onCover?.(cover);
  } catch {
    cbs.onCover?.(undefined);
  }

  const textBuf = await file.arrayBuffer();
  const { pages, numPages } = await extractPdfText(textBuf, cbs.onProgress);
  const result = assembleDocument(pages, { bookName: '' });

  if (result.isScanned || result.sentences.length === 0) {
    throw new ScannedPdfError();
  }

  return {
    chapters: result.chapters,
    paragraphs: result.paragraphs,
    sentences: result.sentences,
    totalSentences: result.sentences.length,
    parsedAt: Date.now(),
    parserVersion: PARSER_VERSION,
    numPages,
    charCount: result.charCount,
    isScanned: false,
  };
}
