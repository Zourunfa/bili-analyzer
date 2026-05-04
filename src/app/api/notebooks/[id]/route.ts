import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { buildSmartNotebookVideoWhere, normalizeSmartNotebookRule } from "@/lib/notebook-rules";
import { Prisma } from "@/generated/prisma/client";
import { ensureKnowledgeWorkflowSchema, parseKnowledgeSchemaError } from "@/lib/knowledge-schema";

// 获取笔记本详情
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    await ensureKnowledgeWorkflowSchema();
    const userId = (session.user as { id?: string }).id;

    const { id } = await params;
    const notebook = await prisma.notebook.findFirst({
      where: { id, userId },
      include: {
        videos: {
          include: {
            video: {
              select: {
                id: true,
                bvid: true,
                title: true,
                pic: true,
                ownerName: true,
                duration: true,
                subtitleText: true,
                subtitleSource: true,
                summary: true,
                createdAt: true,
              },
            },
          },
          orderBy: { order: "asc" },
        },
        _count: { select: { videos: true } },
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: "笔记本不存在" }, { status: 404 });
    }

    if (notebook.mode !== "smart") {
      return NextResponse.json({ notebook });
    }

    const smartVideos = await prisma.video.findMany({
      where: buildSmartNotebookVideoWhere(userId!, notebook.rule),
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        bvid: true,
        title: true,
        pic: true,
        ownerName: true,
        duration: true,
        subtitleText: true,
        subtitleSource: true,
        summary: true,
        createdAt: true,
      },
      take: 200,
    });

    const smartNotebook = {
      ...notebook,
      videoCount: smartVideos.length,
      videos: smartVideos.map((video, idx) => ({
        id: `smart-${video.id}`,
        notes: null,
        order: idx + 1,
        video,
      })),
      _count: {
        videos: smartVideos.length,
      },
    };

    return NextResponse.json({ notebook: smartNotebook });
  } catch (error) {
    console.error("获取笔记本详情错误:", error);
    const parsed = parseKnowledgeSchemaError(error, "获取失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}

// 更新笔记本
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    await ensureKnowledgeWorkflowSchema();
    const userId = (session.user as { id?: string }).id;

    const { id } = await params;
    const { title, description, tags, mode, rule } = await req.json();
    const data: Prisma.NotebookUpdateInput = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (tags !== undefined) {
      data.tags = Array.isArray(tags)
        ? tags.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
    }

    if (mode !== undefined) {
      if (typeof mode !== "string" || !["manual", "smart"].includes(mode)) {
        return NextResponse.json({ error: "mode 仅支持 manual 或 smart" }, { status: 400 });
      }
      data.mode = mode;
      data.rule = mode === "smart" ? normalizeSmartNotebookRule(rule) : Prisma.DbNull;
    } else if (rule !== undefined) {
      data.rule = normalizeSmartNotebookRule(rule);
    }

    const owned = await prisma.notebook.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "笔记本不存在" }, { status: 404 });

    const notebook = await prisma.notebook.update({
      where: { id },
      data,
    });

    return NextResponse.json({ notebook });
  } catch (error) {
    console.error("更新笔记本错误:", error);
    const parsed = parseKnowledgeSchemaError(error, "更新失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}

// 删除笔记本
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    await ensureKnowledgeWorkflowSchema();
    const userId = (session.user as { id?: string }).id;

    const { id } = await params;
    const owned = await prisma.notebook.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!owned) return NextResponse.json({ error: "笔记本不存在" }, { status: 404 });

    await prisma.notebook.delete({ where: { id } });

    return NextResponse.json({ message: "删除成功" });
  } catch (error) {
    console.error("删除笔记本错误:", error);
    const parsed = parseKnowledgeSchemaError(error, "删除失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}
