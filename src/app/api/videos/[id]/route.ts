import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const video = await prisma.video.findUnique({ where: { id } });
    if (!video) {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }

    // NotebookVideo、KnowledgePoint、Embedding 都有 onDelete: Cascade，只需删 Video
    await prisma.video.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("删除视频错误:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
