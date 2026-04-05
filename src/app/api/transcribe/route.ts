import { NextRequest, NextResponse } from "next/server";
import { downloadAudioViaApi, subtitleToText } from "@/lib/bilibili";
import { transcribeAudio, parseSrt, cleanup } from "@/lib/videocaptioner";

export async function POST(req: NextRequest) {
  const { bvid, cid } = await req.json();

  if (!bvid || !cid) {
    return NextResponse.json({ error: "缺少 bvid 或 cid" }, { status: 400 });
  }

  let audioPath: string | undefined;
  let workDir: string | undefined;

  try {
    // Step 1: 通过 B站 API 直接下载音频（绕过 yt-dlp 412 问题）
    console.log(`[transcribe] 开始下载音频: ${bvid}`);
    audioPath = await downloadAudioViaApi(bvid, cid);
    workDir = audioPath.substring(0, audioPath.lastIndexOf("/"));

    // Step 2: 语音转写
    console.log(`[transcribe] 开始语音转写: ${audioPath}`);
    const srtText = await transcribeAudio(audioPath);

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
    if (audioPath) await cleanup(audioPath);
    if (workDir) await cleanup(workDir);
  }
}
