import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { buildSmartNotebookVideoWhere, normalizeSmartNotebookRule } from "@/lib/notebook-rules";
import { Prisma } from "@/generated/prisma/client";
import { ensureKnowledgeWorkflowSchema, parseKnowledgeSchemaError } from "@/lib/knowledge-schema";

// 获取笔记本列表
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    await ensureKnowledgeWorkflowSchema();

    const userId = (session.user as { id?: string }).id;
    const notebooks = await prisma.notebook.findMany({
      where: { userId },
      include: {
        _count: { select: { videos: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const result = await Promise.all(
      notebooks.map(async (nb) => {
        if (nb.mode !== "smart") return nb;
        const smartCount = await prisma.video.count({
          where: buildSmartNotebookVideoWhere(userId!, nb.rule),
        });
        return {
          ...nb,
          videoCount: smartCount,
        };
      })
    );

    return NextResponse.json({ notebooks: result });
  } catch (error) {
    console.error("获取笔记本列表错误:", error);
    const parsed = parseKnowledgeSchemaError(error, "获取失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}

// 创建笔记本
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    await ensureKnowledgeWorkflowSchema();

    const userId = (session.user as { id?: string }).id;
    const { title, description, tags, mode, rule } = await req.json();

    if (!title) {
      return NextResponse.json({ error: "请输入笔记本标题" }, { status: 400 });
    }

    const normalizedMode = typeof mode === "string" ? mode : "manual";
    if (!["manual", "smart"].includes(normalizedMode)) {
      return NextResponse.json({ error: "mode 仅支持 manual 或 smart" }, { status: 400 });
    }

    const normalizedTags = Array.isArray(tags)
      ? tags.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const normalizedRule = normalizedMode === "smart" ? normalizeSmartNotebookRule(rule) : Prisma.DbNull;

    const notebook = await prisma.notebook.create({
      data: {
        userId: userId!,
        title,
        description: description || null,
        tags: normalizedTags,
        mode: normalizedMode,
        rule: normalizedRule,
      },
    });

    return NextResponse.json({ notebook });
  } catch (error) {
    console.error("创建笔记本错误:", error);
    const parsed = parseKnowledgeSchemaError(error, "创建失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}
