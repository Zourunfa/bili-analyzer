import { createHash, randomUUID } from "crypto";
import { mkdir, writeFile, rm } from "fs/promises";
import { createWriteStream, existsSync } from "fs";
import { join } from "path";
import { Writable } from "stream";
import { execFile } from "child_process";
import { getScopedCookieSet } from "@/lib/bilibili-auth";

const BILIBILI_API_BASE = "https://api.bilibili.com";
const DEFAULT_FETCH_TIMEOUT_MS = 12_000;
const B23_TO_VIEW_COOLDOWN_MS = 180;
const VIDEO_INFO_RETRY_BASE_MS = 550;
const WBI_KEY_CACHE_TTL_MS = 10 * 60 * 1000;
const WBI_KEY_FAILURE_COOLDOWN_MS = 25_000;

// ==================== API 缓存与降频 ====================
const apiCache = new Map<string, { data: unknown; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
let lastApiCallAt = 0;
const MIN_API_INTERVAL = 3000; // 两次 API 调用最小间隔 3 秒

function getCached<T>(key: string): T | null {
  const entry = apiCache.get(key);
  if (entry && Date.now() < entry.expiresAt) return entry.data as T;
  if (entry) apiCache.delete(key);
  return null;
}

function setCache(key: string, data: unknown, ttl = CACHE_TTL) {
  apiCache.set(key, { data, expiresAt: Date.now() + ttl });
}

/** 降频：确保两次 API 调用之间至少间隔 MIN_API_INTERVAL */
async function throttle() {
  const now = Date.now();
  const wait = lastApiCallAt + MIN_API_INTERVAL - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastApiCallAt = Date.now();
}
// ==================== END ====================

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || "";
  return String(error || "");
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const obj = error as Record<string, unknown>;
  const direct = obj.code;
  if (typeof direct === "string") return direct;
  const cause = obj.cause;
  if (cause && typeof cause === "object") {
    const causeCode = (cause as Record<string, unknown>).code;
    if (typeof causeCode === "string") return causeCode;
  }
  return "";
}

function isRetryableFetchError(error: unknown): boolean {
  const message = getErrorMessage(error);
  const code = getErrorCode(error);

  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof TypeError && message.includes("fetch failed")) {
    return true;
  }
  if (["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND", "UND_ERR_SOCKET"].includes(code)) {
    return true;
  }
  return [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNREFUSED",
    "socket hang up",
    "network",
    "timeout",
    "fetch failed",
    "reset",
  ].some((kw) => message.includes(kw));
}

function isRetryableApiError(code: unknown, message: unknown): boolean {
  const codeNum = Number(code);
  const msg = String(message || "");
  if ([-412, -799, -352, 429].includes(codeNum)) {
    return true;
  }
  return [
    "request was banned",
    "请求过于频繁",
    "风控",
    "timeout",
    "访问权限不足",
  ].some((kw) => msg.includes(kw));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Cache anonymous cookies to avoid regenerating on every request
let cachedCookies: string | null = null;
let cookiesExpireAt = 0;

async function getAnonymousCookies(): Promise<string> {
  // Use cached cookies if still valid (refresh every 30 minutes)
  if (cachedCookies && Date.now() < cookiesExpireAt) {
    return cachedCookies;
  }

  try {
    const res = await fetch("https://www.bilibili.com/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
      redirect: "manual",
    });

    const setCookies = res.headers.getSetCookie?.() || [];
    const cookies: string[] = [];

    for (const sc of setCookies) {
      const match = sc.match(/^([^=]+)=([^;]*)/);
      if (match) {
        cookies.push(`${match[1]}=${match[2]}`);
      }
    }

    if (cookies.length > 0) {
      cachedCookies = cookies.join("; ");
      cookiesExpireAt = Date.now() + 30 * 60 * 1000;
      console.log("[bilibili] 获取到匿名 cookies:", cookies.length, "个");
      return cachedCookies;
    }
  } catch (e) {
    console.log("[bilibili] 获取匿名 cookies 失败:", e);
  }

  // Fallback: generate random buvid3
  const uuid = randomUUID().replace(/-/g, "").toUpperCase();
  const fallback = `buvid3=${uuid}infoc`;
  cachedCookies = fallback;
  cookiesExpireAt = Date.now() + 30 * 60 * 1000;
  return fallback;
}

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 16,
  4, 9, 23, 37, 49, 13, 1, 33, 49, 19, 10, 40, 26, 11, 19, 24,
  26, 41, 55, 34, 54, 16, 23, 22, 46, 40, 31, 53, 6, 42, 51, 30,
];

interface VideoInfo {
  bvid: string;
  aid: number;
  title: string;
  desc: string;
  pic: string;
  owner: {
    name: string;
    face: string;
  };
  duration: number;
  cid: number;
}

interface SubtitleItem {
  from: number;
  to: number;
  content: string;
}

type WbiKeysSnapshot = {
  imgKey: string;
  subKey: string;
  isLogin: boolean;
  cookieFingerprint: string;
  expiresAt: number;
};

type WbiFailureSnapshot = {
  reason: string;
  until: number;
  cookieFingerprint: string;
};

function getMixinKey(raw: string): string {
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i]).join("").slice(0, 32);
}

