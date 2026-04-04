# 用户系统 + 视频管理功能方案设计

## Context

当前项目是一个无状态的 B 站字幕分析工具，任何人都可以直接使用。现在需要加入用户系统和视频管理功能：
- 用户注册/登录（邮箱 + 密码）
- 每个用户有自己的视频列表
- 支持 B 站链接和本地上传两种方式
- 先在本地开发，部署到阿里云 2核2G 服务器时再考虑性能优化

---

## 1. 技术选型

| 类别 | 选择 | 理由 |
|------|------|------|
| 数据库 | MySQL 8.x | 用户选择，关系型数据适合用户/视频结构 |
| ORM | Prisma | Next.js 生态最成熟，TypeScript 友好，迁移方便 |
| 认证 | NextAuth.js (Auth.js v5) | Next.js 标准认证方案，支持 Credentials Provider |
| 密码加密 | bcrypt | 业界标准，通过 `bcryptjs` 纯 JS 实现，不依赖原生编译 |
| 文件上传 | 本地存储 (`/uploads/`) | 先用本地文件系统，后期可迁移到阿里云 OSS |
| 状态管理 | React Context + Cookie | NextAuth 内置 session 管理，不需要额外状态库 |

### 为什么不选 Redis？
2核2G 服务器内存紧张，MySQL 本身就要占 500M+，Redis 非必需。用户 session 用 JWT 存在 Cookie 里，不需要 Redis 存储。

### 为什么选 Prisma 而不是 Drizzle？
Prisma 的 schema 文件更直观，自动生成的类型更完善，对新手更友好。Drizzle 更轻量但学习曲线稍高。

---

## 2. 数据库设计

### 2.1 ER 关系图

```
User 1 ──── N Video 1 ──── N Subtitle
```

一个用户可以有多个视频，一个视频可以有多条字幕（CC字幕 + 转写字幕）。

### 2.2 表结构

#### users 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT, 自增主键 | 用户 ID |
| email | VARCHAR(255), UNIQUE | 登录邮箱 |
| name | VARCHAR(100) | 用户昵称 |
| password | VARCHAR(255) | bcrypt 加密后的密码 |
| avatar | VARCHAR(500), 可选 | 头像 URL |
| createdAt | DATETIME | 注册时间 |
| updatedAt | DATETIME | 更新时间 |

#### videos 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT, 自增主键 | 视频 ID |
| userId | INT, 外键 → users.id | 所属用户 |
| source | ENUM('bilibili', 'upload') | 来源：B站链接 / 本地上传 |
| bvid | VARCHAR(20), 可选 | B 站 BV 号（仅 bilibili 来源） |
| title | VARCHAR(500) | 视频标题 |
| cover | VARCHAR(500), 可选 | 封面图 URL |
| duration | INT, 可选 | 时长（秒） |
| description | TEXT, 可选 | 视频描述 |
| filePath | VARCHAR(500), 可选 | 本地文件路径（仅 upload 来源） |
| fileSize | BIGINT, 可选 | 文件大小（字节，仅 upload 来源） |
| status | ENUM('pending', 'processing', 'done', 'error') | 处理状态 |
| createdAt | DATETIME | 创建时间 |
| updatedAt | DATETIME | 更新时间 |

#### subtitles 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT, 自增主键 | 字幕 ID |
| videoId | INT, 外键 → videos.id | 所属视频 |
| source | ENUM('cc', 'transcribed') | 来源：CC字幕 / 语音转写 |
| content | LONGTEXT | 字幕内容（JSON 数组） |
| text | LONGTEXT | 纯文本版本（用于 AI 分析） |
| createdAt | DATETIME | 创建时间 |

#### summaries 表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INT, 自增主键 | 摘要 ID |
| videoId | INT, 外键 → videos.id | 所属视频 |
| content | TEXT | AI 生成的摘要（Markdown） |
| createdAt | DATETIME | 创建时间 |

---

## 3. 页面设计

### 3.1 页面流程图

```
首页 (/)
  ├── 未登录 → 显示登录/注册按钮
  └── 已登录 → 显示视频列表 + 新建分析按钮

登录页 (/login)
  └── 邮箱 + 密码表单

注册页 (/register)
  └── 邮箱 + 密码 + 确认密码表单

视频列表页 (/dashboard)
  └── 卡片网格展示所有已分析的视频
      每个卡片：封面 + 标题 + 来源标签 + 创建时间
      点击 → 进入分析结果页

分析页 (/analyze/[bvid] 或 /analyze/local/[videoId])
  └── 保持现有功能不变
      新增：保存分析结果按钮

新建分析 (/new)
  └── 两个入口：
      1. 粘贴 B 站链接（现有功能）
      2. 上传本地视频文件（新功能）
```

### 3.2 页面改动清单

| 页面 | 改动 |
|------|------|
| `/` (首页) | 重构为登录后进入 dashboard，未登录显示介绍页 |
| `/login` (新建) | 邮箱密码登录表单 |
| `/register` (新建) | 注册表单 |
| `/dashboard` (新建) | 视频列表页，卡片网格布局 |
| `/new` (新建) | 新建分析页（链接输入 + 文件上传） |
| `/analyze/[bvid]` | 加「保存结果」按钮，加登录态校验 |
| Header | 加用户头像/名称 + 退出登录 |

---

## 4. API 设计

### 4.1 认证相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册（邮箱+密码+昵称） |
| POST | `/api/auth/[...nextauth]` | NextAuth 自动处理的登录/登出/会话 |

