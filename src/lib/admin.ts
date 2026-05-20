import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

type SessionUser = {
  id?: string;
  email?: string | null;
};

function getAdminEmails() {
  return (process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email?: string | null) {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

export async function requireAdminSession() {
  const session = await getServerSession(authOptions);
  const user = session?.user as SessionUser | undefined;

  if (!user?.id) {
    return {
      session: null,
      response: NextResponse.json({ error: "请先登录" }, { status: 401 }),
    };
  }

  if (!isAdminEmail(user.email)) {
    return {
      session: null,
      response: NextResponse.json({ error: "没有后台管理权限" }, { status: 403 }),
    };
  }

  return { session, response: null };
}
