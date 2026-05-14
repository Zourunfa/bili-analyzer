/**
 * 抖音视频链接解析
 *
 * 策略（已验证可用）：
 *  1) Playwright（桌面端 UA）打开 www.douyin.com/video/{id}，
 *     被动拦截页面 JS 自己发的 /aweme/v1/web/aweme/detail/ XHR。
 *     页面 JS 会用 a_bogus 签名后发请求，我们只读响应即可。
 *  2) 同一次 Playwright 访问中顺便 dump cookies 给下游 yt-dlp 音频下载用。
 *
 * 注：yt-dlp 2026.03.17 的 Douyin extractor 因 a_bogus 签名已失效
 *     （抛 "Fresh cookies needed"），不能用于元数据提取。
 *     但 yt-dlp 对直链 URL（douyinvod.com）仍可正常下载音频。
 */

import { execFile } from "child_process";
import { mkdir, writeFile, stat } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import type { PlatformVideoInfo } from "@/lib/platform";
import type { Browser, BrowserContext, Cookie, Page, Response as PlaywrightResponse } from "playwright";

// ─── Video ID Extraction ──────────────────────────────────────────────────────

export function extractDouyinId(rawUrl: string): string | null {
  const urlMatch = rawUrl.match(/https?:\/\/[^\s\]】]+/);
  const url = urlMatch ? urlMatch[0] : rawUrl.trim();

  const videoMatch = url.match(/douyin\.com\/video\/(\d+)/);
  if (videoMatch) return videoMatch[1];

  const iesMatch = url.match(/iesdouyin\.com\/share\/video\/(\d+)/);
  if (iesMatch) return iesMatch[1];

  const mMatch = url.match(/modal_id=(\d+)/);
  if (mMatch) return mMatch[1];

  if (/^\d{15,20}$/.test(url.trim())) return url.trim();

  return null;
}

// ─── Short URL Resolution ─────────────────────────────────────────────────────