function signWbiParams(params: Record<string, string>, imgKey: string, subKey: string): string {
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = Math.floor(Date.now() / 1000).toString();
  const allParams: Record<string, string> = { ...params, wts };

  // 按 key 排序
  const query = Object.keys(allParams)
    .sort()
    .map((key) => {
      // 过滤特殊字符
      const val = allParams[key].replace(/[!'()*]/g, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
    })
    .join("&");

  // 计算 w_rid (md5)
  const w_rid = md5(query + mixinKey);

  return `${query}&w_rid=${w_rid}`;
}

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

function normalizeSessdata(raw: string): string {
  // 去除引号、首尾空白
  let val = raw.trim().replace(/^["']|["']$/g, "");
  // 如果值中包含未编码的 +/= 字符（用户可能复制了解码后的值），重新编码
  if (/[+/]/.test(val) && !val.includes("%")) {
    val = val.replace(/\+/g, "%2B").replace(/\//g, "%2F").replace(/=/g, "%3D");
  }
  return val;
}

function getActiveCookieSet() {
  const scoped = getScopedCookieSet();
  return {
    sessdata: normalizeSessdata(scoped?.sessdata ?? process.env.BILIBILI_SESSDATA ?? ""),
    dedeUserId: (scoped?.dedeUserId ?? process.env.BILIBILI_DEDE_USERID ?? "").trim(),
    biliJct: (scoped?.biliJct ?? process.env.BILIBILI_BILI_JCT ?? "").trim(),
  };
}

function getCookieFingerprint(): string {
  const active = getActiveCookieSet();
  const raw = `${active.sessdata}|${active.dedeUserId}|${active.biliJct}`;
  return raw.trim() ? md5(raw).slice(0, 16) : "anonymous";
}

function getHeaders(extra?: { referer?: string }) {
  const active = getActiveCookieSet();

  const cookies: string[] = [];
  if (active.sessdata) cookies.push(`SESSDATA=${active.sessdata}`);
  if (active.dedeUserId) cookies.push(`DedeUserID=${active.dedeUserId}`);
  if (active.biliJct) cookies.push(`bili_jct=${active.biliJct}`);
  return {
    Cookie: cookies.join("; "),
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: extra?.referer || "https://space.bilibili.com",
    Origin: "https://space.bilibili.com",
    "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
  };
}

function getPublicHeaders(extra?: { referer?: string }) {
  return {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: extra?.referer || "https://www.bilibili.com",
    Origin: "https://www.bilibili.com",
    Connection: "close",
  };
}

// 全局缓存的 buvid3，避免连续触发风控
let globalBuvid3: string | null = null;

// WBI key 缓存与短期熔断
let cachedWbiKeys: WbiKeysSnapshot | null = null;
let cachedWbiFailure: WbiFailureSnapshot | null = null;
let cachedLoginStatus: boolean | null = null;

function isRetryableWbiError(err: unknown): boolean {
  if (isRetryableFetchError(err)) return true;
  const message = getErrorMessage(err);
  return isRetryableApiError(-1, message);
}

async function getWbiKeys(): Promise<{ imgKey: string; subKey: string; isLogin: boolean }> {
  const now = Date.now();
  const cookieFingerprint = getCookieFingerprint();

  if (
    cachedWbiKeys &&
    cachedWbiKeys.cookieFingerprint === cookieFingerprint &&
    now < cachedWbiKeys.expiresAt
  ) {
    return {
      imgKey: cachedWbiKeys.imgKey,
      subKey: cachedWbiKeys.subKey,
      isLogin: cachedWbiKeys.isLogin,
    };
  }

  if (
    cachedWbiFailure &&
    cachedWbiFailure.cookieFingerprint === cookieFingerprint &&
    now < cachedWbiFailure.until
  ) {
    const remain = Math.ceil((cachedWbiFailure.until - now) / 1000);
    throw new Error(`WBI keys 请求冷却中（剩余 ${remain}s）: ${cachedWbiFailure.reason}`);
  }

  await throttle();

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(
        `${BILIBILI_API_BASE}/x/web-interface/nav`,
        { headers: getHeaders() },
        10_000
      );
      const data = await res.json();
      const code = Number(data?.code ?? -1);
      const message = String(data?.message || data?.msg || "");

      if (code !== 0) {
        throw new Error(`nav 响应异常: code=${code}, message=${message || "unknown"}`);
      }

      const isLogin = data.data?.isLogin === true;
      cachedLoginStatus = isLogin;
      const hasSessdata = Boolean(getActiveCookieSet().sessdata);
      if (hasSessdata) {
        console.log(`[bilibili] SESSDATA 登录态: ${isLogin ? "有效 ✓" : "无效 ✗ — B站未识别此 SESSDATA"}`);
      } else {
        console.log("[bilibili] 未配置 BILIBILI_SESSDATA（匿名访问）");
      }

      const wbiImg = data.data?.wbi_img;
      if (!wbiImg) {
        throw new Error(`WBI keys 获取失败，wbi_img 为空。message=${message || "unknown"}`);
      }
      const imgUrl = wbiImg.img_url || wbiImg.url;
      const subUrl = wbiImg.sub_url;
      if (!imgUrl || !subUrl) {
        throw new Error(`WBI keys 获取失败，wbi_img 字段不完整: ${JSON.stringify(wbiImg)}`);
      }

      const imgKey = imgUrl.split("/").pop()!.split(".")[0];
      const subKey = subUrl.split("/").pop()!.split(".")[0];
      cachedWbiKeys = {
        imgKey,
        subKey,
        isLogin,
        cookieFingerprint,
        expiresAt: now + WBI_KEY_CACHE_TTL_MS,
      };
      cachedWbiFailure = null;

      return { imgKey, subKey, isLogin };
    } catch (err) {
      lastError = err;
      if (attempt < 1 && isRetryableWbiError(err)) {
        await sleep((attempt + 1) * 450);
        continue;
      }
      break;
    }
  }

  const reason = getErrorMessage(lastError) || "unknown";
  cachedWbiFailure = {
    reason,
    until: Date.now() + WBI_KEY_FAILURE_COOLDOWN_MS,
    cookieFingerprint,
  };
  throw new Error(`WBI keys 获取失败: ${reason}`);
}

async function ensureBuvid3() {
  if (globalBuvid3) return;
  try {
    const res = await fetch("https://www.bilibili.com/", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Referer: "https://www.bilibili.com",
      },
    });
    const setCookieHeader = res.headers.get("set-cookie") || "";
    const match = setCookieHeader.match(/buvid3=([^;]+)/);
    if (match) {
      globalBuvid3 = match[1];
      console.log("[bilibili] 获取 buvid3:", globalBuvid3);
    }
  } catch {
    // 如果 still no buvid3, generate one
    globalBuvid3 = `${randomUUID()}-${randomUUID().replace(/-/g, "")}infoc`;
    console.log("[bilibili] 生成 buvid3:", globalBuvid3);
  }
}

/**
 * 解析 b23.tv 短链接，返回重定向后的完整 URL
 * B站短链接可能返回 302/307，需要手动从 Location 头提取
 */
async function resolveB23ShortUrl(shortUrl: string, maxRedirects = 5): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      console.log("[resolveB23ShortUrl] 请求:", shortUrl, "剩余跳转:", maxRedirects, "尝试:", attempt + 1);
      const resp = await fetchWithTimeout(shortUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Referer: "https://www.bilibili.com/",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          Connection: "close",
        },
        redirect: "manual",
      }, 10_000);

      console.log("[resolveB23ShortUrl] 状态码:", resp.status, "location:", resp.headers.get("location"));

      if ([301, 302, 303, 307, 308].includes(resp.status)) {
        const location = resp.headers.get("location");
        if (location && maxRedirects > 0) {
          const nextUrl = location.startsWith("http") ? location : new URL(location, shortUrl).toString();
          // 如果重定向目标已经包含 bilibili 视频 URL，直接返回
          if (nextUrl.includes("bilibili.com/video/")) {
            console.log("[resolveB23ShortUrl] 重定向目标含视频URL:", nextUrl);
            return nextUrl;
          }
          return resolveB23ShortUrl(nextUrl, maxRedirects - 1);
        }
      }

      // 非重定向响应，尝试从 HTML 内容提取
      const html = await resp.text();
      const htmlMatch = html.match(/bilibili\.com\/video\/(BV[\w]+)/);
      if (htmlMatch) {
        console.log("[resolveB23ShortUrl] 从HTML提取到BV:", htmlMatch[1]);
        return `https://www.bilibili.com/video/${htmlMatch[1]}`;
      }

      console.log("[resolveB23ShortUrl] 未找到视频URL, HTML长度:", html.length);
      return null;
    } catch (err) {
      if (attempt < 2 && isRetryableFetchError(err)) {
        const wait = 220 * (attempt + 1);
        console.log("[resolveB23ShortUrl] 网络波动，重试前等待:", wait, "ms");
        await sleep(wait);
        continue;
      }
      console.log("[resolveB23ShortUrl] 请求失败:", err instanceof Error ? err.message : err);
      return null;
    }
  }

  return null;
}

/**
 * 从URL中提取BV号（支持 b23.tv 短链接重定向解析）
 */
export async function extractBvId(url: string): Promise<string | null> {
  console.log("[extractBvId] 原始输入:", JSON.stringify(url));

  // 从混合文本中提取纯 URL（兼容 B站分享格式：【标题】 https://...）
  const urlMatch = url.match(/https?:\/\/[^\s\]】]+/);
  if (urlMatch) url = urlMatch[0];
  console.log("[extractBvId] 提取URL后:", url);

  // 标准链接和直接 BV 号
  const patterns = [
    /bilibili\.com\/video\/(BV[\w]+)/,
    /^BV[\w]+$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      console.log("[extractBvId] 标准匹配命中:", match[1] || match[0]);
      return match[1] || match[0];
    }
  }

  // b23.tv 短链接（手机分享链接），需要请求跳转
  if (url.includes("b23.tv")) {
    console.log("[extractBvId] 检测到 b23.tv 短链接");
    // 尝试从 URL 直接提取 BV（部分 b23.tv 短链接已包含 BV）
    const bvMatch = url.match(/b23\.tv\/(BV[\w]+)/);
    if (bvMatch) {
      console.log("[extractBvId] b23 URL直接含BV:", bvMatch[1]);
      return bvMatch[1];
    }

    // 否则请求重定向获取真实 URL
    console.log("[extractBvId] 开始解析b23重定向...");
    const finalUrl = await resolveB23ShortUrl(url);
    console.log("[extractBvId] b23重定向结果:", finalUrl);
    if (finalUrl) {
      const bvFromRedirect = finalUrl.match(/bilibili\.com\/video\/(BV[\w]+)/);
      if (bvFromRedirect) {
        await sleep(B23_TO_VIEW_COOLDOWN_MS);
        return bvFromRedirect[1];
      }
      // 手机端 m.bilibili.com 格式
      const bvFromMobile = finalUrl.match(/m\.bilibili\.com\/video\/(BV[\w]+)/);
      if (bvFromMobile) {
        await sleep(B23_TO_VIEW_COOLDOWN_MS);
        return bvFromMobile[1];
      }
    }
  }

  console.log("[extractBvId] 所有解析均失败");
  return null;
}

/**
 * 获取视频信息（带重试）
 */
