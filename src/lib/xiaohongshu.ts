/**
 * 小红书视频链接解析
 * 使用 Playwright 浏览器抓取，从页面 JSON 数据提取元数据和视频直链
 */

import type { PlatformVideoInfo } from "@/lib/platform";
import { execFile } from "child_process";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

function extractFirstUrl(input: string): string | null {
  return input.match(/https?:\/\/[^\s\]】]+/)?.[0] || null;
}

// ─── Video ID Extraction ────────────────────────────────────────────────────

/**
 * 从小红书 URL 提取笔记 ID（noteId）
 * 支持：xiaohongshu.com/explore/xxx, xiaohongshu.com/discovery/item/xxx, xhslink.com/xxx
 */
export async function extractXHSId(rawUrl: string): Promise<string | null> {
  // 从混合文本提取纯 URL
  const url = extractFirstUrl(rawUrl) || rawUrl.trim();

  // 标准链接：/explore/abc123def 或 /discovery/item/abc123def
  const exploreMatch = url.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/);
  if (exploreMatch) return exploreMatch[1];

  // 用户主页视频链接：/user/profile/xxx/abc123def
  const userMatch = url.match(/xiaohongshu\.com\/user\/profile\/[^\/]+\/([a-zA-Z0-9]+)/);
  if (userMatch) return userMatch[1];

  if (/^[a-zA-Z0-9]{10,32}$/.test(url.trim())) return url.trim();

  // xhslink.com 短链接，需要重定向解析
  if (url.includes("xhslink.com")) {
    return await resolveXHSShortUrl(url);
  }

  return null;
}

// ─── Short URL Resolution ─────────────────────────────────────────────────────

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const TMP_BASE = join(tmpdir(), "bilibili-subtitle");

