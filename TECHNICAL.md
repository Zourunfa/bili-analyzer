# B站字幕分析器 — 技术架构文档

## 项目概述

一个基于 Next.js 的全栈 Web 应用，用户粘贴 B 站视频链接后，自动提取字幕并利用大语言模型（通义千问）生成 AI 摘要，支持基于字幕内容的对话式问答。对于没有 CC 字幕的视频，自动调用语音转写引擎作为回退方案。

---

## 技术栈

| 层级 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 框架 | Next.js (App Router) | 16.2.2 | 全栈框架，SSR + API Routes |
| 前端 | React | 19.2.4 | UI 渲染 |
| UI 库 | Ant Design | 6.x | 页面组件（Input、Card、Tabs 等） |
| 样式 | Tailwind CSS | 4.x | 原子化 CSS |
| AI SDK | Vercel AI SDK (`ai`) | 6.x | 流式文本生成 |
| AI 模型 | 通义千问 (qwen-plus) | — | DashScope 兼容 OpenAI 接口 |
| 视频处理 | VideoCaptioner (Pyth进程on CLI) | 1.4.1 | 语音转写回退方案 |
| 部署 | PM2 + Nginx | — | 管理 + 反向代理 |

---

## 目录结构

```
src/
├── app/
│   ├── layout.tsx              # 根布局（html lang、metadata）
│   ├── page.tsx                # 首页（输入视频链接）
│   ├── globals.css             # 全局样式 + Tailwind + CSS 变量
│   ├── analyze/
│   │   └── [bvid]/
│   │       └── page.tsx        # 分析页（字幕 + AI 摘要 + 对话）
│   └── api/
│       ├── video-info/route.ts # 获取视频元信息
│       ├── subtitle/route.ts   # 获取 CC 字幕
│       ├── transcribe/route.ts # 语音转写（无 CC 字幕时的回退）
│       ├── summarize/route.ts  # AI 摘要（流式）
│       ├── chat/route.ts       # AI 对话（流式）
│       └── debug/route.ts      # 调试接口（逐步检测 WBI 签名流程）
└── lib/
    ├── bilibili.ts             # B 站 API 封装（WBI 签名、字幕获取）
    ├── qwen.ts                 # 通义千问模型配置
    ├── prompts.ts              # AI 系统 Prompt
    ├── videocaptioner.ts       # VideoCaptioner CLI 封装
    └── utils.ts                # 工具函数（cn class 合并）
```

---

## 核心数据流

```
用户输入链接
    │
    ▼
┌─────────────────────────────────────────────┐
│  首页 (page.tsx)                             │
│  POST /api/video-info { url }               │
│  → extractBvId() → getVideoInfo()           │
│  → 跳转到 /analyze/{bvid}?cid={cid}         │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────┐
│  分析页 (analyze/[bvid]/page.tsx)            │
│                                              │
│  1. POST /api/subtitle { bvid, cid }        │
│     ├─ 有 CC 字幕 → subtitleSource: "cc"    │
│     │   直接拿到字幕文本                      │
│     │                                        │
│     └─ 无 CC 字幕 → subtitleSource: "none"  │
│         POST /api/transcribe { bvid }        │
│         → downloadVideo()                    │
│         → transcribeAudio()                  │
│         → parseSrt()                         │
│         → 清理临时文件                        │
│                                              │
│  2. 拿到字幕后，POST /api/summarize          │
│     → streamText() 流式生成摘要               │
│                                              │
│  3. 用户提问，POST /api/chat                 │
│     → streamText() 流式对话                   │
└─────────────────────────────────────────────┘
```

---

## 模块详解

### 1. B 站 API 封装 (`lib/bilibili.ts`)

#### WBI 签名机制

B 站从 2023 年起对部分 API（如字幕接口）要求 WBI 签名，防止未授权调用。签名流程：

