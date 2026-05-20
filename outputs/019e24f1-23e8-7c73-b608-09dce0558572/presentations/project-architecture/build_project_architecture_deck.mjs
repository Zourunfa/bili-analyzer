import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const localRequire = createRequire(import.meta.url);
const rootRequire = createRequire(path.join(process.cwd(), "package.json"));
const pptxgen = localRequire("pptxgenjs");
const sharp = rootRequire("sharp");

const WORKSPACE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.join(WORKSPACE, "output");
const ASSETS = path.join(WORKSPACE, "assets");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ASSETS, { recursive: true });

const COLORS = {
  ink: "#172026",
  muted: "#5E6B73",
  line: "#B7C4CE",
  bg: "#F7FAFC",
  navy: "#183B56",
  blue: "#2F80ED",
  cyan: "#14B8A6",
  green: "#2E7D32",
  amber: "#D97706",
  red: "#C2410C",
  purple: "#6D5BD0",
  panel: "#FFFFFF",
  softBlue: "#EAF3FF",
  softCyan: "#E7FAF7",
  softAmber: "#FFF4E5",
  softPurple: "#F1EEFF",
  softGreen: "#EAF7EE",
};

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapText(text, max = 16) {
  const str = String(text);
  const lines = [];
  let current = "";
  for (const ch of str) {
    const wide = /[\u4e00-\u9fa5]/.test(ch) ? 2 : 1;
    const len = [...current].reduce((n, c) => n + (/[\u4e00-\u9fa5]/.test(c) ? 2 : 1), 0);
    if (len + wide > max && current) {
      lines.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function svgBox({ x, y, w, h, title, lines = [], fill = "#FFFFFF", stroke = COLORS.line, titleColor = COLORS.ink, radius = 16 }) {
  const titleLines = wrapText(title, Math.max(8, Math.floor(w / 12)));
  const lineEls = [];
  let ty = y + 32;
  for (const ln of titleLines) {
    lineEls.push(`<text x="${x + w / 2}" y="${ty}" text-anchor="middle" class="boxTitle" fill="${titleColor}">${esc(ln)}</text>`);
    ty += 24;
  }
  let ly = Math.max(y + 74, ty + 2);
  for (const line of lines) {
    for (const part of wrapText(line, Math.max(12, Math.floor(w / 10)))) {
      lineEls.push(`<text x="${x + 18}" y="${ly}" class="boxLine">${esc(part)}</text>`);
      ly += 21;
    }
  }
  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
  ${lineEls.join("\n")}`;
}

function arrow({ x1, y1, x2, y2, label = "", color = COLORS.navy, dashed = false }) {
  const dash = dashed ? `stroke-dasharray="8 8"` : "";
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - 8;
  return `
  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="3" ${dash} marker-end="url(#arrow)"/>
  ${label ? `<rect x="${mx - 82}" y="${my - 18}" width="164" height="28" rx="14" fill="#fff" stroke="${COLORS.line}"/><text x="${mx}" y="${my + 2}" text-anchor="middle" class="arrowLabel">${esc(label)}</text>` : ""}`;
}

function baseSvg(title, subtitle, body, { width = 1600, height = 900 } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<defs>
  <marker id="arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto" markerUnits="strokeWidth">
    <path d="M2,2 L10,6 L2,10 z" fill="${COLORS.navy}"/>
  </marker>
  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
    <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#0F172A" flood-opacity="0.12"/>
  </filter>
</defs>
<style>
  .title{font:700 40px Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif; fill:${COLORS.ink}}
  .subtitle{font:400 20px Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif; fill:${COLORS.muted}}
  .boxTitle{font:700 22px Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif}
  .boxLine{font:400 17px Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif; fill:${COLORS.muted}}
  .group{font:700 17px Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif; fill:${COLORS.navy}; letter-spacing:.4px}
  .small{font:400 15px Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif; fill:${COLORS.muted}}
  .arrowLabel{font:600 14px Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif; fill:${COLORS.navy}}
</style>
<rect width="${width}" height="${height}" fill="${COLORS.bg}"/>
<text x="64" y="66" class="title">${esc(title)}</text>
<text x="64" y="100" class="subtitle">${esc(subtitle)}</text>
${body}
</svg>`;
}

function architectureSvg() {
  const body = `
  <text x="80" y="148" class="group">用户与前端体验</text>
  <text x="382" y="148" class="group">Next.js BFF / API Routes</text>
  <text x="780" y="148" class="group">领域服务与任务编排</text>
  <text x="1158" y="148" class="group">外部依赖与持久化</text>
  ${svgBox({ x: 70, y: 170, w: 240, h: 142, title: "Web Client", lines: ["首页 / 分析页 / 笔记本", "搜索 / UP 主分析", "React 19 + Ant Design"], fill: COLORS.softBlue, stroke: "#8BBDF7" })}
  ${svgBox({ x: 360, y: 170, w: 300, h: 142, title: "API BFF 层", lines: ["/api/video-info", "/api/subtitle / transcribe", "/api/summarize / chat", "/api/videos / notebooks"], fill: "#FFFFFF" })}
  ${svgBox({ x: 750, y: 170, w: 282, h: 142, title: "Platform Adapter", lines: ["platform.ts 统一入口", "bilibili / douyin / xiaohongshu", "短链解析 + 元信息抓取"], fill: COLORS.softCyan, stroke: "#72D6CB" })}
  ${svgBox({ x: 1120, y: 160, w: 190, h: 120, title: "内容平台", lines: ["B站 API", "抖音页面/XHR", "小红书链接解析"], fill: COLORS.softAmber, stroke: "#F2B15F" })}
  ${svgBox({ x: 1346, y: 160, w: 180, h: 120, title: "PostgreSQL", lines: ["Prisma 7", "用户/视频/知识库", "pgvector embedding"], fill: COLORS.softGreen, stroke: "#7CCB91" })}
  ${svgBox({ x: 70, y: 390, w: 240, h: 120, title: "NextAuth", lines: ["邮箱密码登录", "JWT Session", "邮箱验证 token"], fill: COLORS.softPurple, stroke: "#A99CF0" })}
  ${svgBox({ x: 360, y: 390, w: 300, h: 120, title: "AI Streaming APIs", lines: ["Vercel AI SDK streamText", "摘要 / 对话 / 知识提取", "模型可配置"], fill: COLORS.softBlue, stroke: "#8BBDF7" })}
  ${svgBox({ x: 750, y: 390, w: 282, h: 120, title: "Subtitle Pipeline", lines: ["CC 字幕优先", "无字幕走音频下载", "VideoCaptioner / SRT parse"], fill: "#FFFFFF" })}
  ${svgBox({ x: 1120, y: 350, w: 190, h: 120, title: "LLM Providers", lines: ["DashScope/Qwen", "DeepSeek/OpenAI/Kimi", "Anthropic/自定义"], fill: COLORS.softPurple, stroke: "#A99CF0" })}
  ${svgBox({ x: 1346, y: 350, w: 180, h: 120, title: "文件系统", lines: ["/tmp/bilibili-subtitle", "临时音频/SRT", "cookie 持久化"], fill: "#FFFFFF" })}
  ${svgBox({ x: 360, y: 610, w: 300, h: 116, title: "Search / Knowledge", lines: ["字幕全文检索", "知识点抽取", "笔记本聚合"], fill: COLORS.softGreen, stroke: "#7CCB91" })}
  ${svgBox({ x: 750, y: 610, w: 282, h: 116, title: "Deploy Runtime", lines: ["local Docker build", ".next/standalone release", "PM2 + Nginx"], fill: COLORS.softAmber, stroke: "#F2B15F" })}
  ${arrow({ x1: 310, y1: 240, x2: 360, y2: 240, label: "HTTP / UI action" })}
  ${arrow({ x1: 660, y1: 240, x2: 750, y2: 240, label: "route orchestration" })}
  ${arrow({ x1: 1032, y1: 240, x2: 1120, y2: 220, label: "fetch metadata" })}
  ${arrow({ x1: 660, y1: 440, x2: 750, y2: 440, label: "subtitle fallback" })}
  ${arrow({ x1: 1032, y1: 440, x2: 1120, y2: 410, label: "LLM stream" })}
  ${arrow({ x1: 660, y1: 450, x2: 1346, y2: 220, label: "Prisma read/write", dashed: true })}
  ${arrow({ x1: 1032, y1: 450, x2: 1346, y2: 410, label: "temp files", dashed: true })}
  ${arrow({ x1: 660, y1: 668, x2: 1346, y2: 245, label: "knowledge/query data", dashed: true })}
  <rect x="70" y="790" width="1456" height="54" rx="16" fill="#FFFFFF" stroke="${COLORS.line}"/>
  <text x="92" y="824" class="small">核心判断：这是一个 Next.js BFF 型全栈应用，前端体验、API 编排、平台适配、AI 流式能力和 PostgreSQL 知识沉淀都在同一代码库内闭环。</text>`;
  return baseSvg("项目总体架构图", "Bilibili Subtitle Analyzer / VideoNote：多平台视频解析、字幕转写、AI 摘要与知识管理", body);
}

const tableGroups = [
  { title: "认证与用户", x: 64, y: 150, color: COLORS.softPurple, tables: [
    ["users", "id, email, name, password, email_verified_at"],
    ["email_verification_tokens", "email, token, expires_at"],
  ]},
  { title: "视频核心", x: 64, y: 430, color: COLORS.softBlue, tables: [
    ["videos", "bvid, title, cid, subtitle_text, summary, knowledge_extracted"],
    ["user_videos", "user_id, video_id, created_at"],
    ["up_profiles", "mid, name, face, video_count, last_synced_at"],
  ]},
  { title: "笔记本组织", x: 570, y: 150, color: COLORS.softGreen, tables: [
    ["notebooks", "user_id, title, tags[], mode, rule, video_count"],
    ["notebook_videos", "notebook_id, video_id, notes, order"],
  ]},
  { title: "知识与检索", x: 570, y: 430, color: COLORS.softAmber, tables: [
    ["knowledge_points", "video_id, type, content, timestamp, metadata"],
    ["embeddings", "knowledge_point_id, vector(1024)"],
    ["chat_messages", "user_id, video_id, role, content"],
  ]},
  { title: "个人化标注", x: 1076, y: 150, color: COLORS.softCyan, tables: [
    ["video_timestamp_notes", "user_id, video_id, timestamp_sec, content"],
    ["video_tags", "user_id, name, color"],
    ["video_tag_relations", "user_id, video_id, tag_id"],
  ]},
];

function dbTableSvg() {
  let body = "";
  for (const group of tableGroups) {
    const tableH = 76;
    const step = 92;
    body += `<rect x="${group.x}" y="${group.y}" width="460" height="${group.tables.length * step + 58}" rx="18" fill="${group.color}" stroke="${COLORS.line}"/>`;
    body += `<text x="${group.x + 24}" y="${group.y + 42}" class="group">${esc(group.title)}</text>`;
    group.tables.forEach((t, i) => {
      const ty = group.y + 58 + i * step;
      body += `<rect x="${group.x + 20}" y="${ty}" width="420" height="${tableH}" rx="13" fill="#FFFFFF" stroke="${COLORS.line}"/>`;
      body += `<text x="${group.x + 42}" y="${ty + 30}" class="boxTitle" fill="${COLORS.ink}">${esc(t[0])}</text>`;
      for (const [j, line] of wrapText(t[1], 50).entries()) {
        body += `<text x="${group.x + 42}" y="${ty + 56 + j * 16}" class="small">${esc(line)}</text>`;
      }
    });
  }
  body += `<rect x="64" y="790" width="1458" height="54" rx="16" fill="#FFFFFF" stroke="${COLORS.line}"/>
  <text x="92" y="824" class="small">数据模型围绕 users 与 videos 两个主轴展开：用户侧做历史、笔记、标签、聊天隔离；视频侧承载字幕、摘要、知识点与向量检索。</text>`;
  return baseSvg("数据库表图", "Prisma/PostgreSQL：13 张业务表按职责域分组", body);
}

function erBox(x, y, w, h, title, fields, fill = "#FFFFFF") {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${COLORS.navy}" stroke-width="2"/>
  <rect x="${x}" y="${y}" width="${w}" height="38" rx="12" fill="${COLORS.navy}"/>
  <text x="${x + 16}" y="${y + 26}" class="boxTitle" fill="#FFFFFF">${esc(title)}</text>`;
  fields.forEach((f, i) => {
    s += `<text x="${x + 16}" y="${y + 64 + i * 21}" class="small">${esc(f)}</text>`;
  });
  return s;
}

function rel(x1, y1, x2, y2, label) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS.navy}" stroke-width="2.5" marker-end="url(#arrow)"/>
  <rect x="${mx - 34}" y="${my - 18}" width="68" height="26" rx="13" fill="#fff" stroke="${COLORS.line}"/>
  <text x="${mx}" y="${my + 1}" text-anchor="middle" class="arrowLabel">${esc(label)}</text>`;
}

function erSvg() {
  const body = `
  ${rel(310, 234, 386, 234, "1:N")}
  ${rel(596, 234, 680, 234, "N:1")}
  ${rel(190, 308, 190, 382, "email")}
  ${rel(310, 210, 1040, 190, "1:N")}
  ${rel(1270, 205, 1310, 200, "1:N")}
  ${rel(1310, 228, 940, 238, "N:1")}
  ${rel(940, 244, 1040, 408, "1:N")}
  ${rel(1270, 408, 1310, 406, "1:1")}
  ${rel(195, 610, 195, 308, "user")}
  ${rel(320, 670, 680, 260, "video")}
  ${rel(505, 610, 225, 308, "user")}
  ${rel(615, 670, 690, 670, "1:N")}
  ${rel(815, 610, 815, 324, "video")}
  ${rel(940, 670, 1040, 670, "chat")}
  ${rel(1160, 610, 885, 324, "video")}
  ${erBox(70, 160, 240, 148, "users", ["PK id", "email unique", "password hash", "email_verified_at"], COLORS.softPurple)}
  ${erBox(70, 382, 240, 112, "email_tokens", ["PK id", "email index", "token unique"], "#FFFFFF")}
  ${erBox(386, 184, 210, 118, "user_videos", ["FK user_id", "FK video_id", "unique pair"], "#FFFFFF")}
  ${erBox(680, 160, 260, 164, "videos", ["PK id", "bvid unique", "title / cid / owner", "subtitle_text / summary"], COLORS.softBlue)}
  ${erBox(690, 392, 250, 118, "up_profiles", ["PK id", "mid unique", "name / face / sign"], "#FFFFFF")}
  ${erBox(1040, 140, 230, 132, "notebooks", ["PK id", "FK user_id", "title / tags[] / rule"], COLORS.softGreen)}
  ${erBox(1310, 140, 220, 118, "notebook_videos", ["FK notebook_id", "FK video_id", "unique pair"], "#FFFFFF")}
  ${erBox(1040, 340, 230, 140, "knowledge_points", ["FK video_id", "type / content", "timestamp / metadata"], COLORS.softAmber)}
  ${erBox(1310, 350, 220, 112, "embeddings", ["FK knowledge_point_id", "vector(1024)", "1:1 knowledge"], "#FFFFFF")}
  ${erBox(70, 610, 250, 120, "video_timestamp_notes", ["FK user_id", "FK video_id", "timestamp_sec"], "#FFFFFF")}
  ${erBox(395, 610, 220, 120, "video_tags", ["FK user_id", "name unique per user", "color"], COLORS.softCyan)}
  ${erBox(690, 610, 250, 120, "video_tag_relations", ["FK user_id", "FK video_id", "FK tag_id"], "#FFFFFF")}
  ${erBox(1040, 610, 240, 120, "chat_messages", ["FK user_id", "FK video_id", "role/content"], "#FFFFFF")}
  <rect x="70" y="790" width="1450" height="54" rx="16" fill="#FFFFFF" stroke="${COLORS.line}"/>
  <text x="92" y="824" class="small">关系重点：videos 是内容资产中心，users 是权限与个性化中心；notebook_videos、user_videos、video_tag_relations 是三张主要关联表。</text>`;
  return baseSvg("ER 图", "实体关系与基数：用户、视频、笔记本、知识点、标签、聊天", body);
}

const files = [
  ["architecture", architectureSvg()],
  ["database-tables", dbTableSvg()],
  ["er-diagram", erSvg()],
];

for (const [name, svg] of files) {
  const svgPath = path.join(ASSETS, `${name}.svg`);
  const pngPath = path.join(ASSETS, `${name}.png`);
  fs.writeFileSync(svgPath, svg);
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
}

function addFooter(slide, n) {
  slide.addText("Bilibili Subtitle Analyzer / VideoNote 架构解析", { x: 0.45, y: 7.08, w: 7.3, h: 0.2, fontSize: 8, color: "6B7280" });
  slide.addText(String(n).padStart(2, "0"), { x: 12.25, y: 7.08, w: 0.6, h: 0.2, fontSize: 8, color: "6B7280", align: "right" });
}

function title(slide, t, s) {
  slide.addText(t, { x: 0.55, y: 0.36, w: 8.3, h: 0.38, fontFace: "Arial", bold: true, fontSize: 22, color: COLORS.ink.replace("#", ""), margin: 0 });
  if (s) slide.addText(s, { x: 0.56, y: 0.78, w: 10.5, h: 0.25, fontSize: 9.5, color: COLORS.muted.replace("#", ""), margin: 0 });
}

function pill(slide, text, x, y, color) {
  slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 1.78, h: 0.34, rectRadius: 0.08, fill: { color }, line: { color } });
  slide.addText(text, { x: x + 0.12, y: y + 0.09, w: 1.54, h: 0.12, fontSize: 8, bold: true, color: "FFFFFF", align: "center", margin: 0 });
}

function addBullets(slide, items, x, y, w, size = 12) {
  items.forEach((item, i) => {
    slide.addShape(pptx.ShapeType.ellipse, { x, y: y + i * 0.46 + 0.08, w: 0.08, h: 0.08, fill: { color: "2F80ED" }, line: { color: "2F80ED" } });
    slide.addText(item, { x: x + 0.18, y: y + i * 0.46, w, h: 0.25, fontSize: size, color: COLORS.ink.replace("#", ""), margin: 0.02, breakLine: false });
  });
}

const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Codex";
pptx.subject = "Bilibili Subtitle Analyzer architecture";
pptx.title = "Bilibili Subtitle Analyzer 项目架构解析";
pptx.company = "OpenAI";
pptx.lang = "zh-CN";
pptx.theme = {
  headFontFace: "Arial",
  bodyFontFace: "Arial",
  lang: "zh-CN",
};
pptx.defineLayout({ name: "LAYOUT_WIDE", width: 13.333, height: 7.5 });

let slideNo = 1;
{
  const slide = pptx.addSlide();
  slide.background = { color: "F7FAFC" };
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: "F7FAFC" }, line: { color: "F7FAFC" } });
  pill(slide, "Next.js 16 / Prisma / AI", 0.64, 0.74, "183B56");
  slide.addText("Bilibili Subtitle Analyzer", { x: 0.62, y: 1.42, w: 8.2, h: 0.58, fontSize: 31, bold: true, color: COLORS.ink.replace("#", ""), margin: 0 });
  slide.addText("项目架构图、架构解析、数据库表图与 ER 图", { x: 0.66, y: 2.12, w: 7.8, h: 0.34, fontSize: 17, color: COLORS.navy.replace("#", ""), margin: 0 });
  slide.addText("一个从多平台视频链接出发，经字幕/转写、LLM 摘要对话、知识沉淀，到 PostgreSQL 检索与笔记组织的 Next.js BFF 全栈应用。", { x: 0.66, y: 2.78, w: 6.65, h: 0.88, fontSize: 13, color: COLORS.muted.replace("#", ""), fit: "shrink", margin: 0.02, breakLine: false });
  slide.addImage({ path: path.join(ASSETS, "architecture.png"), x: 7.35, y: 0.92, w: 5.36, h: 3.02 });
  slide.addShape(pptx.ShapeType.rect, { x: 7.35, y: 4.25, w: 5.36, h: 1.86, fill: { color: "FFFFFF" }, line: { color: "D7E0E8" } });
  slide.addText("交付内容", { x: 7.65, y: 4.55, w: 1.6, h: 0.22, fontSize: 13, bold: true, color: COLORS.ink.replace("#", ""), margin: 0 });
  addBullets(slide, ["1. 项目总体架构图 + 架构解析 PPT", "2. 数据库表图（按领域分组）", "3. ER 图（实体关系与基数）"], 7.68, 4.94, 4.5, 10.5);
  addFooter(slide, slideNo++);
}