export async function getVideoInfo(bvid: string, retries = 2): Promise<VideoInfo> {
  const viewUrl = `${BILIBILI_API_BASE}/x/web-interface/view?bvid=${bvid}`;
  const authedHeaders = {
    ...getHeaders({ referer: `https://www.bilibili.com/video/${bvid}` }),
    Connection: "close",
  };
  const publicHeaders = getPublicHeaders({ referer: `https://www.bilibili.com/video/${bvid}` });

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const usePublicHeaders = attempt >= 2;
      const headers = usePublicHeaders ? publicHeaders : authedHeaders;
      const res = await fetchWithTimeout(viewUrl, { headers }, 10_000);
      const raw = await res.text();

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        throw new Error(`获取视频信息失败: 响应非JSON（HTTP ${res.status}）`);
      }

      if ((data.code as number) !== 0) {
        const apiCode = Number(data.code ?? -1);
        const apiMessage = String(data.message || data.msg || "unknown");
        if (attempt < retries && isRetryableApiError(apiCode, apiMessage)) {
          const backoff = VIDEO_INFO_RETRY_BASE_MS * (attempt + 1);
          console.log(`[getVideoInfo] API限流/波动 code=${apiCode}，第 ${attempt + 1} 次重试前等待 ${backoff}ms`);
          await sleep(backoff);
          continue;
        }
        throw new Error(`获取视频信息失败: ${apiMessage} (code: ${apiCode})`);
      }

      const v = ((data.data as Record<string, unknown> | undefined) || {});
      return {
        bvid: (v.bvid as string) || bvid,
        aid: Number(v.aid || 0),
        title: (v.title as string) || "",
        desc: (v.desc as string) || "",
        pic: (v.pic as string) || "",
        owner: {
          name: ((v.owner as Record<string, unknown> | undefined)?.name as string) || "",
          face: ((v.owner as Record<string, unknown> | undefined)?.face as string) || "",
        },
        duration: Number(v.duration || 0),
        cid: Number(v.cid || 0),
      };
    } catch (err) {
      lastError = err;
      if (attempt < retries && isRetryableFetchError(err)) {
        const backoff = VIDEO_INFO_RETRY_BASE_MS * (attempt + 1);
        console.log(`[getVideoInfo] 网络错误，第 ${attempt + 1} 次重试...`, getErrorCode(err) || getErrorMessage(err));
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("获取视频信息失败: 重试耗尽");
}

/**
 * 获取字幕列表并下载字幕内容（带 WBI 签名）
 */
export async function getSubtitle(
  bvid: string,
  cid: number
): Promise<SubtitleItem[]> {
  const { imgKey, subKey } = await getWbiKeys();

  const params: Record<string, string> = {
    bvid,
    cid: cid.toString(),
  };

  const query = signWbiParams(params, imgKey, subKey);
  const url = `${BILIBILI_API_BASE}/x/player/wbi/v2?${query}`;

  const res = await fetch(url, { headers: getHeaders() });
  const data = await res.json();

  console.log(`[bilibili] player/wbi/v2 response:`, (JSON.stringify(data) ?? "").slice(0, 500));

  if (data.code !== 0) {
    throw new Error(`获取字幕信息失败: ${data.message} (code: ${data.code})`);
  }

  console.log(`[bilibili] subtitle data:`, (JSON.stringify(data.data?.subtitle) ?? "undefined").slice(0, 500));

  const subtitles = data.data?.subtitle?.subtitles;
  if (!subtitles || subtitles.length === 0) {
    throw new Error(
      "该视频没有可用的字幕。请确认视频有CC字幕（AI生成或手动上传）。"
    );
  }

  // 优先中文（ai-generated），其次中文字幕
  const zhSubtitle =
    subtitles.find(
      (s: { lan: string }) =>
        s.lan === "ai-zh" || s.lan === "zh-CN" || s.lan === "zh-Hans"
    ) || subtitles[0];

  const subtitleUrl = zhSubtitle.subtitle_url.startsWith("http")
    ? zhSubtitle.subtitle_url
    : `https:${zhSubtitle.subtitle_url}`;

  const subtitleRes = await fetch(subtitleUrl);
  const subtitleData = await subtitleRes.json();

  return subtitleData.body as SubtitleItem[];
}

/**
 * 将字幕转为纯文本（带时间戳）
 */
export function subtitleToText(subtitles: SubtitleItem[]): string {
  return subtitles
    .map((s) => {
      const start = formatTime(s.from);
      return `[${start}] ${s.content}`;
    })
    .join("\n");
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

type PlayurlResponse = {
  code: number;
  message?: string;
  data?: {
    dash?: {
      audio?: Array<{ baseUrl?: string; base_url?: string }>;
    };
    durl?: Array<{ url?: string; backup_url?: string[] }>;
  };
};

/**
 * playurl 必须带完整的访客 cookies（buvid3/buvid4/b_lsid/_uuid 等），
 * 否则会触发 B 站风控返回只含 v_voucher 的响应。
 * 这里把匿名 cookies 与 SESSDATA 系列合并，SESSDATA 已配置时叠加在最后（优先级更高）。
 */
async function buildPlayurlHeaders(): Promise<Record<string, string>> {
  const anon = await getAnonymousCookies();
  const sessdata = normalizeSessdata(process.env.BILIBILI_SESSDATA || "");
  const dedeUserId = (process.env.BILIBILI_DEDE_USERID || "").trim();
  const biliJct = (process.env.BILIBILI_BILI_JCT || "").trim();

  const cookieParts: string[] = [];
  if (anon) cookieParts.push(anon);
  if (sessdata) cookieParts.push(`SESSDATA=${sessdata}`);
  if (dedeUserId) cookieParts.push(`DedeUserID=${dedeUserId}`);
  if (biliJct) cookieParts.push(`bili_jct=${biliJct}`);

  return {
    Cookie: cookieParts.join("; "),
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: "https://www.bilibili.com",
    Origin: "https://www.bilibili.com",
    "Sec-Ch-Ua": '"Chromium";v="131", "Not_A Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
  };
}

async function fetchPlayurl(
  bvid: string,
  cid: number,
  fnval: string
): Promise<PlayurlResponse> {
  const { imgKey, subKey } = await getWbiKeys();
  const params: Record<string, string> = {
    bvid,
    cid: cid.toString(),
    fnval,
    fnver: "0",
    fourk: "1",
  };
  const query = signWbiParams(params, imgKey, subKey);
  const url = `${BILIBILI_API_BASE}/x/player/wbi/playurl?${query}`;
  const headers = await buildPlayurlHeaders();
  const res = await fetch(url, { headers });
  return (await res.json()) as PlayurlResponse;
}

function isVoucherResponse(data: PlayurlResponse): boolean {
  // 风控签名：data 只有 v_voucher，没有 dash/durl
  const d = data.data as { v_voucher?: string; dash?: unknown; durl?: unknown } | undefined;
  return !!d?.v_voucher && !d.dash && !d.durl;
}

function ffmpegExtractAudio(input: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffmpeg",
      ["-i", input, "-vn", "-acodec", "copy", "-y", output],
      { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) {
          // copy 失败时（编码不兼容 m4a 容器）回退到重编码
          execFile(
            "ffmpeg",
            ["-i", input, "-vn", "-acodec", "aac", "-b:a", "128k", "-y", output],
            { timeout: 300_000, maxBuffer: 10 * 1024 * 1024 },
            (err2, _o2, stderr2) => {
              if (err2) reject(new Error(stderr2 || stderr || err2.message));
              else resolve();
            }
          );
          return;
        }
        resolve();
      }
    );
  });
}

/**
 * 通过 B站 API 直接获取音频流并下载（绕过 yt-dlp 的 412 问题）
 *
 * 策略（按优先级）：
 *   1) playurl(fnval=4048) -> dash.audio  最常见
 *   2) 重试一次 dash（B站调度抖动 / CDN 选择不同）
 *   3) durl 兜底：下载 MP4/FLV 合流文件 + ffmpeg 抽音频
 */
