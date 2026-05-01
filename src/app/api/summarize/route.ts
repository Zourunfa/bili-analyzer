import { NextRequest } from "next/server";
import { streamText } from "ai";
import { type ClientModelConfig, getLanguageModel } from "@/lib/llm";
import { SUMMARY_SYSTEM_PROMPT } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  try {
    const { subtitleText, modelId, modelConfig } = await req.json();
    const clientModelConfig =
      modelConfig && typeof modelConfig === "object" ? (modelConfig as ClientModelConfig) : undefined;

    if (!subtitleText) {
      return new Response(JSON.stringify({ error: "缺少字幕文本" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const result = streamText({
      model: getLanguageModel(typeof modelId === "string" ? modelId : undefined, clientModelConfig),
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `请分析以下视频字幕内容并生成摘要：\n\n${subtitleText}`,
        },
      ],
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (text: string) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`));
        };

        try {
          for await (const chunk of result.textStream) {
            send(chunk);
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish" })}\n\n`));
          controller.close();
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "生成摘要失败" })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成摘要失败";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