{
  const slide = pptx.addSlide();
  title(slide, "一页看懂：项目总体架构", "前端体验、API BFF、领域服务、外部平台、AI 与数据库在一个 Next.js 应用内闭环。");
  slide.addImage({ path: path.join(ASSETS, "architecture.png"), x: 0.48, y: 1.08, w: 12.35, h: 6.05 });
  addFooter(slide, slideNo++);
}

{
  const slide = pptx.addSlide();
  title(slide, "架构解析：BFF 是系统的中枢", "Next.js API Routes 不只是转发，而是在服务端完成鉴权、平台适配、字幕降级、流式 AI 与数据写入。");
  const cards = [
    ["用户入口", "app/page.tsx、analyze/[bvid]、notebooks、search、upowner 组成主要体验面。", "EAF3FF"],
    ["BFF 路由", "video-info / subtitle / transcribe / summarize / chat / videos / notebooks 分担边界。", "FFFFFF"],
    ["领域服务", "platform.ts 抽象多平台；bilibili.ts 处理 WBI；douyin/xhs 处理短链与页面解析。", "E7FAF7"],
    ["AI 能力", "llm.ts 统一多供应商模型；streamText 输出摘要、对话、知识抽取。", "F1EEFF"],
    ["数据沉淀", "Prisma 连接 PostgreSQL：视频、用户历史、笔记本、知识点、标签、聊天。", "EAF7EE"],
    ["部署形态", "本地 Docker 构建 .next/standalone，线上 PM2 运行，Nginx 反代到 3000。", "FFF4E5"],
  ];
  cards.forEach((c, i) => {
    const x = 0.6 + (i % 3) * 4.12;
    const y = 1.35 + Math.floor(i / 3) * 2.18;
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 3.62, h: 1.72, rectRadius: 0.08, fill: { color: c[2] }, line: { color: "D7E0E8" } });
    slide.addText(c[0], { x: x + 0.22, y: y + 0.2, w: 3.1, h: 0.25, fontSize: 14, bold: true, color: COLORS.ink.replace("#", ""), margin: 0 });
    slide.addText(c[1], { x: x + 0.22, y: y + 0.62, w: 3.15, h: 0.78, fontSize: 10.2, color: COLORS.muted.replace("#", ""), fit: "shrink", margin: 0.02, breakLine: false });
  });
  slide.addText("设计结论：应用选择“单体 BFF + 清晰领域模块”，换来部署简单、密钥不暴露、流式体验稳定；风险集中在长任务转写和小内存服务器资源控制。", { x: 0.78, y: 6.28, w: 11.9, h: 0.4, fontSize: 12, bold: true, color: COLORS.navy.replace("#", ""), margin: 0 });
  addFooter(slide, slideNo++);
}

