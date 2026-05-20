import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { isAdminEmail } from "@/lib/admin";

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;

  return NextResponse.json({
    isAdmin: isAdminEmail(email),
  });
}
