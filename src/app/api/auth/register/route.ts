import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/lib/db";
import { sendVerificationEmail } from "@/lib/email";

// Token 有效期 24 小时
const TOKEN_EXPIRY_HOURS = 24;

/**
 * 生成验证 Token
 */
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

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

    // 创建用户（默认 emailVerified 为 null，表示未验证）
    const user = await prisma.user.create({
      data: { email, password: hashedPassword, name },
    });

    // 生成验证 Token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);

    // 存储 Token
    await prisma.emailVerificationToken.create({
      data: { email, token, expiresAt },
    });

    // 发送验证邮件
    try {
      await sendVerificationEmail(email, name, token);
    } catch (emailError) {
      console.error("发送验证邮件失败:", emailError);
      // 邮件发送失败不影响注册成功，但需要提示用户
      return NextResponse.json({
        id: user.id,
        email: user.email,
        name: user.name,
        emailSent: false,
        message: "注册成功，但验证邮件发送失败，请联系管理员",
      });
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      emailSent: true,
      message: "注册成功，请去邮箱验证您的账号",
    });
  } catch (err) {
    console.error("注册错误:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "注册失败: " + msg }, { status: 500 });
  }
}
