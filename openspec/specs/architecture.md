# 技术架构

## 整体架构

```
┌─────────────────────────────────────────────────┐
│                   前端                           │
│   Next.js 16 App Router + React 19 + Ant Design │
├─────────────────────────────────────────────────┤
│                API 层                            │
│   Next.js Route Handlers (app/api/)             │
├──────────┬──────────┬──────────┬────────────────┤
│ B站 API  │ AI 服务  │ 数据存储  │ 文件处理       │
│ WBI签名  │ DashScope│ PostgreSQL│ 音频下载       │
│ 视频信息 │ Qwen LLM │ + pgvector│ Whisper转写    │
│ 字幕获取 │ Embedding│ Prisma ORM│               │
└──────────┴──────────┴──────────┴────────────────┘
```

## 技术选型

### 后端
- **框架**：Next.js 16 App Router
- **数据库**：PostgreSQL + pgvector 扩展
  - 关系数据：用户、笔记本、视频、知识点
  - 向量数据：embedding 用于语义搜索和 RAG
- **ORM**：Prisma
- **认证**：NextAuth.js (Credentials + OAuth)
- **AI SDK**：Vercel AI SDK 6 (streamText / generateText)
- **LLM**：DashScope Qwen (qwen-plus / qwen-turbo)
- **Embedding**：DashScope text-embedding-v3

### 前端
- **UI**：Ant Design 6 + Tailwind CSS 4
- **Markdown**：react-markdown + marked
- **状态管理**：React Hooks (useState/useReducer)

### 部署
- **Vercel**：前端 + API Routes
- **阿里云**：数据库 (PostgreSQL)
- **域名**：afai.asia

## API 设计

### 现有 API（复用）
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/video-info` | POST | 获取B站视频信息 |
| `/api/subtitle` | POST | 获取视频字幕 |
| `/api/transcribe` | POST | SSE流式语音转写 |
| `/api/summarize` | POST | SSE流式AI摘要 |
| `/api/chat` | POST | SSE流式字幕对话 |

### 新增 API
| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/auth/*` | GET/POST | NextAuth 认证 |
| `/api/notebooks` | GET/POST | 笔记本列表/创建 |
| `/api/notebooks/[id]` | GET/PATCH/DELETE | 笔记本详情/更新/删除 |
| `/api/notebooks/[id]/videos` | POST | 关联视频到笔记本 |
| `/api/knowledge/extract` | POST | 提取视频结构化知识 |
| `/api/knowledge/search` | POST | 知识检索（全文+语义）|
| `/api/upowner/videos` | GET | 获取UP主视频列表 |
| `/api/upowner/analyze` | POST | UP主全量分析 |
| `/api/chat/rag` | POST | 跨视频RAG对话 |
| `/api/skills/export` | POST | 导出笔记本为Skill |

## 数据流

### 视频分析流程
```
用户输入BV号 → 获取视频信息 → 提取/转写字幕
  → AI生成摘要（流式）→ 提取结构化知识 → 存储
```

### RAG 对话流程
```
用户提问 → Query Embedding → pgvector相似度检索
  → 拼接上下文 + 字幕 → LLM生成回答（流式）→ 返回
```

### Skill 导出流程
```
选择笔记本 → 查询关联知识点 → 结构化整理
  → LLM润色 → 生成Markdown/System Prompt → 下载
```

## 安全考量
- B站 API 调用使用 WBI 签名认证
- 用户认证通过 NextAuth.js 管理
- API Key 存储在环境变量中
- pgvector 相似度搜索使用余弦距离