export async function downloadAudioViaApi(
  bvid: string,
  cid: number,
  onProgress?: (percent: number, downloaded: string, total: string) => void
): Promise<string> {
  const maxAudioMBRaw = Number.parseInt(process.env.TRANSCRIBE_MAX_AUDIO_MB || "60", 10);
  const maxAudioMB = Number.isFinite(maxAudioMBRaw) && maxAudioMBRaw > 0 ? maxAudioMBRaw : 60;
  const maxAudioBytes = maxAudioMB * 1024 * 1024;
  const downloadTimeoutRaw = Number.parseInt(process.env.AUDIO_DOWNLOAD_TIMEOUT_MS || "300000", 10);
  const downloadTimeoutMs =
    Number.isFinite(downloadTimeoutRaw) && downloadTimeoutRaw > 10_000 ? downloadTimeoutRaw : 300_000;

  // fnval=4048 = 16(DASH) | 64(HDR) | 128(4K) | 256(Dolby Audio) | 512(Dolby Vision) | 1024(8K) | 2048(AV1)
  // 旧的 fnval=16 在部分视频上 B 站只回 durl 不回 dash，导致 dash.audio 取不到
  const FNVAL_DASH = "4048";

  // 提前预热 buvid3，并清掉旧的匿名 cookies 缓存以拿一组新鲜的（30 分钟 TTL）
  await ensureBuvid3();

  let data = await fetchPlayurl(bvid, cid, FNVAL_DASH);

  if (data.code !== 0) {
    throw new Error(`获取视频流地址失败: ${data.message ?? "未知错误"}`);
  }

  // 风控命中：清缓存的访客 cookies 后重试（拿一组新的 buvid3/b_lsid）
  if (isVoucherResponse(data)) {
    console.warn(
      `[bilibili] playurl 命中风控 v_voucher，刷新访客 cookies 后重试: bvid=${bvid}`
    );
    cachedCookies = null;
    cookiesExpireAt = 0;
    globalBuvid3 = null;
    await ensureBuvid3();
    await new Promise((r) => setTimeout(r, 1200));
    data = await fetchPlayurl(bvid, cid, FNVAL_DASH);
  }

  // 仍然命中风控 → 给出明确错误信息
  if (isVoucherResponse(data)) {
    const sessdataValid = cachedLoginStatus === true;
    throw new Error(
      sessdataValid
        ? "B站风控拦截（v_voucher），请稍后重试或更换网络"
        : "B站风控拦截（v_voucher），通常是 SESSDATA 失效或未配置导致。请更新 .env 中的 BILIBILI_SESSDATA"
    );
  }

  let audioList = data.data?.dash?.audio;

  // dash.audio 缺失：重试一次（B 站调度抖动会换 CDN）
  if (!audioList || audioList.length === 0) {
    console.warn(
      `[bilibili] dash.audio 缺失，重试 playurl (bvid=${bvid}, cid=${cid}, hasDash=${!!data.data?.dash}, hasDurl=${!!data.data?.durl})`
    );
    await new Promise((r) => setTimeout(r, 800));
    data = await fetchPlayurl(bvid, cid, FNVAL_DASH);
    if (data.code === 0 && !isVoucherResponse(data)) {
      audioList = data.data?.dash?.audio;
    }
  }

  // 仍然没有 dash.audio：走 durl 兜底（下载合流 MP4/FLV，ffmpeg 抽音频）
  if (!audioList || audioList.length === 0) {
    const durl = data.data?.durl;
    if (durl && durl.length > 0 && durl[0].url) {
      console.warn(`[bilibili] dash 不可用，走 durl 兜底: bvid=${bvid}`);
      return downloadDurlAndExtractAudio(durl[0].url, maxAudioBytes, maxAudioMB, downloadTimeoutMs, onProgress);
    }
    console.error(
      `[bilibili] playurl 响应无 dash.audio 也无 durl: ${JSON.stringify(data).slice(0, 400)}`
    );
    throw new Error("未找到音频流");
  }

  // 选最后一个（通常是最高音质中我们能拿到的）
  const audio = audioList[audioList.length - 1];
  const audioUrl = audio.baseUrl || audio.base_url;

  if (!audioUrl) {
    throw new Error("音频流 URL 为空");
  }

  // 下载音频到临时文件
  const tmpDir = join("/tmp/bilibili-subtitle", randomUUID());
  await mkdir(tmpDir, { recursive: true });
  const outputPath = join(tmpDir, "audio.m4a");

  console.log(`[bilibili] 开始下载音频: ${audioUrl.slice(0, 80)}...`);

  const downloadController = new AbortController();
  const timeoutHandle = setTimeout(() => downloadController.abort(), downloadTimeoutMs);

  try {
    const audioRes = await fetch(audioUrl, {
      signal: downloadController.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.bilibili.com",
      },
    });

    if (!audioRes.ok) {
      throw new Error(`下载音频失败: HTTP ${audioRes.status}`);
    }

    // 流式下载，支持进度回调
    const contentLength = parseInt(audioRes.headers.get("content-length") || "0", 10);
    if (contentLength > maxAudioBytes) {
      throw new Error(`音频过大（${(contentLength / 1024 / 1024).toFixed(1)}MB），超过限制 ${maxAudioMB}MB`);
    }
    const totalMB = contentLength ? (contentLength / 1024 / 1024).toFixed(1) : "?";
    let downloaded = 0;

    const fileStream = (await import("fs")).createWriteStream(outputPath);
    const reader = audioRes.body?.getReader();

    if (!reader) {
      throw new Error("无法读取音频流");
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      downloaded += value.length;
      if (downloaded > maxAudioBytes) {
        reader.cancel().catch(() => { /* ignore */ });
        fileStream.destroy();
        throw new Error(`音频过大（>${maxAudioMB}MB），请换短一点的视频后重试`);
      }

      const canContinue = fileStream.write(value);
      if (!canContinue) {
        await new Promise<void>((resolve, reject) => {
          fileStream.once("drain", () => resolve());
          fileStream.once("error", reject);
        });
      }

      if (onProgress && contentLength) {
        const percent = Math.round((downloaded / contentLength) * 100);
        onProgress(percent, (downloaded / 1024 / 1024).toFixed(1), totalMB);
      }
    }

    await new Promise<void>((resolve, reject) => {
      fileStream.once("finish", () => resolve());
      fileStream.once("error", reject);
      fileStream.end();
    });

    console.log(`[bilibili] 音频下载完成: ${outputPath} (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);

    return outputPath;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

/**
 * durl 兜底：下载 B 站合流 MP4/FLV 后用 ffmpeg 抽音频
 * 限制下载体积上限放宽到 maxAudioMB * 5（视频+音频合流通常更大），
 * 抽出来的纯音频再受 maxAudioBytes 约束。
 */
async function downloadDurlAndExtractAudio(
  videoUrl: string,
  maxAudioBytes: number,
  maxAudioMB: number,
  downloadTimeoutMs: number,
  onProgress?: (percent: number, downloaded: string, total: string) => void
): Promise<string> {
  const muxedMaxBytes = maxAudioBytes * 5; // 合流文件比纯音频大很多
  const tmpDir = join("/tmp/bilibili-subtitle", randomUUID());
  await mkdir(tmpDir, { recursive: true });
  const muxedPath = join(tmpDir, "muxed.mp4");
  const audioPath = join(tmpDir, "audio.m4a");

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), downloadTimeoutMs);

  try {
    const res = await fetch(videoUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: "https://www.bilibili.com",
      },
    });
    if (!res.ok) throw new Error(`下载视频失败: HTTP ${res.status}`);

    const contentLength = parseInt(res.headers.get("content-length") || "0", 10);
    if (contentLength > muxedMaxBytes) {
      throw new Error(
        `视频过大（${(contentLength / 1024 / 1024).toFixed(1)}MB），超过限制 ${(muxedMaxBytes / 1024 / 1024).toFixed(0)}MB`
      );
    }
    const totalMB = contentLength ? (contentLength / 1024 / 1024).toFixed(1) : "?";
    const fileStream = createWriteStream(muxedPath);
    const reader = res.body?.getReader();
    if (!reader) throw new Error("无法读取视频流");

    let downloaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      downloaded += value.length;
      if (downloaded > muxedMaxBytes) {
        reader.cancel().catch(() => {});
        fileStream.destroy();
        throw new Error(`视频过大（>${(muxedMaxBytes / 1024 / 1024).toFixed(0)}MB），请换短一点的视频`);
      }
      const ok = fileStream.write(value);
      if (!ok) {
        await new Promise<void>((resolve, reject) => {
          fileStream.once("drain", () => resolve());
          fileStream.once("error", reject);
        });
      }
      if (onProgress && contentLength) {
        const percent = Math.round((downloaded / contentLength) * 100);
        onProgress(percent, (downloaded / 1024 / 1024).toFixed(1), totalMB);
      }
    }
    await new Promise<void>((resolve, reject) => {
      fileStream.once("finish", () => resolve());
      fileStream.once("error", reject);
      fileStream.end();
    });

    console.log(`[bilibili] durl 下载完成 (${(downloaded / 1024 / 1024).toFixed(1)}MB)，开始 ffmpeg 抽音频`);
    await ffmpegExtractAudio(muxedPath, audioPath);
    await rm(muxedPath, { force: true });

    if (!existsSync(audioPath)) throw new Error("ffmpeg 抽音频失败：输出文件不存在");

    const { statSync } = await import("fs");
    const audioSize = statSync(audioPath).size;
    if (audioSize > maxAudioBytes) {
      await rm(audioPath, { force: true });
      throw new Error(`音频过大（${(audioSize / 1024 / 1024).toFixed(1)}MB），超过限制 ${maxAudioMB}MB`);
    }

    console.log(`[bilibili] durl 音频抽取完成: ${audioPath} (${(audioSize / 1024 / 1024).toFixed(1)}MB)`);
    return audioPath;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

type UpownerVideo = {
  bvid: string;
  title: string;
  pic: string;
  duration: number;
  play: number;
  created: number;
};

type UpownerVideosResult = {
  upowner: { mid: string; name: string; face: string; sign: string; videoCount: number };
  videos: UpownerVideo[];
  total: number;
};

function parseDurationToSeconds(lengthStr: string | undefined): number {
  if (!lengthStr) return 0;
  const parts = lengthStr.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function normalizePicUrl(pic: string | undefined): string {
  if (!pic) return "";
  if (pic.startsWith("//")) return `https:${pic}`;
  return pic;
}

function isRiskControlError(message: string): boolean {
  return [
    "request was banned",
    "请求过于频繁",
    "风控校验失败",
    "code=-412",
    "code=-799",
    "code=-352",
    "访问权限不足",
  ].some((kw) => message.includes(kw));
}

function sanitizeText(text: string | undefined): string {
  if (!text) return "";
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function toSafeNumber(input: unknown): number {
  const n = Number(input);
  return Number.isFinite(n) ? n : 0;
}

const AV_TO_BV_TABLE = "fZodR9XQDSUm21yCkLt3xa4bvh8e7j6zBqiveYahwcpHnJE5VGguMTKNPAWC";
const AV_TO_BV_POS = [11, 10, 3, 8, 4, 6] as const;
const AV_TO_BV_XOR = BigInt(177451812);
const AV_TO_BV_ADD = BigInt(8728348608);

function aidToBvid(aidInput: unknown): string {
  let aidBigInt = BigInt(0);

  if (typeof aidInput === "number" && Number.isFinite(aidInput) && aidInput > 0) {
    aidBigInt = BigInt(Math.floor(aidInput));
  } else if (typeof aidInput === "string") {
    const digits = aidInput.trim().match(/\d+/)?.[0] || "";
    if (digits) {
      aidBigInt = BigInt(digits);
    }
  }

  if (aidBigInt <= BigInt(0)) return "";

  const chars = "BV1  4 1 7  ".split("");
  const x = (aidBigInt ^ AV_TO_BV_XOR) + AV_TO_BV_ADD;
  for (let i = 0; i < AV_TO_BV_POS.length; i++) {
    const idx = Number((x / (BigInt(58) ** BigInt(i))) % BigInt(58));
    chars[AV_TO_BV_POS[i]] = AV_TO_BV_TABLE[idx] || "0";
  }
  return chars.join("");
}

function safeParseObject(input: unknown): Record<string, unknown> | null {
  if (typeof input !== "string") return null;
  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function pickVideoFromRecord(record: Record<string, unknown>): UpownerVideo | null {
  const explicitBvid = typeof record.bvid === "string"
    ? record.bvid
    : (typeof record.bv_id === "string" ? record.bv_id : "");
  const jumpUrl = typeof record.jump_url === "string"
    ? record.jump_url
    : (
      typeof record.href === "string"
        ? record.href
        : (
          typeof record.short_link_v2 === "string"
            ? record.short_link_v2
            : (
              typeof record.short_link === "string"
                ? record.short_link
                : (typeof record.url === "string" ? record.url : "")
            )
        )
    );
  const bvidFromUrl = jumpUrl.match(/BV[0-9A-Za-z]+/)?.[0] || "";
  const aidFromUrl =
    jumpUrl.match(/\/video\/(\d+)/)?.[1] ||
    jumpUrl.match(/[?&]aid=(\d+)/)?.[1] ||
    "";
  const aidCandidate = record.aid ?? record.av_id ?? record.avid ?? aidFromUrl;
  const bvidFromAid = aidToBvid(aidCandidate);
  const bvid = explicitBvid || bvidFromUrl || bvidFromAid;
  if (!/^BV[0-9A-Za-z]+$/.test(bvid)) return null;

  const stat = (record.stat && typeof record.stat === "object")
    ? (record.stat as Record<string, unknown>)
    : {};
  const coverObj = (record.cover && typeof record.cover === "object")
    ? (record.cover as Record<string, unknown>)
    : {};

  const title = sanitizeText(
    (record.title as string) ||
    (record.name as string) ||
    (record.desc as string) ||
    (record.description as string) ||
    (record.dynamic as string) ||
    (record.content as string) ||
    ""
  );
  const pic = normalizePicUrl(
    (record.pic as string) ||
    (record.cover as string) ||
    (record.first_frame as string) ||
    (coverObj.url as string) ||
    ""
  );
  const duration = typeof record.duration === "number"
    ? record.duration
    : parseDurationToSeconds((record.length as string) || (record.duration as string) || "");
  const play = toSafeNumber(record.play ?? stat.view ?? stat.play);
  const created = toSafeNumber(record.created ?? record.pubdate ?? record.ctime ?? record.publish_time);

  return {
    bvid,
    title,
    pic,
    duration,
    play,
    created,
  };
}

function collectVideosFromPayload(payload: unknown, out: Map<string, UpownerVideo>): void {
  const visited = new WeakSet<object>();

  const walk = (node: unknown) => {
    if (node === null || node === undefined) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    if (typeof node !== "object") return;

    const obj = node as Record<string, unknown>;
    if (visited.has(obj)) return;
    visited.add(obj);

    const maybeVideo = pickVideoFromRecord(obj);
    if (maybeVideo && !out.has(maybeVideo.bvid)) {
      out.set(maybeVideo.bvid, maybeVideo);
    }

    for (const value of Object.values(obj)) {
      walk(value);
    }
  };

  walk(payload);
}

/**
 * 获取UP主视频列表
 *
 * B站要求 SESSDATA 才能访问此接口。
 * 如果未配置或已过期，会抛出带有配置指引的错误。
 */
export async function getUPownerVideos(
  mid: string,
  page: number = 1,
  pageSize: number = 30,
  keyword?: string,
): Promise<UpownerVideosResult> {
  // 检查缓存
  const cacheKey = `upowner:v2:${mid}:p${page}:ps${pageSize}:${keyword || ""}`;
  const cached = getCached<Awaited<ReturnType<typeof getUPownerVideos>>>(cacheKey);
  if (cached) {
    console.log("[bilibili] 命中缓存:", cacheKey);
    return cached;
  }

  const cacheIfNonEmpty = (data: UpownerVideosResult) => {
    if (data.total > 0 || data.videos.length > 0) {
      setCache(cacheKey, data);
    }
  };

  // 方案 0: 优先使用空间页当前前端同源 API（稳定且抗风控）
  let homeResult: UpownerVideosResult | null = null;
  try {
    homeResult = await getUPownerVideosViaHomeSeasons(mid, page, pageSize, keyword);
    if (homeResult.videos.length > 0 || homeResult.total > 0) {
      cacheIfNonEmpty(homeResult);
      return homeResult;
    }
  } catch (homeErr) {
    console.log("[bilibili] home/seasons_series 失败:", homeErr instanceof Error ? homeErr.message : homeErr);
  }

  let browserResult: UpownerVideosResult | null | undefined;
  const ensureBrowserResult = async (): Promise<UpownerVideosResult | null> => {
    if (browserResult !== undefined) return browserResult;
    try {
      const candidate = await getUPownerVideosViaBrowserScrape(mid, page, pageSize, keyword);
      browserResult = candidate.total > 0 || candidate.videos.length > 0 ? candidate : null;
      if (browserResult) {
        console.log("[bilibili] 浏览器兜底成功，视频数:", browserResult.total);
      } else {
        console.log("[bilibili] 浏览器兜底未抓到视频");
      }
    } catch (browserErr) {
      browserResult = null;
      console.log("[bilibili] 浏览器兜底失败:", browserErr instanceof Error ? browserErr.message : browserErr);
    }
    return browserResult;
  };

  let dynamicResult: UpownerVideosResult | null | undefined;
  const ensureDynamicResult = async (): Promise<UpownerVideosResult | null> => {
    if (dynamicResult !== undefined) return dynamicResult;
    try {
      const candidate = await getUPownerVideosViaDynamicHistory(mid, page, pageSize, keyword);
      dynamicResult = candidate.total > 0 || candidate.videos.length > 0 ? candidate : null;
      if (dynamicResult) {
        console.log("[bilibili] 动态历史兜底成功，视频数:", dynamicResult.total);
      } else {
        console.log("[bilibili] 动态历史兜底未抓到视频");
      }
    } catch (dynamicErr) {
      dynamicResult = null;
      console.log("[bilibili] 动态历史兜底失败:", dynamicErr instanceof Error ? dynamicErr.message : dynamicErr);
    }
    return dynamicResult;
  };

  const { imgKey, subKey, isLogin } = await getWbiKeys();

  // 登录态诊断
  if (!isLogin) {
    if (homeResult && (homeResult.total > 0 || homeResult.videos.length > 0)) {
      cacheIfNonEmpty(homeResult);
      return homeResult;
    }

    const browserFallback = await ensureBrowserResult();
    if (browserFallback) {
      cacheIfNonEmpty(browserFallback);
      return browserFallback;
    }

    const dynamicFallback = await ensureDynamicResult();
    if (dynamicFallback) {
      cacheIfNonEmpty(dynamicFallback);
      return dynamicFallback;
    }

    const sessdata = getActiveCookieSet().sessdata;
    if (sessdata) {
      throw new Error(
        "SESSDATA 已失效（B站确认未登录）。请在浏览器重新登录 B站并复制新的 SESSDATA。\n" +
        "获取方法：浏览器登录 B站 → F12 → Application → Cookies → 复制 SESSDATA 的值\n" +
        "提示：同时复制 DedeUserID 和 bili_jct 到 .env 可提高兼容性"
      );
    } else {
      throw new Error(
        "获取UP主视频列表需要登录态。请在 .env 中配置 BILIBILI_SESSDATA。\n" +
        "获取方法：浏览器登录 B站 → F12 → Application → Cookies → 复制 SESSDATA 的值"
      );
    }
  }

  let result: UpownerVideosResult;
  let apiErrorMessage = "";
  let legacyErrorMessage = "";

  // 方案 A: 先尝试 WBI 签名 API
  try {
    result = await getUPownerVideosViaAPI(mid, page, pageSize, keyword, imgKey, subKey);
  } catch (apiErr) {
    apiErrorMessage = apiErr instanceof Error ? apiErr.message : String(apiErr);
    console.log("[bilibili] WBI API 失败:", apiErrorMessage);

    // 方案 B: 尝试不带 WBI 签名的旧接口
    try {
      result = await getUPownerVideosViaLegacyAPI(mid, page, pageSize, keyword);
    } catch (legacyErr) {
      legacyErrorMessage = legacyErr instanceof Error ? legacyErr.message : String(legacyErr);
      console.log("[bilibili] 旧接口失败:", legacyErrorMessage);

      const bothRiskControlled =
        isRiskControlError(apiErrorMessage) && isRiskControlError(legacyErrorMessage);

      if (bothRiskControlled) {
        if (homeResult) {
          cacheIfNonEmpty(homeResult);
          if (homeResult.total > 0 || homeResult.videos.length > 0) {
            return homeResult;
          }
        }

        const browserFallback = await ensureBrowserResult();
        if (browserFallback) {
          cacheIfNonEmpty(browserFallback);
          return browserFallback;
        }

        const dynamicFallback = await ensureDynamicResult();
        if (dynamicFallback) {
          cacheIfNonEmpty(dynamicFallback);
          return dynamicFallback;
        }

        if (homeResult) {
          cacheIfNonEmpty(homeResult);
          return homeResult;
        }

        throw new Error("B站暂时限制了当前网络对上传列表接口的访问（-412/-799）。请等待几分钟后重试，或切换网络后重试。");
      }

      // 方案 C: 兜底 — 解析用户空间页面
      try {
        result = await getUPownerVideosViaPage(mid, page, pageSize, keyword);
      } catch (pageErr) {
        const browserFallback = await ensureBrowserResult();
        if (browserFallback) {
          cacheIfNonEmpty(browserFallback);
          return browserFallback;
        }

        const dynamicFallback = await ensureDynamicResult();
        if (dynamicFallback) {
          cacheIfNonEmpty(dynamicFallback);
          return dynamicFallback;
        }

        if (homeResult) {
          cacheIfNonEmpty(homeResult);
          return homeResult;
        }
        throw pageErr;
      }
    }
  }

  // 缓存结果
  cacheIfNonEmpty(result);
  return result;
}

async function getUPownerProfile(mid: string): Promise<{
  name: string;
  face: string;
  sign: string;
  videoCount: number;
}> {
  const res = await fetch(`${BILIBILI_API_BASE}/x/space/acc/info?mid=${mid}`, {
    headers: getHeaders({ referer: `https://space.bilibili.com/${mid}/video` }),
    redirect: "manual",
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`acc/info 返回非 JSON，状态码: ${res.status}`);
  }

  if ((data.code as number) !== 0) {
    throw new Error(`acc/info 失败: code=${data.code}, message=${data.message}`);
  }

  const up = (data.data || {}) as Record<string, unknown>;
  return {
    name: (up.name as string) || "",
    face: normalizePicUrl((up.face as string) || ""),
    sign: (up.sign as string) || "",
    videoCount: Number(up.archive_count || 0),
  };
}

