export function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = 60_000;
  if (diff < m) return '刚刚';
  if (diff < 60 * m) return `${Math.floor(diff / m)} 分钟前`;
  if (diff < 24 * 60 * m) return `${Math.floor(diff / (60 * m))} 小时前`;
  if (diff < 7 * 24 * 60 * m) return `${Math.floor(diff / (24 * 60 * m))} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function fmtPercent(cur: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round(((cur + 1) / total) * 1000) / 10}%`;
}