1. **获取密钥**：调用 `/x/web-interface/nav` 拿到 `wbi_img.img_url` 和 `wbi_img.sub_url`
2. **提取 Key**：从 URL 路径中截取文件名部分（如 `https://i0.hdslb.com/bfs/wbi/xxx.png` → `xxx`）
3. **生成 Mixin Key**：将 `imgKey + subKey` 拼接后，按固定索引表（`MIXIN_KEY_ENC_TAB`，64 个数字）重排字符，取前 32 位
4. **参数签名**：
   - 加入 `wts`（当前时间戳）
   - 所有参数按 key 字典序排列
   - 过滤 `!'()*` 特殊字符
   - 拼接为 query string，加上 mixinKey，计算 MD5 得到 `w_rid`
5. **发起请求**：将 `w_rid` 和 `wts` 附加到 URL 参数中

```
imgKey + subKey → 按索引表重排 → mixinKey (32位)
params + wts → 排序 → 过滤 → queryString
MD5(queryString + mixinKey) → w_rid
```

#### SESSDATA 认证

通过 Cookie 中的 `SESSDATA` 标识登录状态，用于访问需要登录的 API（如获取 CC 字幕）。从浏览器 `F12 → Application → Cookies` 中获取。

#### 字幕获取逻辑

```
优先级：ai-zh > zh-CN > zh-Hans > 其他
```

AI 生成的中文字幕（`ai-zh`）优先于手动上传的。字幕以 JSON 格式返回，每条包含 `from`（开始时间）、`to`（结束时间）、`content`（文字）。

---

### 2. AI 集成 (`lib/qwen.ts` + `lib/prompts.ts`)

#### 模型配置

通过 `@ai-sdk/openai-compatible` 适配器连接阿里云 DashScope API：

```typescript
createOpenAICompatible({
  name: "qwen",
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
```

使用模型 `qwen-plus`，兼顾性能和成本。

#### 流式响应

`summarize` 和 `chat` 两个 API 都使用 Vercel AI SDK 的 `streamText()` 实现流式输出：

```typescript
const result = streamText({
  model: qwen("qwen-plus"),
  system: SYSTEM_PROMPT,
  messages: [...],
});
return result.toTextStreamResponse();
```

前端通过 `ReadableStream` 逐块读取，实现打字机效果。

#### Prompt 设计

**摘要 Prompt**：要求按固定结构输出——概要、关键要点、详细摘要（带时间线）、总结。

**对话 Prompt**：将完整字幕文本注入 system prompt 作为上下文，要求 AI 基于字幕内容回答，不编造信息。

---

### 3. 语音转写 (`lib/videocaptioner.ts`)

当视频没有 CC 字幕时的回退方案，调用 Python CLI 工具 VideoCaptioner。

#### 处理流程

```
downloadVideo(bvid)
  → execFile("videocaptioner", ["download", url, "-o", workDir])
  → 扫描目录找到视频文件（.mp4/.mkv/.webm）
  → 返回文件路径

transcribeAudio(videoPath)
  → execFile("videocaptioner", ["transcribe", videoPath, "--asr", "bijian", "--format", "srt", "-o", outputPath])
  → 读取生成的 .srt 文件
  → 返回 SRT 文本

parseSrt(srtText)
  → 按空行分块
  → 正则提取时间戳和文本
  → 转换为统一的 SubtitleItem[] 格式

cleanup(path)
  → 递归删除临时目录
```

#### ASR 引擎

使用必剪（bijian）语音识别引擎，免费且不需要 API Key。通过 `--asr bijian` 参数指定。

#### 临时文件管理

- 所有临时文件存放在 `/tmp/bilibili-subtitle/{uuid}/`
- 每次请求创建独立目录，用完即删
- `finally` 块确保异常时也能清理

---

### 4. 前端页面

#### 首页 (`app/page.tsx`)

- 单输入框 + 按钮，粘贴 B 站链接后提交
- 调用 `/api/video-info` 获取 BV 号和 CID
- 跳转到 `/analyze/{bvid}?cid={cid}`
- 渐变背景 + 居中卡片布局

#### 分析页 (`app/analyze/[bvid]/page.tsx`)

**三栏布局**：
- Header：项目名 + 视频标题
- 左侧栏（360px）：视频封面卡片 + 可滚动字幕内容
- 右侧主区域：Tab 切换（AI 摘要 / 对话）

**字幕获取状态机**：

