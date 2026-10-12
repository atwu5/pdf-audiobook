import type { BookRecord, ParsedBook } from '../types';
import { db } from '../db/database';
import { parseBook } from '../pdf';
import { askConfirm, toast, useUI } from '../store/uiStore';
import { usePlayer } from '../store/playerStore';

const MAX_SIZE = 300 * 1024 * 1024;

/** 串行导入队列，避免同时解析多本大文件卡死 UI */
let chain: Promise<void> = Promise.resolve();

export function importPdf(file: File): Promise<void> {
  chain = chain.then(() => doImport(file)).catch((e) => {
    console.error('导入失败', e);
  });
  return chain;
}

// 开发环境暴露钩子，便于自动化冒烟测试
if (import.meta.env.DEV) {
  (window as unknown as { __importPdf?: (f: File) => Promise<void> }).__importPdf = importPdf;
}

async function doImport(file: File) {
  const isPdf = (file.type && file.type.includes('pdf')) || /\.pdf$/i.test(file.name);
  if (!isPdf) {
    toast('仅支持导入 PDF 文件', 'error');
    return;
  }
  if (file.size > MAX_SIZE) {
    toast('文件过大（超过 300MB），无法导入', 'error');
    return;
  }
  if (file.size === 0) {
    toast('文件为空，无法导入', 'error');
    return;
  }

  // 重复导入检测：同名且同大小
  const displayName = file.name.replace(/\.pdf$/i, '');
  const sameName = await db.books.where('name').equals(displayName).toArray();
  const dup = sameName.find((b) => b.size === file.size);
  if (dup) {
    const ok = await askConfirm({
      title: '可能重复导入',
      message: `书架中已有《${displayName}》（名称与大小都相同）。仍要再次导入一份吗？`,
      confirmText: '仍要导入',
    });
    if (!ok) return;
  }

  // 申请持久化存储，降低浏览器自动清理风险
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }

  const id = crypto.randomUUID();
  try {
    const book: BookRecord = {
      id,
      name: displayName,
      size: file.size,
      pages: 0,
      addedAt: Date.now(),
      lastReadAt: Date.now(),
      parseStatus: 'parsing',
    };
    await db.books.add(book);
    await db.files.put({ bookId: id, blob: file });

    const result = await parseBook(file, {
      onProgress: (page, total) => {
        void db.books.update(id, { parseProgress: { page, total }, pages: total });
      },
      onCover: (cover) => {
        if (cover) void db.books.update(id, { cover });
      },
    });

    if (result.isScanned) {
      await db.books.update(id, {
        parseStatus: 'needs_ocr',
        isScanned: true,
        pages: result.numPages,
        charCount: result.charCount,
        parseProgress: undefined,
      });
      toast(`《${displayName}》是扫描版 PDF，需要 OCR 才能朗读`, 'warn');
      return;
    }

    const parsed: ParsedBook = {
      bookId: id,
      chapters: result.chapters,
      paragraphs: result.paragraphs,
      sentences: result.sentences,
      totalSentences: result.totalSentences,
      parsedAt: result.parsedAt,
      parserVersion: result.parserVersion,
    };
    await db.parsed.put(parsed);
    await db.books.update(id, {
      parseStatus: 'done',
      pages: result.numPages,
      charCount: result.charCount,
      sentenceCount: result.sentences.length,
      parseProgress: undefined,
      parseError: undefined,
    });
    toast(`《${displayName}》导入完成：${result.numPages} 页 / ${result.sentences.length} 句`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    try {
      await db.books.update(id, { parseStatus: 'failed', parseError: msg, parseProgress: undefined });
    } catch {
      /* ignore */
    }
    toast(`《${displayName}》解析失败：${msg}`, 'error');
  }
}

export async function deleteBook(id: string): Promise<void> {
  const player = usePlayer.getState();
  if (player.bookId === id) {
    player.reset();
  }
  try {
    await db.transaction('rw', db.books, db.files, db.parsed, db.progress, async () => {
      await db.books.delete(id);
      await db.files.delete(id);
      await db.parsed.delete(id);
      await db.progress.delete(id);
    });
    toast('已删除该书及全部相关数据');
  } catch (e) {
    console.error(e);
    useUI.getState().toast('删除失败：浏览器存储读写异常', 'error');
  }
}
