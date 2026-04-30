import { NextRequest, NextResponse } from "next/server";
import {
  getSubtitle,
  subtitleToText,
  downloadAudioViaApi,
} from "@/lib/bilibili";
import {
  transcribeAudio,
  parseSrt,
  cleanup,
} from "@/lib/videocaptioner";
import { acquireTranscribeSlot } from "@/lib/transcribe-guard";

function isExplicitNoSubtitleError(message: string): boolean {
  const normalized = message.toLowerCase();
  return [
    "该视频没有可用的字幕",
    "没有可用的字幕",
    "cc 字幕为空",
    "subtitle list empty",
    "subtitle is empty",
  ].some((kw) => normalized.includes(kw.toLowerCase()));
}

function isRateLimitError(message: string): boolean {
  return (
    message.includes("request was banned") ||
    message.includes("请求过于频繁") ||
    message.includes("风控校验失败") ||
    message.includes("-412") ||
    message.includes("-799") ||
    message.includes("-352")
  );
}

export async function POST(req: NextRequest) {
  let audioPath: string | undefined;
  let workDir: string | undefined;
  let releaseSlot: (() => void) | undefined;

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

    // 优先尝试 CC 字幕
    let subtitleSource: "cc" | "transcribed" | "none" = "none";
    let subtitles: unknown[] = [];
    let text = "";

    try {
      const raw = await getSubtitle(bvid, cid);
      subtitles = Array.isArray(raw) ? raw : [];
      text = subtitleToText(raw as Parameters<typeof subtitleToText>[0]);
      if (text.trim()) {
        subtitleSource = "cc";
        return NextResponse.json({
          subtitles,
          text,
          count: subtitles.length,
          subtitleSource,
        });
      }
      // 空字幕内容，当作无字幕处理
      console.log("[subtitle] CC 字幕内容为空，尝试音频转写...");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isExplicitNoSubtitleError(message)) {
        console.log("[subtitle] 无 CC 字幕，尝试音频转写...");
      } else if (isRateLimitError(message)) {
        console.log(`[subtitle] CC 字幕接口被风控拦截 (-412)，尝试音频转写...`);
      } else {
        // 其他错误（网络、超时等）也尝试转写兜底
        console.warn(`[subtitle] CC 字幕获取失败，尝试音频转写: ${message}`);
      }
    }

    // 音频转写兜底
    if (subtitleSource !== "cc") {
      releaseSlot = await acquireTranscribeSlot();
      console.log("[subtitle] 正在下载音频并转写...");
      audioPath = await downloadAudioViaApi(bvid, cid);
      workDir = audioPath.slice(0, Math.max(0, audioPath.lastIndexOf("/")));

      const srtText = await transcribeAudio(audioPath);
      if (!srtText.trim()) {
        // 转写结果为空，返回 none
        return NextResponse.json({ subtitleSource: "none" });
      }

      const parsed = parseSrt(srtText);
      text = subtitleToText(parsed);
      if (!text.trim()) {
        return NextResponse.json({ subtitleSource: "none" });
      }

      console.log(`[subtitle] 音频转写成功，获取 ${parsed.length} 条字幕`);
      subtitles = parsed;
      subtitleSource = "transcribed";
    }

    return NextResponse.json({
      subtitles,
      text,
      count: subtitles.length,
      subtitleSource,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "获取字幕失败";
    console.error(`[subtitle] Error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    if (releaseSlot) releaseSlot();
    if (audioPath) await cleanup(audioPath);
    if (workDir) await cleanup(workDir);
  }
}
