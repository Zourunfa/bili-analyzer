# 阿里云服务器部署问题汇总

## 环境
- 服务器 IP: 120.76.141.65
- 系统: Ubuntu 22.04 (jammy)
- Node.js: v20
- PostgreSQL: 14
- PM2 进程名: subtitle

---

## 问题一：NextAuth 缺少 NEXTAUTH_SECRET

### 错误日志
```
[next-auth][error][NO_SECRET]
Error [MissingSecretError]: Please define a `secret` in production.
```

### 原因
`.env` 文件不存在或 PM2 启动时没有加载环境变量。

### 解决方法

**1. 创建 .env 文件**
```bash
NEXTAUTH_SECRET=生成的随机值
NEXTAUTH_URL=http://120.76.141.65
DATABASE_URL=postgresql://bilianalyzer:bili123321@localhost:5432/bilianalyzer
```

生成随机 secret：
```bash
openssl rand -base64 32
```

**2. 创建 ecosystem.config.js 让 PM2 加载 .env**
```javascript
const path = require('path');
const fs = require('fs');

const envFile = path.join(__dirname, '.env');
let envVars = {};
if (fs.existsSync(envFile)) {
  const content = fs.readFileSync(envFile, 'utf8');
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key] = valueParts.join('=');
      }
    }
  });
}

module.exports = {
  apps: [{
    name: 'subtitle',
    script: 'npm',
    args: 'start',
    cwd: '/root/bili-analyzer',
    env: {
      NODE_ENV: 'production',
      ...envVars,
    },
  }],
};
```

**3. 重启服务**
```bash
pm2 delete subtitle
pm2 start ecosystem.config.js
pm2 save
```

---

## 问题二：PostgreSQL 未安装

### 错误日志
```
Error [PrismaClientKnownRequestError]:
code: 'ECONNREFUSED'
meta: { modelName: 'User' }
```

### 原因
服务器上没有安装 PostgreSQL。

### 解决方法

**1. 安装 PostgreSQL**
```bash
apt update && apt install -y postgresql postgresql-contrib
service postgresql start
```

**2. 创建数据库和用户**
```bash
sudo -u postgres psql -c "CREATE USER bilianalyzer WITH PASSWORD 'bili123321';"
sudo -u postgres psql -c "CREATE DATABASE bilianalyzer OWNER bilianalyzer;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE bilianalyzer TO bilianalyzer;"
```

---

## 问题三：pgvector 扩展未安装

### 错误日志
```
ERROR: type "vector" does not exist
Position: 74
CREATE TABLE "embeddings" (
    ...
    "vector" vector(1024) NOT NULL,
```

### 原因
PostgreSQL 没有安装 pgvector 扩展，无法支持向量类型。

### 解决方法

**方案：从源码编译安装（推荐）**

1. 安装编译依赖：
```bash
apt-get install -y build-essential git
apt-get install -y postgresql-server-dev-14=14.22-0ubuntu0.22.04.1
```

2. 克隆并编译 pgvector：
```bash
cd /tmp
git clone https://github.com/pgvector/pgvector.git
cd pgvector
make clean
make PGINCLUDE="-I/usr/include/postgresql/14/server -I/usr/include/postgresql/internal"
make install
```

3. 在数据库中启用扩展：
```bash
sudo -u postgres psql -d bilianalyzer -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

---

## 问题四：迁移失败记录阻止新迁移

### 错误日志
```
Error: P3009
migrate found failed migrations in the target database, new migrations will not be applied.
Migration name: 20260405120153_init
```

### 原因
之前迁移失败时在 `_prisma_migrations` 表中留下了失败记录。

### 解决方法

**1. 查看失败记录：**
```bash
sudo -u postgres psql -d bilianalyzer -c "SELECT * FROM _prisma_migrations;"
```

**2. 删除失败记录（如果表还存在）：**
```bash
sudo -u postgres psql -d bilianalyzer -c "DELETE FROM _prisma_migrations WHERE migration_name = '20260405120153_init';"
```

**3. 如果表结构已损坏，删除整个 schema 重建：**
```bash
sudo -u postgres psql -d bilianalyzer -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO postgres; GRANT ALL ON SCHEMA public TO public;"
sudo -u postgres psql -d bilianalyzer -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

**4. 重新运行迁移：**
```bash
cd ~/bili-analyzer
NEXTAUTH_SECRET=xxx DATABASE_URL=xxx npx prisma migrate deploy
```

---

## 问题五：cid 字段整数溢出

### 错误日志
```
Value out of range for the type: value "37477355126" is out of range for type integer
code: 'P2020'
meta: { modelName: 'Video' }
```

### 原因
B站的 cid 值（约 37 亿）超出了 PostgreSQL INTEGER 类型范围（最大 2,147,483,647）。
迁移 SQL 中 `cid` 定义为 `INTEGER`，但实际需要 `BIGINT`。

### 解决方法

**1. 修改迁移 SQL 文件（prisma/migrations/20260405120153_init/migration.sql）：**
```sql
-- 把
"cid" INTEGER,
-- 改为
"cid" BIGINT,
```

**2. 直接在数据库中修改列类型（不用重新迁移）：**
```bash
sudo -u postgres psql -d bilianalyzer -c "ALTER TABLE videos ALTER COLUMN cid TYPE BIGINT;"
```

---

## 常用服务器维护命令

### PM2 管理
```bash
# 查看进程状态
pm2 list

# 查看日志
pm2 logs subtitle

# 重启服务
pm2 restart subtitle

# 删除并重新启动
pm2 delete subtitle
pm2 start ecosystem.config.js

# 保存进程列表（重启后自动恢复）
pm2 save

# 设置开机自启
pm2 startup
```

### PostgreSQL 管理
```bash
# 查看集群状态
pg_lsclusters

# 启动服务
service postgresql start

# 连接数据库
sudo -u postgres psql -d bilianalyzer

# 查看表结构
sudo -u postgres psql -d bilianalyzer -c "\d videos"

# 查看扩展
sudo -u postgres psql -d bilianalyzer -c "\dx"
```

### 环境变量
```bash
# 查看 .env 文件
cat ~/bili-analyzer/.env

# 测试数据库连接
sudo -u postgres psql -d bilianalyzer -c "SELECT 1;"

# 验证 vector 扩展
sudo -u postgres psql -d bilianalyzer -c "CREATE EXTENSION IF NOT EXISTS vector; SELECT extversion FROM pg_extension WHERE extname = 'vector';"
```

---

## 当前 .env 配置
```
NEXTAUTH_SECRET=UHUfLOxz45D9OdpkCBlGQA1XH8Pc/zXCupHT9MRyqN4=
NEXTAUTH_URL=http://120.76.141.65
DATABASE_URL=postgresql://bilianalyzer:bili123321@localhost:5432/bilianalyzer
```

---

## 数据库信息
- 数据库名: bilianalyzer
- 用户名: bilianalyzer
- 密码: bili123321
- 端口: 5432
- pgvector: 已安装并启用
