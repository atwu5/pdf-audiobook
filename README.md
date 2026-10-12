# 声阅 · PDF 智能听书阅读器

一个**本地优先**的 PDF 听书工具：导入本地 PDF，像音乐播放器一样实时高亮朗读位置，支持多音色、语速调节、拖动进度和断点续播。纯前端静态应用，无需注册登录，不上传任何文件到服务器。

技术栈：React 18 + TypeScript + Vite 5 + Tailwind CSS 3 + PDF.js 4 + Web Speech API + Dexie.js（IndexedDB）+ Zustand + React Router。

## 快速开始

要求 Node.js ≥ 18（推荐 20+）。

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（默认 http://localhost:5173）
npm run build        # 类型检查 + 产线构建（输出 dist/）
npm run preview      # 本地预览构建产物
npm run test:parser  # Node 端解析自测（无需浏览器）
```

> 部署说明：构建产物为静态文件，任意静态服务器可托管。路由使用 Hash 模式，无需服务端重写规则。直接双击 `dist/index.html` 打开会因 ES Module 的 file:// 限制而失败，请使用 `npm run preview` 或任意 HTTP 服务。

仓库内附带 `public/sample-test.pdf`（5 页英文样例书，含重复页眉、页码、三个章节与跨页段落），没有合适 PDF 时可直接用它体验。

## 项目结构

```
src/
├── main.tsx / App.tsx           # 入口与路由（书架 / 阅读页）
├── types.ts                     # Book / Chapter / Paragraph / Sentence / Progress 类型
├── db/database.ts               # Dexie：books / files / parsed / progress / settings 五张表
├── pdf/
│   ├── assemble.ts              # 纯函数文本组装：页眉页脚过滤、段落拼接、章节识别、分句（可单测）
│   ├── extract.ts               # pdfjs 提取层：行聚类、行内拼接、封面渲染
│   └── index.ts                 # 解析编排（封面 → 提取 → 组装 → 扫描版判定）
├── tts/
│   ├── speechEngine.ts          # 朗读引擎单例：句队列、跳转、暂停回退、错误恢复
│   └── useVoices.ts             # 音色列表加载（处理 voiceschanged 异步）
├── store/
│   ├── playerStore.ts           # 播放状态 + 断点持久化（防抖 + 多时机落库）
│   ├── settingsStore.ts         # 全局默认设置（音色/语速/字号/行距/自动滚动）
│   └── uiStore.ts               # Toast 与确认框
├── library/importer.ts          # 导入队列、重复检测、删除清理
├── pages/
│   ├── BookshelfPage.tsx        # 书架：导入/拖拽/搜索/封面网格/删除
│   └── ReaderPage.tsx           # 阅读页：断点恢复、抽屉、自动跟随
└── components/
    ├── reader/ReaderView.tsx    # 正文渲染（句子级 span + DOM 高亮切换 + 懒绘制）
    ├── reader/TocPanel.tsx      # 章节目录
    ├── reader/SettingsPanel.tsx # 音色/语速/字号/行距/自动滚动
    ├── player/PlayerBar.tsx     # 底部播放器（进度条拖拽预览、上下句/段）
    ├── ToastHost.tsx / Icons.tsx
