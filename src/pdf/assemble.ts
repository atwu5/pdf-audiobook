/**
 * PDF 文本组装器（纯函数，不依赖 DOM / pdfjs，可在 Node 中单测）。
 *
 * 输入：每一页的行列表（已按“从上到下”排序，包含 x/y/字号）。
 * 输出：Book → Chapter → Paragraph → Sentence 结构。
 *
 * 处理内容：
 *  - 重复页眉/页脚与纯页码过滤
 *  - 段落拼接（首行缩进、段间距、跨页续段、行内空格策略、英文断词连字符）
 *  - 章节标题识别（“第 X 章/节/回…”、“Chapter N”、显著大字号短行等）
 *  - 中英文混合分句（长句按标点二次切分）
 *  - 扫描版（无文字层）识别
 */
import type { ChapterInfo, ParagraphData, SentenceData } from '../types';

export interface RawLine {
  text: string;
  x: number;
  y: number;
  size: number;
  page: number;
}

export interface AssembleResult {
  chapters: ChapterInfo[];
  paragraphs: ParagraphData[];
  sentences: SentenceData[];
  totalSentences: number;
  charCount: number;
  isScanned: boolean;
}

/* ------------------------------ 常量与工具 ------------------------------ */

const PAGE_NUM_RE =
  /^\s*[—–\-–]?[\s]*(\d{1,4}|[ivxlcdm]{1,7}|第\s*\d+\s*页|[·•・]\s*\d+\s*[·•・]|[—–\-]\s*\d+\s*[—–\-])\s*$/i;

const DOT_LEADER = /(?:\.{2,}|…+|·{2,})/;
const CJK_RE = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

const STRONG_CH = /^第\s*[0-9０-９一二三四五六七八九十百千两零]+\s*[章节篇部回卷讲]/;
const STRONG_EN = /^chapter\s+\d+/i;
const SPECIAL_HEAD = /^(序章?|楔子|引子|前言|序言|自序|译者序|后记|附录|尾声|终章|番外)(\s+.{0,20})?$/;

const CJK_TERM = new Set(['。', '！', '？', '；', '…', '!', '?', '.']);
const CLOSERS = new Set(['”', '’', '」', '』', '）', ')', '】', '》', '"', "'"]);

/** 常见缩写：后面跟空格时不应断句 */
const ABBREV = /^(mr|mrs|ms|dr|st|sr|jr|prof|vs|etc|no|vol|fig|approx|inc|ltd|dept|est)$/i;

function normKey(t: string): string {
  return t.replace(/\d+/g, '#').replace(/[\s\u3000]+/g, '').replace(/[·•・\-–—|丨]/g, '');
}

