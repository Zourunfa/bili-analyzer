import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

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

    const { id } = await params;
    const notebook = await prisma.notebook.findUnique({
      where: { id },
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
                summary: true,
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

    return NextResponse.json({ notebook });
  } catch (error) {
    console.error("获取笔记本详情错误:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
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

    const { id } = await params;
    const { title, description, tags } = await req.json();

    const notebook = await prisma.notebook.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(tags !== undefined && { tags }),
      },
    });

    return NextResponse.json({ notebook });
  } catch (error) {
    console.error("更新笔记本错误:", error);
    return NextResponse.json({ error: "更新失败" }, { status: 500 });
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

    const { id } = await params;
    await prisma.notebook.delete({ where: { id } });

    return NextResponse.json({ message: "删除成功" });
  } catch (error) {
    console.error("删除笔记本错误:", error);
    return NextResponse.json({ error: "删除失败" }, { status: 500 });
  }
}
