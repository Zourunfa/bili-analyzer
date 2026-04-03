import { streamText } from "ai";
import { qwen } from "@/lib/qwen";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompts";

export async function POST(req: Request) {
  try {
    const { messages, subtitleText } = await req.json();

    if (!subtitleText || !messages) {
      return new Response(
        JSON.stringify({ error: "缺少必要参数" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = streamText({
      model: qwen("qwen-plus"),
      system: CHAT_SYSTEM_PROMPT(subtitleText),
      messages,
    });

    return result.toTextStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "对话失败";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
