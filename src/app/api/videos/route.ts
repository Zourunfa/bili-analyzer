import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// 保存或更新视频信息到数据库
export async function POST(req: Request) {
  try {
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

    return NextResponse.json({ video });
  } catch (error) {
    console.error("保存视频错误:", error);
    return NextResponse.json({ error: "保存失败" }, { status: 500 });
  }
}

// 获取已保存的视频列表（支持分页、搜索、排序）
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const bvid = url.searchParams.get("bvid");

    // 按 bvid 查单条（保持向后兼容）
    if (bvid) {
      const video = await prisma.video.findUnique({ where: { bvid } });
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

    const [videos, total] = await Promise.all([
      prisma.video.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.video.count({ where }),
    ]);

    return NextResponse.json({ videos, total, page, pageSize });
  } catch (error) {
    console.error("获取视频列表错误:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}
