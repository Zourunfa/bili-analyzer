# B站扫码登录功能说明

## 功能概述

通过 B站 APP 扫码登录，自动获取并持久化 SESSDATA 等 Cookie 凭证，解决传统手动复制 Cookie 繁琐且易失效的问题。

## 使用方式

### 1. 进入 UP主页面

点击顶部导航栏 **"UP主"** 进入 UP主视频管理页面。

### 2. 打开 Cookie 配置面板

点击页面中的 **"B站 Cookie 配置"** 折叠面板展开配置区域。

### 3. 点击"扫码登录"

在手动输入框下方找到 **"扫码登录"** 按钮（右侧带有二维码图标）。

### 4. 用 B站 APP 扫码

- 用手机上的 B站 APP 扫描页面显示的二维码
- 在 APP 内点击确认登录
- 页面会自动识别扫码状态（等待扫描 → 已扫描待确认 → 登录成功）

### 5. 登录完成

登录成功后：
- 输入框会自动填充 SESSDATA 等值
- Cookie 自动保存到浏览器 localStorage
- Cookie 同步持久化到服务端 `data/bilibili-cookies.json`，重启服务无需重新扫码

## 技术细节

### Cookie 持久化三层架构

| 层级 | 存储位置 | 用途 |
|------|----------|------|
| JSON 文件 | `data/bilibili-cookies.json` | 服务端重启后自动复用，无需重新扫码 |
| 环境变量 | `process.env`（内存） | 兼容所有现有 API 调用 |
| 浏览器 | localStorage | 客户端请求通过 headers 发送 |

> **注意**：`data/bilibili-cookies.json` 已被加入 `.gitignore`，不会泄露到代码仓库。

### Cookie 优先级

客户端传入（headers） > JSON 文件持久化 > `.env.local` 环境变量

### API 端点

- `POST /api/auth/bilibili/qrcode` — 生成二维码
- `POST /api/auth/bilibili/qrcode/poll` — 轮询扫码状态
- `GET /api/auth/bilibili/status` — 查询当前登录状态

### 二维码有效期

二维码有效期 **180 秒**，过期后页面会提示"二维码已过期"，点击"刷新二维码"可重新生成。

## 与手动配置的关系

扫码登录与手动输入 Cookie **互为补充**，可以随时切换：
- 手动输入的 Cookie 不会被扫码登录覆盖
- 扫码登录成功后，输入框会同步更新为扫码获取的值

## 常见问题

### Q: 扫码后提示"登录成功但未获取到 SESSDATA"
A: 极少见，可能是 B站接口返回异常。尝试重新扫码，或使用手动复制 Cookie 方式。

### Q: 重启服务后需要重新扫码吗？
A: 不需要。Cookie 已持久化到 `data/bilibili-cookies.json`，重启后自动加载。

### Q: 在 Vercel 部署时文件只读，Cookie 怎么持久化？
A: Vercel 环境下 JSON 文件持久化不可用，但 localStorage 路径仍然生效。Vercel 部署建议通过环境变量配置 `BILIBILI_SESSDATA`。

### Q: 扫码登录后 API 调用仍然失败？
A: 检查登录状态 API：`GET /api/auth/bilibili/status`，确认 `valid: true`。如仍有问题，可能是 B站风控触发，需要稍后再试或使用手动 Cookie。
