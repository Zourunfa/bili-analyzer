import { streamText } from "ai";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import { type ClientModelConfig, getLanguageModel } from "@/lib/llm";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompts";

type ChatRequestMessage = {
  role: "user" | "assistant";
  content: string;
};

async function saveChatTurn(input: {
  userId?: string;
  videoId?: string;
  messages: ChatRequestMessage[];
  assistantContent: string;
}) {
  const { userId, videoId, messages, assistantContent } = input;
  if (!userId || !videoId || !assistantContent.trim()) return;

  const userMessage = [...messages].reverse().find((item) => item.role === "user");
  if (!userMessage?.content.trim()) return;

  const owned = await prisma.userVideo.findUnique({
    where: { userId_videoId: { userId, videoId } },
    select: { id: true },
  });
  if (!owned) return;

  await prisma.chatMessage.createMany({
    data: [
      {
        userId,
        videoId,
        role: "user",
        content: userMessage.content.trim(),
      },
      {
        userId,
        videoId,
        role: "assistant",
        content: assistantContent.trim(),
      },
    ],
  });
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    const { messages, subtitleText, videoId, modelId, modelConfig } = await req.json();
    const clientModelConfig =
      modelConfig && typeof modelConfig === "object" ? (modelConfig as ClientModelConfig) : undefined;

    if (!subtitleText || !messages) {
      return new Response(
        JSON.stringify({ error: "缺少必要参数" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = streamText({
      model: getLanguageModel(typeof modelId === "string" ? modelId : undefined, clientModelConfig),
      system: CHAT_SYSTEM_PROMPT(subtitleText),
      messages,
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let assistantContent = "";
        const send = (text: string) => {
          assistantContent += text;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`));
        };

        try {
          for await (const chunk of result.textStream) {
            send(chunk);
          }
          try {
            await saveChatTurn({
              userId,
              videoId: typeof videoId === "string" ? videoId : undefined,
              messages,
              assistantContent,
            });
          } catch (saveError) {
            console.error("保存对话历史失败:", saveError);
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "finish" })}\n\n`));
          controller.close();
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "对话失败" })}\n\n`));
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
    const message = err instanceof Error ? err.message : "对话失败";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