/**
 * 方案 0.4: 动态历史兜底（不依赖 arc/search）
 * 通过 `dynamic_svr/space_history` 拉取动态卡片并提取视频信息。
 */
async function getUPownerVideosViaDynamicHistory(
  mid: string,
  page: number,
  pageSize: number,
  keyword?: string
): Promise<UpownerVideosResult> {
  const targetCount = Math.max(1, page) * pageSize + pageSize;
  const maxPages = 20;
  const collected = new Map<string, UpownerVideo>();

  let offsetDynamicId = 0;
  let hasMore = true;
  let fallbackName = "";
  let fallbackFace = "";

  for (let i = 0; i < maxPages && hasMore && collected.size < targetCount; i++) {
    const url = `${BILIBILI_API_BASE.replace("api.", "api.vc.")}/dynamic_svr/v1/dynamic_svr/space_history?host_uid=${mid}&offset_dynamic_id=${offsetDynamicId}&need_top=1`;
    const res = await fetch(url, {
      headers: getHeaders({ referer: `https://space.bilibili.com/${mid}/video` }),
      redirect: "manual",
    });

    const text = await res.text();
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(`dynamic_svr 返回非 JSON，状态码: ${res.status}`);
    }

    if ((data.code as number) !== 0) {
      const msg = (data.message as string) || (data.msg as string) || "unknown";
      throw new Error(`dynamic_svr 失败: code=${data.code}, message=${msg}`);
    }

    const payload = (data.data || {}) as Record<string, unknown>;
    const cards = Array.isArray(payload.cards) ? payload.cards as Record<string, unknown>[] : [];

    for (const cardEntry of cards) {
      const desc = (cardEntry.desc && typeof cardEntry.desc === "object")
        ? cardEntry.desc as Record<string, unknown>
        : {};
      const cardData = safeParseObject(cardEntry.card);

      if (cardData) {
        const user = (cardData.user && typeof cardData.user === "object")
          ? cardData.user as Record<string, unknown>
          : {};
        if (!fallbackName) fallbackName = (user.uname as string) || "";
        if (!fallbackFace) fallbackFace = normalizePicUrl((user.face as string) || "");
      }

      const candidates: unknown[] = [cardEntry, desc];
      if (cardData) {
        candidates.push(cardData);
        const originData = safeParseObject(cardData.origin);
        if (originData) candidates.push(originData);
        const originExt = safeParseObject(cardData.origin_extend_json);
        if (originExt) candidates.push(originExt);
      }

      for (const node of candidates) {
        collectVideosFromPayload(node, collected);
      }
    }

    const nextOffset = toSafeNumber(payload.next_offset);
    const hasMoreFlag = toSafeNumber(payload.has_more);
    if (hasMoreFlag !== 1 || nextOffset <= 0 || nextOffset === offsetDynamicId) {
      hasMore = false;
    } else {
      offsetDynamicId = nextOffset;
    }
  }

  let videos = [...collected.values()];
  videos.sort((a, b) => b.created - a.created);

  if (keyword) {
    const kw = keyword.toLowerCase();
    videos = videos.filter((v) => v.title.toLowerCase().includes(kw));
  }

  const total = videos.length;
  const from = (Math.max(1, page) - 1) * pageSize;
  const pagedVideos = videos.slice(from, from + pageSize);

  let profile: { name: string; face: string; sign: string; videoCount: number } | null = null;
  try {
    profile = await getUPownerProfile(mid);
  } catch (profileErr) {
    console.log("[bilibili] 动态兜底获取 up 信息失败:", profileErr instanceof Error ? profileErr.message : profileErr);
  }

  return {
    upowner: {
      mid,
      name: profile?.name || fallbackName,
      face: profile?.face || fallbackFace,
      sign: profile?.sign || "",
      videoCount: profile?.videoCount || total,
    },
    videos: pagedVideos,
    total,
  };
}

