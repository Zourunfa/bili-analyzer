import { NextRequest, NextResponse } from "next/server";
import { extractVideoId, getVideoMetadata } from "@/lib/platform";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: "请提供视频链接" },
        { status: 400 }
      );
    }

    console.log("[video-info] 收到原始输入:", url);

    // 解析平台和 ID
    const parsed = await extractVideoId(url);
    if (!parsed) {
      return NextResponse.json(
        { error: "无法识别该链接平台，请确认是B站/抖音/小红书视频链接" },
        { status: 400 }
      );
    }

    console.log(`[video-info] 平台: ${parsed.platform}, ID: ${parsed.id}`);

    // 获取元数据
    const info = await getVideoMetadata(parsed);
    return NextResponse.json(info);
  } catch (err) {
    console.error("[video-info] 错误:", err);
    const message = err instanceof Error ? err.message : "获取视频信息失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
