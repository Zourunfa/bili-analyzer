import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import prisma from "@/lib/db";

type Params = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: Request, { params }: Params) {
  const auth = await requireAdminSession();
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    const body = await req.json();

    if (typeof body.emailVerified !== "boolean") {
      return NextResponse.json({ error: "缺少 emailVerified 布尔值" }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { emailVerified: body.emailVerified ? new Date() : null },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ user });
  } catch (error) {
    console.error("后台用户更新失败:", error);
    return NextResponse.json({ error: "更新用户失败" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const auth = await requireAdminSession();
  if (auth.response) return auth.response;

  try {
    const { id } = await params;
    const currentUserId = (auth.session?.user as { id?: string } | undefined)?.id;

    if (id === currentUserId) {
      return NextResponse.json({ error: "不能删除当前登录的管理员账号" }, { status: 400 });
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("后台用户删除失败:", error);
    return NextResponse.json({ error: "删除用户失败" }, { status: 500 });
  }
}