export async function resolveDouyinShortUrl(shortUrl: string): Promise<string | null> {
  const normalizedShortUrl = normalizeDouyinUrl(shortUrl);
  const directId = extractDouyinId(normalizedShortUrl);
  if (directId) return directId;

  const cachedId = getCachedShortUrlId(normalizedShortUrl);
  if (cachedId) return cachedId;

  const httpId = await resolveDouyinShortUrlViaHttp(normalizedShortUrl);
  if (httpId) {
    setCachedShortUrlId(normalizedShortUrl, httpId);
    return httpId;
  }

  const { chromium } = await import("playwright");
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({
      userAgent: PC_UA,
    });
    await page.goto(normalizedShortUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const id = extractDouyinId(page.url());
    if (id) setCachedShortUrlId(normalizedShortUrl, id);
    return id;
  } catch (err) {
    console.warn("[douyin] 短链接解析失败:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await browser?.close();
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface DouyinRawMeta {
  title: string;
  description: string;
  coverUrl: string;
  duration: number;
  authorName: string;
  authorAvatar: string;
  authorUid: string;
  videoUrl: string;
}

interface AwemeItem {
  aweme_id?: string;
  desc?: string;
  duration?: number;
  video?: {
    duration?: number;
    play_addr?: { url_list?: string[] };
    play_addr_h264?: { url_list?: string[] };
    play_addr_lowbr?: { url_list?: string[] };
    cover?: { url_list?: string[] };
    origin_cover?: { url_list?: string[] };
    dynamic_cover?: { url_list?: string[] };
  };
  author?: {
    uid?: string;
    sec_uid?: string;
    nickname?: string;
    avatar_thumb?: { url_list?: string[] };
    avatar_larger?: { url_list?: string[] };
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

const COOKIE_FILE = join(tmpdir(), "bilibili-subtitle", "douyin-cookies.txt");
const COOKIE_TTL_MS = 30 * 60 * 1000;
const SHORT_URL_CACHE_TTL_MS = 30 * 60 * 1000;
const META_CACHE_TTL_MS = 10 * 60 * 1000;

const shortUrlCache = new Map<string, { id: string; expiresAt: number }>();
const metaCache = new Map<string, { meta: DouyinRawMeta; expiresAt: number }>();
const pendingMetaFetches = new Map<string, Promise<DouyinRawMeta>>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pickPlayUrl(item: AwemeItem): string {
  const candidates = [
    item.video?.play_addr?.url_list?.[0],
    item.video?.play_addr_h264?.url_list?.[0],
    item.video?.play_addr_lowbr?.url_list?.[0],
  ].filter((x): x is string => Boolean(x));

  if (candidates.length === 0) return "";
  return candidates[0].replace("/playwm/", "/play/").replace(/^http:\/\//, "https://");
}

function mapItemToMeta(item: AwemeItem): DouyinRawMeta {
  const durationMs = item.video?.duration ?? item.duration ?? 0;
  return {
    title: item.desc || "抖音视频",
    description: item.desc || "",
    coverUrl:
      item.video?.cover?.url_list?.[0] ||
      item.video?.origin_cover?.url_list?.[0] ||
      item.video?.dynamic_cover?.url_list?.[0] ||
      "",
    duration: Math.round(durationMs / 1000),
    authorName: item.author?.nickname || "抖音用户",
    authorAvatar:
      item.author?.avatar_thumb?.url_list?.[0] ||
      item.author?.avatar_larger?.url_list?.[0] ||
      "",
    authorUid: item.author?.uid || item.author?.sec_uid || "",
    videoUrl: pickPlayUrl(item),
  };
}

function extractRouterDataItem(html: string): AwemeItem | null {
  const markerMatch = html.match(/window\._ROUTER_DATA\s*=\s*/);
  const marker = markerMatch?.[0];
  const start = marker ? html.indexOf(marker) : -1;
  if (start < 0) return null;

  const jsonStart = start + marker!.length;
  const jsonEnd = html.indexOf("</script>", jsonStart);
  if (jsonEnd < 0) return null;

  try {
    const json = JSON.parse(html.slice(jsonStart, jsonEnd).trim()) as {
      loaderData?: Record<string, { videoInfoRes?: { item_list?: AwemeItem[] } }>;
    };
    for (const data of Object.values(json.loaderData || {})) {
      const item = data.videoInfoRes?.item_list?.[0];
      if (item?.aweme_id) return item;
    }
  } catch {
    return null;
  }

  return null;
}

function extractFirstUrl(input: string): string | null {
  return input.match(/https?:\/\/[^\s\]】]+/)?.[0] || null;
}

function normalizeDouyinUrl(input: string): string {
  return extractFirstUrl(input)?.replace(/[，。；、]+$/, "") || input.trim();
}

function getCachedShortUrlId(url: string): string | null {
  const cached = shortUrlCache.get(url);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    shortUrlCache.delete(url);
    return null;
  }
  return cached.id;
}

function setCachedShortUrlId(url: string, id: string) {
  shortUrlCache.set(url, { id, expiresAt: Date.now() + SHORT_URL_CACHE_TTL_MS });
}

function getCachedMeta(videoId: string): DouyinRawMeta | null {
  const cached = metaCache.get(videoId);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    metaCache.delete(videoId);
    return null;
  }
  return cached.meta;
}

function setCachedMeta(videoId: string, meta: DouyinRawMeta) {
  metaCache.set(videoId, { meta, expiresAt: Date.now() + META_CACHE_TTL_MS });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<globalThis.Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function resolveDouyinShortUrlViaHttp(shortUrl: string): Promise<string | null> {
  try {
    const resp = await fetchWithTimeout(
      shortUrl,
      {
        headers: {
          "User-Agent": MOBILE_UA,
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        redirect: "follow",
      },
      5_000
    );
    return extractDouyinId(resp.url);
  } catch (err) {
    console.warn("[douyin] HTTP 短链接解析失败:", err instanceof Error ? err.message : err);
    return null;
  }
}

function parseShareTextFallback(input: string): Pick<DouyinRawMeta, "title" | "description" | "authorName"> | null {
  const withoutUrl = input.replace(/https?:\/\/[^\s\]】]+/g, " ").replace(/\s+/g, " ").trim();
  if (!withoutUrl || withoutUrl === input.trim() && /^\d{15,20}$/.test(input.trim())) return null;

  const authorName = withoutUrl.match(/看看【(.+?)的作品】/)?.[1] || "抖音用户";
  const afterAuthor = withoutUrl.replace(/^.*?看看【.+?的作品】/, "").trim();
  const title = (afterAuthor || withoutUrl)
    .replace(/\s*a@.*$/i, "")
    .replace(/\s*[a-zA-Z0-9.]+:\/.*$/i, "")
    .replace(/^复制打开抖音，?/, "")
    .replace(/^\d+(?:\.\d+)?\s*/, "")
    .trim();

  if (!title) return null;
  return {
    title,
    description: title,
    authorName,
  };
}

async function fetchViaSharePage(videoId: string, source?: string): Promise<DouyinRawMeta | null> {
  const sourceUrl = source ? extractFirstUrl(source) : null;
  const shareUrl = sourceUrl && /douyin\.com|iesdouyin\.com/i.test(sourceUrl)
    ? sourceUrl
    : `https://www.iesdouyin.com/share/video/${videoId}/`;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const resp = await fetch(shareUrl, {
        headers: {
          "User-Agent": MOBILE_UA,
          "Accept-Language": "zh-CN,zh;q=0.9",
        },
        redirect: "follow",
      });
      if (!resp.ok) return null;

      const html = await resp.text();
      const item = extractRouterDataItem(html);
      if (!item) {
        console.warn(`[douyin] 分享页未解析到 _ROUTER_DATA item (status=${resp.status}, url=${resp.url})`);
      }
      return item ? mapItemToMeta(item) : null;
    } catch (err) {
      console.warn(`[douyin] 分享页 SSR 解析失败(${attempt}/3):`, err instanceof Error ? err.message : err);
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
    }
  }

  return null;
}

async function fetchViaMobileBrowser(videoId: string, source?: string): Promise<DouyinRawMeta | null> {
  const { chromium } = await import("playwright");
  const sourceUrl = source ? extractFirstUrl(source) : null;
  const shareUrl = sourceUrl && /douyin\.com|iesdouyin\.com/i.test(sourceUrl)
    ? sourceUrl
    : `https://www.iesdouyin.com/share/video/${videoId}/`;
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
    const context = await browser.newContext({
      userAgent: MOBILE_UA,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    const page = await context.newPage();
    await page.goto(shareUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(1_500);

    const html = await page.content();
    const item = extractRouterDataItem(html);
    await context.close().catch(() => {});
    return item ? mapItemToMeta(item) : null;
  } catch (err) {
    console.warn("[douyin] 移动页 Playwright 解析失败:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await browser?.close().catch(() => {});
  }
}

function cookiesToNetscape(cookies: Cookie[]): string {
  const lines = ["# Netscape HTTP Cookie File", ""];
  for (const c of cookies) {
    const domain = c.domain.startsWith(".") ? c.domain : `.${c.domain}`;
    const exp = c.expires && c.expires > 0 ? Math.floor(c.expires) : Math.floor(Date.now() / 1000) + 86400;
    lines.push([domain, "TRUE", c.path || "/", c.secure ? "TRUE" : "FALSE", exp, c.name, c.value].join("\t"));
  }
  return lines.join("\n") + "\n";
}

// ─── Core: Playwright + XHR Intercept ─────────────────────────────────────────

async function fetchViaBrowser(videoId: string, source?: string): Promise<DouyinRawMeta> {
  const { chromium } = await import("playwright");

  const browser: Browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox", "--disable-dev-shm-usage"],
  });

  let context: BrowserContext | null = null;
  let captured: AwemeItem | null = null;
  try {
    context = await browser.newContext({
      userAgent: PC_UA,
      viewport: { width: 1280, height: 800 },
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      // @ts-expect-error chrome 字段
      window.chrome = window.chrome || { runtime: {} };
    });

    const page: Page = await context.newPage();

    // 拦截 aweme detail XHR —— 页面 JS 会带 a_bogus 签名发起此请求
    page.on("response", async (resp: PlaywrightResponse) => {
      if (captured) return;
      const url = resp.url();
      if (
        !url.includes("/aweme/v1/web/aweme/detail/") &&
        !url.includes("/aweme/v1/web/aweme/post/")
      ) {
        return;
      }
      try {
        if (resp.status() !== 200) return;
        const json: unknown = await resp.json();
        const item: AwemeItem | undefined =
          (json as { aweme_detail?: AwemeItem })?.aweme_detail ??
          (json as { aweme_list?: AwemeItem[] })?.aweme_list?.[0] ??
          (json as { item_list?: AwemeItem[] })?.item_list?.[0];
        if (item?.aweme_id) captured = item;
      } catch {
        /* ignore */
      }
    });

    // Step 1: 先访问首页建立 cookie（ttwid/odin_tt 等），否则直接跳视频页会被验证页拦截
    console.log("[douyin] Step 1: 访问首页建立 cookie...");
    await page.goto("https://www.douyin.com/", {
      waitUntil: "domcontentloaded",
      timeout: 25_000,
    });
    await page.waitForTimeout(2_000);

    // Step 2: 在同一 context 内导航到视频页（cookie 自动携带，XHR 会触发）
    console.log("[douyin] Step 2: 访问视频页...");
    await page.goto(`https://www.douyin.com/video/${videoId}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // 等 XHR 触发（通常 3-5 秒内）
    for (let i = 0; i < 12 && !captured; i++) {
      await page.waitForTimeout(1_000);
    }

    // 保存 cookies 供下游 yt-dlp 用
    if (context) {
      try {
        const cookies = await context.cookies();
        if (cookies.length > 0) {
          await mkdir(join(tmpdir(), "bilibili-subtitle"), { recursive: true });
          await writeFile(COOKIE_FILE, cookiesToNetscape(cookies), "utf8");
          console.log(`[douyin] 保存 cookie 文件 (${cookies.length} 条)`);
        }
      } catch {
        /* cookie 保存失败不影响主流程 */
      }
    }

    // TS 控制流无法理解异步回调会在 await 期间写入 captured，
    // 但 for 循环之后它认为 captured 必然为 null，所以需要绕过
    const item = captured as AwemeItem | null;
    if (item) {
      console.log(`[douyin] XHR 拦截成功: title="${item.desc?.slice(0, 40) || ''}"`);
      return mapItemToMeta(item);
    }

    const sharePageMeta = await fetchViaSharePage(videoId, source);
    if (sharePageMeta) {
      console.log(`[douyin] 分享页 SSR 解析成功: title="${sharePageMeta.title.slice(0, 40)}"`);
      return sharePageMeta;
    }

    const html = await page.content().catch(() => "");
    const routerDataItem = html ? extractRouterDataItem(html) : null;
    if (routerDataItem) {
      console.log(`[douyin] 页面 SSR 数据解析成功: title="${routerDataItem.desc?.slice(0, 40) || ''}"`);
      return mapItemToMeta(routerDataItem);
    }

    // 兜底：meta/title（无 videoUrl）
    console.warn("[douyin] XHR/SSR 均未命中，尝试 meta/title 兜底");
    const [title, description, coverUrl] = await Promise.all([
      page.title().catch(() => ""),
      page.$eval('meta[property="og:description"], meta[name="description"]', (el) => el.getAttribute("content") || "").catch(() => ""),
      page.$eval('meta[property="og:image"], img.poster', (el) => el.getAttribute("content") || el.getAttribute("src") || "").catch(() => ""),
    ]);

    return {
      title: title || "抖音视频",
      description,
      coverUrl,
      duration: 0,
      authorName: "抖音用户",
      authorAvatar: "",
      authorUid: videoId,
      videoUrl: "",
    };
  } finally {
    await context?.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

// ─── Cookie File for Downstream yt-dlp ────────────────────────────────────────

let cookieRefreshPromise: Promise<string> | null = null;

async function bootstrapCookiesViaPlaywright(): Promise<string> {
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  try {
    const context = await browser.newContext({
      userAgent: PC_UA,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    const page = await context.newPage();
    await page.goto("https://www.douyin.com/", { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForTimeout(3_000);
    const cookies = await context.cookies();
    if (cookies.length === 0) throw new Error("未能从抖音首页取到 cookie");
    await mkdir(join(tmpdir(), "bilibili-subtitle"), { recursive: true });
    await writeFile(COOKIE_FILE, cookiesToNetscape(cookies), "utf8");
    console.log(`[douyin] cookie bootstrap 完成 (${cookies.length} 条)`);
    return COOKIE_FILE;
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * 获取抖音 cookie 文件路径（供下游 yt-dlp 下载音频使用）
 * 如果 fetchViaBrowser 已运行过，cookie 文件已存在；否则在此 bootstrap
 */
export async function getDouyinCookieFile(): Promise<string> {
  try {
    const st = await stat(COOKIE_FILE);
    if (Date.now() - st.mtimeMs < COOKIE_TTL_MS) return COOKIE_FILE;
  } catch {
    /* 文件不存在 */
  }
  if (!cookieRefreshPromise) {
    cookieRefreshPromise = bootstrapCookiesViaPlaywright().finally(() => {
      cookieRefreshPromise = null;
    });
  }
  return cookieRefreshPromise;
}

// ─── Audio Download ────────────────────────────────────────────────────────────

const TMP_BASE = join(tmpdir(), "bilibili-subtitle");

function execFileAsync(cmd: string, args: string[], timeout = 300_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.toString().slice(0, 500) || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * 从抖音 CDN 直链下载视频并提取音频
 * videoUrl 来自 douyinvod.com，是带签名的临时直链，直接 fetch 即可
 */
export async function downloadDouyinAudio(videoUrl: string): Promise<string> {
  const { randomUUID } = await import("crypto");
  const workDir = join(TMP_BASE, randomUUID());
  await mkdir(workDir, { recursive: true });

  const videoPath = join(workDir, "video.mp4");
  const audioPath = join(workDir, "audio.m4a");

  // Step 1: 用 Node fetch 下载视频（CDN 直链，无需 yt-dlp）
  console.log("[douyin] 下载视频文件...");
  const resp = await fetch(videoUrl, {
    headers: {
      "User-Agent": PC_UA,
      "Referer": "https://www.douyin.com/",
    },
    redirect: "follow",
  });

  if (!resp.ok) {
    // CDN 直链可能已过期（有时效性），尝试用 yt-dlp 兜底
    console.warn(`[douyin] CDN 下载失败 (${resp.status})，回落到 yt-dlp`);
    const { downloadAudioFromUrl } = await import("@/lib/videocaptioner");
    try {
      const cookieFile = await getDouyinCookieFile();
      return await downloadAudioFromUrl(`https://www.douyin.com/video/${extractDouyinId(videoUrl) || ""}`, cookieFile);
    } catch {
      throw new Error(`抖音音频下载失败：CDN 返回 ${resp.status}，yt-dlp 兜底也失败`);
    }
  }

  const body = await resp.arrayBuffer();
  await writeFile(videoPath, Buffer.from(body));
  console.log(`[douyin] 视频下载完成 (${(body.byteLength / 1024 / 1024).toFixed(1)} MB)`);

  // Step 2: ffmpeg 提取音频轨道
  console.log("[douyin] 提取音频...");
  await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-vn",           // 不要视频
    "-acodec", "copy", // 直接拷贝音频流（通常是 AAC）
    "-y",            // 覆盖输出
    audioPath,
  ]);

  // 删除视频文件节省空间
  const { unlink } = await import("fs/promises");
  await unlink(videoPath).catch(() => {});

  return audioPath;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getDouyinVideo(
  videoIdOrUrl: string,
  knownVideoId?: string
): Promise<PlatformVideoInfo> {
  let videoId = knownVideoId || extractDouyinId(videoIdOrUrl);
  if (!videoId) {
    videoId = await resolveDouyinShortUrl(videoIdOrUrl);
    if (!videoId) {
      throw new Error("无法从抖音链接中提取视频 ID");
    }
  }

  let meta = getCachedMeta(videoId);
  if (!meta) {
    let pending = pendingMetaFetches.get(videoId);
    if (!pending) {
      pending = (async () => {
        const fetched =
          await fetchViaSharePage(videoId, videoIdOrUrl) ||
          await fetchViaMobileBrowser(videoId, videoIdOrUrl) ||
          await fetchViaBrowser(videoId, videoIdOrUrl);
        setCachedMeta(videoId, fetched);
        return fetched;
      })().finally(() => {
        pendingMetaFetches.delete(videoId);
      });
      pendingMetaFetches.set(videoId, pending);
    }
    meta = await pending;
  }

  if (meta.title === "抖音视频" && !meta.description) {
    const shareText = parseShareTextFallback(videoIdOrUrl);
    if (shareText) {
      meta = {
        ...meta,
        title: shareText.title,
        description: shareText.description,
        authorName: meta.authorName === "抖音用户" ? shareText.authorName : meta.authorName,
      };
    }
  }

  if (!meta.videoUrl) {
    console.warn(`[douyin] 未能拿到视频直链 (id=${videoId})，下游转写可能失败`);
  }

  return {
    platform: "douyin",
    id: videoId,
    title: meta.title,
    description: meta.description,
    coverUrl: meta.coverUrl,
    duration: meta.duration,
    author: {
      name: meta.authorName,
      avatar: meta.authorAvatar,
      uid: meta.authorUid || videoId,
    },
    videoUrl: meta.videoUrl,
  };
}
