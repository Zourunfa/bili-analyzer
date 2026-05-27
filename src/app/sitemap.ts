import type { MetadataRoute } from "next";
import { connection } from "next/server";
import prisma from "@/lib/db";
import { SITE_URL } from "@/lib/share";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();

  const baseEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/features`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/faq`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date(),
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];

  try {
    const shares = await prisma.sharePage.findMany({
      where: { targetType: "video", visibility: "public" },
      orderBy: { updatedAt: "desc" },
      take: 5000,
      select: {
        shareId: true,
        updatedAt: true,
      },
    });

    return [
      ...baseEntries,
      ...shares.map((share) => ({
        url: `${SITE_URL}/share/videos/${share.shareId}`,
        lastModified: share.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.error("生成 sitemap 分享页失败:", error);
    return baseEntries;
  }
}
