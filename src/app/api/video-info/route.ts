import { NextRequest, NextResponse } from "next/server";
import { extractBvId, getVideoInfo } from "@/lib/bilibili";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "请提供B站视频链接" }, { status: 400 });
    }

    const bvid = extractBvId(url);
    if (!bvid) {
      return NextResponse.json(
        { error: "无法解析视频链接，请检查链接格式" },
        { status: 400 }
      );
    }

    const videoInfo = await getVideoInfo(bvid);
    return NextResponse.json(videoInfo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "获取视频信息失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
