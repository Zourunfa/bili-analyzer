import { NextResponse } from "next/server";
import { getUPownerVideos } from "@/lib/bilibili";

type BiliCookieSet = {
  sessdata?: string;
  dedeUserId?: string;
  biliJct?: string;
};

function setEnvKey(key: "BILIBILI_SESSDATA" | "BILIBILI_DEDE_USERID" | "BILIBILI_BILI_JCT", value?: string) {
  if (value && value.trim()) process.env[key] = value.trim();
  else delete process.env[key];
}

function applyCookieSet(set: BiliCookieSet) {
  setEnvKey("BILIBILI_SESSDATA", set.sessdata);
  setEnvKey("BILIBILI_DEDE_USERID", set.dedeUserId);
  setEnvKey("BILIBILI_BILI_JCT", set.biliJct);
}

function readServerCookieSet(): BiliCookieSet {
  return {
    sessdata: process.env.BILIBILI_SESSDATA,
    dedeUserId: process.env.BILIBILI_DEDE_USERID,
    biliJct: process.env.BILIBILI_BILI_JCT,
  };
}

async function verifyCookieSet(set: BiliCookieSet): Promise<boolean> {
  if (!set.sessdata?.trim()) return false;
  const cookieParts = [`SESSDATA=${set.sessdata.trim()}`];
  if (set.dedeUserId?.trim()) cookieParts.push(`DedeUserID=${set.dedeUserId.trim()}`);
  if (set.biliJct?.trim()) cookieParts.push(`bili_jct=${set.biliJct.trim()}`);

  try {
    const res = await fetch("https://api.bilibili.com/x/web-interface/nav", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: "https://www.bilibili.com",
        Cookie: cookieParts.join("; "),
      },
      redirect: "manual",
    });
    const data = await res.json();
    return data?.code === 0 && data?.data?.isLogin === true;
  } catch {
    return false;
  }
}

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

    // 仅当客户端 SESSDATA 验证通过时才覆盖，避免无效本地缓存污染服务端登录态
    if (hasClientSessdata) {
      const validClientCookie = await verifyCookieSet(clientCookies);
      if (validClientCookie) {
        applyCookieSet(clientCookies);
        usingClientCookies = true;
      } else {
        console.warn("[bilibili] 客户端传入 SESSDATA 无效，已回退服务端环境变量");
        applyCookieSet(serverCookies);
      }
    } else {
      applyCookieSet(serverCookies);
    }

    const result = await getUPownerVideos(mid, page, pageSize, keyword);
    if (
      hasClientSessdata &&
      !usingClientCookies &&
      result.total === 0 &&
      result.videos.length === 0
    ) {
      return NextResponse.json(
        { error: "本地 SESSDATA 已失效且未获取到公开视频列表。请在“B站 Cookie 配置”里更新 SESSDATA 后重试。" },
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
  } finally {
    // 避免请求级 cookie 覆盖污染后续请求
    applyCookieSet(serverCookies);
  }
}