scripts/
├── make-test-pdf.mjs            # 生成样例测试 PDF（pdf-lib）
└── test-parser.ts               # 解析自测（英文全链路 + 中文合成用例，22 项断言）
```

## 已实现功能（对照需求）

### 书架
- ✅ 点击 / 拖拽导入 PDF（多文件排队解析，实时显示解析进度页数）
- ✅ 自动提取书名、页数、正文、封面（第 1 页渲染缩略图）
- ✅ 最近阅读优先排序、书名搜索、封面进度条与“上次听到 X%”
- ✅ 删除书籍（二次确认，同时清理 PDF 原件 / 解析缓存 / 进度）
- ✅ 空状态引导；重复导入检测（同名且同大小弹确认）
- ✅ IndexedDB 持久化，刷新/重启浏览器不丢失；页脚显示本地存储用量

### 阅读与朗读（核心）
- ✅ PDF 正文重排版展示（非截图），保留章节标题 / 段落缩进
- ✅ 页眉页脚、纯页码自动过滤；段间合并（首行缩进 / 段间距 / 跨页续段 / 英文断词）
- ✅ 点击任意句子开始朗读；当前句柔和背景高亮（box-decoration 克隆跨行）
- ✅ 上一句 / 下一句 / 上一段 / 下一段精准切换
- ✅ 进度条以**全文句子索引**为基准；拖动时实时预览“章节 · 句子文本”，松开定位并开始朗读
- ✅ 播放/暂停不丢位置；换位置后从新位置继续，绝不自动跳回第一页
- ✅ 语速 0.75x–2x、多音色切换，切换后从当前位置继续（句级）
- ✅ 自动跟随滚动（朗读句保持居中）；用户滚动即暂停跟随，出现「回到朗读位置」按钮
- ✅ 字号（15–28px）、行距（1.5–2.4）调节；移动端抽屉与 PC 弹层

### 断点续播
- ✅ 每本书独立保存：章节 / 段落 / 句子 ID、百分比、音色、语速、自动滚动偏好
- ✅ 保存时机：位置变化（防抖 700ms）、暂停、停止、页面隐藏（visibilitychange）、页面关闭（pagehide）、切换书籍——不只依赖关闭事件
- ✅ 重新打开弹出「继续朗读 / 从头开始 / 暂不」，点击后才发声（规避自动播放限制）
- ✅ 两本书进度完全独立；刷新 / 退出浏览器后断点仍有效

### 多音色
- ✅ 列出设备实际可用的音色，中文音色优先分组展示，其他语言折叠
- ✅ 正确处理 voiceschanged 异步加载；无中文音色时明确提示
- ✅ 不伪造音色名称；音色选择按 URI 记忆（全局默认 + 每本书进度各一份）

### PDF 解析与容错
- ✅ PDF.js 文字层提取；解析进度（页 x/y）展示
- ✅ 扫描版识别：文字层过少时标记「需要 OCR」并在阅读页明确提示（不展示假正文）
- ✅ 解析失败显示真实原因（加密 / 无文本等），不伪造进度
- ✅ 解析结果缓存，二次打开秒开；架构预留 OCR 扩展入口（`parseBook` 的 `isScanned` 分支）

## 自动化测试结果

`npm run test:parser`（Node 22 实测通过，22/22）：

- 样例 PDF 全链路（英文，5 页）：页数 ✓、4 章节识别 ✓、页眉过滤 ✓、页脚页码过滤 ✓、跨页段落合并（埋入短语断言）✓、句子拼接严格等于原文 ✓、非扫描版 ✓
- 中文合成用例：第一章识别 ✓、首行缩进分段 ✓、无缩进续行合并 ✓、跨页续段 ✓、中文分句 ✓、引号归属前句 ✓、小数点不切分 ✓、超长句二次切分 ✓
- `npm run build`：TypeScript strict 全量检查 + Vite 构建通过（pdf.js worker 正常打包）
- dev server 所有模块 200（Vite 转换无错误）

## 手工测试清单（浏览器语音无法自动化验证的部分）

| # | 场景 | 步骤 | 预期 |
|---|------|------|------|
| 1 | 大文档 | 导入 100+ 页文字型 PDF | 卡片显示解析进度，完成后可打开 |
| 2 | 点击定位 | 阅读页点击中间任意句子 | 从该句开始朗读并高亮 |
| 3 | 拖动进度 | 朗读中拖进度条 | 实时预览章节+句子，松开后从该位置朗读 |
| 4 | 暂停续播 | 暂停 → 播放 | 从暂停句继续，不从头开始 |
| 5 | 刷新恢复 | 朗读中刷新页面 | 弹出「继续朗读？」，点继续从原句开始 |
| 6 | 退出恢复 | 关闭浏览器 → 重开 → 打开书 | 断点仍在，继续朗读正确 |
| 7 | 双书隔离 | 两本书分别读到不同位置 | 进度互不影响 |
| 8 | 音色/语速 | 朗读中切换音色和语速 | 从当前句继续，无重叠语音 |
| 9 | 上下句/段 | 点击四个切换按钮 | 精准移动高亮并朗读 |
| 10 | 删除 | 删除一本正在读的书 | 播放停止，书架无残留 |
| 11 | 移动端 | 手机 Chrome/Safari 打开 | 单列书架、迷你播放器、无横向滚动、播放器不遮正文 |
| 12 | 扫描版 | 导入扫描版 PDF | 卡片标「需要 OCR」，阅读页明确提示 |
| 13 | 音色列表 | 打开朗读设置 | 列出真实音色；无中文音色时给出提示 |
| 14 | 后台/锁屏 | 手机切后台或锁屏 | 以浏览器实际支持为准（iOS Safari 锁屏可能暂停），回来后可手动继续 |

## 已知限制（如实说明，无虚构）

1. **OCR 未实现**（P0 明确不要求）：扫描版只识别并提示；扩展入口已预留。
2. **云端 TTS 未接入**：MVP 使用浏览器 Web Speech API；`SpeechEngine` 已按 `TtsProvider` 接口封装，未来可实现同接口的云端引擎替换。
3. **音色由设备决定**：macOS 有 Siri/Tingting 等中文音色，Windows 视安装情况，Linux/部分安卓可能只有少量或没有中文音色——应用如实展示，不伪装。
4. **复杂版式**：双栏/多栏 PDF 的阅读顺序可能错乱（按 y 轴行聚类，未做栏切分）；艺术排版、竖排、表格内文字可能被并入正文。单栏常规中文书籍效果最好。
5. **后台播放**：浏览器锁屏/后台的朗读能力以浏览器实现为准，不做承诺；iOS Safari 锁屏通常会暂停。
6. **本地优先**：数据只存当前浏览器（IndexedDB），无跨设备同步；清理浏览器数据会丢失书籍，已申请 `navigator.storage.persist()` 降低被自动清理的概率。
7. **深色主题 / 睡眠定时 / PWA**：属 P1，未实现。
8. 朗读高亮为**句级**同步：部分浏览器支持 word boundary 回调，但为保证跨浏览器一致性未启用逐字高亮。

## 部署（外网访问）

本项目为**纯静态 SPA**：无后端、无数据库，构建产物 `dist/` 可托管到任意静态服务。

### GitHub Pages（推荐）

仓库已内置自动部署工作流 `.github/workflows/deploy.yml`（push 到 main 即自动构建并发布）：

1. 在 GitHub 新建一个**公开**仓库（如 `pdf-audiobook-reader`，Pages 免费额度要求公开仓库，或用 Pro 私有仓库）
2. 本地执行：
   ```bash
   git remote add origin git@github.com:<你的用户名>/pdf-audiobook-reader.git
   git push -u origin main
   ```
3. 仓库 Settings → Pages → Source 选 **GitHub Actions**（首次部署后自动选中）
4. 约 1-2 分钟后访问：`https://<你的用户名>.github.io/pdf-audiobook-reader/`

