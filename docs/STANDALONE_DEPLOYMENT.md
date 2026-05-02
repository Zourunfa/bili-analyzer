# Standalone 低内存服务器部署方案

本文档记录当前推荐的生产部署方式：在本地或 CI 完成依赖安装与 Next.js 构建，打包 `.next/standalone` 产物上传到服务器，服务器只负责数据库迁移、解压产物和用 PM2 运行 Node 服务。

这套方式用于解决 2G 内存、2 核服务器上 `npm i`、`npm ci`、`npm run build` 容易卡死或被系统终止的问题。

## 部署原则

- 不在 2G 服务器上执行 `npm i`、`npm ci`、`npm run build`。
- 构建环境必须和服务器架构一致。当前服务器是 Linux x86_64，因此本地推荐用 Docker `linux/amd64` 构建。
- 服务器运行 `.next/standalone` 产物，不依赖源码目录里的 `node_modules`。
- 生产环境变量不放进构建包，部署时从服务器已有 `.env`、`.env.local` 复制到 release 目录。
- 数据库 schema 变更仍然需要执行 Prisma migration，再切换 PM2 进程。

## 当前线上结构

```bash
/root/bili-analyzer                         # 服务器源码目录，保留用于源码同步、环境文件和迁移
/root/bili-analyzer-standalone
  /uploads                                  # 上传的 tar.gz 构建包
  /releases/<commit>                        # 每次部署一个独立 release
  /current -> /releases/<commit>            # 当前运行版本软链
```

PM2 进程：

```bash
subtitle -> /root/bili-analyzer-standalone/current/start-server.js
```

服务监听：

```bash
PORT=3000
NODE_ENV=production
```

公网访问通常走 Nginx 的 80/443 端口，服务器的 `:3000` 不一定对公网开放。

## 一次性配置

Next.js 需要开启 standalone 输出：

```ts
// next.config.ts
const nextConfig = {
  output: "standalone",
};
```

服务器需要有：

- Node.js，当前线上使用 Node 20.x。
- PM2。
- Nginx，反向代理到 `127.0.0.1:3000`。
- 可用的生产 `.env` 或 `.env.local`。

本地或 CI 构建机需要有：

- Docker。
- `ssh`、`rsync` 或等价上传工具。

## 本地构建

以下命令以本地临时目录为例。`DATABASE_URL`、`NEXTAUTH_SECRET`、`NEXTAUTH_URL` 在构建阶段只用于让 Next.js 完成路由收集，不应填写生产密钥。

```bash
COMMIT=$(git rev-parse --short HEAD)
BUILD_DIR=/tmp/bili-analyzer-standalone-build
ARTIFACT=/tmp/bili-analyzer-standalone-$COMMIT.tar.gz

rm -rf "$BUILD_DIR" "$ARTIFACT"
mkdir -p "$BUILD_DIR"

rsync -a \
  --exclude .git \
  --exclude node_modules \
  --exclude .next \
  --exclude '.env*' \
  --exclude .agents \
  --exclude .codex \
  ./ "$BUILD_DIR/"

docker run --rm --platform linux/amd64 \
  -e NEXT_TELEMETRY_DISABLED=1 \
  -e DATABASE_URL='postgresql://user:pass@127.0.0.1:5432/bilianalyzer' \
  -e NEXTAUTH_SECRET='build-placeholder' \
  -e NEXTAUTH_URL='http://localhost:3000' \
  -v "$BUILD_DIR:/app" \
  -w /app \
  node:22-bookworm \
  bash -lc 'npm ci --no-audit --no-fund && npm run build && cp -r public .next/standalone/ && mkdir -p .next/standalone/.next && cp -r .next/static .next/standalone/.next/'
```

Next standalone 默认不会把项目根目录的 `.env` 自动带入 release。为了让线上继续读取 release 目录下的 `.env`、`.env.local`，构建后加入一个启动包装文件：

```bash
cp -R "$BUILD_DIR/node_modules/dotenv" "$BUILD_DIR/.next/standalone/node_modules/dotenv"

cat > "$BUILD_DIR/.next/standalone/start-server.js" <<'EOF'
const path = require('path');
const dotenv = require('./node_modules/dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });

require('./server.js');
EOF
```

打包产物：

```bash
cd "$BUILD_DIR/.next/standalone"
tar --no-xattrs -czf "$ARTIFACT" .
```

## 上传产物

```bash
COMMIT=$(git rev-parse --short HEAD)
ARTIFACT=/tmp/bili-analyzer-standalone-$COMMIT.tar.gz

ssh root@120.76.141.65 'mkdir -p /root/bili-analyzer-standalone/uploads'
rsync -avP "$ARTIFACT" root@120.76.141.65:/root/bili-analyzer-standalone/uploads/
```

