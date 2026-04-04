# 阿里云 ECS 部署指南

## 服务器信息

| 项目 | 值 |
|------|-----|
| 公网 IP | 120.76.141.65 |
| 规格 | 2核 2G（ecs.e-c1m1.large） |
| 带宽 | 3Mbps 固定 |
| 系统 | Ubuntu 22.04 |
| 系统盘 | 40G ESSD Entry |

---

## 第 1 步：SSH 登录服务器

```bash
ssh root@120.76.141.65
```

> **含义**：SSH（Secure Shell）是远程登录服务器的协议。这条命令以 root（超级管理员）身份连接到你的服务器。
>
> 第一次连接会提示 `Are you sure you want to continue connecting?`，输入 `yes` 回车。
> 然后输入你在阿里云创建实例时设置的密码。

---

## 第 2 步：加 Swap（虚拟内存）

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

> **含义**：
> - 服务器只有 2G 物理内存，跑多了容易不够用（OOM，Out of Memory）
> - Swap 就是在硬盘上划一块空间当"虚拟内存"用，内存不够时系统会自动把数据挪到 swap
> - `fallocate` — 在硬盘上创建一个 2G 的文件
> - `chmod 600` — 设置权限，只有 root 能读写（安全）
> - `mkswap` — 把这个文件格式化为 swap 格式
> - `swapon` — 立即启用这个 swap
> - `echo ... >> /etc/fstab` — 写入启动配置，重启后 swap 自动生效
>
> **验证**：`free -h`，看到 Swap 那行显示 2.0G 就对了

---

## 第 3 步：安装 screen（防 SSH 断连）

```bash
apt update -y
apt install -y screen
screen -S deploy
```

> **含义**：
> - `apt` — Ubuntu 的包管理器（类似前端的 npm，用来安装系统软件）
> - `apt update` — 更新软件源列表（告诉系统有哪些软件可以装）
> - `screen` — 终端复用工具，创建一个"虚拟终端会话"
> - `screen -S deploy` — 创建一个名为 deploy 的会话
>
> **为什么需要**：直接在 SSH 里跑命令，电脑睡眠或网络断开，命令就会中断。用 screen 后，命令在服务器后台跑，断开也不影响。
>
> **恢复会话**：重新 SSH 登录后，执行 `screen -r deploy` 就能回到之前的终端

---

## 第 4 步：安装基础依赖

```bash
apt install -y curl git nginx ffmpeg python3 python3-pip
```

> **含义**（每个工具的作用）：
> - `curl` — 命令行 HTTP 请求工具（下载文件、调 API 用）
> - `git` — 版本控制，用来从 GitHub 拉代码
> - `nginx` — Web 服务器，做反向代理（后面会详细讲）
> - `ffmpeg` — 音视频处理工具，VideoCaptioner 依赖它
> - `python3` + `python3-pip` — Python 运行环境和包管理器，VideoCaptioner 是 Python 写的

---

## 第 5 步：安装 Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
```

> **含义**：
> - `curl ... | bash -` — 从 NodeSource 官方下载安装脚本并执行，把 Node.js 的软件源加到系统里
> - `apt install -y nodejs` — 安装 Node.js（包含 npm）
> - `node -v` — 验证安装，应该显示 `v20.x.x`
>
> **为什么要 20**：Node.js 20 是 LTS（长期支持）版本，Next.js 16 需要它。

---

## 第 6 步：安装 PM2 和 VideoCaptioner

```bash
npm install -g pm2
pip3 install videocaptioner yt-dlp
```

> **含义**：
> - `pm2`（Process Manager 2）— Node.js 进程管理器
>   - 类似前端的 forever/nodemon，但更强大
>   - 自动重启：程序崩溃了 PM2 会自动拉起来
>   - 开机自启：服务器重启后自动运行你的项目
>   - 日志管理：自动收集 console.log 输出
> - `videocaptioner` — 语音转字幕工具（卡卡字幕助手）
>   - 用来处理没有 CC 字幕的 B 站视频
>   - 使用免费的必剪(bijian)语音识别引擎，不需要 API Key
> - `yt-dlp` — 视频/音频下载工具
>   - 用于只下载视频的音频轨道（比下载完整视频快很多，文件也更小）
>   - videocaptioner 内部也依赖它

---

## 第 7 步：部署项目代码

```bash
cd /opt
git clone https://github.com/Zourunfa/bili-analyzer.git
cd bili-analyzer
npm install --registry=https://registry.npmmirror.com
    npm run build
