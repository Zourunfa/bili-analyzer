# B站视频知识管理平台 — 后端架构技术文档

> 面向前端工程师的后端技术指南。以本项目为实战案例，系统讲解全栈架构、数据库设计、AI 集成等后端核心知识。

---

## 目录

1. [架构总览](#1-架构总览)
2. [数据层：Prisma ORM + PostgreSQL](#2-数据层prisma-orm--postgresql)
3. [认证系统：NextAuth.js](#3-认证系统nextauthjs)
4. [API 路由设计](#4-api-路由设计)
5. [外部 API 集成：Bilibili](#5-外部-api-集成bilibili)
6. [AI 集成与工程化](#6-ai-集成与工程化)
7. [核心数据流](#7-核心数据流)

---

## 1. 架构总览

### 1.1 项目定位

这是一个 **B站视频知识管理平台**，核心能力是将 B站视频的字幕内容转化为结构化知识，支持语义搜索和笔记本管理。

**一句话描述**：用户输入 B站视频 URL → 系统自动提取字幕 → AI 生成摘要和知识点 → 向量化存储 → 支持语义搜索和导出。

### 1.2 技术栈全景

```
┌─────────────────────────────────────────────────────────┐
│                      前端 (React)                        │
│         Next.js App Router + Ant Design + Tailwind       │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────┐
│                   API Route 层                            │
│        Next.js Route Handlers (src/app/api/*)            │
│   ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│   │  Auth   │ │ Notebooks│ │ Knowledge│ │  Bilibili  │ │
│   │Routes   │ │  CRUD    │ │Extract   │ │  Proxy     │ │
│   └─────────┘ └──────────┘ └──────────┘ └────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                    服务层 (src/lib/)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │   Auth   │ │ Bilibili │ │  Qwen    │ │ Embedding  │ │
│  │ Config   │ │ API SDK  │ │ AI Client│ │  Service   │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│  ┌──────────┐ ┌──────────┐                               │
│  │ Prompts  │ │   DB     │                               │
│  │ Templates│ │  Client  │                               │
│  └──────────┘ └──────────┘                               │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   数据层 (PostgreSQL)                     │
│        Prisma ORM + pgpool 连接池 + pgvector 扩展        │
└─────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────┐              ┌──────────────────────┐
│  Bilibili API   │              │  DashScope (通义千问)  │
│  (视频/字幕/音频) │              │  (LLM + Embedding)   │
└─────────────────┘              └──────────────────────┘
```

### 1.3 技术选型与职责

| 技术 | 职责 | 为什么选它 |
|------|------|-----------|
| **Next.js App Router** | 全栈框架，前后端一体 | 前后端同一项目，API Route 无需单独部署 |
| **Prisma ORM** | 数据库操作 | 类型安全，自动生成 TypeScript 类型，避免手写 SQL |
| **PostgreSQL + pgvector** | 数据存储 + 向量搜索 | 关系型数据库 + 原生向量搜索，一个库解决两个需求 |
| **NextAuth.js** | 用户认证 | Next.js 生态标准方案，开箱即用 |
| **Vercel AI SDK** | LLM 调用 | 统一的 AI 模型接口，内置流式支持 |
| **通义千问 (Qwen)** | AI 推理 | 阿里云 DashScope 服务，中文能力强 |

### 1.4 目录结构与职责

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # 后端 API 路由（Route Handlers）
│   │   ├── auth/           # 认证相关 API
│   │   ├── knowledge/      # 知识提取与搜索 API
│   │   ├── notebooks/      # 笔记本 CRUD API
│   │   ├── upowner/        # UP主相关 API
│   │   ├── videos/         # 视频管理 API
│   │   └── ...
│   ├── analyze/            # 视频分析页面
│   ├── login/              # 登录页面
│   ├── notebooks/          # 笔记本页面
│   └── search/             # 搜索页面
├── lib/                    # 后端服务层（核心业务逻辑）
│   ├── auth.ts             # NextAuth 配置
│   ├── db.ts               # Prisma 数据库客户端
│   ├── bilibili.ts         # B站 API 封装
│   ├── qwen.ts             # AI 模型客户端
│   ├── embedding.ts        # 向量嵌入服务
│   ├── prompts.ts          # Prompt 模板
│   └── videocaptioner.ts   # 音频转录工具
├── components/             # React 组件
└── generated/prisma/       # Prisma 自动生成的 TypeScript 类型
```

> **前端工程师注意**：`src/lib/` 和 `src/app/api/` 是纯后端代码，不运行在浏览器端。Next.js 的 Route Handler 在服务端执行，相当于传统后端的 Controller。

---

## 2. 数据层：Prisma ORM + PostgreSQL

### 2.1 数据库连接

**文件**：`src/lib/db.ts`

```typescript
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  const pool = new pg.Pool({ connectionString });  // 连接池
  const adapter = new PrismaPg(pool);               // Prisma Pg 适配器
  return new PrismaClient({ adapter });
}

// 单例模式：开发环境复用，避免热重载创建过多连接
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
```

**关键概念解析**：

| 概念 | 说明 |
|------|------|
| **连接池** (`pg.Pool`) | 维护一组数据库连接复用，避免每次请求都建立新连接（连接建立很昂贵） |
| **适配器模式** (`PrismaPg`) | Prisma 通过适配器连接 PostgreSQL，而非直连。好处是可以灵活切换数据库驱动 |
| **单例模式** | `globalForPrisma` 确保整个应用只创建一个 Prisma 客户端实例。开发环境热重载时会执行多次模块，不用单例会导致连接泄露 |

### 2.2 数据模型

**文件**：`prisma/schema.prisma`

项目的实体关系如下：

```
User 1──N Notebook N──N Video 1──N KnowledgePoint 1──1 Embedding
                       │
                       └── NoteBookVideo（中间表）
                       └── UPProfile（独立）
```

#### User — 用户表

```prisma
model User {
  id        String     @id @default(cuid())   // CUID 格式主键（比 UUID 更短、URL 安全）
  email     String     @unique                 // 唯一约束，用于登录
  name      String
  avatar    String?
  password  String                             // bcrypt 哈希存储，永远不存明文
  notebooks Notebook[]                         // 一对多：一个用户有多个笔记本
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt              // 自动更新时间戳
}
```

#### Notebook — 笔记本

```prisma
model Notebook {
  id          String          @id @default(cuid())
  userId      String                             // 外键，关联 User
  title       String
  description String?
  tags        String[]                          // PostgreSQL 数组类型，存多个标签
  videoCount  Int             @default(0)        // 冗余字段，避免每次 COUNT 查询
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  videos      NotebookVideo[]
}
```

> **设计要点**：
> - `onDelete: Cascade` 表示删除用户时，其所有笔记本也会被自动删除
> - `videoCount` 是冗余计数字段，用空间换时间（避免每次查笔记本都要 JOIN COUNT）

#### Video — 视频

```prisma
model Video {
  bvid               String           @unique    // B站视频唯一标识
  title              String
  subtitleText       String                      // 完整字幕文本
  subtitleSource     String           @default("cc")  // 字幕来源：cc 或 transcribe
  summary            String?                     // AI 生成的摘要
  knowledgeExtracted Boolean          @default(false)  // 是否已提取知识点（幂等标记）
  knowledgePoints    KnowledgePoint[]
  @@index([ownerMid])                           // 为常用查询字段加索引
}
```

> **设计要点**：
> - `bvid` 设为 `@unique`，同一视频不会重复存储（upsert 模式）
> - `knowledgeExtracted` 是幂等标记，防止重复调用 AI 提取

#### KnowledgePoint — 知识点

```prisma
model KnowledgePoint {
  type      String     // topic | keyPoint | concept | qaPair
  content   String     // 知识点内容
  timestamp Int?       // 视频中的出现时间（秒）
  metadata  Json?      // 灵活的 JSON 字段，存额外信息
  embedding Embedding? // 一对一关联向量
}
```

#### Embedding — 向量嵌入

```prisma
model Embedding {
  vector            Unsupported("vector(1024)")  // pgvector 扩展类型
  knowledgePointId  String          @unique       // 一对一关联知识点
}
```

> **为什么用 `Unsupported`？** Prisma 原生不支持 PostgreSQL 的 vector 扩展类型，所以用 `Unsupported` 声明，实际查询时用 raw SQL (`$queryRawUnsafe`) 操作。

#### NotebookVideo — 多对多中间表

```prisma
model NotebookVideo {
  notebookId String
  videoId    String
  notes      String?        // 用户对这条视频的笔记
  order      Int @default(0) // 排序字段
  @@unique([notebookId, videoId])  // 联合唯一约束
}
```

> **多对多关系的设计**：一个视频可以加入多个笔记本，一个笔记本可以有多个视频。通过中间表 `NotebookVideo` 实现关联，同时可以在中间表上加额外字段（如 notes、order）。

### 2.3 Prisma 常用操作模式

#### 基本 CRUD

```typescript
// 创建
const notebook = await prisma.notebook.create({
  data: { title: "React 学习", userId: "clx..." }
});

// 查询（带关联）
const notebook = await prisma.notebook.findUnique({
  where: { id: "clx..." },
  include: { videos: { include: { video: true } } }  // 嵌套 include 加载关联数据
});

// 更新
await prisma.notebook.update({
  where: { id: "clx..." },
  data: { title: "新标题", videoCount: { increment: 1 } }  // 原子递增
});

// 删除（级联删除会自动处理关联数据）
await prisma.notebook.delete({ where: { id: "clx..." } });
```

#### Upsert（不存在则创建，存在则更新）

```typescript
// 视频去重：同一 BV 号的视频不重复创建
const video = await prisma.video.upsert({
  where: { bvid: "BV1xx..." },
  update: { title: videoInfo.title },     // 已存在则更新
  create: { bvid: "BV1xx...", ... },      // 不存在则创建
});
```

#### Raw SQL（向量搜索等 Prisma 不原生支持的操作）

```typescript
// pgvector 余弦相似度搜索
const results = await prisma.$queryRawUnsafe(`
  SELECT kp.*, 1 - (e.vector <=> '${vectorStr}'::vector) as score
  FROM knowledge_points kp
  JOIN embeddings e ON e.knowledge_point_id = kp.id
  ORDER BY e.vector <=> '${vectorStr}'::vector
  LIMIT 10
`);
```

> **前端工程师注意**：Prisma 类似前端的 ORM（Object-Relational Mapping），可以理解为"数据库的 TypeScript SDK"。你不需要写 SQL，用 TypeScript 方法就能操作数据库，且有完整的类型提示。

---

## 3. 认证系统：NextAuth.js

### 3.1 认证流程

```
注册                            登录                        请求受保护 API
POST /api/auth/register    POST /api/auth/signin       GET /api/notebooks
        │                        │                           │
        ▼                        ▼                           ▼
  bcrypt 哈希密码         bcrypt.compare 验证        getServerSession
        │                        │                      检查 JWT
        ▼                        ▼                           │
  prisma.user.create      生成 JWT token                 是否有效？
                                │                      ┌────┴────┐
                                ▼                      是         否
                          存入 HttpOnly Cookie          │          │
                                                    正常处理    返回 401
```

### 3.2 NextAuth 配置

**文件**：`src/lib/auth.ts`

```typescript
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "./db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      // 邮箱密码登录（而非 OAuth 第三方登录）
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        // 1. 查数据库找用户
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user) return null;

        // 2. 验证密码（bcrypt 对比哈希）
        const isValid = await bcrypt.compare(credentials.password, user.password);
        if (!isValid) return null;

        // 3. 返回用户信息（会存入 JWT）
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],

  session: { strategy: "jwt" },  // 使用 JWT，不存数据库 session

  callbacks: {
    // JWT 回调：登录时把 user.id 写入 token
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    // Session 回调：每次前端读取 session 时，把 token 中的 id 传给前端
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id;
      }
      return session;
    },
  },
};
```

**关键概念**：

| 概念 | 说明 |
|------|------|
| **Credentials Provider** | 用邮箱密码登录，区别于 OAuth（GitHub/Google 第三方登录） |
| **JWT Strategy** | Session 存在客户端 Cookie 中（HttpOnly），服务端不存储。好处是无状态、易扩展 |
| **bcrypt** | 密码哈希算法。同一个密码每次哈希结果不同（加盐），即使数据库泄露也无法反推密码 |
| **Callbacks** | 钩子函数，可以自定义 JWT 和 Session 中携带的数据 |

### 3.3 API 路由中的鉴权模式

```typescript
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET(req: Request) {
  // 每个需要登录的 API 都这样检查
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  // session.user.id 就是当前登录用户的 ID
  const notebooks = await prisma.notebook.findMany({
    where: { userId: session.user.id },
  });

  return NextResponse.json({ notebooks });
}
```

> **前端工程师注意**：这和前端路由守卫（如 React Router 的 ProtectedRoute）思路类似，但后端鉴权更关键——前端检查只是 UI 层面的限制，后端检查才是真正的安全保障。

---

## 4. API 路由设计

### 4.1 Next.js Route Handler 模式

Next.js App Router 中，`src/app/api/` 目录下的 `route.ts` 文件就是 API 端点。文件路径即路由路径：

```
src/app/api/notebooks/route.ts       →  GET/POST  /api/notebooks
src/app/api/notebooks/[id]/route.ts  →  GET/PATCH/DELETE  /api/notebooks/:id
src/app/api/knowledge/search/route.ts →  POST  /api/knowledge/search
```

每个文件导出与 HTTP 方法同名的函数：

```typescript
// src/app/api/notebooks/route.ts
export async function GET(req: Request) { ... }   // 查询
export async function POST(req: Request) { ... }   // 创建

// src/app/api/notebooks/[id]/route.ts
export async function GET(req: Request, { params }: { params: { id: string } }) { ... }
export async function PATCH(req: Request, { params }: { params: { id: string } }) { ... }
export async function DELETE(req: Request, { params }: { params: { id: string } }) { ... }
```

> **类比前端**：`route.ts` 就像 React 的 `page.tsx`，但导出的是服务端函数而不是 React 组件。每个 HTTP 方法是一个独立的处理函数。

### 4.2 统一的请求处理模式

项目中的 API 遵循统一的三段式结构：**解析 → 处理 → 响应**

```typescript
export async function POST(req: Request) {
  try {
    // 1. 解析和验证请求
    const { bvid } = await req.json();
    if (!bvid) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    // 2. 业务逻辑（查数据库、调外部 API 等）
    const video = await prisma.video.findUnique({ where: { bvid } });
    if (!video) {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }
    // ... 业务处理 ...

    // 3. 返回成功响应
    return NextResponse.json({ message: "操作成功", data: result });
  } catch (error) {
    // 统一错误处理
    const message = error instanceof Error ? error.message : "服务器错误";
    console.error("操作失败:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

**HTTP 状态码约定**：

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | 成功 | GET 查询、PATCH 更新成功 |
| 201 | 已创建 | POST 创建资源成功 |
| 400 | 请求错误 | 参数缺失、格式错误 |
| 401 | 未认证 | 未登录或 Session 过期 |
| 404 | 未找到 | 资源不存在 |
| 500 | 服务器错误 | 代码异常、外部 API 报错 |

### 4.3 SSE 流式响应模式

对于耗时较长的操作（如音频转录、批量分析），项目使用 **Server-Sent Events (SSE)** 实时推送进度：

```typescript
export async function POST(req: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // 发送 SSE 事件的辅助函数
      const sendEvent = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        sendEvent({ status: "started", progress: 0 });

        // 长时间操作，定期推送进度
        for (let i = 0; i < items.length; i++) {
          await processItem(items[i]);
          sendEvent({ status: "processing", progress: (i + 1) / items.length * 100 });
        }

        sendEvent({ status: "completed", progress: 100 });
      } catch (error) {
        sendEvent({ status: "error", error: error.message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

> **前端工程师注意**：SSE 类似前端的 EventSource API。与 WebSocket 的区别是 SSE 是单向的（服务端→客户端），更简单，适合进度推送场景。

---

## 5. 外部 API 集成：Bilibili

### 5.1 B站 API 的认证体系

B站的 API 有多层认证机制，项目在 `src/lib/bilibili.ts` 中做了完整封装：

```
                    ┌─────────────────┐
                    │  Bilibili API   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        基础请求        WBI 签名        SESSDATA
        (公开接口)     (防篡改签名)     (用户身份)
              │              │              │
      无需认证         需要签名密钥     需要登录 Cookie
      如: 视频信息      如: 字幕接口     如: UP主视频列表
```

### 5.2 匿名 Cookie 缓存

```typescript
// 缓存匿名 cookies，避免每次请求都重新获取
let cachedCookies: string | null = null;
let cookiesExpireAt = 0;

async function getAnonymousCookies(): Promise<string> {
  // 30 分钟内复用缓存
  if (cachedCookies && Date.now() < cookiesExpireAt) {
    return cachedCookies;
  }

  // 访问 B站首页，从 Set-Cookie 中提取
  const res = await fetch("https://www.bilibili.com/", { redirect: "manual" });
  const setCookies = res.headers.getSetCookie?.() || [];
  // ... 解析 Cookie ...

  cachedCookies = cookies.join("; ");
  cookiesExpireAt = Date.now() + 30 * 60 * 1000;  // 30 分钟过期
  return cachedCookies;
}
```

> **设计思路**：B站部分 API 需要有效的 Cookie 才能访问。通过缓存机制，避免每次请求都重新获取，减少被风控的概率。

### 5.3 WBI 签名算法

B站对部分接口（如字幕、UP主视频列表）要求 WBI 签名，防止参数被篡改：

```typescript
// 1. 获取签名密钥（从 B站导航接口获取）
async function getWbiKeys() {
  const res = await fetch("https://api.bilibili.com/x/web-interface/nav");
  const data = await res.json();
  // 从 img_url 和 sub_url 中提取 key
  const imgKey = imgUrl.split("/").pop().split(".")[0];
  const subKey = subUrl.split("/").pop().split(".")[0];
  return { imgKey, subKey };
}

// 2. 参数签名
function signWbiParams(params, imgKey, subKey) {
  const mixinKey = getMixinKey(imgKey + subKey);  // 通过混淆表生成 32 位密钥
  const wts = Math.floor(Date.now() / 1000);       // 当前时间戳

  // 参数按 key 排序 → 拼接查询字符串 → MD5 哈希
  const query = sortAndJoin({ ...params, wts });
  const w_rid = md5(query + mixinKey);

  return `${query}&w_rid=${w_rid}`;  // 签名后的完整查询字符串
}

// 3. 使用签名发请求
const query = signWbiParams({ bvid, cid }, imgKey, subKey);
const url = `https://api.bilibili.com/x/player/wbi/v2?${query}`;
```

> **前端工程师注意**：WBI 签名类似前端的 API 签名拦截器。核心思想是：把请求参数 + 密钥通过哈希算法生成一个签名，服务端验证签名来判断请求是否合法。这在后端调用第三方 API 时非常常见。

### 5.4 统一的请求头与错误处理

```typescript
function getHeaders() {
  const sessdata = normalizeSessdata(process.env.BILIBILI_SESSDATA || "");
  return {
    Cookie: `SESSDATA=${sessdata}`,
    "User-Agent": "Mozilla/5.0 ...",    // 模拟浏览器请求
    Referer: "https://space.bilibili.com",  // 防盗链检查
    Origin: "https://space.bilibili.com",
  };
}
```

针对风控的友好错误提示：

```typescript
if (data.code === -352) {
  throw new Error(
    "B站风控校验失败。请配置有效的 BILIBILI_SESSDATA。\n" +
    "获取方法：浏览器登录 B站 → F12 → Application → Cookies → 复制 SESSDATA"
  );
}
```

---

## 6. AI 集成与工程化

### 6.1 AI 客户端初始化

**文件**：`src/lib/qwen.ts`

```typescript
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// 一行代码创建 AI 客户端
export const qwen = createOpenAICompatible({
  name: "qwen",
  apiKey: process.env.DASHSCOPE_API_KEY!,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
```

**架构决策**：
- 使用 **Vercel AI SDK** 的 `@ai-sdk/openai-compatible` 适配器，而非直接调用 HTTP API
- DashScope（阿里云）提供了 OpenAI 兼容接口，所以可以用 OpenAI 的 SDK 格式调用
- 好处：如果以后换模型（如 OpenAI、Claude），只需改 `baseURL` 和 `apiKey`

### 6.2 两种 AI 调用模式

#### 模式一：流式文本生成（实时输出）

**场景**：视频摘要、AI 对话 — 用户需要实时看到输出

```typescript
// src/app/api/summarize/route.ts
import { streamText } from "ai";

export async function POST(req: Request) {
  const { subtitleText } = await req.json();

  // streamText 返回一个流式响应
  const result = streamText({
    model: qwen("qwen-plus"),       // 使用 qwen-plus 模型
    system: SUMMARY_SYSTEM_PROMPT,   // 系统提示词（定义 AI 角色）
    messages: [
      { role: "user", content: `请分析以下字幕：\n\n${subtitleText}` },
    ],
  });

  // 一行代码把流式结果转为 HTTP 响应（SSE 格式）
  return result.toTextStreamResponse();
}
```

**前端消费方式**：

```typescript
// 前端用 Vercel AI SDK 的 useChat / readTextStream 消费
const response = await fetch("/api/summarize", {
  method: "POST",
  body: JSON.stringify({ subtitleText }),
});
const reader = response.body.getReader();
// 逐块读取，实时渲染
```

#### 模式二：结构化数据提取（一次性返回）

**场景**：知识提取 — 需要拿到完整 JSON 结果再处理

```typescript
// src/app/api/knowledge/extract/route.ts
import { generateText } from "ai";

export async function POST(req: Request) {
  const { bvid } = await req.json();
  const video = await prisma.video.findUnique({ where: { bvid } });

  // generateText 等待完整响应返回
  const { text } = await generateText({
    model: qwen("qwen-plus"),
    prompt: KNOWLEDGE_EXTRACTION_PROMPT(video.title, video.subtitleText),
  });

  // 解析 LLM 返回的 JSON
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const points = JSON.parse(jsonMatch[0]);

  // 存入数据库
  for (const point of points) {
    await prisma.knowledgePoint.create({ data: { ...point, videoId: video.id } });
  }
}
```

### 6.3 Prompt 工程

**文件**：`src/lib/prompts.ts`

项目使用模板函数管理 Prompt，保持可维护性：

```typescript
export const KNOWLEDGE_EXTRACTION_PROMPT = (title: string, subtitleText: string) =>
  `你是一个专业的知识提取专家。请从以下视频字幕中提取结构化的知识点。

## 视频标题：${title}
## 视频字幕：${subtitleText}

## 提取要求：
请提取以下类型的知识点，返回一个 JSON 数组：
- type: topic | keyPoint | concept | qaPair
- content: 知识点内容
- timestamp: 出现时间（秒）

约束：
- 提取 10-30 个知识点
- 只返回 JSON 数组，不要其他文字`;
```

**Prompt 设计要点**：
1. **角色定义**（"你是知识提取专家"）— 约束 AI 的输出风格
2. **结构化输出格式**（JSON 数组）— 便于程序解析
3. **约束条件**（数量、格式）— 控制输出质量
4. **示例输出** — 提高输出格式一致性

### 6.4 LLM 输出解析与重试

LLM 的输出不总是可靠的。项目实现了重试机制：

```typescript
// 第一次尝试
let { text } = await generateText({ model: qwen("qwen-plus"), prompt });

try {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  points = JSON.parse(jsonMatch[0]);
} catch {
  // JSON 解析失败，用更简单的 prompt 重试
  const retryResult = await generateText({
    model: qwen("qwen-plus"),
    prompt: `请从字幕中提取10个关键知识点...只返回JSON数组。`,
  });
  const jsonMatch = retryResult.text.match(/\[[\s\S]*\]/);
  points = JSON.parse(jsonMatch[0]);
}
```

> **实战经验**：LLM 返回的 JSON 可能被 markdown 代码块包裹（如 ` ```json ... ``` `），所以用正则 `text.match(/\[[\s\S]*\]/)` 提取数组部分而非直接 `JSON.parse`。

### 6.5 向量嵌入（Embedding）

**文件**：`src/lib/embedding.ts`

向量嵌入是将文本转化为数学向量，使语义相近的文本在向量空间中距离也相近。

```typescript
// 调用 DashScope 的 embedding API
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-v3",
      input: text,
      dimensions: 1024,  // 1024 维向量
    }),
  });

  return response.data[0].embedding;  // 返回 [0.12, -0.34, 0.56, ...] 共 1024 个浮点数
}
```

**向量搜索的原理**：

```
用户搜索 "React Hooks"
        │
        ▼
  generateEmbedding()     →  [0.12, -0.34, 0.56, ...]
        │
        ▼
  PostgreSQL pgvector     →  余弦相似度计算 (<=> 操作符)
        │
        ▼
  返回最相近的知识点       →  "useState 是 React 的基础 Hook"
```

### 6.6 双模式搜索实现

**文件**：`src/app/api/knowledge/search/route.ts`

```typescript
if (mode === "semantic") {
  // 语义搜索：理解含义，"React 状态管理" 能匹配到 "useState 详解"
  const queryEmbedding = await generateEmbedding(query);
  const vectorStr = toVectorString(queryEmbedding);

  results = await prisma.$queryRawUnsafe(`
    SELECT kp.*, 1 - (e.vector <=> '${vectorStr}'::vector) as score
    FROM knowledge_points kp
    JOIN embeddings e ON e.knowledge_point_id = kp.id
    ORDER BY e.vector <=> '${vectorStr}'::vector
    LIMIT ${topK}
  `);
} else {
  // 全文搜索：精确匹配关键词
  const points = await prisma.knowledgePoint.findMany({
    where: { content: { contains: query, mode: "insensitive" } },
    take: topK,
    include: { video: { select: { title: true, bvid: true } } },
  });
}
```

**两种搜索对比**：

| 维度 | 全文搜索 (ILIKE) | 语义搜索 (pgvector) |
|------|-------------------|---------------------|
| 原理 | 关键词匹配 | 向量余弦相似度 |
| 精确匹配 | 强 | 弱 |
| 语义理解 | 无（"苹果"和"Apple"无关） | 有（能理解同义词） |
| 性能 | 快 | 较慢（需计算向量距离） |
| 适用场景 | 精确查找 | 探索性搜索 |

### 6.7 异步嵌入生成

知识点创建后，向量嵌入的生成是异步的，不阻塞 API 响应：

```typescript
// 保存知识点
const knowledgePoint = await prisma.knowledgePoint.create({ data: { ... } });

// 异步生成 embedding（不等待完成）
generateEmbedding(point.content)
  .then(async (embedding) => {
    await prisma.$executeRaw`
      INSERT INTO embeddings (id, knowledge_point_id, vector, "createdAt")
      VALUES (${crypto.randomUUID()}, ${knowledgePoint.id},
              ${toVectorString(embedding)}::vector, NOW())
    `;
  })
  .catch((err) => console.error("生成 embedding 失败:", err));

// 立即返回，不等 embedding 生成完
return NextResponse.json({ message: "知识提取完成", count: savedPoints.length });
```

> **设计决策**：embedding 生成调用外部 API 耗时较长（每个知识点 1-2 秒），如果等全部生成完再返回，30 个知识点可能需要 30-60 秒。异步处理让用户立即看到结果，embedding 在后台静默生成。

---

## 7. 核心数据流

### 7.1 视频处理完整流程

```
用户输入 B站 URL
       │
       ▼
┌──────────────┐    POST /api/video-info
│ 提取 BV 号    │    extractBvId("https://bilibili.com/video/BV1xx...")
└──────┬───────┘    → "BV1xx..."
       │
       ▼
┌──────────────┐    GET /x/web-interface/view?bvid=BV1xx...
│ 获取视频信息   │    → { title, pic, duration, cid, owner }
└──────┬───────┘
       │
       ▼
┌──────────────┐    WBI签名 → GET /x/player/wbi/v2?bvid=&cid=&wts=&w_rid=
│ 获取 CC 字幕  │    → 有字幕 → SubtitleItem[]
│              │    → 无字幕 → 进入音频转录分支
└──────┬───────┘
       │
       ▼                        ┌──────────────────┐
┌──────────────┐  无字幕时       │ 音频转录          │
│ 保存视频      │ ──────────────►│ downloadAudio →  │
│ 到数据库      │                │ whisper 转录      │
└──────┬───────┘                └──────────────────┘
       │
       ▼
┌──────────────┐    POST /api/summarize
│ AI 生成摘要   │    streamText(qwen, subtitleText)
│ (流式输出)    │    → SSE 实时推送到前端
└──────┬───────┘
       │
       ▼
┌──────────────┐    POST /api/knowledge/extract
│ 知识点提取    │    generateText → JSON 解析 → 存数据库
│              │    → 异步生成向量嵌入
└──────┬───────┘
       │
       ▼
┌──────────────┐    POST /api/knowledge/search
│ 可搜索       │    语义搜索 (pgvector) / 全文搜索 (ILIKE)
└──────────────┘
```

### 7.2 UP主批量分析流程

```
用户输入 UP主 mid
       │
       ▼
┌──────────────┐    分页获取视频列表
│ 获取全部视频   │    while (page <= totalPages) { getUPownerVideos(mid, page) }
└──────┬───────┘
       │
       ▼
┌──────────────┐    SSE 实时推送进度
│ 逐个处理视频   │    for (video of videos) {
│ (SSE 推送进度) │      sendEvent({ progress: i/total, current: video.title })
│              │      // 跳过已处理的
│              │      if (video.knowledgeExtracted) continue
│              │      // 获取字幕 → 保存视频 → 提取知识
│              │    }
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ 返回统计结果   │    { total, processed, skipped, errors }
└──────────────┘
```

### 7.3 笔记本管理流程

```
创建笔记本            添加视频到笔记本              导出技能包
POST /notebooks       POST /notebooks/:id/videos   POST /skills/export
       │                      │                          │
       ▼                      ▼                          ▼
prisma.create         检查是否已存在              获取笔记本所有知识点
title, userId         (联合唯一约束)              调用 LLM 生成 System Prompt
                       │                          打包为文件夹/Markdown/Prompt
                       ▼
                 prisma.create              SKILL.md + knowledge.json
                 NotebookVideo              summaries.md
                 更新 videoCount
```

---

## 附录：前端工程师后端入门路线建议

基于本项目的后端知识图谱：

```
第一阶段：理解基础概念
├── HTTP 协议（请求方法、状态码、Header）
├── API 设计（RESTful、路径参数、请求体）
└── 数据库基础（表、关系、索引）

第二阶段：掌握本项目的技术栈
├── Prisma ORM（Schema → Migration → CRUD）
├── Next.js Route Handler（API 路由编写）
├── NextAuth.js（认证原理）
└── TypeScript 后端类型安全

第三阶段：深入后端工程化
├── 错误处理与日志
├── 异步编程（Promise、流式处理）
├── 外部 API 集成（认证、签名、重试）
└── 性能优化（缓存、连接池、索引）

第四阶段：AI 工程化
├── LLM 调用模式（流式 vs 非流式）
├── Prompt 工程与模板管理
├── 向量嵌入与语义搜索
└── AI 输出解析与容错
```
