import { SITE_URL } from "@/lib/share";

export const SITE_NAME = "视记 VideoNote";
export const CONTACT_EMAIL = "contact@afai.asia";
export const DEFAULT_OG_IMAGE = `${SITE_URL}/opengraph-image`;

export const HOME_TITLE = "AI 视频转知识笔记工具 - 视频摘要、思维导图与知识库 | 视记 VideoNote";
export const HOME_DESCRIPTION =
  "视记 VideoNote 是 AI 视频转知识笔记工具，支持 B站、抖音、小红书视频摘要、关键词、思维导图和结构化知识点生成，可保存到个人知识库、公开分享视频笔记，并用于课程复习、技术研究、内容分析和 UP 主追踪。";
export const FEATURES_TITLE = "功能介绍 - AI 视频摘要、思维导图与知识库管理 | 视记 VideoNote";
export const FEATURES_DESCRIPTION =
  "了解视记 VideoNote 的核心功能：AI 视频摘要、视频思维导图、知识点抽取、个人知识库、公开视频笔记分享和 Agent Skill 导出。";
export const FAQ_TITLE = "常见问题 - 视频转知识笔记、公开视频分享与 AI 摘要说明 | 视记 VideoNote";
export const FAQ_DESCRIPTION =
  "查看视记 VideoNote 常见问题，了解支持的视频平台、AI 视频摘要生成方式、公开视频笔记权限、知识库保存、导出和使用边界。";

export function absoluteUrl(path = "/") {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function getPublicPageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const url = absoluteUrl(path);
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      type: "website" as const,
      locale: "zh_CN",
      images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      images: [DEFAULT_OG_IMAGE],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export const noindexMetadata = {
  robots: {
    index: false,
    follow: true,
  },
};
