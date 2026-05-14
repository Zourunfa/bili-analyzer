import { streamText } from "ai";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";
import {
  type ClientModelConfig,
  getConfiguredModelProviders,
  getDefaultModelId,
  getLanguageModel,
} from "@/lib/llm";
import { CHAT_SYSTEM_PROMPT } from "@/lib/prompts";

type ChatRequestMessage = {
  role: "user" | "assistant";
  content: string;
};

const CHAT_TOTAL_TIMEOUT_MS = 120_000;
const STREAM_FIRST_CHUNK_TIMEOUT_MS = 15_000;
const STREAM_CHUNK_TIMEOUT_MS = 30_000;

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

function createAbortController(req: Request) {
  const controller = new AbortController();
  const abort = () => controller.abort();

  if (req.signal.aborted) {
    abort();
  } else {
    req.signal.addEventListener("abort", abort, { once: true });
  }

  return controller;
}

function toError(value: unknown, fallback = "对话失败") {
  if (value instanceof Error) return value;
  if (typeof value === "string" && value.trim()) return new Error(value);
  const message = extractErrorMessage(value);
  if (message) return new Error(message);
  return new Error(fallback);
}

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    const directMessage = record.message;
    if (typeof directMessage === "string") return directMessage;

    const nestedError = record.error;
    if (nestedError && typeof nestedError === "object") {
      const nestedMessage = (nestedError as Record<string, unknown>).message;
      if (typeof nestedMessage === "string") return nestedMessage;
    }
  }
  return "";
}

function normalizeErrorMessage(err: unknown) {
  const message = extractErrorMessage(err);
  if (/insufficient.*balance|account.*balance|余额不足|账户余额/i.test(message)) {
    return "当前模型账号余额不足，请充值或切换到其它可用模型。";
  }
  return message || "对话失败";
}

function isBalanceError(err: unknown) {
  return /insufficient.*balance|account.*balance|余额不足|账户余额/i.test(normalizeErrorMessage(err));
}

function getServerFallbackModelIds(modelId?: string, clientConfig?: ClientModelConfig) {
  const currentModelId = clientConfig?.providerId && clientConfig?.model
    ? `${clientConfig.providerId}:${clientConfig.model}`
    : modelId;
  const configuredModelIds = getConfiguredModelProviders().flatMap((provider) =>
    provider.models.map((model) => model.id)
  );

  return Array.from(new Set([getDefaultModelId(), ...configuredModelIds]))
    .filter((id) => id && id !== currentModelId);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T | "timeout">([
      promise,
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

    const requestedModelId = typeof modelId === "string" ? modelId : undefined;
    const model = getLanguageModel(requestedModelId, clientModelConfig);
    const system = CHAT_SYSTEM_PROMPT(subtitleText);

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let assistantContent = "";
        let closed = false;
        const sendEvent = (payload: Record<string, unknown>) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        const send = (text: string) => {
          assistantContent += text;
          sendEvent({ type: "text", content: text });
        };
        const close = () => {
          if (closed) return;
          closed = true;
          controller.close();
        };
        const streamAnswer = async (modelToUse: ReturnType<typeof getLanguageModel>) => {
          const streamAbortController = createAbortController(req);
          const result = streamText({
            model: modelToUse,
            system,
            messages,
            abortSignal: streamAbortController.signal,
            timeout: {
              totalMs: CHAT_TOTAL_TIMEOUT_MS,
              chunkMs: STREAM_CHUNK_TIMEOUT_MS,
            },
            maxRetries: 1,
          });
          const iterator = result.fullStream[Symbol.asyncIterator]();
          let hasContent = false;
          let streamError: unknown;

          while (true) {
            const nextPromise = iterator.next();
            const chunk = hasContent
              ? await nextPromise
              : await withTimeout(nextPromise, STREAM_FIRST_CHUNK_TIMEOUT_MS);

            if (chunk === "timeout") {
              streamAbortController.abort();
              nextPromise.catch(() => undefined);
              return { hasContent, error: new Error("模型响应超时") };
            }
            if (chunk.done) return { hasContent, error: hasContent ? undefined : new Error("模型未返回内容") };

            const part = chunk.value;
            if (part.type === "text-delta") {
              hasContent = true;
              send(part.text);
            } else if (part.type === "error") {
              if (hasContent) throw toError(part.error);
              streamAbortController.abort();
              streamError = part.error;
              return { hasContent, error: streamError };
            }
          }
        };

        try {
          const firstAttempt = await streamAnswer(model);

          if (!firstAttempt.hasContent) {
            const fallbackModelIds = getServerFallbackModelIds(requestedModelId, clientModelConfig);
            let lastError = firstAttempt.error;

            for (const fallbackModelId of fallbackModelIds) {
              try {
                const fallbackAttempt = await streamAnswer(getLanguageModel(fallbackModelId));
                if (fallbackAttempt.hasContent) {
                  lastError = undefined;
                  break;
                }
                lastError = fallbackAttempt.error;
              } catch (fallbackError) {
                lastError = fallbackError;
                if (!isBalanceError(fallbackError)) break;
              }
            }

            if (lastError && !assistantContent.trim()) {
              throw toError(normalizeErrorMessage(lastError));
            }
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
          sendEvent({ type: "finish" });
          close();
        } catch (err) {
          sendEvent({ type: "error", message: normalizeErrorMessage(err) });
          close();
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