### 4.2 视频相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/videos` | 获取当前用户的视频列表（分页） |
| POST | `/api/videos` | 保存视频记录（B站链接分析完成后） |
| POST | `/api/videos/upload` | 上传本地视频文件 |
| GET | `/api/videos/:id` | 获取视频详情（含字幕、摘要） |
| DELETE | `/api/videos/:id` | 删除视频（同时删除文件和记录） |

### 4.3 现有 API 改动

| API | 改动 |
|-----|------|
| `/api/transcribe` | 上传的视频直接用本地文件路径，不再下载 |
| `/api/summarize` | 分析完成后可选保存摘要到数据库 |
| `/api/chat` | 无需改动 |

---

## 5. 核心流程

### 5.1 B 站链接分析流程

```
用户粘贴链接 → 获取视频信息 → 获取/转写字幕 → 生成摘要
                                          ↓
                                    用户点击「保存」
                                          ↓
                              保存到 videos + subtitles + summaries 表
                                          ↓
                              出现在 dashboard 视频列表中
```

### 5.2 本地视频上传流程

```
用户选择文件 → POST /api/videos/upload → 保存到 /uploads/{userId}/{uuid}.mp4
                                           ↓
                                     创建 video 记录（status: pending）
                                           ↓
                                     语音转写（直接用本地文件）
                                           ↓
                                     生成摘要
                                           ↓
                               更新 video 记录（status: done）
```

### 5.3 文件上传限制

- 最大文件：500MB（`next.config.ts` 配置 `api.bodyParser.sizeLimit`）
- 支持格式：mp4, mkv, webm, avi, mov
- 存储路径：`/uploads/{userId}/{uuid}.{ext}`
- 定期清理：超过 30 天未访问的文件可考虑清理

---

## 6. 认证方案细节

### 6.1 NextAuth.js 配置

- 使用 Credentials Provider（邮箱+密码）
- Session 策略：JWT（存在 Cookie 里，不需要服务端 session 存储）
- Token 有效期：7 天
- 密码规则：最少 8 位

### 6.2 路由保护

通过 Next.js Middleware（`middleware.ts`）实现：

- 公开页面：`/`、`/login`、`/register`
- 需要登录：`/dashboard`、`/new`、`/analyze/*`
- API 保护：除了 `/api/auth/*` 和 `/api/debug`，其他 API 都需要登录

---

## 7. 新增依赖

```json
{
  "dependencies": {
    "next-auth": "^5.x",        // 认证框架
    "@prisma/client": "^6.x",   // Prisma 运行时客户端
    "bcryptjs": "^3.x"          // 密码加密
  },
  "devDependencies": {
    "prisma": "^6.x",           // Prisma CLI（迁移、生成客户端）
    "@types/bcryptjs": "^3.x"   // TypeScript 类型
  }
}
```

---

## 8. 项目目录变化

```
src/
├── app/
│   ├── layout.tsx              # 加 SessionProvider
│   ├── page.tsx                # 改造：未登录介绍页 / 已登录跳转 dashboard
│   ├── login/page.tsx          # 新建：登录页
│   ├── register/page.tsx       # 新建：注册页
│   ├── dashboard/page.tsx      # 新建：视频列表页
│   ├── new/page.tsx            # 新建：新建分析页
│   ├── analyze/[bvid]/page.tsx # 改造：加保存按钮、登录校验
│   ├── api/
│   │   ├── auth/               # NextAuth 路由
│   │   │   ├── register/route.ts  # 新建：注册 API
│   │   │   └── [...nextauth]/route.ts  # 新建：NextAuth 入口
│   │   ├── videos/             # 新建：视频 CRUD
│   │   │   ├── route.ts           # GET 列表 / POST 创建
│   │   │   ├── upload/route.ts    # POST 上传文件
│   │   │   └── [id]/route.ts      # GET 详情 / DELETE 删除
│   │   └── ...现有 API 不变
├── lib/
│   ├── auth.ts                 # 新建：NextAuth 配置
│   ├── db.ts                   # 新建：Prisma 客户端实例
│   ├── bilibili.ts             # 不变
│   ├── qwen.ts                 # 不变
│   ├── prompts.ts              # 不变
│   └── videocaptioner.ts       # 不变
├── components/
│   ├── UserMenu.tsx            # 新建：用户头像 + 下拉菜单
│   └── ...现有组件不变
├── middleware.ts               # 新建：路由保护
prisma/
└── schema.prisma               # 新建：数据库 Schema
```

---

## 9. 实施步骤（建议顺序）

### 阶段一：基础架构
1. 安装依赖（Prisma、NextAuth、bcryptjs）
2. 配置 Prisma + MySQL 连接
3. 编写 Schema 并执行迁移
4. 实现 NextAuth 认证配置

### 阶段二：用户系统
5. 注册页面 + API
6. 登录页面 + API
7. 路由保护中间件
8. Header 用户菜单组件

### 阶段三：视频管理
9. 视频列表页（dashboard）
10. 新建分析页（链接 + 上传双入口）
11. 视频保存 API
12. 视频详情 / 删除功能

### 阶段四：整合优化
13. 分析页加入保存按钮
14. 本地视频上传 + 转写流程
15. 视频列表分页和搜索

---

## 10. 本地开发环境准备

开始编码前需要本地安装 MySQL：

```bash
# Mac 上用 Homebrew 安装
brew install mysql
brew services start mysql

# 设置 root 密码并创建数据库
mysql -u root
CREATE DATABASE bili_analyzer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

`.env.local` 新增：
```
DATABASE_URL="mysql://root:你的密码@localhost:3306/bili_analyzer"
NEXTAUTH_SECRET="随机生成的密钥"
NEXTAUTH_URL="http://localhost:3000"
```
