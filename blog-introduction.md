# 我做了一个 AI 视频知识提取平台：把 B 站视频变成结构化知识库

> 本文首发于个人技术博客，记录了 [Bilibili Subtitle Analyzer](https://github.com/zourunfa/bilibili-subtitle-analyzer) 的设计思路与技术实现。

## 起因

作为一个重度 B 站用户，我经常在技术教程、知识区视频中刷到大量优质内容。但视频的问题在于——**看完就忘**。一小时的技术分享，我能记住的可能只有几个模糊的关键词。做笔记？边看边停边记，效率极低。

于是我想：能不能让 AI 帮我自动从视频里提取知识点，构建一个可检索的个人知识库？

这就是这个项目的初衷。

## 它能做什么

一句话概括：**粘贴视频链接，AI 自动提取结构化知识点，构建你的个人知识库。**

支持三大平台：
- **B 站**（Bilibili）—— 完整支持，包括分P/多章节视频
- **抖音**（Douyin）—— 支持短视频和常规视频
- **小红书**（Xiaohongshu）—— 支持视频笔记解析

核心功能拆解：

### 1. AI 结构化分析

这是最核心的能力。AI 会从视频字幕/转录文本中提取四类结构化知识：

| 类型 | 说明 | 示例 |
|------|------|------|
| **主题（Topic）** | 视频讨论的核心话题 | "React Server Components 原理" |
| **要点（KeyPoint）** | 关键论点或结论 | "RSC 通过异步组件实现服务端渲染" |
| **概念（Concept）** | 需要理解的专业术语 | "Suspense Boundary" |
| **问答对（Q&A）** | 视频中解答的问题 | "什么时候该用 use server？" |

每个知识点都带有视频时间戳，点击可以跳转到对应位置回顾。

### 2. 笔记本管理

可以按学习主题创建笔记本，把相关视频归类整理。比如创建一个"Rust 入门"笔记本，把相关的教程视频都加进去，形成一个体系化的知识集合。

还支持**章节合集**——遇到分P的长视频，一键创建笔记本并自动逐章解析保存。

### 3. AI 对话

在分析页面可以直接和 AI 对话，基于当前视频内容提问。相当于有了一个"看过这个视频的助手"，可以追问细节、要求总结、甚至跨视频对比。

### 4. 知识检索

两层搜索能力：
- **全文搜索**：在所有视频的字幕和知识点中搜索关键词
- **语义搜索**：基于向量嵌入，用自然语言描述来查找相关知识点（比如"那个讲 React 性能优化的视频里提到了什么？"）

### 5. 思维导图

自动根据提取的知识点生成思维导图，支持全屏查看，帮助你直观理解视频的知识结构。

### 6. Skill 导出

把笔记本里的知识打包成标准的 Agent Skill 格式，可以直接喂给 AI 助手使用。相当于把视频知识变成 AI 可以调用的一项"技能"。

## 技术架构

### 技术栈选型

```
前端：Next.js 16 (App Router) + React 19 + Ant Design 6 + Tailwind CSS v4
后端：Next.js API Routes (全栈一体化)
数据库：PostgreSQL + Prisma ORM
AI：Vercel AI SDK + 多 LLM Provider（Qwen / DeepSeek / OpenAI / Anthropic 等）
语音识别：B站 ASR / bijian / 剪映 / Whisper API（多级降级）
部署：Standalone 模式 + PM2 + Nginx
```

为什么选 Next.js 全栈？因为这个项目的本质是"后端做重活（视频处理、AI 分析），前端做展示"，前后端一体可以省去大量的接口对接工作。而且 App Router 的 Server Actions 和 Streaming 特性非常适合 AI 场景。

### 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    Next.js App                       │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │  首页     │  │ 分析页    │  │  笔记本/搜索页    │  │
│  │ (搜索框)  │  │(AI 对话)  │  │  (知识管理)       │  │
│  └────┬─────┘  └────┬─────┘  └───────┬──────────┘  │
│       │              │                │              │
│  ┌────▼──────────────▼────────────────▼──────────┐  │
│  │              API Routes                        │  │
│  │  /api/video-info  /api/transcribe  /api/analyze│  │
│  │  /api/notebooks   /api/search     /api/chat    │  │
│  └────┬──────────────┬────────────────┬──────────┘  │
│       │              │                │              │
│  ┌────▼──────┐ ┌─────▼──────┐  ┌─────▼──────┐     │
│  │ 平台适配层 │ │ AI 分析引擎 │  │ PostgreSQL  │     │
│  │ B站/抖音/  │ │ 多Provider  │  │ + pgvector  │     │
│  │ 小红书     │ │ 流式输出    │  │             │     │
│  └───────────┘ └────────────┘  └────────────┘     │
└─────────────────────────────────────────────────────┘
```

### 处理管线

一条视频从输入到出结果，经历这样的管线：

```
URL 输入
  → 平台识别 & ID 提取
  → 视频元数据获取（标题、封面、时长、分P信息）
  → 字幕获取
      ├─ B站：优先拉取 CC 字幕
      └─ 无字幕 → 音频下载 → ASR 转录
           ├─ B站内置 ASR
           ├─ bijian 引擎
           ├─ 剪映引擎
           └─ Whisper API（最终降级）
  → AI 结构化提取（主题/要点/概念/问答对）
  → 向量嵌入生成
  → 持久化到数据库
```

### 多平台适配

每个平台的接口差异很大，我设计了一个统一的适配层：

```typescript
// 伪代码：统一的多平台处理接口
interface PlatformHandler {
  detect(url: string): boolean;          // URL 是否匹配该平台
  extractId(url: string): string;        // 提取视频 ID
  fetchVideoInfo(id: string): VideoInfo; // 获取元数据
  fetchSubtitle(id: string): string;     // 获取字幕
}
```

B 站的实现最为复杂——需要处理 SESSDATA 登录态、fnval 参数协商 DASH 流、分P视频的 cid 获取等。抖音和小红书则需要处理分享文本中的短链接解析和重定向跟踪。

### ASR 多级降级

语音转录是最容易出问题的环节。不同 ASR 服务有不同的限制和故障模式，所以做了多级降级策略：

```
B站 CC 字幕（免转录，最优）
  → B站内置 ASR（需登录态）
    → bijian 引擎（第三方，偶尔 KeyError）
      → 剪映引擎
        → Whisper API（最终兜底）
```

每一级失败都会自动尝试下一级，确保尽可能产出转录结果。同时在服务端加了并发控制和超时保护，避免单个大视频拖垮整个服务：

```bash
TRANSCRIBE_MAX_CONCURRENCY=1  # 同时只处理一个转录任务
TRANSCRIBE_MAX_AUDIO_MB=60    # 拒绝过大的音频文件
TRANSCRIBE_TIMEOUT_MS=900000  # 15 分钟超时
```

### 数据模型

核心实体关系：

```
User ─┬─ Notebook ── NotebookVideo ── Video
      │                                  │
      ├─ UserVideo (历史记录)             ├─ KnowledgePoint ── Embedding (向量)
      ├─ VideoTimestampNote              ├─ ChatMessage
      └─ VideoTag ── VideoTagRelation    └─ VideoTimestampNote
```

`KnowledgePoint` 是整个系统的核心数据实体——每条知识点都有类型、内容、时间戳，并关联一个 1024 维的向量嵌入用于语义搜索。

### AI Provider 的灵活配置

支持用户自带 API Key 和选择模型。系统内置了多个 Provider 的适配：

- Qwen（通义千问）
- DeepSeek
- OpenAI / GPT 系列
- Anthropic / Claude
- Kimi（月之暗面）
- GLM（智谱）
- MiniMax

通过 Vercel AI SDK 的统一抽象层，切换模型只需要改配置，不需要改代码。

## 踩过的坑

### 1. B 站音频流的风控拦截

B 站的 playurl 接口有一套风控机制。当 SESSDATA 过期或请求参数不当时，返回的 `data` 里只有 `v_voucher` 字段——这是风控签名，不是正常的流地址。

解决：需要同时携带访客 cookies，并设置合理的 fnval 参数（从 16 升到 4048，兼容更多清晰度）。同时实现了 durl/ffmpeg 作为 DASH 流的降级方案。

### 2. 大视频转录拖垮服务

早期版本没有并发控制，用户同时提交几个长视频就能把服务打满。

解决：加了 `TRANSCRIBE_MAX_CONCURRENCY` 限制，同时在 Nginx 层对 SSE 端点配置了 900s 的 read timeout，避免长连接被中间件切断。

### 3. ASR 第三方包的内部异常

bijian 引擎（来自 videocaptioner 项目）偶尔会抛 `KeyError: 'data'`，这是其内部实现的问题，不是我们的调用方式有误。

解决：在 Node 侧加了重试逻辑，失败后自动切换到下一个 ASR 引擎。

### 4. Prisma Client 缓存问题

修改 Prisma Schema 后，Next.js 的热更新有时不会重新生成 Prisma Client，导致运行时报字段不存在的错误。

解决：在 build 脚本里显式加入 `prisma generate`，确保每次构建都是最新的 Client。

## 部署

项目采用 Next.js Standalone 输出模式，构建产物是一个独立的 Node.js 服务，不依赖 Next.js 运行时：

```bash
# 构建
prisma generate && next build

# 产出 .next/standalone 目录
# 打包为 tar.gz，约 24MB

# 部署到服务器
rsync artifact.tar.gz server:/opt/releases/
ssh server "cd /opt/releases && tar xzf artifact.tar.gz && ln -sfn /opt/releases/new /opt/app/current && pm2 restart subtitle"
```

用 PM2 管理进程，Nginx 做反向代理和 SSL 终结。整个部署流程可以用一条命令完成。

## 写在最后

这个项目解决的核心问题是：**让视频知识可检索、可组织、可复用**。

视频是很好的知识载体，但它的线性消费模式注定了知识容易被遗忘。通过 AI 提取 + 向量检索 + 结构化组织，视频知识可以变成和文档一样便于检索和引用的形式。

如果你也经常在 B 站学习，欢迎试试这个工具。项目开源在 GitHub，也欢迎 PR 和 Issue。

---

**技术栈概览**：Next.js 16 · React 19 · Ant Design 6 · Prisma · PostgreSQL · Vercel AI SDK · Playwright · Tailwind CSS v4

**关键词**：视频知识提取 · AI 结构化分析 · B站字幕分析 · 向量检索 · 多平台视频解析
