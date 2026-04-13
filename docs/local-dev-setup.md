# 视记 VideoNote - 本地开发环境启动指南

## 前置条件
- Node.js 24+（`nvm use 24`）
- OrbStack（已安装，提供 Docker 环境）
- 已配置 `.env.local`（DASHSCOPE_API_KEY、BILIBILI_SESSDATA 等）

## 一、启动 PostgreSQL 数据库

```bash
# 首次启动（创建容器 + pgvector 扩展）
docker run -d \
  --name videonote-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=videonote \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 5432:5432 \
  pgvector/pgvector:pg16

# 初始化 pgvector 扩展（首次需要）
docker exec videonote-postgres psql -U postgres -d videonote -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 首次运行数据库迁移
nvm use 24
npx prisma migrate deploy
```

> 注意：`POSTGRES_HOST_AUTH_METHOD=trust` 是必须的，否则 pg 库无法通过 scram-sha-256 认证。

## 二、日常启动（3 步）

```bash
# 1. 启动数据库（如果容器已存在）
docker start videonote-postgres

# 2. 确保 Node 24
nvm use 24

# 3. 启动开发服务器
npm run dev
```

访问 http://localhost:3000

## 三、停止服务

```bash
# 停止开发服务器：Ctrl+C

# 停止数据库
docker stop videonote-postgres
```

## 四、数据库管理

### 运行迁移（schema 变更后）
```bash
nvm use 24
npx prisma migrate dev --name <描述>
```

### 查看数据
```bash
# 命令行
docker exec videonote-postgres psql -U postgres -d videonote -c "SELECT * FROM users;"

# 可视化工具（推荐）
nvm use 24 && npx prisma studio
# 浏览器打开 http://localhost:5555
```

### 完全重置数据库（清空所有数据）
```bash
docker rm -f videonote-postgres
docker run -d \
  --name videonote-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=videonote \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -p 5432:5432 \
  pgvector/pgvector:pg16
docker exec videonote-postgres psql -U postgres -d videonote -c "CREATE EXTENSION IF NOT EXISTS vector;"
nvm use 24 && npx prisma migrate deploy
```

## 五、常用 Docker 命令

```bash
docker ps                                 # 查看运行中的容器
docker logs videonote-postgres            # 查看数据库日志
docker exec videonote-postgres psql -U postgres -d videonote   # 进入 psql
```

## 连接信息

| 参数 | 值 |
|------|-----|
| Host | localhost |
| Port | 5432 |
| 用户名 | postgres |
| 密码 | postgres |
| 数据库名 | videonote |
| 连接串 | `postgresql://postgres:postgres@localhost:5432/videonote` |

## 关键文件
- `.env.local` — 环境变量（DATABASE_URL、API Key 等）
- `prisma/schema.prisma` — 数据库模型定义
- `prisma/migrations/` — 迁移历史
- `src/lib/db.ts` — Prisma 客户端单例
