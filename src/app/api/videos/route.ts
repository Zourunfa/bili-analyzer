import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

function parseDbError(error: unknown): { status: number; message: string } {
  if (error && typeof error === "object") {
    const err = error as {
      code?: string;
      message?: string;
      cause?: { code?: string };
    };
    const code = err.code || err.cause?.code || "";
    const message = err.message || "";

    if (code === "ECONNREFUSED" || message.includes("ECONNREFUSED")) {
      return {
        status: 503,
        message: "数据库连接被拒绝（ECONNREFUSED）。请确认 PostgreSQL 已启动且 DATABASE_URL 正确。",
      };
    }
    if (code === "P1001") {
      return {
        status: 503,
        message: "数据库不可达（P1001）。请检查数据库地址/端口/网络连通性。",
      };
    }
  }

  return { status: 500, message: "保存失败" };
}

// 保存或更新视频信息到数据库
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const { bvid, title, pic, desc, duration, ownerName, ownerMid, cid, subtitleText, subtitleSource, summary } = await req.json();

    if (!bvid || !title) {
      return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
    }

    const video = await prisma.video.upsert({
      where: { bvid },
      update: {
        title,
        pic: pic || null,
        desc: desc || null,
        duration: duration || 0,
        ownerName: ownerName || "",
        ownerMid: ownerMid || "",
        cid: cid ? String(cid) : null,
        subtitleText: subtitleText || "",
        subtitleSource: subtitleSource || "cc",
        ...(summary !== undefined && { summary }),
      },
      create: {
        bvid,
        title,
        pic: pic || null,
        desc: desc || null,
        duration: duration || 0,
        ownerName: ownerName || "",
        ownerMid: ownerMid || "",
        cid: cid ? String(cid) : null,
        subtitleText: subtitleText || "",
        subtitleSource: subtitleSource || "cc",
        summary: summary || null,
      },
    });

    await prisma.userVideo.upsert({
      where: {
        userId_videoId: {
          userId,
          videoId: video.id,
        },
      },
      update: {},
      create: {
        userId,
        videoId: video.id,
      },
    });

    return NextResponse.json({ video });
  } catch (error) {
    console.error("保存视频错误:", error);
    const parsed = parseDbError(error);
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}

// 获取已保存的视频列表（支持分页、搜索、排序）
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const url = new URL(req.url);
    const bvid = url.searchParams.get("bvid");

    // 按 bvid 查单条（保持向后兼容）
    if (bvid) {
      const video = await prisma.video.findFirst({
        where: {
          bvid,
          userVideos: {
            some: { userId },
          },
        },
      });
      return NextResponse.json({ video });
    }

    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") || "12", 10)));
    const keyword = url.searchParams.get("keyword")?.trim() || "";
    const sortParam = url.searchParams.get("sort") || "createdAt_desc";

    const [sortField, sortDir] = sortParam.split("_");
    const allowedFields = ["createdAt", "updatedAt"];
    const orderBy = allowedFields.includes(sortField)
      ? { [sortField]: sortDir === "asc" ? "asc" as const : "desc" as const }
      : { createdAt: "desc" as const };

    const where = keyword
      ? { OR: [{ title: { contains: keyword } }, { ownerName: { contains: keyword } }] }
      : {};

    const userVideoWhere = {
      userId,
      video: where,
    };

    const [rows, total] = await Promise.all([
      prisma.userVideo.findMany({
        where: userVideoWhere,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { video: true },
      }),
      prisma.userVideo.count({ where: userVideoWhere }),
    ]);

    const videos = rows.map((row) => row.video);

    return NextResponse.json({ videos, total, page, pageSize });
  } catch (error) {
    console.error("获取视频列表错误:", error);
    const parsed = parseDbError(error);
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}