{
  const slide = pptx.addSlide();
  title(slide, "核心业务链路：从链接到知识资产", "系统主流程是解析视频、拿字幕、生成摘要、保存历史，并在后续搜索/笔记本/对话中复用。");
  const steps = [
    ["1 输入链接", "支持 B站、抖音、小红书，也支持分享文案混合输入"],
    ["2 平台识别", "detectPlatform + extractVideoId 解析 bvid / aweme_id / noteId"],
    ["3 获取元信息", "封面、标题、作者、时长、CID、分 P 信息"],
    ["4 字幕链路", "CC 字幕优先；无字幕下载音频并走 VideoCaptioner 转写"],
    ["5 AI 生成", "摘要、对话、知识点抽取通过 streamText 流式返回"],
    ["6 数据沉淀", "videos / user_videos / knowledge_points / notebooks 等表复用资产"],
  ];
  steps.forEach((st, i) => {
    const x = 0.72 + i * 2.08;
    const y = 2.1;
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 1.66, h: 1.28, rectRadius: 0.08, fill: { color: i % 2 ? "FFFFFF" : "EAF3FF" }, line: { color: "B7C4CE" } });
    slide.addText(st[0], { x: x + 0.12, y: y + 0.18, w: 1.35, h: 0.2, fontSize: 12, bold: true, color: COLORS.navy.replace("#", ""), margin: 0 });
    slide.addText(st[1], { x: x + 0.12, y: y + 0.52, w: 1.38, h: 0.52, fontSize: 8.6, color: COLORS.muted.replace("#", ""), fit: "shrink", margin: 0 });
    if (i < steps.length - 1) slide.addShape(pptx.ShapeType.chevron, { x: x + 1.72, y: y + 0.47, w: 0.24, h: 0.28, fill: { color: "183B56" }, line: { color: "183B56" } });
  });
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.78, y: 4.32, w: 5.7, h: 1.14, rectRadius: 0.08, fill: { color: "FFF4E5" }, line: { color: "F2B15F" } });
  slide.addText("关键降级策略", { x: 1.05, y: 4.58, w: 1.6, h: 0.2, fontSize: 13, bold: true, color: COLORS.ink.replace("#", ""), margin: 0 });
  slide.addText("字幕优先走平台 CC，速度最快；缺失时才进入下载与转写。生产环境用 TRANSCRIBE_MAX_CONCURRENCY=1、音频大小限制和超时控制避免小服务器被长任务拖垮。", { x: 2.6, y: 4.46, w: 3.55, h: 0.52, fontSize: 9.5, color: COLORS.muted.replace("#", ""), fit: "shrink", margin: 0 });
  slide.addShape(pptx.ShapeType.roundRect, { x: 6.9, y: 4.32, w: 5.7, h: 1.14, rectRadius: 0.08, fill: { color: "EAF7EE" }, line: { color: "7CCB91" } });
  slide.addText("核心资产复用", { x: 7.18, y: 4.58, w: 1.7, h: 0.2, fontSize: 13, bold: true, color: COLORS.ink.replace("#", ""), margin: 0 });
  slide.addText("同一视频记录沉淀字幕、摘要和知识点；不同用户通过 user_videos、notes、tags、chat_messages 做个性化隔离。", { x: 8.75, y: 4.5, w: 3.35, h: 0.48, fontSize: 9.5, color: COLORS.muted.replace("#", ""), fit: "shrink", margin: 0 });
  addFooter(slide, slideNo++);
}

