import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

type SearchItem = {
  source: "subtitle" | "knowledge";
  id: string;
  type: string;
  content: string;
  timestamp: number | null;
  metadata: unknown;
  videoId: string;
  videoTitle: string;
  videoBvid: string;
  ownerName?: string;
  score: number | null;
  updatedAt?: string | Date;
};

function toSafePage(input: unknown, fallback: number) {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
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
    const mode = String(body?.mode || "hybrid");
    const page = toSafePage(body?.page, 1);
    const pageSize = Math.min(50, toSafePage(body?.pageSize, 20));
    const filters = (body?.filters || {}) as Record<string, unknown>;

    if (!query) {
      return NextResponse.json({ error: "缺少查询参数" }, { status: 400 });
    }

    const host = new URL(req.url).origin;

    const headers = {
      "Content-Type": "application/json",
      cookie: req.headers.get("cookie") || "",
    };

    const calls: Array<Promise<Response>> = [];
    if (mode === "hybrid" || mode === "subtitle") {
      calls.push(
        fetch(`${host}/api/search/subtitles`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query, page: 1, pageSize, filters }),
        })
      );
    }
    if (mode === "hybrid" || mode === "knowledge" || mode === "semantic") {
      calls.push(
        fetch(`${host}/api/knowledge/search`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            query,
            mode: mode === "semantic" ? "semantic" : "fulltext",
            page: 1,
            pageSize,
            filters,
          }),
        })
      );
    }

    const responses = await Promise.all(calls);
    const payloads = await Promise.all(responses.map((r) => r.json().catch(() => ({}))));
    const allResults: SearchItem[] = payloads.flatMap((p) =>
      Array.isArray(p?.results) ? (p.results as SearchItem[]) : []
    );

    const sorted = allResults.sort((a, b) => {
      const scoreA = a.score ?? 0;
      const scoreB = b.score ?? 0;
      if (scoreA !== scoreB) return scoreB - scoreA;
      const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return timeB - timeA;
    });

    const offset = (page - 1) * pageSize;
    const results = sorted.slice(offset, offset + pageSize);

    return NextResponse.json({
      results,
      total: sorted.length,
      page,
      pageSize,
    });
  } catch (error) {
    console.error("全局检索错误:", error);
    return NextResponse.json({ error: "全局检索失败" }, { status: 500 });
  }
}
