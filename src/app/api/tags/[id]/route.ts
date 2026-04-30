import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { ensureKnowledgeWorkflowSchema, parseKnowledgeSchemaError } from "@/lib/knowledge-schema";

async function getOwnedTag(userId: string, id: string) {
  return prisma.videoTag.findFirst({
    where: {
      id,
      userId,
    },
    select: { id: true },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureKnowledgeWorkflowSchema();

    const { id } = await params;
    const tag = await getOwnedTag(userId, id);
    if (!tag) return NextResponse.json({ error: "标签不存在" }, { status: 404 });

    const body = await req.json();
    const data: { name?: string; color?: string | null } = {};
    if (body?.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) return NextResponse.json({ error: "标签名不能为空" }, { status: 400 });
      data.name = name;
    }
    if (body?.color !== undefined) {
      data.color = typeof body.color === "string" ? body.color.trim() : null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "缺少可更新字段" }, { status: 400 });
    }

    const updated = await prisma.videoTag.update({
      where: { id },
      data,
    });

    return NextResponse.json({ tag: updated });
  } catch (error) {
    console.error("更新标签失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "更新标签失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureKnowledgeWorkflowSchema();

    const { id } = await params;
    const tag = await getOwnedTag(userId, id);
    if (!tag) return NextResponse.json({ error: "标签不存在" }, { status: 404 });

    await prisma.videoTag.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除标签失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "删除标签失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}
