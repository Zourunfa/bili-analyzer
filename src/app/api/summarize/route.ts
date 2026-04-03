import { streamText } from "ai";
import { qwen } from "@/lib/qwen";
import { SUMMARY_SYSTEM_PROMPT } from "@/lib/prompts";

export async function POST(req: Request) {
  try {
    const { subtitleText } = await req.json();

    if (!subtitleText) {
      return new Response(
        JSON.stringify({ error: "缺少字幕文本" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = streamText({
      model: qwen("qwen-plus"),
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `请分析以下视频字幕内容并生成摘要：\n\n${subtitleText}`,
        },
      ],
    });

    return result.toTextStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成摘要失败";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