{
  const slide = pptx.addSlide();
  title(slide, "模块边界：平台、字幕、AI、知识四条主干", "源码结构已经把“平台接入”和“业务应用”分开，后续扩平台或换模型的改动半径较小。");
  const lanes = [
    ["平台接入", "src/lib/platform.ts\nsrc/lib/bilibili.ts\nsrc/lib/douyin.ts\nsrc/lib/xiaohongshu.ts", "解析 ID、抓元信息、处理短链、B站 WBI 签名"],
    ["字幕/转写", "src/app/api/subtitle\nsrc/app/api/transcribe\nsrc/lib/videocaptioner.ts", "CC 字幕、音频下载、SRT 解析、临时文件清理"],
    ["AI 编排", "src/lib/llm.ts\nsrc/lib/prompts.ts\n/api/summarize / chat / knowledge", "多供应商模型、流式输出、知识点抽取"],
    ["知识产品", "/api/videos\n/api/notebooks\n/api/search\n/api/tags", "历史、笔记本、标签、搜索、聊天记录"],
  ];
  lanes.forEach((ln, i) => {
    const y = 1.3 + i * 1.35;
    slide.addShape(pptx.ShapeType.roundRect, { x: 0.62, y, w: 2.05, h: 0.92, rectRadius: 0.08, fill: { color: ["EAF3FF","FFF4E5","F1EEFF","EAF7EE"][i] }, line: { color: "D7E0E8" } });
    slide.addText(ln[0], { x: 0.86, y: y + 0.31, w: 1.5, h: 0.2, fontSize: 14, bold: true, color: COLORS.ink.replace("#", ""), align: "center", margin: 0 });
    slide.addShape(pptx.ShapeType.roundRect, { x: 3.0, y, w: 3.8, h: 0.92, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { color: "D7E0E8" } });
    slide.addText(ln[1], { x: 3.2, y: y + 0.15, w: 3.35, h: 0.54, fontSize: 9.4, color: COLORS.navy.replace("#", ""), fit: "shrink", margin: 0 });
    slide.addShape(pptx.ShapeType.roundRect, { x: 7.16, y, w: 5.36, h: 0.92, rectRadius: 0.08, fill: { color: "FFFFFF" }, line: { color: "D7E0E8" } });
    slide.addText(ln[2], { x: 7.42, y: y + 0.27, w: 4.8, h: 0.25, fontSize: 10.5, color: COLORS.muted.replace("#", ""), fit: "shrink", margin: 0 });
  });
  addFooter(slide, slideNo++);
}

