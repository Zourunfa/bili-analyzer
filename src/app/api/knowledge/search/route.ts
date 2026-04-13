import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { generateEmbedding, toVectorString } from "@/lib/embedding";

export async function POST(req: Request) {
  try {
    const { query, mode = "fulltext", filters, topK = 10 } = await req.json();

    if (!query) {
      return NextResponse.json({ error: "缺少查询参数" }, { status: 400 });
    }

    let results: Array<{
      id: string;
      type: string;
      content: string;
      timestamp: number | null;
      metadata: unknown;
      videoId: string;
      videoTitle?: string;
      videoBvid?: string;
      score?: number;
    }> = [];

    if (mode === "semantic") {
      // 语义搜索：使用 pgvector 余弦相似度
      const queryEmbedding = await generateEmbedding(query);
      const vectorStr = toVectorString(queryEmbedding);

      // 构建额外 WHERE 条件
      let whereClause = "";
      const params: (string | number)[] = [];

      if (filters?.type) {
        whereClause += " AND kp.type = $1";
        params.push(filters.type);
      }
      if (filters?.notebookId) {
        whereClause += " AND EXISTS (SELECT 1 FROM notebook_videos nv WHERE nv.video_id = kp.video_id AND nv.notebook_id = $2)";
        params.push(filters.notebookId);
      }

      results = await prisma.$queryRawUnsafe(`
        SELECT
          kp.id, kp.type, kp.content, kp.timestamp, kp.metadata, kp.video_id,
          v.title as video_title, v.bvid as video_bvid,
          1 - (e.vector <=> '${vectorStr}'::vector) as score
        FROM knowledge_points kp
        JOIN videos v ON v.id = kp.video_id
        LEFT JOIN embeddings e ON e.knowledge_point_id = kp.id
        WHERE e.id IS NOT NULL ${whereClause}
        ORDER BY e.vector <=> '${vectorStr}'::vector
        LIMIT ${topK}
      `);

      results = results.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        type: r.type as string,
        content: r.content as string,
        timestamp: r.timestamp as number | null,
        metadata: r.metadata,
        videoId: r.video_id as string,
        videoTitle: r.video_title as string,
        videoBvid: r.video_bvid as string,
        score: Number(r.score),
      }));
    } else {
      // 全文搜索：使用 ILIKE
      const where: Record<string, unknown> = {
        content: { contains: query, mode: "insensitive" },
      };
      if (filters?.type) where.type = filters.type;
      if (filters?.videoId) where.videoId = filters.videoId;

      const points = await prisma.knowledgePoint.findMany({
        where,
        take: topK,
        include: { video: { select: { title: true, bvid: true } } },
        orderBy: { createdAt: "desc" },
      });

      results = points.map((p) => ({
        id: p.id,
        type: p.type,
        content: p.content,
        timestamp: p.timestamp,
        metadata: p.metadata,
        videoId: p.videoId,
        videoTitle: p.video.title,
        videoBvid: p.video.bvid,
      }));
    }

    return NextResponse.json({ results });
  } catch (error) {
    console.error("知识检索错误:", error);
    return NextResponse.json({ error: "检索失败" }, { status: 500 });
  }
}
