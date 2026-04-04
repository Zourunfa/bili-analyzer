import { NextRequest, NextResponse } from "next/server";
import {
  downloadAudio,
  transcribeAudio,
  parseSrt,
  cleanup,
} from "@/lib/videocaptioner";
import { subtitleToText } from "@/lib/bilibili";

export async function POST(req: NextRequest) {
  const { bvid } = await req.json();

  if (!bvid) {
    return NextResponse.json({ error: "缺少 bvid" }, { status: 400 });
  }

  let videoPath: string | undefined;
  let workDir: string | undefined;

  try {
    // Step 1: 只下载音频（比下载完整视频快很多）
    console.log(`[transcribe] 开始下载音频: ${bvid}`);
    videoPath = await downloadAudio(bvid);
    // workDir 用于清理：取 videoPath 的父目录
    workDir = videoPath.substring(0, videoPath.lastIndexOf("/"));

    // Step 2: 语音转写
    console.log(`[transcribe] 开始语音转写: ${videoPath}`);
    const srtText = await transcribeAudio(videoPath);

    if (!srtText.trim()) {
      return NextResponse.json({ error: "语音转写结果为空" }, { status: 500 });
    }

    // Step 3: 解析 SRT 为统一格式
    const subtitles = parseSrt(srtText);
    const text = subtitleToText(subtitles);

    console.log(`[transcribe] 完成，共 ${subtitles.length} 条字幕`);

    return NextResponse.json({
      subtitles,
      text,
      count: subtitles.length,
      subtitleSource: "transcribed",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "转写失败";
    console.error(`[transcribe] Error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // 清理临时文件
    if (videoPath) await cleanup(videoPath);
    if (workDir) await cleanup(workDir);
  }
}
