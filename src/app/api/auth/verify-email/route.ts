import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    const email = searchParams.get("email");

    if (!token || !email) {
      return NextResponse.json(
        { error: "缺少必要参数" },
        { status: 400 }
      );
    }

    // 查找 Token
    const verificationToken = await prisma.emailVerificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return NextResponse.json(
        { error: "验证链接无效或已过期" },
        { status: 400 }
      );
    }

    // 校验邮箱匹配
    if (verificationToken.email !== email) {
      return NextResponse.json(
        { error: "邮箱地址不匹配" },
        { status: 400 }
      );
    }

    // 校验过期
    if (verificationToken.expiresAt < new Date()) {
      // 删除过期 Token
      await prisma.emailVerificationToken.delete({
        where: { token },
      });
      return NextResponse.json(
        { error: "验证链接已过期，请重新注册" },
        { status: 400 }
      );
    }

    // 更新用户邮箱验证状态
    await prisma.user.update({
      where: { email },
      data: { emailVerified: new Date() },
    });

    // 删除已使用的 Token
    await prisma.emailVerificationToken.delete({
      where: { token },
    });

    return NextResponse.json({
      success: true,
      message: "邮箱验证成功！您现在可以正常使用视记了。",
    });
  } catch (err) {
    console.error("验证邮箱错误:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "验证失败: " + msg },
      { status: 500 }
    );
  }
}
