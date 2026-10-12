import Dexie, { type Table } from 'dexie';
import type { BookRecord, ParsedBook, ProgressRecord } from '../types';

export interface FileRecord {
  bookId: string;
  blob: Blob;
}

export interface SettingRecord {
  key: string;
  value: unknown;
}

export class ReaderDB extends Dexie {
  books!: Table<BookRecord, string>;
  files!: Table<FileRecord, string>;
  parsed!: Table<ParsedBook, string>;
  progress!: Table<ProgressRecord, string>;
  settings!: Table<SettingRecord, string>;

  constructor() {
    super('pdf-audiobook-reader');
    this.version(1).stores({
      books: 'id, name, lastReadAt, parseStatus',
      files: 'bookId',
      parsed: 'bookId',
      progress: 'bookId, updatedAt',
      settings: 'key',
    });
  }
}

export const db = new ReaderDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const rec = await db.settings.get(key);
    return rec === undefined ? fallback : (rec.value as T);
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  try {
    await db.settings.put({ key, value });
  } catch (e) {
    console.warn('设置保存失败', e);
  }
}

export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const est = await navigator.storage.estimate();
    return { usage: est.usage ?? 0, quota: est.quota ?? 0 };
  } catch {
    return null;
  }
}
