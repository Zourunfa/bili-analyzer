# 多平台视频链接解析方案

## 需求概述

在现有 B站 视频解析能力基础上，新增对 **抖音** 和 **小红书** 视频链接的解析支持。用户可在首页输入框粘贴这两个平台的视频链接，系统自动提取视频 ID、获取元数据（标题、封面、作者等），并跳转到分析页面。

---

## 一、平台能力对比

| 维度 | 抖音 | 小红书 | B站（已有） |
|------|------|--------|-------------|
| 视频 ID 格式 | 19位纯数字 | 字母数字混合字符串 | BV号（字母数字） |
| URL 示例 | `v.douyin.com/xxx`<br>`douyin.com/video/xxx` | `xhslink.com/xxx`<br>`xiaohongshu.com/explore/xxx` | `bilibili.com/video/BVxxx` |
| 短链接解析 | 需要（v.douyin.com） | 需要（xhslink.com） | 需要（b23.tv）✓ |
| 字幕/转写 | 不适用 | 不适用 | 支持 ✓ |
| 难度 | **高**（A_Bogus 加密） | **中**（x-s/x-t 签名） | 已有 |
| 推荐方案 | TikHub.io API / Playwright | 签名算法 / Playwright | — |

---

## 二、技术方案

### 2.1 整体架构

```
首页输入框 → /api/video-info → URL 模式匹配
                                    ├─ B站 → extractBvId() ✓（已有）
                                    ├─ 抖音 → extractDouyinId()
                                    └─ 小红书 → extractXHSId()

                              → 获取视频元数据
                                    ├─ B站 → getVideoInfo() ✓（已有）
                                    ├─ 抖音 → getDouyinVideo() / TikHub API
                                    └─ 小红书 → getXHSVideo() / Playwright

                              → 跳转到 /analyze/{id}
```

### 2.2 新增文件

| 文件 | 用途 |
|------|------|
| `src/lib/douyin.ts` | 抖音 URL 解析 + 视频元数据获取 |
| `src/lib/xiaohongshu.ts` | 小红书 URL 解析 + 视频元数据获取 |
| `src/lib/platform.ts` | 统一入口：检测平台、路由分发 |

### 2.3 修改文件

| 文件 | 改动 |
|------|------|
| `src/app/api/video-info/route.ts` | 扩展支持抖音/小红书 URL |
| `src/app/page.tsx` | 适配多平台返回的字段 |

---

## 三、抖音方案

### 挑战

抖音 web API 需要 **`A_Bogus` / `X-Bogus`** 加密参数，这是由 JavaScript 算法生成的动态签名，阻止自动化请求。

**选项 A：TikHub.io 商业 API**（推荐 MVP）
- 提供干净的 REST API，无需处理加密
- 注册送免费额度（每日一定量）
- Endpoint 格式：`https://api.tikhub.io/api/v1/douyin/web/fetch_one_video`
- 需要申请 API Key 并配置到环境变量

**选项 B：Playwright 浏览器抓取**（保底）
- 复用项目已有的 Playwright 依赖
- 用无头浏览器访问抖音网页，直接提取 `<video>` 元素和元数据
- 无需处理任何加密或 Cookie
- 缺点：慢（启动浏览器开销）、容易触发风控

### 实现步骤（选项 A - TikHub.io）

1. 注册 TikHub.io 获取 API Key
2. 新增环境变量 `TIKHUb_API_KEY`
3. `extractDouyinId(url)` — 正则匹配 `douyin.com/video/{id}` 或解析 `v.douyin.com` 短链接
4. `getDouyinVideo(id)` — 调用 TikHub API 获取视频元数据（标题、封面、作者、视频直链）
5. API 路由扩展：`video-info` 识别抖音 URL → 调用 TikHub API

### 实现步骤（选项 B - Playwright）

1. `extractDouyinId()` — 同上
2. `getDouyinVideoByBrowser(id)` — 启动 Playwright，访问 `https://www.douyin.com/video/{id}`，等待 DOM 加载，提取 `og:title`、`og:image`、`<video>` src

---

## 四、小红书方案

### 挑战

小红书 API 需要 **`x-s` / `x-t`** 签名头，由 URL 路径和 Cookie 通过 HMAC-SHA256 生成。已有开源 TypeScript 实现 `@lucasygu/redbook`。