{
  const slide = pptx.addSlide();
  title(slide, "部署架构：小内存服务器的 standalone 发布", "推荐路径是本地/CI 构建，服务器只解压 release 并由 PM2 运行，避免 2G ECS 上 npm/build 卡死。");
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.72, y: 1.28, w: 3.2, h: 4.95, rectRadius: 0.08, fill: { color: "EAF3FF" }, line: { color: "8BBDF7" } });
  slide.addText("构建侧", { x: 1.0, y: 1.62, w: 1.4, h: 0.22, fontSize: 15, bold: true, color: COLORS.ink.replace("#", ""), margin: 0 });
  addBullets(slide, ["Docker linux/amd64", "npm ci + next build", "复制 public 与 .next/static", "打包 standalone tar.gz"], 1.02, 2.08, 2.45, 10);
  slide.addShape(pptx.ShapeType.chevron, { x: 4.16, y: 3.3, w: 0.42, h: 0.5, fill: { color: "183B56" }, line: { color: "183B56" } });
  slide.addShape(pptx.ShapeType.roundRect, { x: 4.88, y: 1.28, w: 3.2, h: 4.95, rectRadius: 0.08, fill: { color: "FFF4E5" }, line: { color: "F2B15F" } });
  slide.addText("服务器 release", { x: 5.15, y: 1.62, w: 1.8, h: 0.22, fontSize: 15, bold: true, color: COLORS.ink.replace("#", ""), margin: 0 });
  addBullets(slide, ["/root/bili-analyzer-standalone/uploads", "/releases/<commit>", "current -> releases/<commit>", "复制 .env / data"], 5.15, 2.08, 2.5, 10);
  slide.addShape(pptx.ShapeType.chevron, { x: 8.32, y: 3.3, w: 0.42, h: 0.5, fill: { color: "183B56" }, line: { color: "183B56" } });
  slide.addShape(pptx.ShapeType.roundRect, { x: 9.05, y: 1.28, w: 3.2, h: 4.95, rectRadius: 0.08, fill: { color: "EAF7EE" }, line: { color: "7CCB91" } });
  slide.addText("运行侧", { x: 9.32, y: 1.62, w: 1.4, h: 0.22, fontSize: 15, bold: true, color: COLORS.ink.replace("#", ""), margin: 0 });
  addBullets(slide, ["PM2: subtitle", "start-server.js 读取 env", "Nginx -> 127.0.0.1:3000", "公网 www.afai.asia"], 9.32, 2.08, 2.45, 10);
  slide.addText("运维要点：迁移要在 release 切换前完成；不要在 2G 线上机器跑完整 npm install/build。长任务转写需要并发、大小、超时三道护栏。", { x: 0.82, y: 6.62, w: 11.5, h: 0.3, fontSize: 11.2, bold: true, color: COLORS.navy.replace("#", ""), margin: 0 });
  addFooter(slide, slideNo++);
}

