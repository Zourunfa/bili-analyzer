import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { streamText } from "ai";
import { authOptions } from "@/lib/auth";
import { type ClientModelConfig, getLanguageModel } from "@/lib/llm";
import { getTemplatePresetById } from "@/lib/template-presets";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id?: string } | undefined)?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const body = await req.json();
    const templateId = String(body?.templateId || "").trim();
    const summary = String(body?.summary || "").trim();
    const subtitleText = String(body?.subtitleText || "").trim();
    const extraPrompt = String(body?.extraPrompt || "").trim();
    const modelId = typeof body?.modelId === "string" ? body.modelId : undefined;
    const clientModelConfig =
      body?.modelConfig && typeof body.modelConfig === "object"
        ? (body.modelConfig as ClientModelConfig)
        : undefined;

    if (!templateId) {
      return NextResponse.json({ error: "缺少 templateId" }, { status: 400 });
    }
    if (!summary || !subtitleText) {
      return NextResponse.json({ error: "摘要和字幕内容不能为空" }, { status: 400 });
    }

    const preset = getTemplatePresetById(templateId);
    if (!preset) {
      return NextResponse.json({ error: "模板不存在" }, { status: 404 });
    }

    const result = streamText({
      model: getLanguageModel(modelId, clientModelConfig),
      system:
        "你是资深内容编辑，请严格遵循模板要求生成可直接使用的结构化内容。输出必须是中文，结构清晰，避免空泛语句。",
      messages: [
        {
          role: "user",
          content: [
            `模板：${preset.name}`,
            `模板要求：${preset.instruction}`,
            "",
            "视频摘要：",
            summary,
            "",
            "视频字幕（节选）：",
            subtitleText.slice(0, 16000),
            "",
            extraPrompt ? `额外要求：${extraPrompt}` : "",
          ].join("\n"),
        },
      ],
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (payload: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        };
        try {
          for await (const chunk of result.textStream) {
            send({ type: "text", content: chunk });
          }
          send({ type: "finish" });
          controller.close();
        } catch (err) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "模板生成失败",
          });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("模板生成错误:", error);
    return NextResponse.json({ error: "模板生成失败" }, { status: 500 });
  }
}