## 数据库迁移

如果本次代码包含 Prisma schema 或 migration 变更，需要先执行迁移。

推荐在服务器源码目录执行：

```bash
cd /root/bili-analyzer
git pull --ff-only origin main
npx prisma migrate deploy
```

如果服务器源码目录的 `node_modules` 不完整，避免在小内存服务器重新安装依赖。可以改为在 CI 或本地通过生产数据库连接执行迁移，或者准备一个包含 Prisma CLI 的一次性迁移镜像。

## 切换线上 release

```bash
COMMIT=<commit>
BASE=/root/bili-analyzer-standalone
SOURCE=/root/bili-analyzer
RELEASE=$BASE/releases/$COMMIT
ARTIFACT=$BASE/uploads/bili-analyzer-standalone-$COMMIT.tar.gz

rm -rf "$RELEASE"
mkdir -p "$RELEASE"
tar -xzf "$ARTIFACT" -C "$RELEASE"

for file in "$SOURCE/.env" "$SOURCE/.env.local"; do
  if [ -f "$file" ]; then
    cp "$file" "$RELEASE/"
  fi
done

if [ -d "$SOURCE/data" ]; then
  rm -rf "$RELEASE/data"
  cp -a "$SOURCE/data" "$RELEASE/data"
fi

ln -sfn "$RELEASE" "$BASE/current"

pm2 delete subtitle >/dev/null 2>&1 || true
cd "$BASE/current"
PORT=3000 NODE_ENV=production pm2 start start-server.js --name subtitle --update-env
pm2 save
```

这里使用 `pm2 delete` 后重新 `pm2 start`，是为了确保 PM2 记录的脚本路径指向新的 release，而不是旧 release 的绝对路径。

## 验证

```bash
pm2 describe subtitle --no-color
curl -I http://127.0.0.1:3000
curl -I http://120.76.141.65
```

期望结果：

- PM2 状态为 `online`。
- 本机 `127.0.0.1:3000` 返回 `200`、`302` 或应用预期状态码。
- 公网域名或 IP 通过 Nginx 返回应用页面。

如果 `http://120.76.141.65:3000` 超时，但 `http://120.76.141.65` 正常，这是可以接受的，说明 3000 端口没有直接对公网开放。

## 回滚

查看已有 release：

```bash
ls -1t /root/bili-analyzer-standalone/releases
```

切换到旧版本：

```bash
BASE=/root/bili-analyzer-standalone
OLD_COMMIT=<old_commit>

ln -sfn "$BASE/releases/$OLD_COMMIT" "$BASE/current"
pm2 delete subtitle >/dev/null 2>&1 || true
cd "$BASE/current"
PORT=3000 NODE_ENV=production pm2 start start-server.js --name subtitle --update-env
pm2 save
```

## 清理旧版本

保留最近 3 个 release：

```bash
cd /root/bili-analyzer-standalone/releases
ls -1t | tail -n +4 | xargs -r rm -rf
```

## 常见问题

### 为什么服务器上 `npm i` 会卡死？

2G 内存服务器同时执行依赖解析、包下载、原生依赖安装、Next.js 构建、Prisma 生成等操作时，很容易触发内存峰值。系统可能开始大量 swap，表现为 SSH 还能连但命令长时间无输出，严重时进程会被 OOM killer 终止。

### 为什么不能直接上传 Mac 本机 `.next`？

Next standalone 产物里可能包含平台相关依赖。Mac 本机构建的产物不一定能在 Linux x86_64 服务器稳定运行。用 Docker `--platform linux/amd64` 构建可以让产物和服务器环境一致。

### 为什么要复制 `.next/static` 和 `public`？

`.next/standalone` 只包含运行服务所需的最小 Node 产物，静态资源需要额外复制：

- `public -> .next/standalone/public`
- `.next/static -> .next/standalone/.next/static`

缺少这两部分会导致页面静态资源、图片、CSS 或 JS 加载失败。

### 为什么需要 `start-server.js`？

当前 standalone 运行方式不会稳定读取 release 目录下的 `.env`、`.env.local`。`start-server.js` 在启动 `server.js` 前显式加载环境变量，避免生产服务拿不到数据库、模型供应商、鉴权等配置。

### 源码目录还需要保留吗？

需要。源码目录仍用于：

- 保存生产环境 `.env`、`.env.local`。
- 执行 Prisma migration。
- 对照线上代码版本。

但运行时不再依赖源码目录的构建产物或 `node_modules`。
