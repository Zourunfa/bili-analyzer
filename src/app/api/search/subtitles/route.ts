import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

function toSafePage(input: unknown, fallback: number) {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function getSnippet(text: string, query: string, length = 140): string {
  const normalized = text || "";
  const idx = normalized.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return normalized.slice(0, length);
  const start = Math.max(0, idx - Math.floor(length / 3));
  const end = Math.min(normalized.length, start + length);
  return normalized.slice(start, end);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const body = await req.json();
    const query = String(body?.query || "").trim();
    const page = toSafePage(body?.page, 1);
    const pageSize = Math.min(50, toSafePage(body?.pageSize, 20));
    const offset = (page - 1) * pageSize;
    const filters = (body?.filters || {}) as Record<string, unknown>;

    if (!query) {
      return NextResponse.json({ error: "缺少查询参数" }, { status: 400 });
    }

    const andFilters: Record<string, unknown>[] = [
      {
        userVideos: {
          some: { userId },
        },
      },
      {
        subtitleText: {
          contains: query,
          mode: "insensitive",
        },
      },
    ];

    if (typeof filters?.ownerName === "string" && filters.ownerName.trim()) {
      andFilters.push({
        ownerName: {
          contains: filters.ownerName.trim(),
          mode: "insensitive",
        },
      });
    }

    if (Array.isArray(filters?.tagIds)) {
      const tagIds = filters.tagIds.filter(
        (v): v is string => typeof v === "string" && v.trim().length > 0
      );
      for (const tagId of tagIds) {
        andFilters.push({
          tagRelations: {
            some: {
              userId,
              tagId,
            },
          },
        });
      }
    }

    const where = { AND: andFilters };
    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: offset,
        take: pageSize,
        select: {
          id: true,
          bvid: true,
          title: true,
          ownerName: true,
          subtitleText: true,
          updatedAt: true,
        },
      }),
      prisma.video.count({ where }),
    ]);

    const results = videos.map((video) => ({
      source: "subtitle",
      id: `subtitle-${video.id}`,
      type: "subtitle",
      content: getSnippet(video.subtitleText, query),
      timestamp: null,
      metadata: null,
      videoId: video.id,
      videoTitle: video.title,
      videoBvid: video.bvid,
      ownerName: video.ownerName,
      score: null,
      updatedAt: video.updatedAt,
    }));

    return NextResponse.json({ results, total, page, pageSize });
  } catch (error) {
    console.error("字幕检索错误:", error);
    return NextResponse.json({ error: "字幕检索失败" }, { status: 500 });
  }
}

