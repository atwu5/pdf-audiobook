/**
 * Node 端解析自测：不依赖浏览器。
 * 运行：npm run test:parser
 *
 * 覆盖：
 *  1. 用生成的样例 PDF（英文，含重复页眉/页码/章节/跨页段落）走完整解析链路
 *  2. 用合成的中文行数据验证：章节识别、首行缩进分段、跨页续段、分句
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractLinesFromDoc } from '../src/pdf/extract';
import { assembleDocument, splitSentences } from '../src/pdf/assemble';
import type { RawLine } from '../src/pdf/assemble';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let failed = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  console.log('== 1. 样例 PDF 全链路 ==');
  const pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdfPath = path.resolve(__dirname, '../public/sample-test.pdf');
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
  const { pages } = await extractLinesFromDoc(doc as any);

  check('页数正确（应为 5+ 页）', doc.numPages >= 5, `numPages=${doc.numPages}`);
  check('每页都有提取出行', pages.every((p: RawLine[]) => p.length > 0));

  const result = assembleDocument(pages, { bookName: 'Sample Test' });
  const allText = result.paragraphs.map((p) => p.text).join('\n');

  check('识别出 4 个章节（卷首 + 3 章）', result.chapters.length === 4, `实际 ${result.chapters.length}`);
  check('章节标题正确',
    result.chapters.some((c) => /Chapter 1/.test(c.title)) &&
    result.chapters.some((c) => /Chapter 2/.test(c.title)) &&
    result.chapters.some((c) => /Chapter 3/.test(c.title)),
    result.chapters.map((c) => c.title).join(' | '));

  check('页眉被过滤', !allText.includes('TESTBOOK HEADER'));
  check('页脚页码被过滤', !/\n-\s*\d+\s*-\n|\n-\s*\d+\s*-$/.test(allText) && !result.paragraphs.some((p) => /^-\s*\d+\s*-$/.test(p.text)));
  check('句子数量充足', result.sentences.length > 80, `实际 ${result.sentences.length}`);
  check('非扫描版判定', !result.isScanned);

  const cross = result.paragraphs.find((p) => p.text.includes('the light swept across the bay'));
  check('跨页段落合并成功', !!cross && cross.text.includes('continuing without any pause'),
    cross ? cross.text.slice(-80) : '未找到跨页段落');
  check('跨页段落中无页眉残留', !cross?.text.includes('TESTBOOK'));

  // 段落数合理（3+3+1+3 个段落左右，允许少量合并误差）
  const bodyParas = result.paragraphs.filter((p) => !p.heading);
  check('段落数量合理（>=8）', bodyParas.length >= 8, `实际 ${bodyParas.length}`);

  // 章节区间自洽
  check('章节句子索引单调递增',
    result.chapters.every((c, i) => i === 0 || c.sentenceStart >= result.chapters[i - 1].sentenceStart));
  check('总句数一致', result.totalSentences === result.sentences.length);

  console.log('\n== 2. 中文合成用例 ==');

  // 构造两页中文行：第一章 + 缩进段落 + 跨页续段 + 页眉页码
  const zhPages: RawLine[][] = [];
  const mk = (text: string, x: number, y: number, page: number, size = 12): RawLine => ({ text, x, y, size, page });

  const page1: RawLine[] = [
    mk('第一章 山中的清晨', 72, 700, 1, 16),
    mk('　　天还没亮，山里已经起了雾。老周把门推开，一股凉气涌了进来。', 90, 650, 1),
    mk('他披上外衣，走到院子里。雾气贴着地面流动，像一条白色的河。', 72, 620, 1),
    mk('　　灶房里传来劈柴的声音。女儿小满正在生火，锅里的水快要开了。', 90, 590, 1),
    mk('她抬头看见父亲，笑着说：今天要摘茶吗？', 72, 560, 1),
    mk('第一页页脚', 72, 40, 1),
  ];
  const page2: RawLine[] = [
    mk('第四章？不对，这是页眉', 72, 730, 2),
    mk('老周点点头，把竹篓背上肩。', 72, 690, 2),
    mk('山路的石阶被露水打湿，两个人一前一后，慢慢往茶园走去。', 72, 660, 2),
  ];
  // 注意：页1 第一行页眉没有放——放在 page2 首行，验证重复页眉过滤需要 >=3 页，
  // 这里只有 2 页，靠页码/纯文本过滤逻辑兜底；重复页眉过滤在样例 PDF 中已验证。
  zhPages.push(page1, page2);

  const zh = assembleDocument(zhPages, { bookName: '中文测试' });
  const zhText = zh.paragraphs.map((p) => p.text).join('\n');

  check('识别出第一章', zh.chapters.some((c) => c.title.startsWith('第一章')), zh.chapters.map((c) => c.title).join('|'));
  check('首行缩进成为新段落', zh.paragraphs.some((p) => p.text.startsWith('天还没亮')));
  check('无缩进行并入上一段', zh.paragraphs.some((p) => p.text.includes('涌了进来。他披上外衣')));
  check('跨页续段', zh.paragraphs.some((p) => p.text.includes('锅里的水快要开了。她抬头看见父亲')));
  check('中文分句正确', splitSentences('你好。世界！加油；再会…').length === 4,
    JSON.stringify(splitSentences('你好。世界！加油；再会…')));
  check('引号归属前句', splitSentences('她说：“走吧。”然后离开了。')[0] === '她说：“走吧。”');
  check('英文小数点不切分', splitSentences('圆周率是 3.14 没错。').length === 1,
    JSON.stringify(splitSentences('圆周率是 3.14 没错。')));
  check('超长句二次切分', Math.max(...splitSentences('这是一个没有标点超级长'.repeat(20) + '，然后再来一点内容。').map((s) => s.length)) <= 95);

  // 分句拼接等价性（样例 PDF 全文）
  const joinOk = result.paragraphs.every((p) => {
    const ss = result.sentences.filter((s) => s.paraIdx === p.idx).map((s) => s.text);
    return ss.join('') === p.text;
  });
  check('句子拼接严格等于原文', joinOk);

  await doc.destroy?.();
  console.log(failed === 0 ? '\n全部通过 ✓' : `\n${failed} 项失败 ✗`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