```
初始 → 获取视频信息
     → 请求 CC 字幕
       ├─ 有字幕 → 生成摘要
       └─ 无字幕 → 显示"正在下载视频..."
                → 语音转写
                → 显示"转写完成，正在生成摘要..."
                → 生成摘要
```

**流式渲染**：
- 摘要：150ms 节流更新 `ReactMarkdown`，避免高频重渲染
- 对话：每收到一个 chunk，追加到最后一条 assistant 消息
- 光标闪烁动画模拟打字效果

**Markdown 样式**：
- 全局 `.markdown-body` 类覆盖标题、段落、列表、引用等元素样式
- `<br>` 标签预处理替换为 `\n\n`

---

### 5. API 路由

| 路由 | 方法 | 入参 | 出参 | 说明 |
|------|------|------|------|------|
| `/api/video-info` | POST | `{ url }` | VideoInfo | 提取 BV 号，获取视频元信息 |
| `/api/subtitle` | POST | `{ bvid, cid }` | `{ subtitles, text, subtitleSource }` | 获取 CC 字幕 |
| `/api/transcribe` | POST | `{ bvid }` | `{ subtitles, text }` | 下载视频 + 语音转写 |
| `/api/summarize` | POST | `{ subtitleText }` | Stream | 流式 AI 摘要 |
| `/api/chat` | POST | `{ messages, subtitleText }` | Stream | 流式 AI 对话 |
| `/api/debug` | GET | `?url=...` | 步骤详情 | 调试 WBI 签名全流程 |

#### `/api/subtitle` 的三态返回

```typescript
// 1. 有 CC 字幕
{ subtitles: [...], text: "...", count: 163, subtitleSource: "cc" }

// 2. 无 CC 字幕（前端应转调 transcribe）
{ subtitleSource: "none" }

// 3. 其他错误
{ error: "错误信息" }  // HTTP 500
```

---

### 6. 调试接口 (`api/debug/route.ts`)

独立的调试端点，不依赖 `lib/bilibili.ts`，自己实现一遍完整的 WBI 签名流程。逐步返回每一步的结果，方便排查：

1. 环境变量检查（SESSDATA 是否设置）
2. 视频信息获取（bvid → cid）
3. 登录态检查（nav API → isLogin）
4. WBI 密钥提取（img_key, sub_key）
5. 签名 + 调用 player API
6. 字幕列表检查

---

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DASHSCOPE_API_KEY` | 是 | 阿里云通义千问 API Key |
| `BILIBILI_SESSDATA` | 是 | B 站登录凭证 Cookie |

获取方式：
- DashScope：https://dashscope.console.aliyun.com/
- SESSDATA：浏览器登录 bilibili.com → F12 → Application → Cookies → SESSDATA

---

## 部署架构

```
用户浏览器
    │ http://120.76.141.65 (80端口)
    ▼
Nginx（反向代理）
    │ 转发到 127.0.0.1:3000
    ▼
Next.js 应用（PM2 守护进程）
    │
    ├─ /api/video-info  → B站 API
    ├─ /api/subtitle    → B站 API（WBI 签名）
    ├─ /api/transcribe  → VideoCaptioner CLI
    ├─ /api/summarize   → DashScope API（流式）
    └─ /api/chat        → DashScope API（流式）
```

服务器配置：阿里云 ECS 2核2G + 3Mbps + Ubuntu 22.04，加 2G Swap。

详见 [DEPLOY.md](./DEPLOY.md)。

---

## 关键设计决策

1. **BFF 架构**：Next.js API Routes 作为中间层，前端不直接调用 B 站/AI 的 API，避免暴露密钥和跨域问题
2. **流式响应**：AI 生成的内容较长（可能数千字），流式输出避免用户长时间等待空白页面
3. **双通道字幕**：优先 CC 字幕（快速、准确），无 CC 时回退到语音转写（覆盖面广）
4. **Prompt 注入上下文**：将完整字幕文本放入 system prompt，而非每次对话都附带，减少 token 消耗
5. **独立调试端点**：`/api/debug` 自包含完整签名逻辑，不依赖主代码，方便独立排查问题
