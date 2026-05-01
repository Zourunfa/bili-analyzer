import { NextResponse } from "next/server";
import { getUPownerVideos } from "@/lib/bilibili";
import {
  type BiliCookieSet,
  readServerCookieSet,
  runWithCookieSet,
  verifyCookieSetDetailed,
} from "@/lib/bilibili-auth";

export async function GET(req: Request) {
  const serverCookies = readServerCookieSet();
  try {
    const url = new URL(req.url);
    const mid = url.searchParams.get("mid");
    const page = Number(url.searchParams.get("page") || "1");
    const pageSize = Number(url.searchParams.get("pageSize") || "30");
    const keyword = url.searchParams.get("keyword") || undefined;

    if (!mid) {
      return NextResponse.json({ error: "缺少 mid 参数" }, { status: 400 });
    }

    const clientCookies: BiliCookieSet = {
      sessdata: req.headers.get("x-bilibili-sessdata") || undefined,
      dedeUserId: req.headers.get("x-bilibili-dede-userid") || undefined,
      biliJct: req.headers.get("x-bilibili-bili-jct") || undefined,
    };
    const hasClientSessdata = !!clientCookies.sessdata?.trim();
    let usingClientCookies = false;
    let invalidClientCookie = false;
    let effectiveCookies = serverCookies;

    // 客户端 Cookie 采用三态校验：valid 才强制使用；unknown 不直接判失效
    if (hasClientSessdata) {
      const verifyResult = await verifyCookieSetDetailed(clientCookies);
      if (verifyResult.status === "valid") {
        effectiveCookies = clientCookies;
        usingClientCookies = true;
      } else if (verifyResult.status === "invalid") {
        invalidClientCookie = true;
        console.warn("[bilibili] 客户端传入 SESSDATA 无效，回退服务端登录态:", verifyResult.reason || "unknown");
      } else {
        // unknown（网络/风控）不判失效。如果服务端无 cookie，则尝试继续使用客户端值。
        if (!serverCookies.sessdata?.trim()) {
          effectiveCookies = clientCookies;
          usingClientCookies = true;
        }
        console.warn("[bilibili] 客户端 SESSDATA 校验状态未知，继续按当前可用 cookie 请求:", verifyResult.reason || "unknown");
      }
    }

    const result = await runWithCookieSet(effectiveCookies, async () =>
      getUPownerVideos(mid, page, pageSize, keyword)
    );
    if (
      hasClientSessdata &&
      !usingClientCookies &&
      invalidClientCookie &&
      result.total === 0 &&
      result.videos.length === 0
    ) {
      return NextResponse.json(
        { error: "本地 SESSDATA 已失效且未获取到公开视频列表。请在\"B站 Cookie 配置\"里更新 SESSDATA 后重试。" },
        { status: 401 }
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("获取UP主视频列表错误:", error);
    const message = error instanceof Error ? error.message : "获取失败";
    // 检测是否为 IP 封禁错误，返回特殊状态码
    const isBanned = message.includes("request was banned") || message.includes("请求过于频繁") || message.includes("-412") || message.includes("-799");
    const isAuthError = message.includes("SESSDATA 已失效") || message.includes("获取UP主视频列表需要登录态");
    return NextResponse.json(
      { error: message },
      { status: isAuthError ? 401 : (isBanned ? 429 : 500) }
    );
  }
}
