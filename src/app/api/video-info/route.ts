import { NextRequest, NextResponse } from "next/server";
import { detectPlatform, extractVideoId, getVideoMetadata } from "@/lib/platform";

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
      if (detectPlatform(url) === "douyin") {
        return NextResponse.json(
          { error: "抖音短链接解析失败：当前运行环境连接 v.douyin.com 超时或被关闭。请在浏览器打开短链接后，复制完整的 douyin.com/video/数字ID 链接再试。" },
          { status: 400 }
        );
      }

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
