import { NextRequest } from "next/server";
import { downloadAudioViaApi, subtitleToText } from "@/lib/bilibili";
import { transcribeAudio, parseSrt, cleanup } from "@/lib/videocaptioner";
import { acquireTranscribeSlot, getTranscribeLoad } from "@/lib/transcribe-guard";

export async function POST(req: NextRequest) {
  const { bvid, cid } = await req.json();

  if (!bvid || !cid) {
    return new Response(JSON.stringify({ error: "缺少 bvid 或 cid" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
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

        // Step 1: 下载音频（带进度）
        send({ type: "status", message: "正在下载音频..." });

        audioPath = await downloadAudioViaApi(bvid, cid, (percent, downloaded, total) => {
          send({ type: "progress", percent, downloaded, total });
        });

        workDir = audioPath.substring(0, audioPath.lastIndexOf("/"));

        // Step 2: 语音转写
        send({ type: "status", message: "正在语音转写..." });
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