{
  const slide = pptx.addSlide();
  title(slide, "数据库表图：按职责域分组", "13 张表围绕 users 和 videos 展开，既支持多用户隔离，也支持知识化复用。");
  slide.addImage({ path: path.join(ASSETS, "database-tables.png"), x: 0.48, y: 1.08, w: 12.35, h: 6.05 });
  addFooter(slide, slideNo++);
}

{
  const slide = pptx.addSlide();
  title(slide, "ER 图：实体关系与基数", "关联表承担用户历史、笔记本收纳、标签关系三类 N:M 关系；知识点与 embedding 是 1:1 扩展。");
  slide.addImage({ path: path.join(ASSETS, "er-diagram.png"), x: 0.48, y: 1.08, w: 12.35, h: 6.05 });
  addFooter(slide, slideNo++);
}

{
  const slide = pptx.addSlide();
  title(slide, "数据模型解读：为什么这样拆表", "视频内容资产与用户个性化行为分离，既避免重复抓取/转写，也让不同用户的历史、标签、笔记互不污染。");
  const points = [
    ["内容资产中心", "videos 保存 bvid、字幕全文、摘要、来源和知识抽取状态；同一视频只需要沉淀一次。"],
    ["用户隔离层", "user_videos、video_timestamp_notes、video_tags、chat_messages 都带 user_id，保证历史和标注个人化。"],
    ["知识检索层", "knowledge_points 保存结构化片段，embeddings 用 pgvector 做向量扩展，支持语义检索演进。"],
    ["组织层", "notebooks + notebook_videos 让视频资产可以进入手工或规则驱动的学习集合。"],
  ];
  points.forEach((p, i) => {
    const x = i % 2 === 0 ? 0.75 : 6.85;
    const y = 1.5 + Math.floor(i / 2) * 2.08;
    slide.addShape(pptx.ShapeType.roundRect, { x, y, w: 5.25, h: 1.52, rectRadius: 0.08, fill: { color: ["EAF3FF","EAF7EE","FFF4E5","F1EEFF"][i] }, line: { color: "D7E0E8" } });
    slide.addText(p[0], { x: x + 0.28, y: y + 0.26, w: 2.3, h: 0.24, fontSize: 14, bold: true, color: COLORS.ink.replace("#", ""), margin: 0 });
    slide.addText(p[1], { x: x + 0.28, y: y + 0.7, w: 4.65, h: 0.42, fontSize: 10.3, color: COLORS.muted.replace("#", ""), fit: "shrink", margin: 0 });
  });
  slide.addShape(pptx.ShapeType.line, { x: 0.9, y: 6.05, w: 11.5, h: 0, line: { color: "B7C4CE", width: 1.2 } });
  slide.addText("索引策略集中在高频查询面：用户历史按 userId+updatedAt，视频关系按 videoId，知识点按 videoId/type，标签关系按 userId+tagId。", { x: 0.95, y: 6.32, w: 11.3, h: 0.25, fontSize: 11, color: COLORS.navy.replace("#", ""), bold: true, margin: 0 });
  addFooter(slide, slideNo++);
}

