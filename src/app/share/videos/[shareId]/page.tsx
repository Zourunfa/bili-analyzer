import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import MindMapView from "@/components/MindMapView";
import PublicFooter from "@/components/PublicFooter";
import prisma from "@/lib/db";
import { getVideoShareUrl, makeSeoDescription, SITE_URL } from "@/lib/share";
import { jsonLdScript, SITE_NAME } from "@/lib/seo";
import "./page.css";

type Props = {
  params: Promise<{ shareId: string }>;
};

async function getSharedVideo(shareId: string, increaseView = false) {
  const share = await prisma.sharePage.findUnique({ where: { shareId } });
  if (!share || share.targetType !== "video" || share.visibility !== "public") return null;

  const [video] = await Promise.all([
    prisma.video.findUnique({
      where: { id: share.targetId },
      include: {
        knowledgePoints: {
          orderBy: { createdAt: "asc" },
          take: 24,
        },
      },
    }),
    increaseView
      ? prisma.sharePage.update({
          where: { shareId },
          data: { viewCount: { increment: 1 } },
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  if (!video) return null;
  return { share, video };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareId } = await params;
  const data = await getSharedVideo(shareId);
  if (!data) {
    return {
      title: "分享不存在 - 视记",
      robots: { index: false, follow: false },
    };
  }

  const { share, video } = data;
  const title = `${video.title} 思维导图/笔记 - 视记`;
  const description = makeSeoDescription(video.summary, video.desc || share.description);
  const url = getVideoShareUrl(share.shareId);
  const image = `${SITE_URL}/share/videos/${share.shareId}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "视记 VideoNote",
      type: "article",
      images: [{ url: image, width: 1200, height: 630, alt: video.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

function formatDuration(seconds: number) {
  if (!seconds) return "-";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function getBilibiliUrl(bvid: string) {
  const matched = bvid.match(/^(BV[0-9A-Za-z]+)/)?.[1];
  return matched ? `https://www.bilibili.com/video/${matched}` : "";
}

export default async function SharedVideoPage({ params }: Props) {
  const { shareId } = await params;
  const data = await getSharedVideo(shareId, true);
  if (!data) notFound();

  const { share, video } = data;
  const sourceUrl = getBilibiliUrl(video.bvid);
  const description = makeSeoDescription(video.summary, video.desc || share.description);
  const shareUrl = getVideoShareUrl(share.shareId);
  const coverUrl = video.pic ? (video.pic.startsWith("//") ? `https:${video.pic}` : video.pic) : undefined;
  const updatedDate = share.updatedAt.toISOString();
  const createdDate = share.createdAt.toISOString();
  const authorName = video.ownerName || "视频创作者";
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: `${video.title} 思维导图/笔记`,
      description,
      image: coverUrl ? [coverUrl] : undefined,
      url: shareUrl,
      datePublished: createdDate,
      dateModified: updatedDate,
      author: {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
      },
      publisher: {
        "@type": "Organization",
        name: SITE_NAME,
        url: SITE_URL,
      },
      about: video.title,
    },
    {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: video.title,
      description,
      thumbnailUrl: coverUrl ? [coverUrl] : undefined,
      uploadDate: createdDate,
      duration: video.duration ? `PT${video.duration}S` : undefined,
      embedUrl: sourceUrl || undefined,
      author: {
        "@type": "Person",
        name: authorName,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "首页",
          item: SITE_URL,
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "公开视频笔记",
          item: shareUrl,
        },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <main className="share-page">
        <section className="share-hero">
          <div className="share-hero-copy">
            <div className="share-kicker">公开视频笔记 · 视记</div>
            <h1>{video.title}</h1>
            <p>{description}</p>
            <div className="share-meta">
              <span>{video.ownerName || "原视频创作者未知"}</span>
              <span>{formatDuration(video.duration)}</span>
              <span>{share.viewCount + 1} 次浏览</span>
              <span>更新于 {share.updatedAt.toLocaleDateString("zh-CN")}</span>
            </div>
            <div className="share-attribution">
              由视记 AI 根据视频字幕与描述生成，重要信息建议回到原视频核对。
            </div>
            <div className="share-actions">
              {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">查看原视频</a> : null}
              <Link href="/">用视记分析视频</Link>
              <Link href="/about">了解视记</Link>
            </div>
          </div>
          {coverUrl ? (
            <img className="share-cover" src={coverUrl} alt={`${video.title} 封面`} />
          ) : null}
        </section>

        <section className="share-section">
          <div className="share-section-heading">
            <span>AI 摘要</span>
            <h2>视频重点速览</h2>
          </div>
          <article
            className="share-markdown"
            dangerouslySetInnerHTML={{ __html: marked.parse((video.summary || "暂无摘要").replace(/<br\s*\/?>/gi, "\n")) }}
          />
        </section>

        <section className="share-section share-mindmap-section">
          <div className="share-section-heading">
            <span>Mind Map</span>
            <h2>思维导图</h2>
          </div>
          <div className="share-mindmap">
            <MindMapView markdown={video.summary || video.title} watermarkUrl={shareUrl} exportFileName={`${video.title}-视记思维导图.png`} />
          </div>
        </section>

        <section className="share-section">
          <div className="share-section-heading">
            <span>Knowledge</span>
            <h2>结构化知识点</h2>
          </div>
          {video.knowledgePoints.length ? (
            <div className="knowledge-grid">
              {video.knowledgePoints.map((point) => (
                <div key={point.id} className="knowledge-card">
                  <span>{point.type}</span>
                  <p>{point.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="share-empty">暂无结构化知识点。</p>
          )}
        </section>

        <section className="share-cta">
          <h2>把视频变成可搜索、可分享的知识页</h2>
          <Link href="/">开始使用视记</Link>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