```

> **含义**：
> - `cd /opt` — 进入 /opt 目录（Linux 下存放第三方软件的约定目录）
> - `git clone` — 从 GitHub 拉取项目代码到服务器
> - `npm install` — 安装项目依赖（类似前端的装包）
>   - `--registry=...npmmirror.com` — 用国内 npm 镜像，下载更快
> - `npm run build` — 构建生产版本
>   - Next.js 会把 TypeScript 编译、页面预渲染、打包优化
>   - 构建产物在 `.next` 目录里
>   - 生产构建比开发模式性能好很多

---

## 第 8 步：配置环境变量

```bash
cat > /opt/bili-analyzer/.env.local << 'EOF'
DASHSCOPE_API_KEY=sk-d2705e3b0ddb48e2a0fd26fbcd1e1535
BILIBILI_SESSDATA=9a93e540%2C1790512938%2C3d75b%2A32CjACcDFjs-IMdKeu-OrSRCdgd2FdpYoRy-jcB7k79Xjwz7vKqZCtB_GkDv6KMnbVoewSVmFIeWcyOFZtcDVHSlZvTGJneGhxRk9IODZRdy1WR05aVzMwYm1RSW01X25RYzVKMTh3RjRzTTJCdnVpUC0yUU0wbmNsSkhrX2U1RUdfQ1QtOG02dnVRIIEC
EOF
```

> **含义**：
> - `.env.local` — Next.js 的环境变量文件，程序运行时会自动读取
> - `DASHSCOPE_API_KEY` — 通义千问（阿里云大模型）的 API 密钥，用于 AI 摘要和对话
> - `BILIBILI_SESSDATA` — B 站的登录凭证，用于获取视频字幕
> - 这两个值**不能提交到 Git**（已在 .gitignore 中排除），属于敏感信息
>
> **获取方式**：
> - DASHSCOPE_API_KEY：https://dashscope.console.aliyun.com/ → 开通并创建 API Key
> - BILIBILI_SESSDATA：浏览器登录 bilibili.com → F12 → Application → Cookies → 复制 SESSDATA 的值

---

## 第 9 步：用 PM2 启动项目

```bash
cd /opt/bili-analyzer
pm2 start npm --name "subtitle" -- start
pm2 save
pm2 startup
```

> **含义**：
> - `pm2 start npm --name "subtitle" -- start`
>   - 用 PM2 启动一个名为 "subtitle" 的进程
>   - 实际执行的是 `npm start`（即 `next start`，启动 Next.js 生产服务器）
>   - PM2 会在后台守护这个进程，崩溃自动重启
> - `pm2 save` — 保存当前进程列表
> - `pm2 startup` — 生成开机自启脚本
>   - 执行后会输出一条命令，**复制那条命令再执行一次**
>   - 这样服务器重启后，PM2 会自动恢复所有进程
>
> **常用 PM2 命令**：
> | 命令 | 作用 |
> |------|------|
> | `pm2 status` | 查看所有进程状态 |
> | `pm2 logs subtitle` | 查看实时日志 |
> | `pm2 restart subtitle` | 重启 |
> | `pm2 stop subtitle` | 停止 |
> | `pm2 delete subtitle` | 删除进程 |

---

## 第 10 步：配置 Nginx 反向代理

```bash
cat > /etc/nginx/sites-available/subtitle << 'EOF'
server {
    listen 80;
    server_name _;

    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
EOF

ln -sf /etc/nginx/sites-available/subtitle /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
```

> **含义**：
>
> **Nginx 是什么**：
> - 高性能 Web 服务器，类似前端的 dev server，但用于生产环境
> - 它监听 80 端口（HTTP 默认端口），把请求转发给 Next.js（跑在 3000 端口）
>
> **为什么需要反向代理**：
> - 用户访问 http://120.76.141.65（80 端口）→ Nginx 接收 → 转发给 127.0.0.1:3000（Next.js）
> - 用户不需要输入端口号，直接用 IP 就能访问
> - Nginx 还能处理 HTTPS、负载均衡、静态文件缓存等
>
> **配置解释**：
> - `listen 80` — 监听 80 端口（HTTP 默认端口）
> - `server_name _` — 匹配所有域名/IP（因为我们用 IP 访问）
> - `client_max_body_size 50m` — 允许上传最大 50MB（视频文件可能较大）
> - `proxy_pass http://127.0.0.1:3000` — 把请求转发给本地的 Next.js 服务
> - `proxy_set_header` — 把用户的真实 IP、协议等信息传给 Next.js
> - `proxy_read_timeout 300s` — 超时 5 分钟（语音转写可能耗时较长）
>
> **文件操作解释**：
> - `ln -sf ... sites-enabled/` — 创建软链接，启用这个站点配置
>   - 类似前端的 symlink，sites-available 存配置，sites-enabled 存启用的配置
> - `rm -f sites-enabled/default` — 删除默认站点配置
> - `nginx -t` — 测试配置文件语法是否正确
> - `systemctl restart nginx` — 重启 Nginx 使配置生效

---

## 第 11 步：阿里云安全组放行端口

1. 阿里云控制台 → ECS → 安全组
2. 找到实例绑定的安全组
3. 添加入方向规则：
   - 协议：**TCP**
   - 端口范围：**80**
   - 授权对象：**0.0.0.0/0**
   - 策略：**允许**

> **含义**：
> - 安全组 = 云服务器的防火墙
> - 默认只开放了 22 端口（SSH 用）
> - 需要手动开放 80 端口（HTTP），外部才能访问你的网站
> - `0.0.0.0/0` 表示允许任何 IP 访问

---

## 验证

浏览器访问 http://120.76.141.65 ，看到首页就成功了。

---

## 整体架构图

```
用户浏览器
    ↓ http://120.76.141.65 (80端口)
Nginx（反向代理）
    ↓ 转发到 127.0.0.1:3000
Next.js 应用（PM2 守护）
    ↓ 调用 API
┌─────────────────────────┐
│ /api/video-info  → B站 API（获取视频信息）    │
│ /api/subtitle    → B站 API（获取CC字幕）      │
│ /api/transcribe  → VideoCaptioner（语音转写） │
│ /api/summarize   → 通义千问（AI摘要）         │
│ /api/chat        → 通义千问（AI对话）         │
└─────────────────────────┘
```

---

## 常用运维命令

```bash
# 查看项目状态
pm2 status

# 查看实时日志
pm2 logs subtitle

# 重启项目
pm2 restart subtitle

# 更新代码后重新部署
cd /opt/bili-analyzer
git pull
npm install --registry=https://registry.npmmirror.com
npm run build
pm2 restart subtitle

# 重启 Nginx
systemctl restart nginx

# 检查 Nginx 配置
nginx -t

# 恢复 screen 会话
screen -r deploy
```

---

## 常见问题

### SSH 连不上
- 检查安全组是否放行了 22 端口
- 检查实例是否在运行状态
- 密码是否正确（可在阿里云控制台重置）

### 网页打不开
- 检查安全组是否放行了 80 端口
- 检查 PM2 进程是否在运行：`pm2 status`
- 检查 Nginx 是否在运行：`systemctl status nginx`
- 查看日志排查：`pm2 logs subtitle`

### 命令卡住
- 在 screen 里执行命令不怕卡住
- 如果没在 screen 里，按 `Ctrl + C` 取消
- 重新执行：`screen -r deploy`

### 电脑睡眠后断连
- `screen -r deploy` 恢复会话
- 如果 screen 会话也没了，重新 `screen -S deploy`
