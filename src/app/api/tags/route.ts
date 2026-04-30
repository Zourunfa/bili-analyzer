import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { ensureKnowledgeWorkflowSchema, parseKnowledgeSchemaError } from "@/lib/knowledge-schema";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureKnowledgeWorkflowSchema();

    const tags = await prisma.videoTag.findMany({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        _count: {
          select: { videoTags: true },
        },
      },
    });

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("获取标签失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "获取标签失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureKnowledgeWorkflowSchema();

    const body = await req.json();
    const name = String(body?.name || "").trim();
    const color = typeof body?.color === "string" ? body.color.trim() : null;

    if (!name) {
      return NextResponse.json({ error: "标签名不能为空" }, { status: 400 });
    }

    const tag = await prisma.videoTag.create({
      data: {
        userId,
        name,
        color,
      },
    });

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    console.error("创建标签失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "创建标签失败，标签名可能已存在");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}
