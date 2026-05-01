import { NextResponse } from "next/server";

const BILIBILI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export async function POST() {
  try {
    const res = await fetch(
      "https://passport.bilibili.com/x/passport-login/web/qrcode/generate",
      {
        headers: {
          "User-Agent": BILIBILI_UA,
          Accept: "application/json, text/plain, */*",
          "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          Referer: "https://www.bilibili.com",
          Origin: "https://www.bilibili.com",
        },
      }
    );
    const data = await res.json();

    if (data.code !== 0 || !data.data) {
      return NextResponse.json(
        { error: data.message || "二维码生成失败" },
        { status: 502 }
      );
    }

    return NextResponse.json({
      url: data.data.url as string,
      qrcode_key: data.data.qrcode_key as string,
      expiresAt: Date.now() + 180_000,
    });
  } catch (err) {
    console.error("[bilibili-qrcode] 生成二维码失败:", err);
    return NextResponse.json(
      { error: "无法连接B站服务" },
      { status: 503 }
    );
  }
}