/**
 * 方案 0.5: 浏览器抓取兜底（仅在 API 风控失败时触发）
 * 通过 Playwright 打开空间页，收集前端实际请求返回的数据。
 */
async function getUPownerVideosViaBrowserScrape(
  mid: string,
  page: number,
  pageSize: number,
  keyword?: string
): Promise<UpownerVideosResult> {
  // Allow running with project-local browser binaries:
  // PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers npx playwright install chromium
  if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
    const localBrowsersPath = join(process.cwd(), ".playwright-browsers");
    if (existsSync(localBrowsersPath)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = localBrowsersPath;
    }
  }

  let chromium: Awaited<typeof import("playwright")>["chromium"];
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    throw new Error("未安装 playwright，无法使用浏览器兜底抓取");
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      "Playwright Chromium 启动失败。请先执行：PLAYWRIGHT_BROWSERS_PATH=./.playwright-browsers npx playwright install chromium\n" +
      `详细信息: ${detail}`
    );
  }

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "zh-CN",
      viewport: { width: 1440, height: 900 },
      extraHTTPHeaders: {
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      },
    });

    const sessdata = normalizeSessdata(process.env.BILIBILI_SESSDATA || "");
    const dedeUserId = (process.env.BILIBILI_DEDE_USERID || "").trim();
    const biliJct = (process.env.BILIBILI_BILI_JCT || "").trim();
    const cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      secure: boolean;
      httpOnly?: boolean;
      sameSite?: "Strict" | "Lax" | "None";
    }> = [];
    if (sessdata) {
      cookies.push({
        name: "SESSDATA",
        value: sessdata,
        domain: ".bilibili.com",
        path: "/",
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      });
    }
    if (dedeUserId) {
      cookies.push({
        name: "DedeUserID",
        value: dedeUserId,
        domain: ".bilibili.com",
        path: "/",
        secure: true,
        sameSite: "Lax",
      });
    }
    if (biliJct) {
      cookies.push({
        name: "bili_jct",
        value: biliJct,
        domain: ".bilibili.com",
        path: "/",
        secure: true,
        sameSite: "Lax",
      });
    }
    if (cookies.length > 0) {
      await context.addCookies(cookies);
    }

    const pageObj = await context.newPage();
    const collected = new Map<string, UpownerVideo>();
    const interestingApi = [
      "/x/space/wbi/arc/search",
      "/x/space/arc/search",
      "/x/polymer/web-space/home/seasons_series",
      "/x/polymer/web-space/seasons_series_list",
      "/x/polymer/web-space/seasons_archives_list",
      "/x/series/archives",
    ];

    pageObj.on("response", async (resp) => {
      const url = resp.url();
      if (!url.includes("api.bilibili.com")) return;
      if (!interestingApi.some((seg) => url.includes(seg))) return;

      const contentType = resp.headers()["content-type"] || "";
      if (!contentType.includes("application/json")) return;

      try {
        const data = await resp.json();
        collectVideosFromPayload(data, collected);
      } catch {
        // ignore parsing failures
      }
    });

    const pageUrl = `https://space.bilibili.com/${mid}/video?page=${Math.max(1, page)}`;
    await pageObj.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await pageObj.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await pageObj.waitForTimeout(1500);

    // 某些情况下切到“投稿”标签才会触发视频列表请求
    const uploadTab = pageObj.getByText(/投稿|稿件|视频/).first();
    if (collected.size === 0 && (await uploadTab.count()) > 0) {
      await uploadTab.click({ timeout: 3_000 }).catch(() => undefined);
      await pageObj.waitForTimeout(1800);
    }

    if (collected.size === 0) {
      const domVideos = await pageObj.evaluate(() => {
        const result: Array<{
          bvid: string;
          title: string;
          pic: string;
          duration: number;
          play: number;
          created: number;
        }> = [];

        const toSeconds = (text: string): number => {
          const parts = text.split(":").map(Number);
          if (parts.length === 2) return parts[0] * 60 + parts[1];
          if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
          return 0;
        };

        const anchors = Array.from(document.querySelectorAll("a[href*='/video/BV']"));
        const seen = new Set<string>();
        for (const anchor of anchors) {
          const href = (anchor as HTMLAnchorElement).href || anchor.getAttribute("href") || "";
          const bvidMatch = href.match(/BV[0-9A-Za-z]+/);
          if (!bvidMatch) continue;

          const bvid = bvidMatch[0];
          if (seen.has(bvid)) continue;
          seen.add(bvid);

          const card = anchor.closest(".upload-video-card, .small-item, .bili-video-card, li, .video-list__item");
          const titleEl = card?.querySelector("[title], .title, .upload-video-card__title, .bili-video-card__info--tit");
          const title = (
            titleEl?.getAttribute("title") ||
            titleEl?.textContent ||
            anchor.getAttribute("title") ||
            anchor.textContent ||
            ""
          ).replace(/\s+/g, " ").trim();

          const imgEl = (card?.querySelector("img") || anchor.querySelector("img")) as HTMLImageElement | null;
          const pic = imgEl?.getAttribute("src") || imgEl?.getAttribute("data-src") || "";

          const metaText = (card?.textContent || "").replace(/\s+/g, " ");
          const durMatch = metaText.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
          const duration = durMatch ? toSeconds(durMatch[1]) : 0;

          result.push({ bvid, title, pic, duration, play: 0, created: 0 });
        }

        return result;
      });

      for (const v of domVideos) {
        if (!collected.has(v.bvid)) {
          collected.set(v.bvid, {
            ...v,
            title: sanitizeText(v.title),
            pic: normalizePicUrl(v.pic),
          });
        }
      }
    }

    let videos = [...collected.values()];
    videos.sort((a, b) => b.created - a.created);

    if (keyword) {
      const kw = keyword.toLowerCase();
      videos = videos.filter((v) => v.title.toLowerCase().includes(kw));
    }

    const total = videos.length;
    const from = (Math.max(1, page) - 1) * pageSize;
    const pagedVideos = videos.slice(from, from + pageSize);

    let profile: { name: string; face: string; sign: string; videoCount: number } | null = null;
    try {
      profile = await getUPownerProfile(mid);
    } catch {
      const title = await pageObj.title().catch(() => "");
      const maybeName = title.replace(/的个人空间.*$/, "").trim();
      profile = {
        name: maybeName,
        face: "",
        sign: "",
        videoCount: total,
      };
    }

    return {
      upowner: {
        mid,
        name: profile?.name || "",
        face: profile?.face || "",
        sign: profile?.sign || "",
        videoCount: profile?.videoCount || total,
      },
      videos: pagedVideos,
      total,
    };
  } finally {
    await browser.close();
  }
}

