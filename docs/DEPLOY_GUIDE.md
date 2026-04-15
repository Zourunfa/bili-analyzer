# B站字幕分析器 · 服务器部署指南

本文档涵盖从零到生产可用的完整部署流程，包含 DNS、安全组、SSL 证书、Nginx 反向代理、数据库（Prisma + PostgreSQL）以及 PM2 进程管理的全部步骤。

---

## 目录

1. [域名 DNS 解析](#1-域名-dns-解析)
2. [阿里云安全组配置](#2-阿里云安全组配置)
3. [SSL 证书申请与下载](#3-ssl-证书申请与下载)
4. [上传证书到服务器](#4-上传证书到服务器)
5. [Nginx 安装与配置](#5-nginx-安装与配置)
6. [PM2 进程管理](#6-pm2-进程管理)
7. [PostgreSQL 数据库配置](#7-postgresql-数据库配置)
8. [Prisma + PostgreSQL 联动](#8-prisma--postgresql-联动)
9. [一键部署脚本](#9-一键部署脚本)
10. [常见问题排查](#10-常见问题排查)

---

## 1. 域名 DNS 解析

### 目标

将域名 `www.afai.asia` 和 `afai.asia` 指向服务器公网 IP `120.76.141.65`，并添加 DNSSEC 所需的 TXT 记录。

### 操作步骤

1. 登录 [阿里云 DNS 控制台](https://dns.console.aliyun.com)
2. 进入域名解析页面，点击要解析的域名
3. 添加以下记录：

| 主机记录 | 记录类型 | 记录值 | TTL |
|----------|----------|--------|-----|
| `@` | A | `120.76.141.65` | 600秒 |
| `www` | A | `120.76.141.65` | 600秒 |
| `_dnsauth` | TXT | `2026041400000061hch3k90ldufngeacv6oqtpeieelsbmoqtjg1fuhkjy6xne58` | 600秒 |

> **TXT 记录**用于 CA 厂商（Let's Encrypt 等）验证域名所有权，申请 SSL 证书前必须完成。

4. 等待 DNS 生效（通常 10 分钟以内）

### 验证

```bash
nslookup www.afai.asia
# 期望看到: Address: 120.76.141.65

nslookup -type=TXT _dnsauth.afai.asia
# 期望看到: 2026041400000061hch3k90ldufngeacv6oqtpeieelsbmoqtjg1fuhkjy6xne58
```

---

## 2. 阿里云安全组配置

### 目标

开放 HTTP（80）和 HTTPS（443）端口，允许外部流量进入服务器。

### 安全组规则

在阿里云控制台 **ECS → 安全组 → 入方向规则** 添加或确认以下规则：

| 动作 | 协议 | 端口范围 | 来源 | 说明 |
|------|------|----------|------|------|
| 允许 | HTTPS | 443 | 0.0.0.0/0 | HTTPS 加密通信 |
| 允许 | HTTP | 80 | 0.0.0.0/0 | HTTP 重定向到 HTTPS |
| 允许 | SSH | 22 | 0.0.0.0/0 | 服务器登录（建议限制来源 IP）|

### 关键：绑定 ECS 实例

> 安全组规则创建好后，**必须关联到具体的 ECS 实例**才能生效。

1. 在安全组详情页找到 **"实例"** 或 **"添加实例"** 按钮
2. 将目标 ECS 实例（`i-wz98hs8fpllshyjvxuj7`）添加到该安全组
3. 一个 ECS 实例可以属于多个安全组

### 验证

```bash
# 在本机执行，测试端口是否可达
telnet 120.76.141.65 443
# 如果显示"连接成功"说明安全组已生效
```

---

## 3. SSL 证书申请与下载

### 方式一：阿里云免费证书（Symantec）

1. 登录阿里云控制台 → **SSL 证书** → 免费证书
2. 点击"创建证书"，系统自动验证域名（DNS 验证，即添加上面的 TXT 记录）
3. 审核通过后下载证书，选择 **Nginx** 格式

下载后会得到两个文件：
- `www.afai.asia.key` — 私钥（必须保密）
- `www.afai.asia.pem` — 证书链（含中间 CA）

### 方式二：Let's Encrypt（certbot）

```bash
sudo certbot --nginx -d www.afai.asia -d afai.asia
```

### 证书有效期

- 阿里云免费证书：**1年**，到期需重新申请
- Let's Encrypt：**90天**，自动续期

---

## 4. 上传证书到服务器

### 证书文件

| 文件 | 用途 |
|------|------|
| `www.afai.asia.key` | SSL 私钥 |
| `www.afai.asia.pem` | SSL 证书链 |

### 上传命令

```bash
# 创建证书目录
ssh root@120.76.141.65 "mkdir -p /root/nginx_ssl"

# 上传证书（替换本地路径）
scp /path/to/www.afai.asia.key root@120.76.141.65:/root/nginx_ssl/
scp /path/to/www.afai.asia.pem root@120.76.141.65:/root/nginx_ssl/
```

### 验证

```bash
ssh root@120.76.141.65 "ls -la /root/nginx_ssl/"
# 期望看到:
# www.afai.asia.key
# www.afai.asia.pem
```

---

## 5. Nginx 安装与配置

### 安装

```bash
# Debian/Ubuntu
apt update && apt install nginx -y

# 验证安装
nginx -v
```

### 安装（若未安装）

```bash
# CentOS
yum install nginx -y
```

### 反向代理配置

创建 `/etc/nginx/sites-available/www.afai.asia`：

```nginx
# HTTP → HTTPS 重定向
server {
    listen 80;
    listen [::]:80;
    server_name www.afai.asia afai.asia;

    return 301 https://$server_name$request_uri;
}

# HTTPS 反向代理到 Next.js
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name www.afai.asia afai.asia;

    # SSL 证书
    ssl_certificate /root/nginx_ssl/www.afai.asia.pem;
    ssl_certificate_key /root/nginx_ssl/www.afai.asia.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Next.js 应用
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 启用配置

```bash
# 创建软链接
ln -sf /etc/nginx/sites-available/www.afai.asia /etc/nginx/sites-enabled/

# 测试配置语法
nginx -t

# 重启 Nginx
systemctl restart nginx
systemctl status nginx
```

### 验证

```bash
# 本地验证（服务器上）
curl -s -o /dev/null -w "%{http_code}" -k https://127.0.0.1
# 期望: 200

# 外部验证
curl -s -o /dev/null -w "%{http_code}" -L https://www.afai.asia
# 期望: 200
```

---

## 6. PM2 进程管理

### 安装（若未安装）

```bash
npm install -g pm2
```

### 项目目录结构

假设项目在 `/root/bili-analyzer`。

### 配置 package.json scripts

```json
{
  "scripts": {
    "dev:local": "next dev --port 3300",
    "build": "prisma generate && next build",
    "start": "next start",
    "prod": "prisma generate && pm2 start npm --name 'subtitle' -- start"
  }
}
```

### 启动服务

```bash
cd /root/bili-analyzer

# 首次启动
pm2 start npm --name "subtitle" -- start

# 重启（更新代码后）
pm2 restart subtitle

# 查看状态
pm2 list
pm2 logs subtitle --nostream
```

### PM2 常用命令

| 命令 | 说明 |
|------|------|
| `pm2 list` | 查看所有进程 |
| `pm2 logs subtitle --nostream` | 查看日志（无滚动） |
| `pm2 restart subtitle` | 重启 |
| `pm2 stop subtitle` | 停止 |
| `pm2 delete subtitle` | 删除进程 |
| `pm2 save` | 保存当前进程列表 |
| `pm2 startup` | 设置开机自启 |

### 开机自启

```bash
pm2 save
pm2 startup
# 根据提示执行生成的命令
```

---

## 7. PostgreSQL 数据库配置

### 安装

```bash
apt install postgresql postgresql-contrib -y
systemctl enable postgresql
systemctl start postgresql
```

### 创建用户和数据库

```bash
sudo -u postgres psql

-- 创建用户
CREATE USER bilianalyzer WITH PASSWORD 'YourStrongPassword';

-- 创建数据库
CREATE DATABASE bilianalyzer OWNER bilianalyzer;

-- 退出
\q
```

### 数据库配置示例

| 配置项 | 值 |
|--------|-----|
| Host | localhost |
| Port | 5432 |
| Database | bilianalyzer |
| Username | bilianalyzer |
| Password | （你设置的密码）|

### 项目 .env 配置

```env
DATABASE_URL="postgresql://bilianalyzer:YourStrongPassword@localhost:5432/bilianalyzer"
```

---

## 8. Prisma + PostgreSQL 联动

### Prisma 安装

```bash
npm install prisma --save-dev
npm install @prisma/client
npx prisma init
```

### 初始化 Prisma Schema

项目已有 `prisma/schema.prisma`，数据源配置如下：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id               String    @id @default(cuid())
  email            String    @unique
  name             String
  avatar           String?
  password         String
  emailVerifiedAt  DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  // ... 其他模型
}
```

### 数据库同步（开发环境）

```bash
npx prisma db push
```

### 数据库同步（生产环境）

> **生产环境强烈建议使用 Migration，不要用 `db push`！**

```bash
# 创建迁移文件
npx prisma migrate dev --name add_email_verified

# 生产环境应用迁移（先备份！）
npx prisma migrate deploy
```

### 生成 Prisma Client

```bash
npx prisma generate
```

### 生产构建

```bash
npm run build
# 等价于: prisma generate && next build
```

> **注意**：`prisma generate` 必须在 `next build` 之前执行，因为 Next.js 构建时需要 Prisma Client 的类型定义。

---

## 9. 一键部署脚本

将以下内容保存为 `deploy.sh`，放在项目根目录：

```bash
#!/bin/bash
set -e

echo "===== 开始部署 ====="

# 1. 进入项目目录
cd /root/bili-analyzer

# 2. 拉取最新代码
echo "[1/6] 拉取代码..."
git pull

# 3. 安装依赖
echo "[2/6] 安装依赖..."
npm install

# 4. 数据库结构同步（生产环境建议用 migrate deploy）
echo "[3/6] 同步数据库..."
npx prisma db push

# 5. 构建
echo "[4/6] 构建生产版本..."
npm run build

# 6. 重启 PM2
echo "[5/6] 重启 PM2..."
pm2 restart subtitle || pm2 start npm --name "subtitle" -- start

# 7. 保存 PM2 进程列表
echo "[6/6] 保存 PM2 状态..."
pm2 save

echo "===== 部署完成 ====="
```

```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 10. 常见问题排查

### 问题 1：npm run build 报错 `useSearchParams() must be wrapped in Suspense`

**原因**：Next.js 16 在生产构建时会预渲染页面，`useSearchParams()` 是客户端渲染 bailout，需要 Suspense 边界。

**解决**：将使用 `useSearchParams` 的组件包裹在 `<Suspense>` 中：

```tsx
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function PageContent() {
  const searchParams = useSearchParams();
  // ... 业务逻辑
}

export default function Page() {
  return (
    <Suspense fallback={<Loading />}>
      <PageContent />
    </Suspense>
  );
}
```

### 问题 2：Prisma 报错 `column does not exist`

**原因**：数据库表结构与 Prisma Schema 不同步，新增字段后未执行 `prisma db push` 或 `prisma migrate`。

**解决**：

```bash
# 开发环境（直接覆盖）
npx prisma db push

# 生产环境（生成迁移脚本）
npx prisma migrate dev --name your_migration_name
```

### 问题 3：端口 3000 已被占用

**排查**：

```bash
lsof -i :3000
# 或
ss -tlnp | grep 3000
```

**解决**：kill 掉旧进程

```bash
kill <PID>
```

### 问题 4：外网无法访问 HTTPS

**排查步骤**：

1. 确认阿里云安全组已开放 443 端口（入方向）
2. 确认安全组已绑定到 ECS 实例
3. 在服务器上检查 nginx 是否监听 443：

```bash
ss -tlnp | grep 443
# 期望: LISTEN 0.0.0.0:443
```

4. 在服务器上本地测试：

```bash
curl -k https://127.0.0.1
```

5. 使用 [https://www.yougetsignal.com/tools/open-ports](https://www.yougetsignal.com/tools/open-ports) 检测公网端口

### 问题 5：PM2 重启后网站还是旧版本

**原因**：PM2 启动的是 `/root/bili-analyzer/.next` 目录下的构建产物，需重新 build 才能更新。

**解决**：

```bash
cd /root/bili-analyzer
npm run build
pm2 restart subtitle
```

### 问题 6：数据库迁移丢失数据

> **警告**：`prisma db push` 会修改数据库结构，生产环境慎用！

生产环境正确流程：

```bash
# 1. 在开发环境创建迁移
npx prisma migrate dev --name add_new_field

# 2. 检查生成的迁移文件
ls prisma/migrations/

# 3. 将迁移文件也提交到 Git
git add prisma/migrations/
git commit -m "add new migration"

# 4. 生产环境拉取并应用
git pull
npx prisma migrate deploy
```

### 端口汇总

| 端口 | 用途 | 来源 |
|------|------|------|
| 22 | SSH 登录 | 运维 |
| 80 | HTTP（重定向） | Nginx |
| 443 | HTTPS | Nginx |
| 3000 | Next.js 应用 | Nginx 反代 |
| 5432 | PostgreSQL | 本地 only |

---

## 架构总览

```
用户浏览器
    │
    ▼
DNS: www.afai.asia → 120.76.141.65
    │
    ▼
阿里云安全组（入方向: 80, 443）
    │
    ▼
Nginx（端口 80/443）
    │  SSL 证书: /root/nginx_ssl/
    │
    ▼ 反向代理
PM2 → Next.js（端口 3000）
            │
            ▼
        Prisma Client
            │
            ▼
        PostgreSQL（端口 5432）
        数据库: bilianalyzer
        用户: bilianalyzer
```
