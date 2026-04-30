import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { ensureKnowledgeWorkflowSchema, parseKnowledgeSchemaError } from "@/lib/knowledge-schema";

async function getAuthedNote(userId: string, bvid: string, noteId: string) {
  return prisma.videoTimestampNote.findFirst({
    where: {
      id: noteId,
      userId,
      video: {
        bvid,
        userVideos: {
          some: { userId },
        },
      },
    },
    select: { id: true },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureKnowledgeWorkflowSchema();

    const { id: bvid, noteId } = await params;
    const target = await getAuthedNote(userId, bvid, noteId);
    if (!target) return NextResponse.json({ error: "笔记不存在或无权限" }, { status: 404 });

    const body = await req.json();
    const data: { content?: string; sourceText?: string | null; timestampSec?: number } = {};

    if (body?.content !== undefined) {
      const content = String(body.content || "").trim();
      if (!content) return NextResponse.json({ error: "笔记内容不能为空" }, { status: 400 });
      data.content = content;
    }

    if (body?.sourceText !== undefined) {
      data.sourceText = typeof body.sourceText === "string" ? body.sourceText.trim() : null;
    }

    if (body?.timestampSec !== undefined) {
      const ts = Number(body.timestampSec);
      if (!Number.isFinite(ts) || ts < 0) {
        return NextResponse.json({ error: "timestampSec 必须是非负数字" }, { status: 400 });
      }
      data.timestampSec = Math.floor(ts);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "缺少可更新字段" }, { status: 400 });
    }

    const note = await prisma.videoTimestampNote.update({
      where: { id: noteId },
      data,
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error("更新时间戳笔记失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "更新时间戳笔记失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    await ensureKnowledgeWorkflowSchema();

    const { id: bvid, noteId } = await params;
    const target = await getAuthedNote(userId, bvid, noteId);
    if (!target) return NextResponse.json({ error: "笔记不存在或无权限" }, { status: 404 });

    await prisma.videoTimestampNote.delete({ where: { id: noteId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除时间戳笔记失败:", error);
    const parsed = parseKnowledgeSchemaError(error, "删除时间戳笔记失败");
    return NextResponse.json({ error: parsed.message }, { status: parsed.status });
  }
}