async function resolveXHSShortUrl(shortUrl: string): Promise<string | null> {
  let { chromium } = await import("playwright");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    ({ chromium } = await import("playwright"));

    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
    const page = await browser.newPage({
      userAgent: MOBILE_UA,
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
    });

    await page.goto(shortUrl, { waitUntil: "commit", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(2_000);
    const finalUrl = page.url();

    return extractXHSId(finalUrl);
  } catch (err) {
    console.warn("[xiaohongshu] 短链接解析失败:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await browser?.close();
  }
}

// ─── Metadata Fetching via Playwright ─────────────────────────────────────────

interface XHSRawMeta {
  title: string;
  description: string;
  coverUrl: string;
  duration: number;
  authorName: string;
  authorAvatar: string;
  authorUid: string;
  videoUrl: string;
}

async function fetchViaBrowser(noteUrl: string): Promise<XHSRawMeta> {
  let { chromium } = await import("playwright");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    ({ chromium } = await import("playwright"));

    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });

    const context = await browser.newContext({
      userAgent: MOBILE_UA,
      locale: "zh-CN",
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });

    const page = await context.newPage();

    await page.goto(noteUrl, { waitUntil: "commit", timeout: 30_000 }).catch(() => {});
    await page.waitForTimeout(5_000);

    // 方法1：优先从 og:meta 提取
    const ogTitle = await page
      .$eval('meta[property="og:title"]', (el) => el.getAttribute("content") || "")
      .catch(() => "");
    const ogDesc = await page
      .$eval('meta[property="og:description"]', (el) => el.getAttribute("content") || "")
      .catch(() => "");
    const ogImage = await page
      .$eval('meta[property="og:image"]', (el) => el.getAttribute("content") || "")
      .catch(() => "");

    // 方法2：从 __UNIVERSAL_DATA_FOR_REHYDRATION__ JSON 中提取（更完整）
    const rawJson = await page
      .$eval(
        'script#__UNIVERSAL_DATA_FOR_REHYDRATION__',
        (el) => el.textContent || ""
      )
      .catch(() => "");

    let title = ogTitle;
    let description = ogDesc;
    let coverUrl = ogImage;
    let authorName = "";
    let authorUid = "";
    let authorAvatar = "";
    let duration = 0;
    let videoUrl = "";

    const stateData = await page
      .evaluate(() => ({
        initial: (window as typeof window & { __INITIAL_STATE__?: unknown }).__INITIAL_STATE__,
        setup: (window as typeof window & { __SETUP_SERVER_STATE__?: unknown }).__SETUP_SERVER_STATE__,
      }))
      .catch(() => ({ initial: undefined, setup: undefined }));

    const noteFromState = extractNoteData(stateData.initial) || extractNoteData(stateData.setup);
    if (noteFromState) {
      title = noteFromState.title || title;
      description = noteFromState.description || description;
      coverUrl = coverUrl || noteFromState.coverUrl;
      duration = noteFromState.duration || duration;
      authorName = noteFromState.authorName || authorName;
      authorAvatar = noteFromState.authorAvatar || authorAvatar;
      authorUid = noteFromState.authorUid || authorUid;
      videoUrl = noteFromState.videoUrl || videoUrl;
    }

    if (rawJson) {
      try {
        const data = JSON.parse(rawJson);
        // 尝试多个可能的路径
        const note =
          data?.web笔记DetailData?.note?.noteDetailMap ||
          data?.note?.noteDetailMap ||
          data?.xhsNoteDetail ||
          {};

        const noteKeys = Object.keys(note);
        if (noteKeys.length > 0) {
          const noteData = note[noteKeys[0]]?.note || {};
          title = noteData.title || title;
          description = noteData.desc || description;
          authorName = noteData.user?.nickname || noteData.author?.name || authorName;
          authorUid = noteData.user?.userId || noteData.author?.uid || authorUid;
          authorAvatar = noteData.user?.avatar || authorAvatar;
          duration = Math.round((noteData.video?.duration || 0) / 1000);
          videoUrl = pickXHSVideoUrl(noteData.video) || videoUrl;

          // 封面
          const cover =
            noteData.imageList?.[0]?.urlDefault ||
            noteData.cover?.url ||
            noteData.imageList?.[0]?.url ||
            "";
          coverUrl = coverUrl || cover;
        }
      } catch (parseErr) {
        console.warn("[xiaohongshu] JSON 解析失败:", parseErr);
      }
    }

    return {
      title: title || "小红书笔记",
      description: description || "",
      coverUrl: coverUrl || "",
      duration,
      authorName: authorName || "小红书用户",
      authorAvatar,
      authorUid: authorUid || "",
      videoUrl,
    };
  } finally {
    await browser?.close();
  }
}

function extractNoteData(data: unknown): XHSRawMeta | null {
  const root = data as {
    noteData?: { data?: { noteData?: unknown } };
    LAUNCHER_SSR_STORE_PAGE_DATA?: { noteData?: unknown };
  };
  const note = root?.noteData?.data?.noteData || root?.LAUNCHER_SSR_STORE_PAGE_DATA?.noteData;
  if (!note || typeof note !== "object") return null;

  const noteData = note as {
    title?: string;
    desc?: string;
    imageList?: Array<{ url?: string; urlDefault?: string; infoList?: Array<{ url?: string }> }>;
    cover?: { url?: string };
    user?: { nickName?: string; nickname?: string; avatar?: string; userId?: string };
    video?: unknown;
  };
  const videoUrl = pickXHSVideoUrl(noteData.video);
  const coverUrl =
    noteData.imageList?.[0]?.urlDefault ||
    noteData.imageList?.[0]?.url ||
    noteData.imageList?.[0]?.infoList?.[0]?.url ||
    noteData.cover?.url ||
    "";

  return {
    title: noteData.title || noteData.desc || "小红书笔记",
    description: noteData.desc || noteData.title || "",
    coverUrl,
    duration: getXHSDuration(noteData.video),
    authorName: noteData.user?.nickName || noteData.user?.nickname || "小红书用户",
    authorAvatar: noteData.user?.avatar || "",
    authorUid: noteData.user?.userId || "",
    videoUrl,
  };
}

