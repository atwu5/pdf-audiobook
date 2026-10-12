export type ParseStatus = 'pending' | 'parsing' | 'done' | 'failed' | 'needs_ocr';

export interface BookRecord {
  id: string;
  name: string;
  size: number;
  pages: number;
  addedAt: number;
  lastReadAt: number;
  cover?: string;
  parseStatus: ParseStatus;
  parseError?: string;
  parseProgress?: { page: number; total: number };
  isScanned?: boolean;
  charCount?: number;
  sentenceCount?: number;
}

export interface ChapterInfo {
  idx: number;
  title: string;
  /** 段落区间 [paraStart, paraEnd) */
  paraStart: number;
  paraEnd: number;
  /** 本章第一个句子的全局索引 */
  sentenceStart: number;
}

export interface ParagraphData {
  idx: number;
  chapterIdx: number;
  text: string;
  heading?: boolean;
}

export interface SentenceData {
  idx: number;
  paraIdx: number;
  text: string;
}

export interface ParsedBook {
  bookId: string;
  chapters: ChapterInfo[];
  paragraphs: ParagraphData[];
  sentences: SentenceData[];
  totalSentences: number;
  parsedAt: number;
  parserVersion: number;
}

export interface ProgressRecord {
  bookId: string;
  sentenceIdx: number;
  paraIdx: number;
  chapterIdx: number;
  percent: number;
  voiceURI?: string;
  rate?: number;
  autoScroll?: boolean;
  updatedAt: number;
}
