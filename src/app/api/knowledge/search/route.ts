import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { generateEmbedding, toVectorString } from "@/lib/embedding";

type SearchMode = "fulltext" | "semantic";

function toSafePage(input: unknown, fallback: number) {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

function buildTagAndConditions(userId: string, tagIds?: unknown): Record<string, unknown>[] {
  if (!Array.isArray(tagIds) || tagIds.length === 0) return [];
  const ids = tagIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
  return ids.map((tagId) => ({
    video: {
      tagRelations: {
        some: {
          userId,
          tagId,
        },
      },
    },
  }));
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
    const mode = (body?.mode || "fulltext") as SearchMode;
    const filters = (body?.filters || {}) as Record<string, unknown>;
    const page = toSafePage(body?.page, 1);
    const pageSize = Math.min(50, toSafePage(body?.pageSize ?? body?.topK, 20));
    const offset = (page - 1) * pageSize;

    if (!query) {
      return NextResponse.json({ error: "缺少查询参数" }, { status: 400 });
    }

    if (mode === "semantic") {
      const queryEmbedding = await generateEmbedding(query);
      const vectorStr = toVectorString(queryEmbedding);
      const params: Array<string | number> = [userId];

      let whereSql = "WHERE uv.user_id = $1 AND e.id IS NOT NULL";

      if (typeof filters?.type === "string" && filters.type.trim()) {
        params.push(filters.type.trim());
        whereSql += ` AND kp.type = $${params.length}`;
      }

      if (typeof filters?.videoId === "string" && filters.videoId.trim()) {
        params.push(filters.videoId.trim());
        whereSql += ` AND kp.video_id = $${params.length}`;
      }

      if (Array.isArray(filters?.tagIds)) {
        const tagIds = filters.tagIds.filter(
          (v): v is string => typeof v === "string" && v.trim().length > 0
        );
        for (const tagId of tagIds) {
          params.push(tagId);
          whereSql += ` AND EXISTS (
            SELECT 1 FROM video_tag_relations vtr
            WHERE vtr.video_id = kp.video_id
              AND vtr.user_id = $1
              AND vtr.tag_id = $${params.length}
          )`;
        }
      }

      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(`
        SELECT
          kp.id,
          kp.type,
          kp.content,
          kp.timestamp,
          kp.metadata,
          kp.video_id,
          v.title AS video_title,
          v.bvid AS video_bvid,
          1 - (e.vector <=> '${vectorStr}'::vector) AS score
        FROM knowledge_points kp
        JOIN videos v ON v.id = kp.video_id
        JOIN user_videos uv ON uv.video_id = kp.video_id
        LEFT JOIN embeddings e ON e.knowledge_point_id = kp.id
        ${whereSql}
        ORDER BY e.vector <=> '${vectorStr}'::vector
        LIMIT ${pageSize}
        OFFSET ${offset}
      `, ...params);

      const results = rows.map((r) => ({
        source: "knowledge",
        id: String(r.id),
        type: String(r.type),
        content: String(r.content),
        timestamp: (r.timestamp as number | null) ?? null,
        metadata: r.metadata ?? null,
        videoId: String(r.video_id),
        videoTitle: String(r.video_title || ""),
        videoBvid: String(r.video_bvid || ""),
        score: Number(r.score || 0),
      }));

      return NextResponse.json({ results, page, pageSize });
    }

    const andFilters: Record<string, unknown>[] = [
      { content: { contains: query, mode: "insensitive" } },
      {
        video: {
          userVideos: {
            some: { userId },
          },
        },
      },
      ...buildTagAndConditions(userId, filters?.tagIds),
    ];

    if (typeof filters?.type === "string" && filters.type.trim()) {
      andFilters.push({ type: filters.type.trim() });
    }
    if (typeof filters?.videoId === "string" && filters.videoId.trim()) {
      andFilters.push({ videoId: filters.videoId.trim() });
    }

    const where = { AND: andFilters };
    const [points, total] = await Promise.all([
      prisma.knowledgePoint.findMany({
        where,
        take: pageSize,
        skip: offset,
        include: { video: { select: { title: true, bvid: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.knowledgePoint.count({ where }),
    ]);

    const results = points.map((p) => ({
      source: "knowledge",
      id: p.id,
      type: p.type,
      content: p.content,
      timestamp: p.timestamp,
      metadata: p.metadata,
      videoId: p.videoId,
      videoTitle: p.video.title,
      videoBvid: p.video.bvid,
      score: null,
    }));

    return NextResponse.json({ results, total, page, pageSize });
  } catch (error) {
    console.error("知识检索错误:", error);
    return NextResponse.json({ error: "检索失败" }, { status: 500 });
  }
}