function getXHSDuration(video: unknown): number {
  const data = video as { media?: { video?: { duration?: number } }; capa?: { duration?: number }; duration?: number };
  const raw = data?.media?.video?.duration || data?.capa?.duration || data?.duration || 0;
  return raw > 10_000 ? Math.round(raw / 1000) : Math.round(raw);
}

function pickXHSVideoUrl(video: unknown): string {
  const data = video as {
    media?: {
      stream?: {
        h264?: Array<{ masterUrl?: string; backupUrls?: string[]; size?: number; weight?: number }>;
        h265?: Array<{ masterUrl?: string; backupUrls?: string[]; size?: number; weight?: number }>;
      };
    };
  };
  const h264 = data?.media?.stream?.h264 || [];
  const h265 = data?.media?.stream?.h265 || [];
  const candidates = [...h264, ...h265]
    .filter((item) => item.masterUrl || item.backupUrls?.[0])
    .sort((a, b) => (a.size || a.weight || 0) - (b.size || b.weight || 0));
  const url = candidates[0]?.masterUrl || candidates[0]?.backupUrls?.[0] || "";
  return url.replace(/^http:\/\//, "https://");
}

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
 * 从小红书 CDN 直链下载视频并提取音频。
 * 小红书 videoUrl 是带签名的临时 MP4，不能交给 yt-dlp 的 bestaudio 格式选择器。
 */
export async function downloadXHSAudio(videoUrl: string): Promise<string> {
  const { randomUUID } = await import("crypto");
  const { unlink } = await import("fs/promises");
  const workDir = join(TMP_BASE, randomUUID());
  await mkdir(workDir, { recursive: true });

  const videoPath = join(workDir, "video.mp4");
  const audioPath = join(workDir, "audio.m4a");

  console.log("[xiaohongshu] 下载视频文件...");
  const resp = await fetch(videoUrl, {
    headers: {
      "User-Agent": MOBILE_UA,
      "Referer": "https://www.xiaohongshu.com/",
    },
    redirect: "follow",
  });

  if (!resp.ok) {
    throw new Error(`小红书音频下载失败：视频直链返回 ${resp.status}`);
  }

  const body = await resp.arrayBuffer();
  await writeFile(videoPath, Buffer.from(body));
  console.log(`[xiaohongshu] 视频下载完成 (${(body.byteLength / 1024 / 1024).toFixed(1)} MB)`);

  console.log("[xiaohongshu] 提取音频...");
  await execFileAsync("ffmpeg", [
    "-i", videoPath,
    "-vn",
    "-acodec", "copy",
    "-y",
    audioPath,
  ]);

  await unlink(videoPath).catch(() => {});

  return audioPath;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 获取小红书笔记/视频元数据
 */
export async function getXHSVideo(
  noteIdOrUrl: string,
  knownNoteId?: string
): Promise<PlatformVideoInfo> {
  let noteId = knownNoteId || noteIdOrUrl;

  if (!knownNoteId) {
    const extracted = await extractXHSId(noteIdOrUrl);
    if (!extracted) {
      throw new Error("无法从小红书链接中提取笔记 ID");
    }
    noteId = extracted;
  }

  // 构建笔记页面 URL
  const sourceUrl = extractFirstUrl(noteIdOrUrl);
  const noteUrl = sourceUrl && (sourceUrl.includes("xiaohongshu.com") || sourceUrl.includes("xhslink.com"))
    ? sourceUrl
    : `https://www.xiaohongshu.com/explore/${noteId}`;

  const meta = await fetchViaBrowser(noteUrl);

  return {
    platform: "xiaohongshu",
    id: noteId,
    title: meta.title,
    description: meta.description,
    coverUrl: meta.coverUrl,
    duration: meta.duration,
    author: {
      name: meta.authorName,
      avatar: meta.authorAvatar,
      uid: meta.authorUid,
    },
    videoUrl: meta.videoUrl,
  };
}