/**
 * 方案 0: 与 B站空间页当前前端一致的数据源
 * `/x/polymer/web-space/home/seasons_series` 对部分 IP 更稳定。
 */
async function getUPownerVideosViaHomeSeasons(
  mid: string,
  page: number,
  pageSize: number,
  keyword?: string
): Promise<UpownerVideosResult> {
  // 该接口 page_size 最大 20，超过会返回 -400
  const apiPageSize = Math.max(1, Math.min(pageSize, 20));
  const url = `${BILIBILI_API_BASE}/x/polymer/web-space/home/seasons_series?mid=${mid}&page_size=${apiPageSize}&page_num=1`;
  const res = await fetch(url, {
    headers: getHeaders({ referer: `https://space.bilibili.com/${mid}/video` }),
    redirect: "manual",
  });

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`home/seasons_series 返回非 JSON，状态码: ${res.status}`);
  }

  if ((data.code as number) !== 0) {
    throw new Error(`home/seasons_series 失败: code=${data.code}, message=${data.message}`);
  }

  const itemsLists = ((data.data as Record<string, unknown> | undefined)?.items_lists ||
    {}) as Record<string, unknown>;
  const seasons = (itemsLists.seasons_list || []) as Record<string, unknown>[];
  const series = (itemsLists.series_list || []) as Record<string, unknown>[];

  const rawArchives = [
    ...seasons.flatMap((s) => ((s.archives as Record<string, unknown>[] | undefined) || [])),
    ...series.flatMap((s) => ((s.archives as Record<string, unknown>[] | undefined) || [])),
  ];

  const dedupMap = new Map<string, UpownerVideo>();
  for (const a of rawArchives) {
    const bvid = (a.bvid as string) || "";
    if (!bvid) continue;

    const stat = (a.stat as Record<string, unknown> | undefined) || {};
    const title = ((a.title as string) || "").replace(/<[^>]+>/g, "");
    const created = Number(a.pubdate || a.ctime || 0);

    dedupMap.set(bvid, {
      bvid,
      title,
      pic: normalizePicUrl((a.pic as string) || ""),
      duration:
        typeof a.duration === "number"
          ? a.duration
          : parseDurationToSeconds((a.duration as string) || ""),
      play: Number(stat.view || 0),
      created,
    });
  }

  let videos = [...dedupMap.values()];
  videos.sort((a, b) => b.created - a.created);

  if (keyword) {
    const kw = keyword.toLowerCase();
    videos = videos.filter((v) => v.title.toLowerCase().includes(kw));
  }

  const total = videos.length;
  const from = (Math.max(1, page) - 1) * pageSize;
  const pagedVideos = videos.slice(from, from + pageSize);

  let profile: { name: string; face: string; sign: string; videoCount: number } | null = null;
  try {
    profile = await getUPownerProfile(mid);
  } catch (profileErr) {
    console.log("[bilibili] acc/info 失败，使用降级信息:", profileErr instanceof Error ? profileErr.message : profileErr);
  }

  return {
    upowner: {
      mid,
      name: profile?.name || "",
      face: profile?.face || "",
      sign: profile?.sign || "",
      videoCount: profile?.videoCount || total,
    },
    videos: pagedVideos,
    total,
  };
}

