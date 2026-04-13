import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

// 获取笔记本列表
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    const notebooks = await prisma.notebook.findMany({
      where: { userId },
      include: {
        _count: { select: { videos: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ notebooks });
  } catch (error) {
    console.error("获取笔记本列表错误:", error);
    return NextResponse.json({ error: "获取失败" }, { status: 500 });
  }
}

// 创建笔记本
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const userId = (session.user as { id?: string }).id;
    const { title, description, tags } = await req.json();

    if (!title) {
      return NextResponse.json({ error: "请输入笔记本标题" }, { status: 400 });
    }

    const notebook = await prisma.notebook.create({
      data: {
        userId: userId!,
        title,
        description: description || null,
        tags: tags || [],
      },
    });

    return NextResponse.json({ notebook });
  } catch (error) {
    console.error("创建笔记本错误:", error);
    return NextResponse.json({ error: "创建失败" }, { status: 500 });
  }
}
