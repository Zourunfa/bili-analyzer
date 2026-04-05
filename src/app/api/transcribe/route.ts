import { NextRequest } from "next/server";
import { downloadAudioViaApi, subtitleToText } from "@/lib/bilibili";
import { transcribeAudio, parseSrt, cleanup } from "@/lib/videocaptioner";

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

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Step 1: 下载音频（带进度）
        send({ type: "status", message: "正在下载音频..." });

        audioPath = await downloadAudioViaApi(bvid, cid, (percent, downloaded, total) => {
          send({ type: "progress", percent, downloaded, total });
        });

        workDir = audioPath.substring(0, audioPath.lastIndexOf("/"));

        // Step 2: 语音转写
        send({ type: "status", message: "正在语音转写..." });

        const srtText = await transcribeAudio(audioPath);

        if (!srtText.trim()) {
          send({ type: "error", error: "语音转写结果为空" });
          controller.close();
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