/**
 * 方案 B: 通过不带 WBI 签名的旧接口获取UP主视频列表
 * 旧接口 `/x/space/arc/search` 不需要 WBI 签名，反爬限制更宽松
 */
async function getUPownerVideosViaLegacyAPI(
  mid: string,
  page: number,
  pageSize: number,
  keyword: string | undefined
): Promise<UpownerVideosResult> {
  const url = `${BILIBILI_API_BASE}/x/space/arc/search?mid=${mid}&pn=${page}&ps=${pageSize}&order=pubdate`;
  const res = await fetch(url, {
    headers: getHeaders(),
    redirect: "manual",
  });

  if (res.status >= 300 && res.status < 400) {
    throw new Error(`旧接口重定向 (${res.status})`);
  }

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`旧接口返回非 JSON，状态码: ${res.status}`);
  }

  if ((data.code as number) !== 0) {
    throw new Error(`旧接口失败: code=${data.code}, message=${data.message}`);
  }

  const apiData = data.data as Record<string, unknown>;
  const list = apiData?.list as Record<string, unknown> | undefined;
  const pageInfo = apiData?.page as Record<string, unknown> | undefined;
  const vlist = (list?.vlist || []) as Record<string, unknown>[];

  // UP主信息（旧接口在 list.vlist[0] 中包含 author）
  const upInfo = apiData?.upInfo as Record<string, unknown> | undefined;

  let videos = vlist.map((v) => ({
    bvid: (v.bvid as string) || "",
    title: ((v.title as string) || "").replace(/<[^>]+>/g, ""),
    pic: normalizePicUrl(v.pic as string),
    duration: parseDurationToSeconds((v.length as string) || "0:00"),
    play: Number(v.play || 0),
    created: Number(v.created || 0),
  })).filter((v) => v.bvid);

  if (keyword) {
    const kw = keyword.toLowerCase();
    videos = videos.filter((v) => v.title.toLowerCase().includes(kw));
  }

  return {
    upowner: {
      mid,
      name: (upInfo?.name as string) || (vlist[0]?.author as string) || "",
      face: normalizePicUrl((upInfo?.face as string) || (upInfo?.avatar as string) || ""),
      sign: (upInfo?.sign as string) || "",
      videoCount: (pageInfo?.count as number) || 0,
    },
    videos,
    total: (pageInfo?.count as number) || 0,
  };
}

/**
 * 方案 A: 通过 WBI 签名 API 获取UP主视频列表
 */
async function getUPownerVideosViaAPI(
  mid: string,
  page: number,
  pageSize: number,
  keyword: string | undefined,
  imgKey: string,
  subKey: string
): Promise<UpownerVideosResult> {
  const params: Record<string, string> = {
    mid,
    pn: page.toString(),
    ps: pageSize.toString(),
    order: "pubdate",
  };

  const signedQuery = signWbiParams(params, imgKey, subKey);
  const url = `${BILIBILI_API_BASE}/x/space/wbi/arc/search?${signedQuery}`;

  const res = await fetch(url, {
    headers: getHeaders(),
    redirect: "manual",
  });

  // 手动处理重定向
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`B站 API 返回重定向 (${res.status})，疑似触发反爬`);
  }

  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`B站返回非 JSON 响应（可能触发了风控），状态码: ${res.status}`);
  }

  if ((data.code as number) !== 0) {
    const rawInfo = `[B站原始响应: code=${data.code}, message=${data.message}]`;
    console.error("[bilibili] UP主视频接口原始响应:", JSON.stringify({ code: data.code, message: data.message }));
    throw new Error(`API 请求失败: ${data.message}\n${rawInfo}`);
  }

  const apiData = data.data as Record<string, unknown>;
  const list = apiData?.list as Record<string, unknown> | undefined;
  const pageInfo = apiData?.page as Record<string, unknown> | undefined;
  const vlist = (list?.vlist || []) as Record<string, unknown>[];

  let videos = vlist.map((v) => ({
    bvid: (v.bvid as string) || "",
    title: ((v.title as string) || "").replace(/<[^>]+>/g, ""),
    pic: normalizePicUrl(v.pic as string),
    duration: parseDurationToSeconds((v.length as string) || "0:00"),
    play: Number(v.play || 0),
    created: Number(v.created || 0),
  })).filter((v) => v.bvid);

  if (keyword) {
    const kw = keyword.toLowerCase();
    videos = videos.filter((v) => v.title.toLowerCase().includes(kw));
  }

  return {
    upowner: {
      mid,
      name: (vlist[0]?.author as string) || "",
      face: normalizePicUrl((vlist[0]?.author_face as string) || ""),
      sign: "",
      videoCount: (pageInfo?.count as number) || 0,
    },
    videos,
    total: (pageInfo?.count as number) || 0,
  };
}

/**
 * 方案 B: 通过解析用户空间页面获取UP主视频列表（兜底方案）
 *
 * B站用户空间页面在 HTML 中嵌入 __INITIAL_STATE__ JSON，
 * 包含完整的视频列表数据。此方法不依赖 WBI 签名，更抗反爬。
 */
async function getUPownerVideosViaPage(
  mid: string,
  page: number,
  pageSize: number,
  keyword?: string
): Promise<UpownerVideosResult> {
  const spaceUrl = `https://space.bilibili.com/${mid}/video?page=${page}&page_size=${pageSize}`;
  const res = await fetch(spaceUrl, {
    headers: getHeaders({ referer: `https://space.bilibili.com/${mid}/video` }),
  });

  const html = await res.text();

  // 提取 __INITIAL_STATE__ JSON
  const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]+?\});\s*<\/script>/);
  if (!stateMatch) {
    // 诊断日志：看看页面实际返回了什么
    console.error("[bilibili] 页面解析失败，HTTP 状态:", res.status);
    console.error("[bilibili] 页面前 500 字符:", html.slice(0, 500));
    console.error("[bilibili] 页面中 script 标签数量:", (html.match(/<script/g) || []).length);
    // 尝试匹配其他可能的数据格式
    const ssrDataMatch = html.match(/__NEXT_DATA__\s*=\s*(\{[\s\S]+?\})\s*;?\s*<\/script>/);
    const fetchDataMatch = html.match(/"vlist"\s*:\s*\[/);
    console.error("[bilibili] __NEXT_DATA__ 匹配:", !!ssrDataMatch, "vlist 匹配:", !!fetchDataMatch);
    throw new Error(
      "无法从用户空间页面提取数据。可能 B站 页面结构已变更，或 SESSDATA 无效导致页面未正常渲染。"
    );
  }

  let state: Record<string, unknown>;
  try {
    // B站 __INITIAL_STATE__ 中的 undefined 需要替换为 null 才能被 JSON.parse 解析
    const jsonStr = stateMatch[1].replace(/:\s*undefined/g, ":null");
    state = JSON.parse(jsonStr);
  } catch (e) {
    throw new Error(`解析用户空间页面数据失败: ${e instanceof Error ? e.message : e}`);
  }

  // 从 state 中提取视频列表
  // B站空间页面的数据结构: state.modules?.upModule?.upData / state.list?.vlist
  const modules = state.modules as Record<string, unknown> | undefined;
  const listData = state.list as Record<string, unknown> | undefined;

  // UP主信息
  const upModule = modules?.upModule as Record<string, unknown> | undefined;
  const upData = (upModule?.upData || listData?.upInfo) as Record<string, unknown> | undefined;

  // 视频列表
  const vlistItem = listData?.vlist as Record<string, unknown> | undefined;
  const vlist = (vlistItem?.vlist || []) as Record<string, unknown>[];

  let videos = vlist.map((v) => ({
    bvid: (v.bvid as string) || "",
    title: ((v.title as string) || "").replace(/<[^>]+>/g, ""),
    pic: normalizePicUrl(v.pic as string),
    duration: parseDurationToSeconds((v.length as string) || "0:00"),
    play: Number(v.play || 0),
    created: Number(v.created || 0),
  })).filter((v) => v.bvid);

  if (keyword) {
    const kw = keyword.toLowerCase();
    videos = videos.filter((v) => v.title.toLowerCase().includes(kw));
  }

  const total = (vlistItem?.count as number) || videos.length;

  return {
    upowner: {
      mid,
      name: (upData?.name as string) || "",
      face: normalizePicUrl((upData?.face as string) || (upData?.avatar as string) || ""),
      sign: (upData?.sign as string) || "",
      videoCount: total,
    },
    videos,
    total,
  };
}
