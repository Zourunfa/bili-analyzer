import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";

// TODO: 临时禁用邮箱验证，后续服务器部署后启用
// import crypto from "crypto";
// import { sendVerificationEmail } from "@/lib/email";
// const TOKEN_EXPIRY_HOURS = 24;
// function generateToken(): string { return crypto.randomBytes(32).toString("hex"); }

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "请填写所有必填字段" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "密码至少6位" }, { status: 400 });
    }

    // 校验邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "该邮箱已注册" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户（邮箱验证暂不启用）
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });

    // TODO: 邮箱验证功能暂禁用，后续启用
    // // 生成验证 Token
    // const token = generateToken();
    // const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);
    // await prisma.emailVerificationToken.create({
    //   data: { email, token, expiresAt },
    // });
    // // 发送验证邮件
    // try {
    //   await sendVerificationEmail(email, name, token);
    // } catch (emailError) {
    //   console.error("发送验证邮件失败:", emailError);
    // }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      message: "注册成功",
    });
  } catch (err) {
    console.error("注册错误:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "注册失败: " + msg }, { status: 500 });
  }
}
