/**
 * 真实书籍解析验证脚本：
 * 用项目的解析管线（extract + assemble）处理任意 PDF，输出统计与样本。
 * 运行：npx tsx scripts/parse-book.ts <pdf路径> [输出json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLinesFromDoc } from '../src/pdf/extract';
import { assembleDocument } from '../src/pdf/assemble';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2];
const outJson = process.argv[3];

if (!input || !fs.existsSync(input)) {
  console.error('usage: npx tsx scripts/parse-book.ts <pdf路径> [输出json]');
  process.exit(1);
}

const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
const data = new Uint8Array(fs.readFileSync(input));
console.log(`解析中：${path.basename(input)}（${(data.length / 1024 / 1024).toFixed(1)} MB）`);

console.time('文本提取');
const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
const { pages } = await extractLinesFromDoc(doc as any, (p, t) => {
  if (p % 50 === 0 || p === t) console.log(`  第 ${p}/${t} 页`);
});
console.timeEnd('文本提取');

const result = assembleDocument(pages, { bookName: path.basename(input, '.pdf') });

console.log('\n===== 解析统计 =====');
console.log(`页数：${doc.numPages}`);
console.log(`正文字符：${result.charCount}`);
console.log(`段落：${result.paragraphs.length}`);
console.log(`句子：${result.sentences.length}`);
console.log(`扫描版判定：${result.isScanned ? '是（需要 OCR）' : '否，有文字层'}`);
console.log(`章节数：${result.chapters.length}`);

console.log('\n===== 章节列表（前 24 个） =====');
for (const c of result.chapters.slice(0, 24)) {
  console.log(`  [${c.idx}] ${c.title.slice(0, 30)}  （${c.paraEnd - c.paraStart} 段 / 第 ${c.sentenceStart} 句起）`);
}

// 页眉残留检测：统计重复出现的短段落
const shortCount = new Map<string, number>();
for (const p of result.paragraphs) {
  if (p.text.length <= 30) shortCount.set(p.text, (shortCount.get(p.text) ?? 0) + 1);
}
const topRepeat = [...shortCount.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log('\n===== 高频重复短段落（页眉残留检查，应为空或极少） =====');
if (topRepeat.length === 0) console.log('  无 ✓');
for (const [t, n] of topRepeat) console.log(`  ×${n}  ${t.slice(0, 30)}`);

// 样本段落质量
console.log('\n===== 正文样本（第 2 段前 150 字） =====');
const sample = result.paragraphs.filter((p) => !p.heading)[1] ?? result.paragraphs[0];
console.log(`  ${sample.text.slice(0, 150)}`);
console.log('\n===== 正文样本（全书中间段前 150 字） =====');
const mid = result.paragraphs[Math.floor(result.paragraphs.length / 2)];
console.log(`  ${mid.text.slice(0, 150)}`);

// 供朗读用的 JSON + 摘录
if (outJson) {
  const target = result.chapters.find((c) => c.title !== '卷首') ?? result.chapters[0];
  const chIdx = target ? target.idx : 0;
  const chapterSentences = result.sentences.filter((s) => {
    const para = result.paragraphs[s.paraIdx];
    return para && para.chapterIdx === chIdx;
  });
  const excerpt = chapterSentences.slice(0, 16).map((s) => s.text).join('');
  fs.mkdirSync(path.dirname(outJson), { recursive: true });
  fs.writeFileSync(
    outJson,
    JSON.stringify(
      {
        bookName: path.basename(input, '.pdf'),
        pages: doc.numPages,
        charCount: result.charCount,
        chapters: result.chapters.map((c) => ({ idx: c.idx, title: c.title, sentenceStart: c.sentenceStart })),
        sentences: result.sentences.map((s) => s.text),
        excerptChapter: target?.title ?? '',
        excerpt,
      },
      null,
      0
    )
  );
  console.log(`\nJSON 已写入：${outJson}`);
  console.log(`朗读摘录（${target?.title ?? ''} 前 16 句，${excerpt.length} 字）已就绪`);
}
await doc.destroy?.();
