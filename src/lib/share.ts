export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXTAUTH_URL || "https://www.afai.asia").replace(/\/$/, "");

export function createShareId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function getVideoShareUrl(shareId: string) {
  return `${SITE_URL}/share/videos/${shareId}`;
}

export function getNotebookShareUrl(shareId: string) {
  return `${SITE_URL}/share/notebooks/${shareId}`;
}

export function makeSeoDescription(summary?: string | null, fallback?: string | null) {
  const raw = (summary || fallback || "用视记将视频转化为可检索、可对话、可分享的结构化知识。")
    .replace(/[#>*_`[\]()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return raw.length > 160 ? `${raw.slice(0, 157)}...` : raw;
}
