import type { Metadata } from "next";
import { connection } from "next/server";
import PublicFooter from "@/components/PublicFooter";
import HomeClient, { type RecentPublicNote } from "@/components/HomeClient";
import prisma from "@/lib/db";
import { publicFaqItems, workflowSteps } from "@/lib/public-content";
import { getVideoShareUrl } from "@/lib/share";
import { absoluteUrl, CONTACT_EMAIL, getPublicPageMetadata, HOME_DESCRIPTION, HOME_TITLE, jsonLdScript, SITE_NAME } from "@/lib/seo";

export const metadata: Metadata = {
  ...getPublicPageMetadata({
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    path: "/",
  }),
  title: { absolute: HOME_TITLE },
};

async function getRecentPublicNotes(): Promise<RecentPublicNote[]> {
  await connection();

  try {
    const shares = await prisma.sharePage.findMany({
      where: { targetType: "video", visibility: "public" },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: {
        shareId: true,
        targetId: true,
        title: true,
        description: true,
        updatedAt: true,
        viewCount: true,
      },
    });

    const videos = await prisma.video.findMany({
      where: { id: { in: shares.map((share) => share.targetId) } },
      select: {
        id: true,
        title: true,
        summary: true,
        pic: true,
        ownerName: true,
      },
    });
    const videoById = new Map(videos.map((video) => [video.id, video]));

    return shares
      .map((share) => {
        const video = videoById.get(share.targetId);
        if (!video) return null;
        return {
          title: video.title || share.title,
          description: video.summary || share.description || "公开视频知识笔记",
          url: getVideoShareUrl(share.shareId),
          coverImage: video.pic,
          ownerName: video.ownerName,
          updatedAt: share.updatedAt.toISOString(),
          viewCount: share.viewCount,
        };
      })
      .filter((note): note is RecentPublicNote => Boolean(note));
  } catch (error) {
    console.error("读取最新公开笔记失败:", error);
    return [];
  }
}

export default async function Home() {
  const recentNotes = await getRecentPublicNotes();
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
    {
      "@type": "Organization",
      "@id": absoluteUrl("/#organization"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      email: CONTACT_EMAIL,
      contactPoint: {
        "@type": "ContactPoint",
        email: CONTACT_EMAIL,
        contactType: "customer support",
        availableLanguage: ["zh-CN"],
      },
    },
    {
      "@type": "WebSite",
      "@id": absoluteUrl("/#website"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      description: HOME_DESCRIPTION,
      publisher: { "@id": absoluteUrl("/#organization") },
      inLanguage: "zh-CN",
    },
    {
      "@type": "SoftwareApplication",
      "@id": absoluteUrl("/#software"),
      name: SITE_NAME,
      url: absoluteUrl("/"),
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      description: HOME_DESCRIPTION,
      publisher: { "@id": absoluteUrl("/#organization") },
      featureList: [
        "AI 视频摘要",
        "视频思维导图",
        "结构化知识点抽取",
        "个人知识库管理",
        "公开视频笔记分享",
        "Agent Skill 导出",
      ],
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "CNY",
      },
    },
    {
      "@type": "HowTo",
      "@id": absoluteUrl("/#howto"),
      name: "如何把视频转成知识笔记",
      description: "使用视记 VideoNote 将视频链接转化为 AI 摘要、思维导图和可检索知识点。",
      step: workflowSteps.map((step, index) => ({
        "@type": "HowToStep",
        position: index + 1,
        name: step.name,
        text: step.text,
      })),
    },
    {
      "@type": "FAQPage",
      "@id": absoluteUrl("/#faq"),
      mainEntity: publicFaqItems.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
    {
      "@type": "BreadcrumbList",
      "@id": absoluteUrl("/#breadcrumb"),
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "首页",
          item: absoluteUrl("/"),
        },
      ],
    },
  ]};

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <HomeClient recentNotes={recentNotes} faqItems={publicFaqItems} />
      <PublicFooter />
    </>
  );
}
