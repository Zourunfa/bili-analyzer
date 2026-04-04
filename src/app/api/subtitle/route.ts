import { NextRequest, NextResponse } from "next/server";
import { getSubtitle, subtitleToText, getVideoInfo } from "@/lib/bilibili";

export async function POST(req: NextRequest) {
  try {
    const { bvid, cid } = await req.json();

    if (!bvid || !cid) {
      return NextResponse.json(
        { error: "缺少 bvid 或 cid" },
        { status: 400 }
      );
    }

    console.log(`[subtitle] bvid=${bvid}, cid=${cid}`);

    // 先检查 SESSDATA 是否配置
    if (!process.env.BILIBILI_SESSDATA) {
      return NextResponse.json(
        { error: "未配置 BILIBILI_SESSDATA，请在 .env.local 中填入" },
        { status: 500 }
      );
    }

    const subtitles = await getSubtitle(bvid, cid);
    const text = subtitleToText(subtitles);

    return NextResponse.json({ subtitles, text, count: subtitles.length, subtitleSource: "cc" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "获取字幕失败";
    console.error(`[subtitle] Error: ${message}`);

    // 无 CC 字幕时返回标识，让前端走转写流程
    if (message.includes("没有可用的字幕")) {
      return NextResponse.json({ subtitleSource: "none" });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