{
  const slide = pptx.addSlide();
  title(slide, "后续架构关注点", "项目已经形成完整闭环，下一步的主要挑战在异步任务、可观测性和线上资源隔离。");
  const risks = [
    ["转写任务异步化", "现在长任务仍在 API 请求路径内，建议后续引入队列/任务表，提升失败恢复和进度追踪。"],
    ["Playwright/抓取依赖", "抖音/小红书解析依赖页面/XHR，环境依赖和反爬波动需要更强降级与日志观测。"],
    ["迁移与发布分离", "数据库 migration 不应依赖线上源码目录临时 npm install，可改为 CI migration 或一次性迁移镜像。"],
    ["知识检索增强", "已有 knowledge_points + embeddings 基础，可补召回评估、重排、引用片段和权限过滤。"],
  ];
  risks.forEach((r, i) => {
    const y = 1.4 + i * 1.2;
    slide.addText(`0${i + 1}`, { x: 0.8, y: y + 0.08, w: 0.55, h: 0.24, fontSize: 14, bold: true, color: COLORS.blue.replace("#", ""), margin: 0 });
    slide.addText(r[0], { x: 1.55, y, w: 2.5, h: 0.24, fontSize: 13.5, bold: true, color: COLORS.ink.replace("#", ""), margin: 0 });
    slide.addText(r[1], { x: 4.15, y, w: 7.7, h: 0.42, fontSize: 10.5, color: COLORS.muted.replace("#", ""), fit: "shrink", margin: 0 });
    slide.addShape(pptx.ShapeType.line, { x: 0.8, y: y + 0.78, w: 11.4, h: 0, line: { color: "D7E0E8", width: 1 } });
  });
  slide.addText("一句话总结：当前架构适合快速迭代和单机部署；当使用量上来，优先把转写/抓取/知识抽取从请求链路拆成可恢复任务。", { x: 0.9, y: 6.45, w: 11.35, h: 0.28, fontSize: 12.2, bold: true, color: COLORS.navy.replace("#", ""), margin: 0 });
  addFooter(slide, slideNo++);
}

