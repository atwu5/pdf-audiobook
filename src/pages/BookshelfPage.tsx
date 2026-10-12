import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import type { BookRecord } from '../types';
import { db, estimateStorage } from '../db/database';
import { deleteBook, importPdf } from '../library/importer';
import { fmtBytes, relTime } from '../utils/format';
import { useUI } from '../store/uiStore';
import { IconBookOpen, IconSearch, IconTrash, IconUpload } from '../components/Icons';

function BookCard({
  book,
  percent,
  onDelete,
}: {
  book: BookRecord;
  percent?: number;
  onDelete: (b: BookRecord) => void;
}) {
  const navigate = useNavigate();
  const parsing = book.parseStatus === 'parsing' || book.parseStatus === 'pending';
  const showProgress = book.parseStatus === 'done' && percent !== undefined && percent > 0;
  return (
    <div
      className="group relative cursor-pointer select-none"
      onClick={() => navigate(`/book/${book.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(`/book/${book.id}`);
      }}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border border-line bg-white shadow-sm transition-shadow group-hover:shadow-md">
        {book.cover ? (
          <img src={book.cover} alt={book.name} className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-paperDeep to-[#e0d2b8] px-3">
            <IconBookOpen className="text-accent" width={30} height={30} />
            <span className="line-clamp-3 text-center text-sm font-medium text-ink/70">{book.name}</span>
          </div>
        )}
        {parsing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 px-3 text-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            <span className="text-xs text-white">
              解析中 {book.parseProgress ? `${book.parseProgress.page}/${book.parseProgress.total} 页` : '…'}
            </span>
          </div>
        )}
        {book.parseStatus === 'failed' && (
          <span className="absolute left-2 top-2 rounded-md bg-red-600 px-2 py-0.5 text-xs text-white">解析失败</span>
        )}
        {book.parseStatus === 'needs_ocr' && (
          <span className="absolute left-2 top-2 rounded-md bg-amber-500 px-2 py-0.5 text-xs text-white">需要 OCR</span>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <div className="line-clamp-2 text-sm font-medium leading-snug text-ink" title={book.name}>
          {book.name}
        </div>
        {showProgress && (
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, percent ?? 0)}%` }} />
          </div>
        )}
        <div className="mt-1 flex items-center justify-between text-xs text-inkSoft">
          <span>
            {showProgress ? `上次听到 ${percent}%` : ''}
            {book.parseStatus === 'failed' ? '无法解析' : ''}
            {book.parseStatus === 'needs_ocr' ? '无法朗读' : ''}
            {parsing ? '请稍候' : ''}
          </span>
          <span>{relTime(book.lastReadAt)}</span>
        </div>
      </div>
      <button
        className="absolute right-1.5 top-1.5 hidden rounded-full bg-black/45 p-1.5 text-white backdrop-blur hover:bg-red-600 group-hover:block"
        title="删除这本书"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(book);
        }}
      >
        <IconTrash width={15} height={15} />
      </button>
    </div>
  );
}

export default function BookshelfPage() {
  const navigate = useNavigate();
  const toast = useUI((s) => s.toast);
  const askConfirm = useUI((s) => s.askConfirm);
  const [search, setSearch] = useState('');
  const [dragging, setDragging] = useState(false);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const books = useLiveQuery(() => db.books.orderBy('lastReadAt').reverse().toArray(), []) ?? [];
  const progressMap = useLiveQuery(async () => {
    const all = await db.progress.toArray();
    const m = new Map<string, number>();
    for (const p of all) m.set(p.bookId, p.percent);
    return m;
  }, []) ?? new Map<string, number>();

  useEffect(() => {
    void estimateStorage().then(setStorage);
  }, [books.length]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => b.name.toLowerCase().includes(q));
  }, [books, search]);

  const openPicker = useCallback(() => fileInputRef.current?.click(), []);

  const onFiles = useCallback(
    (files: FileList | null) => {
      if (!files) return;
      const list = Array.from(files);
      if (!list.length) return;
      for (const f of list) void importPdf(f);
    },
    []
  );

  const handleDelete = useCallback(
    async (book: BookRecord) => {
      const ok = await askConfirm({
        title: '删除书籍',
        message: `确定删除《${book.name}》吗？将同时删除 PDF 原件、解析缓存与阅读进度，且不可恢复。`,
        confirmText: '删除',
        danger: true,
      });
      if (ok) await deleteBook(book.id);
    },
    [askConfirm]
  );

  return (
    <div
      className="min-h-screen"
      onDragEnter={(e) => {
        e.preventDefault();
        dragDepth.current++;
        if (e.dataTransfer.types.includes('Files')) setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current--;
        if (dragDepth.current <= 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        onFiles(e.dataTransfer.files);
      }}
    >
      {/* 顶栏 */}
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
              <IconBookOpen width={18} height={18} />
            </div>
            <span className="hidden text-lg font-semibold tracking-wide sm:block">声阅</span>
          </div>
          <div className="relative ml-auto w-full max-w-xs">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-inkSoft" width={16} height={16} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索书名"
              className="w-full rounded-full border border-line bg-white/70 py-1.5 pl-8 pr-3 text-sm outline-none placeholder:text-inkSoft/60 focus:border-accent"
            />
          </div>
          <button
            onClick={openPicker}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-white hover:bg-accentDeep sm:px-4"
          >
            <IconUpload width={16} height={16} />
            <span>导入 PDF</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              onFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {filtered.length === 0 ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-3xl border-2 border-dashed border-line bg-white/60">
              <IconBookOpen className="text-accent" width={34} height={34} />
            </div>
            <div>
              <p className="text-base font-medium text-ink">
                {books.length === 0 ? '书架还是空的' : '没有找到匹配的书籍'}
              </p>
              <p className="mt-1 text-sm text-inkSoft">
                {books.length === 0
                  ? '导入本地 PDF，开始边读边听。文件只保存在本设备浏览器中，不会上传。'
                  : '换个关键词试试。'}
              </p>
            </div>
            {books.length === 0 && (
              <button
                onClick={openPicker}
                className="flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-white hover:bg-accentDeep"
              >
                <IconUpload width={16} height={16} />
                选择 PDF 文件
              </button>
            )}
            <p className="text-xs text-inkSoft/70">也可以把 PDF 文件直接拖拽到页面任意位置</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((b) => (
              <BookCard key={b.id} book={b} percent={progressMap.get(b.id)} onDelete={handleDelete} />
            ))}
          </div>
        )}

        <footer className="mt-10 pb-8 text-center text-xs text-inkSoft/70">
          {storage ? (
            <span>
              本地存储已用 {fmtBytes(storage.usage)}
              {storage.quota ? ` / 约 ${fmtBytes(storage.quota)}` : ''} ·{' '}
            </span>
          ) : null}
          数据仅保存在当前浏览器，清理浏览器数据会导致书籍与进度丢失
        </footer>
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center bg-accent/15 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-accent bg-paper/95 px-10 py-8 shadow-xl">
            <IconUpload className="text-accent" width={36} height={36} />
            <p className="text-sm font-medium text-ink">松开导入 PDF</p>
          </div>
        </div>
      )}
    </div>
  );
}
