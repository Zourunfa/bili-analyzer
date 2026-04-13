# 数据模型

## ER 关系图

```
User 1──N Notebook 1──N NotebookVideo N──1 Video
                    │                        │
                    │                        1
                    │                        N
                    │                   KnowledgePoint
                    │                     │        │
                    1                     1        N
                    N                   Topic     QAPair
                UPProfile
                    │
                    N
                Video (via upowner_mid)
```

## 表定义

### User（用户）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| email | String (unique) | 邮箱 |
| name | String | 昵称 |
| avatar | String? | 头像 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### Notebook（笔记本）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| userId | String (FK) | 所属用户 |
| title | String | 笔记本标题 |
| description | String? | 描述 |
| coverImage | String? | 封面图 |
| tags | String[] | 标签 |
| videoCount | Int (default 0) | 视频数量 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### Video（视频）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| bvid | String (unique) | B站BV号 |
| title | String | 视频标题 |
| pic | String? | 封面图 |
| desc | String? | 视频描述 |
| duration | Int | 时长(秒) |
| ownerName | String | UP主名称 |
| ownerMid | String | UP主mid |
| cid | Int? | 分P的cid |
| subtitleText | Text | 字幕全文 |
| subtitleSource | String | 来源(cc/whisper) |
| summary | Text? | AI摘要 |
| knowledgeExtracted | Boolean (default false) | 是否已提取知识 |
| createdAt | DateTime | 创建时间 |
| updatedAt | DateTime | 更新时间 |

### NotebookVideo（笔记本-视频关联）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| notebookId | String (FK) | 笔记本ID |
| videoId | String (FK) | 视频ID |
| notes | Text? | 用户笔记 |
| order | Int | 排序序号 |
| addedAt | DateTime | 添加时间 |

**唯一约束**：(notebookId, videoId)

### KnowledgePoint（知识点）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| videoId | String (FK) | 所属视频 |
| type | String | 类型(topic/keyPoint/concept/qaPair) |
| content | Text | 内容 |
| timestamp | Int? | 视频时间戳(秒) |
| metadata | Json? | 额外元数据 |
| createdAt | DateTime | 创建时间 |

### Embedding（向量嵌入）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| knowledgePointId | String (FK, unique) | 关联知识点 |
| vector | Vector(1024) | DashScope embedding向量 |
| createdAt | DateTime | 创建时间 |

### UPProfile（UP主档案）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | String (cuid) | 主键 |
| mid | String (unique) | UP主mid |
| name | String | UP主名称 |
| face | String? | 头像 |
| sign | String? | 签名 |
| videoCount | Int? | 视频总数 |
| lastSyncedAt | DateTime? | 最近同步时间 |
| createdAt | DateTime | 创建时间 |

## Prisma Schema

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id        String     @id @default(cuid())
  email     String     @unique
  name      String
  avatar    String?
  notebooks Notebook[]
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
}

model Notebook {
  id          String          @id @default(cuid())
  userId      String
  title       String
  description String?
  coverImage  String?
  tags        String[]
  videoCount  Int             @default(0)
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  videos      NotebookVideo[]
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  @@index([userId])
}

model Video {
  id                  String           @id @default(cuid())
  bvid                String           @unique
  title               String
  pic                 String?
  desc                String?
  duration            Int
  ownerName           String
  ownerMid            String
  cid                 Int?
  subtitleText        String
  subtitleSource      String           @default("cc")
  summary             String?
  knowledgeExtracted  Boolean          @default(false)
  notebookVideos      NotebookVideo[]
  knowledgePoints     KnowledgePoint[]
  createdAt           DateTime         @default(now())
  updatedAt           DateTime         @updatedAt

  @@index([ownerMid])
}

model NotebookVideo {
  id         String   @id @default(cuid())
  notebookId String
  videoId    String
  notes      String?
  order      Int      @default(0)
  notebook   Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  video      Video    @relation(fields: [videoId], references: [id], onDelete: Cascade)
  addedAt    DateTime @default(now())

  @@unique([notebookId, videoId])
  @@index([notebookId])
  @@index([videoId])
}

model KnowledgePoint {
  id           String     @id @default(cuid())
  videoId      String
  type         String
  content      String
  timestamp    Int?
  metadata     Json?
  video        Video      @relation(fields: [videoId], references: [id], onDelete: Cascade)
  embedding    Embedding?
  createdAt    DateTime   @default(now())

  @@index([videoId])
  @@index([type])
}

model Embedding {
  id                String          @id @default(cuid())
  knowledgePointId  String          @unique
  vector            Unsupported("vector(1024)")
  knowledgePoint    KnowledgePoint  @relation(fields: [knowledgePointId], references: [id], onDelete: Cascade)
  createdAt         DateTime        @default(now())
}

model UPProfile {
  id           String    @id @default(cuid())
  mid          String    @unique
  name         String
  face         String?
  sign         String?
  videoCount   Int?
  lastSyncedAt DateTime?
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
}
```
