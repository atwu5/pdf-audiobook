/**
 * 生成用于自测的样例 PDF：public/sample-test.pdf
 * 特性：重复页眉、页脚页码、三个 Chapter、跨页长段落、首行缩进。
 * 运行：node scripts/make-test-pdf.mjs
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, '../public/sample-test.pdf');

const W = 612;
const H = 792;

function fillerSentence(i) {
  const subjects = ['The keeper', 'A quiet harbor', 'The morning fog', 'An old map', 'The village bell', 'A distant ship'];
  const verbs = ['recorded every detail of', 'drifted slowly past', 'settled gently over', 'revealed the location of', 'echoed across', 'sailed steadily toward'];
  const objects = ['the lighthouse journal', 'the rocky peninsula', 'the sleeping town', 'the northern channel', 'the empty bay', 'the open sea'];
  return `${subjects[i % 6]} ${verbs[(i * 3 + 1) % 6]} ${objects[(i * 5 + 2) % 6]}.`;
}

function paraText(seed, sentenceCount) {
  const parts = [];
  for (let i = 0; i < sentenceCount; i++) parts.push(fillerSentence(seed + i));
  return parts.join(' ');
}

/** 固定 78 字符宽手工断行，保证跨页位置可预测 */
function fixedLines(words, count, startSeed) {
  const lines = [];
  let pool = [];
  let s = startSeed;
  while (lines.length < count) {
    if (pool.length === 0) {
      pool = paraText(s++, 4).split(' ');
    }
    let line = '';
    while (line.length < 70 && pool.length) {
      const w = pool.shift();
      if ((line + ' ' + w).trim().length > 78) {
        pool.unshift(w);
        break;
      }
      line = (line + ' ' + w).trim();
    }
    lines.push(line || 'the quiet line');
  }
  void words;
  return lines;
}

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
let pageNo = 0;

function addPage() {
  const page = doc.addPage([W, H]);
  pageNo++;
  page.drawText('TESTBOOK HEADER', { x: 262, y: H - 42, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  page.drawText(`- ${pageNo} -`, { x: 295, y: 32, size: 9, font, color: rgb(0.45, 0.45, 0.45) });
  return page;
}

function drawChapter(title, paragraphLineBlocks) {
  let page = addPage();
  let y = H - 90;
  page.drawText(title, { x: 72, y, size: 16, font: bold });
  y -= 28;
  for (const lines of paragraphLineBlocks) {
    let first = true;
    for (const line of lines) {
      if (y < 60) {
        page = addPage();
        y = H - 90;
      }
      page.drawText(line, { x: 72 + (first ? 18 : 0), y, size: 11, font });
      y -= 15;
      first = false;
    }
    y -= 10;
  }
}

// 卷首段落（第一个标题之前）
drawChapter0();

function drawChapter0() {
  let page = addPage();
  let y = H - 90;
  const intro = fixedLines(null, 4, 100);
  let first = true;
  for (const line of intro) {
    page.drawText(line, { x: 72 + (first ? 18 : 0), y, size: 11, font });
    y -= 15;
    first = false;
  }
  y -= 10;
  void page;
}

// Chapter 1：普通段落
drawChapter('Chapter 1 The Old Lighthouse', [
  fixedLines(null, 8, 200),
  fixedLines(null, 6, 240),
  fixedLines(null, 9, 280),
]);

// Chapter 2：第一个段落 50 行，必然跨页（每页正文约 43 行）
drawChapter('Chapter 2 The Winter Storm', [crossPagePara(), fixedLines(null, 5, 500)]);

function crossPagePara() {
  const lines = fixedLines(null, 48, 400);
  // 在固定位置埋入跨页短语，断言合并后完整
  lines[40] = 'the light swept across the bay and the keeper watched it go';
  lines[41] = 'and fell upon the rocks below the cliff wall continuing without';
  lines[42] = 'any pause in the narration flow';
  return lines;
}

// Chapter 3：多段落
drawChapter('Chapter 3 The Quiet Harbor', [
  fixedLines(null, 7, 600),
  fixedLines(null, 7, 640),
  fixedLines(null, 7, 680),
]);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, await doc.save());
console.log(`sample pdf written: ${outPath} (${pageNo} pages)`);
