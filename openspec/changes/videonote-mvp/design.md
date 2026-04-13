# 技术方案：videonote-mvp

## 复用现有代码

### 直接复用
| 模块 | 文件 | 用途 |
|------|------|------|
| WBI签名 | `src/lib/bilibili.ts` | B站API调用 |
| 字幕提取 | `src/app/api/subtitle/route.ts` | CC字幕/转写 |
| 音频下载 | `src/lib/bilibili.ts` downloadAudioViaApi | 下载音频用于转写 |
| Whisper转写 | `src/lib/videocaptioner.ts` | 语音转文字 |
| AI摘要 | `src/app/api/summarize/route.ts` | 流式摘要生成 |
| 字幕对话 | `src/app/api/chat/route.ts` | 单视频对话 |
| Prompt模板 | `src/lib/prompts.ts` | 现有prompt |

### 需要增强
| 模块 | 改动 |
|------|------|
| `src/lib/bilibili.ts` | 新增 getUPownerVideos(mid, page, keyword) |
| `src/lib/prompts.ts` | 新增知识提取prompt、导出prompt |
| `src/app/api/summarize/route.ts` | 分析完成后触发知识提取 |
| `src/app/analyze/[bvid]/page.tsx` | 添加「保存到笔记本」按钮 |

### 需要新建
| 模块 | 文件 |
|------|------|
| Prisma Schema | `prisma/schema.prisma` |
| 数据库迁移 | `prisma/migrations/` |
| NextAuth配置 | `src/lib/auth.ts` |
| 知识提取API | `src/app/api/knowledge/extract/route.ts` |
| 知识搜索API | `src/app/api/knowledge/search/route.ts` |
| 笔记本API | `src/app/api/notebooks/route.ts` |
| UP主视频API | `src/app/api/upowner/videos/route.ts` |
| UP主分析API | `src/app/api/upowner/analyze/route.ts` |
| Skill导出API | `src/app/api/skills/export/route.ts` |
| 笔记本列表页 | `src/app/notebooks/page.tsx` |
| 笔记本详情页 | `src/app/notebooks/[id]/page.tsx` |
| UP主分析页 | `src/app/upowner/page.tsx` |
| Embedding工具 | `src/lib/embedding.ts` |
| 首页改造 | `src/app/page.tsx` (添加导航) |

## 技术方案

### 数据库
- PostgreSQL + pgvector 扩展
- Prisma ORM 管理迁移和查询
- 向量字段使用 `Unsupported("vector(1024)")` 类型
- 相似度查询使用 raw SQL：`SELECT *, 1 - (vector <=> $queryVector) AS distance`

### 认证
- NextAuth.js Credentials Provider
- 邮箱+密码注册登录
- Session 管理（JWT）
- API Routes 通过 `getServerSession` 获取用户

### 知识提取
- 复用现有 DashScope 配置
- 使用 `generateText`（非流式）提取结构化知识
- Prompt 要求输出 JSON 数组
- 提取完成后异步生成 embedding
- 错误处理：JSON解析失败时重试一次

### 向量搜索
- DashScope text-embedding-v3 生成 1024 维向量
- pgvector 索引：IVFFlat 或 HNSW
- 余弦距离：`1 - (a <=> b)`
- 搜索 top-K = 10

### 批量分析队列
- 内存队列（MVP，非持久化）
- 并发控制：同时最多处理 2 个视频
- SSE 推送进度事件
- 失败重试：最多 3 次

### Skill 导出
- Markdown：模板渲染，纯字符串拼接
- System Prompt：LLM 辅助整理，`generateText` 一次性生成
- 下载：前端创建 Blob + URL.createObjectURL

## 目录结构（新增/修改）
```
src/
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts    (新建)
│   │   ├── notebooks/
│   │   │   ├── route.ts                   (新建)
│   │   │   └── [id]/route.ts              (新建)
│   │   ├── knowledge/
│   │   │   ├── extract/route.ts           (新建)
│   │   │   └── search/route.ts            (新建)
│   │   ├── upowner/
│   │   │   ├── videos/route.ts            (新建)
│   │   │   └── analyze/route.ts           (新建)
│   │   ├── skills/
│   │   │   └── export/route.ts            (新建)
│   │   ├── summarize/route.ts             (修改)
│   │   └── ...
│   ├── notebooks/
│   │   ├── page.tsx                       (新建)
│   │   └── [id]/page.tsx                  (新建)
│   ├── upowner/page.tsx                   (新建)
│   ├── analyze/[bvid]/page.tsx            (修改)
│   └── page.tsx                           (修改)
├── lib/
│   ├── auth.ts                            (新建)
│   ├── db.ts                              (新建)
│   ├── embedding.ts                       (新建)
│   ├── prompts.ts                         (修改)
│   ├── bilibili.ts                        (修改)
│   └── ...
├── components/
│   ├── Navbar.tsx                          (新建)
│   └── ...
prisma/
├── schema.prisma                          (新建)
└── migrations/                            (新建)
```