/** 行内拼接时是否需要补空格（中英文混排规则） */
export function needsSpace(prev: string, next: string): boolean {
  if (!prev || !next) return false;
  if (CJK_RE.test(prev) || CJK_RE.test(next)) return false;
  if (/[a-z0-9%,)\].]/i.test(prev) && /[a-zA-Z0-9(\[“"'‘]/.test(next)) return true;
  return false;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function isHeadingLine(line: RawLine, bodySize: number): boolean {
  const t = line.text.trim();
  if (!t || t.length > 60) return false;
  if (DOT_LEADER.test(t)) return false;
  if (/\s{2,}\S.*\s+\d{1,4}$/.test(t)) return false; // 目录行：“标题 …… 12”
  if (STRONG_CH.test(t) || SPECIAL_HEAD.test(t)) return t.length <= 50;
  if (STRONG_EN.test(t) && t.length <= 60 && !/[.,;:]$/.test(t)) return true;
  if (line.size >= bodySize * 1.15 && t.length <= 40 && !/[。，；、,.！？:：]$/.test(t)) return true;
  return false;
}

/* ------------------------------ 分句 ------------------------------ */

/** 将一段文本切成句子；返回值是原文的精确切片（拼接后等于原文）。 */
export function splitSentences(text: string): string[] {
  if (!text.trim()) return [];
  const chars = Array.from(text);
  // 用字符索引记录切片边界（chars 可能含代理对，用 map 维护 char->原始索引）
  const idxOf: number[] = [];
  {
    let i = 0;
    for (const ch of chars) {
      idxOf.push(i);
      i += ch.length;
    }
    idxOf.push(text.length);
  }
  const bounds: number[] = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!CJK_TERM.has(ch)) continue;
    let end = i;
    if (ch === '…') {
      while (end + 1 < chars.length && chars[end + 1] === '…') end++;
    } else if (ch === '!' || ch === '?' || ch === '.') {
      while (end + 1 < chars.length && (chars[end + 1] === '!' || chars[end + 1] === '?' || chars[end + 1] === '.')) end++;
    }
    // 半角句点仅在后接空白/末尾/CJK/后引号时结算（小数点、版本号等不切分）
    if (ch === '.') {
      const after = end + 1 < chars.length ? chars[end + 1] : '';
      const afterOk = after === '' || /[\s\u3000]/.test(after) || CJK_RE.test(after) || CLOSERS.has(after);
      if (!afterOk) continue;
      // 缩写词后不断句：Mr. / Dr. / etc. …
      const before = text.slice(0, idxOf[i]);
      const word = before.match(/[A-Za-z]+$/)?.[0] ?? '';
      if (word && ABBREV.test(word)) continue;
      // 人名首字母缩写："J. Smith"
      if (/^[A-Z]$/.test(word) && /\s[A-Z]$/.test(before)) continue;
    }
    // 吸收后引号/括号
    while (end + 1 < chars.length && CLOSERS.has(chars[end + 1])) end++;
    // 半角叹号/问号开头孤立出现不切分
    if (ch === '!' || ch === '?') {
      const prevCh = i > 0 ? chars[i - 1] : '';
      if (!prevCh.trim()) continue;
    }
    bounds.push(idxOf[end + 1]);
    i = end;
  }
  const pieces: string[] = [];
  let start = 0;
  for (const b of bounds) {
    if (b > start) pieces.push(text.slice(start, b));
    start = b;
  }
  if (start < text.length) pieces.push(text.slice(start));

  const result: string[] = [];
  let pendingSpace = '';
  for (const p of pieces) {
    if (!p.trim()) {
      // 纯空白切片：并入前一个句子，保持「句子拼接 === 原文」
      if (result.length) result[result.length - 1] += p;
      else pendingSpace += p;
      continue;
    }
    const piece = pendingSpace ? pendingSpace + p : p;
    pendingSpace = '';
    if (piece.trim().length <= 90) {
      result.push(piece);
    } else {
      result.push(...splitLong(piece, 90));
    }
  }
  if (pendingSpace && result.length) result[result.length - 1] += pendingSpace;
  return result.length ? result : [text];
}

/** 超长句（几乎没有句末标点）按逗号/顿号等二次切分，切片仍保持原文拼接相等。 */
function splitLong(s: string, max: number): string[] {
  if (s.length <= max) return [s];
  const window = s.slice(0, max);
  let cut = -1;
  for (let i = window.length - 1; i >= 10; i--) {
    if (/[，,、；;：:]/.test(window[i])) {
      cut = i + 1;
      break;
    }
  }
  if (cut <= 0) {
    // 无标点：退而按空格切（英文），最后才硬切（中文单字可独立成词）
    for (let i = window.length - 1; i >= 10; i--) {
      if (window[i] === ' ') {
        cut = i + 1;
        break;
      }
    }
  }
  if (cut <= 0) cut = max;
  return [s.slice(0, cut), ...splitLong(s.slice(cut), max)];
}

/* ------------------------------ 主流程 ------------------------------ */

export function assembleDocument(pages: RawLine[][], _opts: { bookName: string }): AssembleResult {
  // 0. 去空行
  const cleaned = pages.map((pg) => pg.filter((l) => l.text.trim().length > 0));

  // 1. 页眉/页脚检测：每页首尾各 2 行做候选，规范化（数字→#）后统计出现次数
  const cand = new Map<string, number>();
  const candLines: { line: RawLine; key: string }[] = [];
  for (const pg of cleaned) {
    const picks = [...pg.slice(0, 2), ...pg.slice(-2)];
    for (const l of picks) {
      const t = l.text.trim();
      const key = PAGE_NUM_RE.test(t) ? '__PG__' : normKey(t);
      if (!key || key.length > 40) continue;
      candLines.push({ line: l, key });
      cand.set(key, (cand.get(key) ?? 0) + 1);
    }
  }
  const totalPages = cleaned.length;
  const junk = new Set<RawLine>();
  for (const { line, key } of candLines) {
    const n = cand.get(key) ?? 0;
    if (key === '__PG__' && n >= 2) junk.add(line);
    else if (totalPages >= 3 && n >= 3 && n >= Math.ceil(totalPages * 0.5)) junk.add(line);
  }

  const body: RawLine[] = [];
  for (const pg of cleaned) {
    for (const l of pg) {
      if (junk.has(l)) continue;
      if (PAGE_NUM_RE.test(l.text) && l.text.trim().length <= 12) continue;
      body.push(l);
    }
  }
  if (body.length === 0) {
    throw new Error('未解析到文本内容');
  }

  // 2. 正文字号：按字符数加权的众数
  const sizeCount = new Map<number, number>();
  for (const l of body) {
    const s = round1(l.size);
    sizeCount.set(s, (sizeCount.get(s) ?? 0) + l.text.length);
  }
  let bodySize = 0;
  let best = -1;
  for (const [s, c] of sizeCount) {
    if (c > best) {
      best = c;
      bodySize = s;
    }
  }
  if (bodySize <= 0) bodySize = 12;

  // 3. 正文左边界（x 的低分位数，抗标题居中干扰）
  const xs = body.map((l) => l.x).sort((a, b) => a - b);
  const bodyLeft = xs[Math.floor(xs.length * 0.08)] ?? xs[0] ?? 0;

  // 4. 行间距中位数（同页相邻行）
  const byPage = new Map<number, RawLine[]>();
  for (const l of body) {
    const arr = byPage.get(l.page);
    if (arr) arr.push(l);
    else byPage.set(l.page, [l]);
  }
  const gaps: number[] = [];
  for (const [, ls] of byPage) {
    const sorted = [...ls].sort((a, b) => b.y - a.y);
    for (let i = 1; i < sorted.length; i++) {
      const g = sorted[i - 1].y - sorted[i].y;
      if (g > 0 && g < bodySize * 4) gaps.push(g);
    }
  }
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : bodySize * 1.45;

  // 5. 逐行组段
  interface ParaDraft {
    chapterIdx: number;
    text: string;
    heading: boolean;
  }
  const paras: ParaDraft[] = [];
  const chapters: ChapterInfo[] = [];
  let curChapter = -1;
  let curText = '';
  let lastY: number | null = null;
  let lastPage: number | null = null;

  const flush = () => {
    const t = curText.trim();
    if (t) paras.push({ chapterIdx: Math.max(curChapter, 0), text: t, heading: false });
    curText = '';
  };

  for (const line of body) {
    const t = line.text.trim();
    if (!t) continue;

    if (isHeadingLine(line, bodySize)) {
      flush();
      chapters.push({ idx: chapters.length, title: t, paraStart: paras.length, paraEnd: 0, sentenceStart: 0 });
      curChapter = chapters.length - 1;
      paras.push({ chapterIdx: curChapter, text: t, heading: true });
      lastY = line.y;
      lastPage = line.page;
      continue;
    }

    if (curChapter === -1) {
      // 第一个标题之前的内容归入“卷首”
      curChapter = 0;
      chapters.push({ idx: 0, title: '卷首', paraStart: paras.length, paraEnd: 0, sentenceStart: 0 });
    }

    const indented = line.x > bodyLeft + bodySize * 0.7;
    const gap = lastY !== null && lastPage === line.page ? lastY - line.y : null;
    const bigGap = gap !== null && gap > medianGap * 1.55 && gap < bodySize * 7;
    const startsNew = curText === '' || indented || bigGap;

    if (startsNew) {
      flush();
      curText = t;
    } else {
      const prevChar = curText.slice(-1);
      const nextChar = t[0] ?? '';
      if (prevChar === '-' && /[a-z]/.test(nextChar)) {
        curText = curText.slice(0, -1) + t; // 英文断词：exam- ple → example
      } else if (needsSpace(prevChar, nextChar)) {
        curText += ' ' + t;
      } else {
        curText += t;
      }
    }
    lastY = line.y;
    lastPage = line.page;
  }
  flush();

  // 6. 章节区间收口，剔除空章节并重排索引
  for (let i = 0; i < chapters.length; i++) {
    const next = chapters[i + 1];
    chapters[i].paraEnd = next ? next.paraStart : paras.length;
  }
  const kept = chapters.filter((c) => c.paraEnd > c.paraStart);
  const oldToNew = new Map<number, number>();
  kept.forEach((c, i) => oldToNew.set(c.idx, i));
  const keptFinal = kept.map((c, i) => ({ ...c, idx: i }));
  for (const p of paras) {
    p.chapterIdx = oldToNew.get(p.chapterIdx) ?? 0;
  }

  // 7. 分句并建立索引
  const paragraphs: ParagraphData[] = [];
  const sentences: SentenceData[] = [];
  const chapterSentenceStart = keptFinal.map(() => -1);
  paras.forEach((p, i) => {
    paragraphs.push({ idx: i, chapterIdx: p.chapterIdx, text: p.text, heading: p.heading || undefined });
    const parts = splitSentences(p.text);
    for (const s of parts) {
      const sIdx = sentences.length;
      sentences.push({ idx: sIdx, paraIdx: i, text: s });
      const cs = chapterSentenceStart[p.chapterIdx];
      if (cs !== undefined && cs < 0) chapterSentenceStart[p.chapterIdx] = sIdx;
    }
  });
  keptFinal.forEach((c, i) => {
    c.sentenceStart = chapterSentenceStart[i] < 0 ? 0 : chapterSentenceStart[i];
  });

  const charCount = paragraphs.reduce((acc, p) => acc + p.text.length, 0);
  const numPages = pages.length;
  const isScanned = (numPages >= 3 && charCount / numPages < 25) || charCount < 10;

  return {
    chapters: keptFinal,
    paragraphs,
    sentences,
    totalSentences: sentences.length,
    charCount,
    isScanned,
  };
}
