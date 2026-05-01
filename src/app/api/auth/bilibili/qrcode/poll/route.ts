import { NextResponse } from "next/server";
import {
  extractCookiesFromHeaders,
  persistCookies,
  verifyCookieSetDetailed,
} from "@/lib/bilibili-auth";

const BILIBILI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function POST(req: Request) {
  try {
    const { qrcode_key } = await req.json();
    if (!qrcode_key || typeof qrcode_key !== "string") {
      return NextResponse.json(
        { error: "缺少 qrcode_key" },
        { status: 400 }
      );
    }

    const res = await fetch(
      `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${encodeURIComponent(qrcode_key)}`,
      {
        headers: {
          "User-Agent": BILIBILI_UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Referer: "https://www.bilibili.com",
          Origin: "https://www.bilibili.com",
        },
        redirect: "manual",
      }
    );

    const body = await res.json();

    // B站 poll 返回码:
    // HTTP code 0 + body.data.code:
    //   86101 = 未扫描
    //   86090 = 已扫描待确认
    //   0     = 确认成功
    // HTTP code 86038 = 二维码已过期

    if (body.code === 86038) {
      return NextResponse.json({ status: "expired", code: 86038 });
    }

    if (body.code !== 0) {
      return NextResponse.json({
        status: "error",
        code: body.code,
        message: body.message || "未知错误",
      });
    }

    const innerCode = body.data?.code;

    if (innerCode === 86101) {
      return NextResponse.json({ status: "pending", code: 86101 });
    }

    if (innerCode === 86090) {
      return NextResponse.json({ status: "scanned", code: 86090 });
    }

    if (innerCode === 0) {
      // 登录成功，从 Set-Cookie 头中提取 Cookie
      const setCookieHeaders = res.headers.getSetCookie?.() || [];
      const cookies = extractCookiesFromHeaders(setCookieHeaders);

      if (!cookies.sessdata) {
        console.warn("[bilibili-qrcode] 登录成功但未提取到 SESSDATA");
        return NextResponse.json({
          status: "error",
          code: -1,
          message: "登录成功但未获取到 SESSDATA",
        });
      }

      // 验证提取到的 Cookie，unknown（网络/风控）不阻断登录流程
      const verifyResult = await verifyCookieSetDetailed(cookies);
      if (verifyResult.status === "invalid") {
        console.warn("[bilibili-qrcode] Cookie 验证失败:", verifyResult.reason || "unknown");
      } else if (verifyResult.status === "unknown") {
        console.warn("[bilibili-qrcode] Cookie 校验结果未知，已继续持久化:", verifyResult.reason || "unknown");
      }

      // 持久化到服务端
      await persistCookies(cookies);

      return NextResponse.json({
        status: "confirmed",
        code: 0,
        cookies: {
          sessdata: cookies.sessdata,
          dedeUserId: cookies.dedeUserId || "",
          biliJct: cookies.biliJct || "",
        },
      });
    }

    return NextResponse.json({
      status: "error",
      code: innerCode ?? body.code,
      message: body.data?.message || body.message || "未知状态",
    });
  } catch (err) {
    console.error("[bilibili-qrcode] 轮询失败:", err);
    return NextResponse.json(
      { status: "error", code: -1, message: "网络错误" },
      { status: 503 }
    );
  }
}
