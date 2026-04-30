/**
 * 小红书视频链接解析
 * 使用 Playwright 浏览器抓取，从页面 JSON 数据提取元数据
 */

import { join } from "path";
import type { PlatformVideoInfo } from "@/lib/platform";

// ─── Video ID Extraction ────────────────────────────────────────────────────

/**
 * 从小红书 URL 提取笔记 ID（noteId）
 * 支持：xiaohongshu.com/explore/xxx, xiaohongshu.com/discovery/item/xxx, xhslink.com/xxx
 */
export async function extractXHSId(rawUrl: string): Promise<string | null> {
  // 从混合文本提取纯 URL
  const urlMatch = rawUrl.match(/https?:\/\/[^\s\]】]+/);
  const url = urlMatch ? urlMatch[0] : rawUrl.trim();

  // 标准链接：/explore/abc123def 或 /discovery/item/abc123def
  const exploreMatch = url.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([a-zA-Z0-9]+)/);
  if (exploreMatch) return exploreMatch[1];

  // 用户主页视频链接：/user/profile/xxx/abc123def
  const userMatch = url.match(/xiaohongshu\.com\/user\/profile\/[^\/]+\/([a-zA-Z0-9]+)/);
  if (userMatch) return userMatch[1];

  // xhslink.com 短链接，需要重定向解析
  if (url.includes("xhslink.com")) {
    return await resolveXHSShortUrl(url);
  }

  return null;
}

// ─── Short URL Resolution ─────────────────────────────────────────────────────

async function resolveXHSShortUrl(shortUrl: string): Promise<string | null> {
  let { chromium } = await import("playwright");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    ({ chromium } = await import("playwright"));

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({});

    await page.goto(shortUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
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
}

async function fetchViaBrowser(noteUrl: string): Promise<XHSRawMeta> {
  let { chromium } = await import("playwright");
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    ({ chromium } = await import("playwright"));

    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled"],
    });

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      locale: "zh-CN",
      viewport: { width: 1440, height: 900 },
    });

    const page = await context.newPage();

    await page.goto(noteUrl, { waitUntil: "networkidle", timeout: 30_000 });

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
    let duration = 0;

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
          duration = Math.round((noteData.video?.duration || 0) / 1000);

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
      authorAvatar: "",
      authorUid: authorUid || "",
    };
  } finally {
    await browser?.close();
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * 获取小红书笔记/视频元数据
 */
export async function getXHSVideo(
  noteIdOrUrl: string
): Promise<PlatformVideoInfo> {
  let noteId = noteIdOrUrl;

  const extracted = await extractXHSId(noteIdOrUrl);
  if (!extracted) {
    throw new Error("无法从小红书链接中提取笔记 ID");
  }
  noteId = extracted;

  // 构建笔记页面 URL
  const noteUrl = `https://www.xiaohongshu.com/explore/${noteId}`;

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
  };
}