**选项 A：签名算法实现**（推荐）
- 参考 `@lucasygu/redbook` 源码（`src/lib/signing.ts`）
- 需要用户提供小红书 Cookie（`a1` 等）
- 直接调用 `edith.xiaohongshu.com` API

**选项 B：Playwright 浏览器抓取**（更简单）
- 直接访问小红书网页，提取 `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">` 中的 JSON 数据
- 包含完整的视频元数据（标题、封面、视频直链、作者）
- 无需 Cookie 和签名

### 实现步骤（选项 B - Playwright，推荐）

1. `extractXHSId(url)` — 正则匹配 `/explore/{id}` 或 `/discovery/item/{id}`，解析 `xhslink.com` 短链接
2. `getXHSVideoByBrowser(noteId)` — Playwright 访问小红书页面，提取 `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON，解析出 `noteDetailMap[noteId].note.*` 字段

---

## 五、数据模型统一

现有的 `VideoInfo` 需要扩展以支持多平台：

```typescript
type Platform = "bilibili" | "douyin" | "xiaohongshu";

interface VideoInfo {
  platform: Platform;
  id: string;           // B站: BV号 / 抖音: aweme_id / 小红书: noteId
  title: string;
  description: string;
  coverUrl: string;       // 封面图
  duration?: number;      // 视频时长（秒）
  author: {
    name: string;
    avatar?: string;
    mid?: string;         // B站 mid
    uid?: string;         // 抖音作者 uid / 小红书用户ID
  };
  // 以下字段抖音/小红书可能为空
  cid?: number;           // B站专用
  subtitleUrl?: string;   // B站字幕直链
}
```

---

## 六、/api/video-info 扩展

现有路由只接受 `{ url }` 或 `{ bvid, cid }`。

扩展后支持：
```typescript
// 请求体
type VideoInfoRequest =
  | { url: string }                        // 任意平台 URL（推荐）
  | { bvid: string; cid?: number }          // B站（兼容已有）
  | { platform: "douyin"; id: string }      // 抖音
  | { platform: "xiaohongshu"; id: string } // 小红书

// 响应体
type VideoInfoResponse =
  | { platform: "bilibili"; ...VideoInfo }
  | { platform: "douyin"; ...VideoInfo }
  | { platform: "xiaohongshu"; ...VideoInfo }
```

---

## 七、首页适配

首页目前跳转到 `/analyze/{bvid}?cid={cid}`。

扩展后：
- `/analyze/{id}?platform=douyin`
- `/analyze/{id}?platform=xiaohongshu`
- `/analyze/{id}?cid={cid}` （B站，兼容已有）

**注意**：抖音/小红书的 `/analyze` 页面会与 B站 有差异（无字幕功能），需要条件渲染或展示"该平台暂不支持字幕分析"提示。

---

## 八、分析页面差异

| 功能 | B站 | 抖音 | 小红书 |
|------|------|------|--------|
| 字幕显示 | ✓ | ✗ | ✗ |
| 语音转写 | ✓ | ✗ | ✗ |
| 思维导图 | ✓（摘要） | ✓（视频描述） | ✓（视频描述） |
| 知识点提取 | ✓ | ✗ | ✗ |
| AI 对话 | ✓ | ✓ | ✓ |
| 笔记保存 | ✓ | ✓ | ✓ |

抖音/小红书不支持字幕相关功能（`subtitleText` 为空），但思维导图和对话功能基于视频描述仍然可用。

---

## 九、环境变量

```bash
# TikHub.io API Key（抖音 MVP 用）
TIKHUb_API_KEY=your_api_key_here
```

---

## 十、风险与注意事项

1. **抖音 A_Bogus**：如 TikHub.io 免费额度用尽，需考虑切换方案（Playwright 或自行实现签名）
2. **小红书 Cookie**：如用签名方案，用户需要提供有效的登录 Cookie
3. **风控**：两个平台都有反爬机制，Playwright 方案需要随机化 User-Agent 和请求间隔
4. **视频直链**：抖音/小红书的视频直链可能有防盗链（Referrer 检查），下载可能失败
5. **字幕**：抖音支持字幕 API，小红书部分视频有字幕，但暂不在 MVP 范围