fs.writeFileSync(path.join(WORKSPACE, "source-notes.txt"), [
  "Source files inspected:",
  "- TECHNICAL.md",
  "- docs/STANDALONE_DEPLOYMENT.md",
  "- README.md",
  "- prisma/schema.prisma",
  "- src/lib/platform.ts, llm.ts, db.ts, auth.ts",
  "- src/app API route inventory",
  "",
  "Task mode: create",
  "Deck profile: engineering-platform",
].join("\n"));

fs.writeFileSync(path.join(WORKSPACE, "profile-plan.txt"), [
  "task mode: create",
  "primary deck-profile: engineering-platform",
  "required proof objects: architecture diagram, deployment diagram, database table map, ER diagram, module boundary slide",
  "source/asset requirements: use repo source only; no external logos/assets",
  "QA gates: diagrams must use real route/module/table names; database tables must match Prisma schema",
].join("\n"));

fs.writeFileSync(path.join(OUT, "architecture.mmd"), `flowchart LR
  Client["Web Client"] --> BFF["Next.js API Routes / BFF"]
  BFF --> Platform["Platform Adapters: Bilibili / Douyin / Xiaohongshu"]
  BFF --> AI["AI Streaming APIs"]
  BFF --> DB["PostgreSQL via Prisma"]
  Platform --> External["External video platforms"]
  AI --> LLM["LLM providers"]
  Platform --> Transcribe["VideoCaptioner / temp files"]
  Transcribe --> BFF
`);

fs.writeFileSync(path.join(OUT, "er.mmd"), `erDiagram
  users ||--o{ user_videos : owns
  users ||--o{ notebooks : owns
  users ||--o{ video_timestamp_notes : writes
  users ||--o{ video_tags : creates
  users ||--o{ video_tag_relations : applies
  users ||--o{ chat_messages : sends
  videos ||--o{ user_videos : appears_in
  videos ||--o{ notebook_videos : collected_by
  videos ||--o{ knowledge_points : yields
  videos ||--o{ video_timestamp_notes : annotated_by
  videos ||--o{ video_tag_relations : tagged_by
  videos ||--o{ chat_messages : discussed_in
  notebooks ||--o{ notebook_videos : contains
  knowledge_points ||--|| embeddings : embeds
  video_tags ||--o{ video_tag_relations : groups
`);

await pptx.writeFile({ fileName: path.join(OUT, "bilibili-subtitle-analyzer-architecture.pptx") });

console.log(JSON.stringify({
  pptx: path.join(OUT, "bilibili-subtitle-analyzer-architecture.pptx"),
  assets: files.map(([name]) => ({
    svg: path.join(ASSETS, `${name}.svg`),
    png: path.join(ASSETS, `${name}.png`),
  })),
  mermaid: [path.join(OUT, "architecture.mmd"), path.join(OUT, "er.mmd")],
}, null, 2));
