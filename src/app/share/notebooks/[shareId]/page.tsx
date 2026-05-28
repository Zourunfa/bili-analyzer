import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import PublicFooter from "@/components/PublicFooter";
import prisma from "@/lib/db";
import { getNotebookShareUrl, makeSeoDescription, SITE_URL } from "@/lib/share";
import { jsonLdScript, SITE_NAME } from "@/lib/seo";
import "./page.css";

type Props = {
  params: Promise<{ shareId: string }>;
};

async function getSharedNotebook(shareId: string, increaseView = false) {
  const share = await prisma.sharePage.findUnique({ where: { shareId } });
  if (!share || share.targetType !== "notebook" || share.visibility !== "public") return null;

  const [notebook] = await Promise.all([
    prisma.notebook.findUnique({
      where: { id: share.targetId },
      include: {
        videos: {
          orderBy: { order: "asc" },
          include: {
            video: {
              select: {
                id: true,
                bvid: true,
                title: true,
                pic: true,
                desc: true,
                duration: true,
                ownerName: true,
                summary: true,
                knowledgePoints: {
                  orderBy: { createdAt: "asc" },
                  take: 12,
                },
              },
            },
          },
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

  if (!notebook || notebook.mode !== "manual") return null;
  return { share, notebook };
}

function normalizeImageUrl(url?: string | null) {
  if (!url) return undefined;
  return url.startsWith("//") ? `https:${url}` : url;
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

function getNotebookDescription(data: Awaited<ReturnType<typeof getSharedNotebook>>) {
  if (!data) return "";
  const firstVideo = data.notebook.videos[0]?.video;
  return makeSeoDescription(data.notebook.description || data.share.description || firstVideo?.summary, firstVideo?.desc);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { shareId } = await params;
  const data = await getSharedNotebook(shareId);
  if (!data) {
    return {
      title: "分享不存在 - 视记",
      robots: { index: false, follow: false },
    };
  }

  const { share, notebook } = data;
  const title = `${notebook.title} 视频知识笔记合集 - 视记`;
  const description = getNotebookDescription(data);
  const url = getNotebookShareUrl(share.shareId);
  const cover = normalizeImageUrl(share.coverImage || notebook.coverImage || notebook.videos[0]?.video.pic);
  const image = cover || `${SITE_URL}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "视记 VideoNote",
      type: "website",
      images: [{ url: image, width: 1200, height: 630, alt: notebook.title }],
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

export default async function SharedNotebookPage({ params }: Props) {
  const { shareId } = await params;
  const data = await getSharedNotebook(shareId, true);
  if (!data) notFound();

  const { share, notebook } = data;
  const shareUrl = getNotebookShareUrl(share.shareId);
  const description = getNotebookDescription(data);
  const coverUrl = normalizeImageUrl(share.coverImage || notebook.coverImage || notebook.videos[0]?.video.pic);
  const updatedDate = share.updatedAt.toISOString();
  const createdDate = share.createdAt.toISOString();
  const totalKnowledgePoints = notebook.videos.reduce((sum, item) => sum + item.video.knowledgePoints.length, 0);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `${notebook.title} 视频知识笔记合集`,
      description,
      url: shareUrl,
      image: coverUrl ? [coverUrl] : undefined,
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
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${notebook.title} 视频列表`,
      itemListElement: notebook.videos.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.video.title,
        url: getBilibiliUrl(item.video.bvid) || shareUrl,
      })),
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
          name: "公开笔记本",
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
      <main className="notebook-share-page">
        <aside className="notebook-share-sidebar">
          <div className="notebook-sidebar-head">
            <div className="notebook-share-kicker">公开笔记本</div>
            <h1>{notebook.title}</h1>
            <p>{description}</p>
            <div className="notebook-share-meta">
              <span>{notebook.videos.length} 个视频</span>
              <span>{totalKnowledgePoints} 个知识点</span>
              <span>{share.viewCount + 1} 次浏览</span>
            </div>
            {notebook.tags.length ? (
              <div className="notebook-share-tags">
                {notebook.tags.map((tag) => <span key={tag}>{tag}</span>)}
              </div>
            ) : null}
          </div>

          <div className="notebook-sidebar-search">视频列表</div>
          <nav className="notebook-video-nav" aria-label="笔记本视频列表">
            {notebook.videos.map((item, index) => {
              const videoCover = normalizeImageUrl(item.video.pic);
              return (
                <a key={item.id} href={`#video-${item.video.id}`} className="notebook-video-nav-item">
                  {videoCover ? <img src={videoCover} alt="" /> : <span className="notebook-video-nav-fallback">{index + 1}</span>}
                  <span>
                    <strong>{item.video.title}</strong>
                    <small>{item.video.ownerName || "原视频创作者未知"} · {formatDuration(item.video.duration)}</small>
                  </span>
                </a>
              );
            })}
          </nav>

          <div className="notebook-sidebar-actions">
            <Link href="/">用视记分析视频</Link>
            <Link href="/features">查看功能</Link>
          </div>
        </aside>

        <section className="notebook-share-content">
          <header className="notebook-content-header">
            <div>
              <div className="notebook-share-kicker">Analysis</div>
              <h2>笔记本解析内容</h2>
            </div>
            <div className="notebook-share-attribution">
              本页由视记 AI 根据笔记本内公开视频解析结果生成，不包含用户私有笔记、聊天历史或完整字幕。更新于 {share.updatedAt.toLocaleDateString("zh-CN")}。
            </div>
          </header>

          <div className="notebook-analysis-stack">
            {notebook.videos.map((item, index) => {
              const sourceUrl = getBilibiliUrl(item.video.bvid);
              return (
              <article key={item.id} id={`video-${item.video.id}`} className="notebook-analysis-card">
                <div className="notebook-analysis-card-header">
                  <span>#{index + 1} · {item.video.ownerName || "视频创作者"} · {formatDuration(item.video.duration)}</span>
                  <h3>{item.video.title}</h3>
                  {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">查看原视频</a> : null}
                </div>
                <div
                  className="notebook-summary"
                  dangerouslySetInnerHTML={{ __html: marked.parse((item.video.summary || "暂无摘要").replace(/<br\s*\/?>/gi, "\n")) }}
                />
                {item.video.knowledgePoints.length ? (
                  <div className="notebook-knowledge-grid">
                    {item.video.knowledgePoints.map((point) => (
                      <div key={point.id} className="notebook-knowledge-card">
                        <span>{point.type}</span>
                        <p>{point.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="notebook-share-empty">暂无结构化知识点。</p>
                )}
              </article>
            );
            })}
          </div>

        </section>
      </main>
      <PublicFooter />
    </>
  );
}