路由为 Hash 模式、资源为相对路径，子路径托管无需任何额外配置。

### 其他平台

- **Vercel / Netlify / Cloudflare Pages**：导入仓库，构建命令 `npm run build`，产物目录 `dist`，零配置即可。

### 部署后的注意事项

- 朗读、IndexedDB、文件读取均要求 **HTTPS**（GitHub Pages 自带）；
- 音色来自**访问者的设备/浏览器**：手机 Chrome/Safari 自带中文音色可直接用；桌面端取决于系统语音包；
- 数据按设备隔离：每台设备各自的书架与进度，互不相通（本地优先设计的边界）。

## 架构要点

- **统一位置数据**：Book → Chapter → Paragraph → Sentence 全局索引，进度条、高亮、点击定位、断点续播共用同一套 ID。
- **朗读引擎单例**：全应用只有一处 SpeechSynthesis 调用；`gen` 计数器作废过期回调，跳转/切换时旧语音事件不会污染新状态。
- **渲染性能**：正文段落 `content-visibility: auto` 懒绘制；高亮切换走 DOM class（`usePlayer.subscribe`），句子变化不触发整篇 React 重渲染。
- **隐私**：所有数据（PDF 原件、解析结果、进度、设置）都在本机 IndexedDB，无任何网络上传。
