/**
 * 多平台统一入口
 * 支持 B站、抖音、小红书的 URL 解析和视频元数据获取
 */

import { extractBvId, getVideoInfo } from "@/lib/bilibili";

// ─── Types ───────────────────────────────────────────────────────────────────

export type Platform = "bilibili" | "douyin" | "xiaohongshu";

export interface PlatformVideoInfo {
  platform: Platform;
  /** 平台原始 ID（bvid / aweme_id / noteId） */
  id: string;
  title: string;
  description: string;
  /** 封面图 URL */
  coverUrl: string;
  /** 时长（秒），抖音/小红书可能为空 */
  duration?: number;
  author: {
    name: string;
    avatar?: string;
    /** B站 mid */
    mid?: string;
    /** 抖音/小红书用户 ID */
    uid?: string;
  };
  /** B站专用：CID（分P） */
  cid?: number;
  /** B站专用：用户链接中指定的分 P 页码 */
  page?: number;
  /** B站专用：分 P 列表 */
  pages?: Array<{
    bvid?: string;
    cid: number;
    page: number;
    part: string;
    duration: number;
  }>;
  /** 抖音/小红书视频直链（用于音频转写），B站为 undefined */
  videoUrl?: string;
}

export interface ParsedVideoId {
  platform: Platform;
  id: string;
  page?: number;
}

// ─── URL Pattern Detection ───────────────────────────────────────────────────

/**
 * 从混合文本中提取纯 URL
 */
function extractUrl(input: string): string {
  const match = input.match(/https?:\/\/[^\s\]】]+/);
  return match ? match[0] : input.trim();
}

function extractBilibiliPage(urlOrText: string): number | undefined {
  const rawUrl = extractUrl(urlOrText);
  try {
    const parsed = new URL(rawUrl);
    const page = Number(parsed.searchParams.get("p") || parsed.searchParams.get("page") || "");
    return Number.isInteger(page) && page > 0 ? page : undefined;
  } catch {
    const match = rawUrl.match(/[?&](?:p|page)=(\d+)/);
    const page = Number(match?.[1] || "");
    return Number.isInteger(page) && page > 0 ? page : undefined;
  }
}

export function detectPlatform(urlOrText: string): Platform | null {
  const text = urlOrText.toLowerCase();

  // B站
  if (
    text.includes("bilibili.com") ||
    text.includes("b23.tv") ||
    /^bv[\w]+$/i.test(text.trim())
  ) {
    return "bilibili";
  }

  // 抖音
  if (
    text.includes("douyin.com") ||
    text.includes("iesdouyin.com") ||
    text.includes("v.douyin.com")
  ) {
    return "douyin";
  }

  // 小红书
  if (
    text.includes("xiaohongshu.com") ||
    text.includes("xhslink.com") ||
    text.includes("xhs.cn")
  ) {
    return "xiaohongshu";
  }

  return null;
}

// ─── Video ID Extraction ─────────────────────────────────────────────────────

/**
 * 统一入口：从任意平台 URL 提取视频 ID
 */
export async function extractVideoId(
  urlOrText: string
): Promise<ParsedVideoId | null> {
  const url = extractUrl(urlOrText);

  // 优先按 URL 中的平台特征检测
  const platform = detectPlatform(urlOrText);

  if (platform === "douyin") {
    const { extractDouyinId } = await import("@/lib/douyin");
    const id = extractDouyinId(url);
    return id ? { platform: "douyin", id } : null;
  }

  if (platform === "xiaohongshu") {
    const { extractXHSId } = await import("@/lib/xiaohongshu");
    const id = await extractXHSId(url);
    return id ? { platform: "xiaohongshu", id } : null;
  }

  // 默认按 B站 处理（extractBvId 已内置 b23.tv 短链接解析）
  const bvid = await extractBvId(url);
  if (bvid) return { platform: "bilibili", id: bvid, page: extractBilibiliPage(urlOrText) };

  // B站解析失败，尝试抖音（纯数字 ID）
  if (/^\d{15,20}$/.test(url.trim())) {
    const { extractDouyinId } = await import("@/lib/douyin");
    const id = extractDouyinId(url.trim());
    if (id) return { platform: "douyin", id };
  }

  // 尝试小红书（字母数字混合 ID）
  if (/^[a-zA-Z0-9]{10,30}$/.test(url.trim())) {
    const { extractXHSId } = await import("@/lib/xiaohongshu");
    const id = await extractXHSId(url.trim());
    if (id) return { platform: "xiaohongshu", id };
  }

  return null;
}

// ─── Metadata Fetching ────────────────────────────────────────────────────────

/**
 * 统一入口：获取任意平台视频元数据
 */
export async function getVideoMetadata(
  parsed: ParsedVideoId
): Promise<PlatformVideoInfo> {
  if (parsed.platform === "douyin") {
    const { getDouyinVideo } = await import("@/lib/douyin");
    return getDouyinVideo(parsed.id);
  }

  if (parsed.platform === "xiaohongshu") {
    const { getXHSVideo } = await import("@/lib/xiaohongshu");
    return getXHSVideo(parsed.id);
  }

  // B站
  const info = await getVideoInfo(parsed.id);
  const pages = info.pages || [];
  const selectedPage = parsed.page
    ? pages.find((page) => page.page === parsed.page)
    : undefined;
  const currentPage = selectedPage || pages.find((page) => page.bvid === info.bvid);
  return {
    platform: "bilibili",
    id: info.bvid,
    title: info.title,
    description: info.desc,
    coverUrl: info.pic,
    duration: info.duration,
    author: {
      name: info.owner?.name || "",
      avatar: info.owner?.face,
      mid: String(info.aid), // aid 近似 mid 用途
    },
    cid: currentPage?.cid || info.cid,
    page: currentPage?.page || parsed.page,
    pages,
  };
}
