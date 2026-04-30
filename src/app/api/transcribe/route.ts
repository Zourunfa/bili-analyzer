import { NextRequest } from "next/server";
import { downloadAudioViaApi, subtitleToText } from "@/lib/bilibili";
import { transcribeAudio, parseSrt, cleanup, downloadAudioFromUrl } from "@/lib/videocaptioner";
import { acquireTranscribeSlot, getTranscribeLoad } from "@/lib/transcribe-guard";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { bvid, cid, videoUrl, platform } = body;

  // B站模式：必须有 bvid 和 cid
  const isBilibili = !!bvid && !!cid;
  // 多平台模式：必须有 videoUrl
  const isMultiPlatform = !!videoUrl;

  if (!isBilibili && !isMultiPlatform) {
    return new Response(
      JSON.stringify({ error: "缺少参数：请提供 bvid+cid（B站）或 videoUrl+platform（抖音/小红书）" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const encoder = new TextEncoder();
  let audioPath: string | undefined;
  let workDir: string | undefined;
  let releaseSlot: (() => void) | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const load = getTranscribeLoad();
        send({
          type: "status",
          message: `转写资源: 运行中 ${load.active}/${load.max}，排队 ${load.queued}`,
        });

        releaseSlot = await acquireTranscribeSlot((queuePosition) => {
          send({
            type: "status",
            message: `当前转写任务较多，已进入队列（前方 ${queuePosition} 个）...`,
          });
        });

        // Step 1: 下载音频
        const platformLabel = isBilibili ? "B站" : (platform === "douyin" ? "抖音" : "小红书");
        send({ type: "status", message: `正在从 ${platformLabel} 下载音频...` });

        if (isBilibili) {
          audioPath = await downloadAudioViaApi(bvid, Number(cid), (percent, downloaded, total) => {
            send({ type: "progress", percent, downloaded, total });
          });
        } else {
          // 多平台音频下载
          if (platform === "douyin" && videoUrl) {
            // 抖音：videoUrl 是 douyinvod.com CDN 直链，用 fetch 直接下载再 ffmpeg 提音频
            const { downloadDouyinAudio } = await import("@/lib/douyin");
            audioPath = await downloadDouyinAudio(videoUrl);
          } else {
            // 其他平台：用 yt-dlp
            audioPath = await downloadAudioFromUrl(videoUrl);
          }
          send({ type: "progress", percent: 100, downloaded: "?", total: "?" });
        }

        workDir = audioPath.substring(0, audioPath.lastIndexOf("/"));

        // Step 2: 语音转写
        send({ type: "status", message: "正在语音转写，请稍候..." });
        heartbeatTimer = setInterval(() => {
          send({ type: "status", message: "正在语音转写，请稍候..." });
        }, 15_000);

        const srtText = await transcribeAudio(audioPath);
        clearInterval(heartbeatTimer);
        heartbeatTimer = undefined;

        if (!srtText.trim()) {
          send({ type: "error", error: "语音转写结果为空" });
          return;
        }

        // Step 3: 解析 SRT
        const subtitles = parseSrt(srtText);
        const text = subtitleToText(subtitles);

        send({
          type: "done",
          data: {
            subtitles,
            text,
            count: subtitles.length,
            subtitleSource: "transcribed",
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "转写失败";
        send({ type: "error", error: message });
      } finally {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        if (releaseSlot) releaseSlot();
        if (audioPath) await cleanup(audioPath);
        if (workDir) await cleanup(workDir);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
