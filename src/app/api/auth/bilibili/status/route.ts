import { NextResponse } from "next/server";
import {
  type BiliCookieSet,
  readServerCookieSet,
  verifyCookieSetDetailed,
} from "@/lib/bilibili-auth";

export async function GET(req: Request) {
  try {
    const clientCookies: BiliCookieSet = {
      sessdata: req.headers.get("x-bilibili-sessdata") || undefined,
      dedeUserId: req.headers.get("x-bilibili-dede-userid") || undefined,
      biliJct: req.headers.get("x-bilibili-bili-jct") || undefined,
    };
    const hasClientCookie = Boolean(clientCookies.sessdata?.trim());
    const cookieSet = hasClientCookie ? clientCookies : readServerCookieSet();

    const result = await verifyCookieSetDetailed(cookieSet);
    return NextResponse.json({
      valid: result.status === "valid",
      status: result.status,
      reason: result.reason || "",
      username: result.username || "",
      face: result.face || "",
      mid: result.mid || null,
      source: hasClientCookie ? "client" : "server",
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[bilibili-status] 检查登录状态失败:", err);
    return NextResponse.json(
      { valid: false, status: "unknown", reason: "status route failed" },
      { status: 500 }
    );
  }
}
