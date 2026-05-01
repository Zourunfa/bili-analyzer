import { NextResponse } from "next/server";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { type ClientModelConfig, getLanguageModel } from "@/lib/llm";
import { KNOWLEDGE_EXTRACTION_PROMPT } from "@/lib/prompts";
import { generateEmbedding, toVectorString } from "@/lib/embedding";

export async function POST(req: Request) {
  try {
    const { bvid, modelId, modelConfig } = await req.json();
    const clientModelConfig =
      modelConfig && typeof modelConfig === "object" ? (modelConfig as ClientModelConfig) : undefined;
    if (!bvid) {
      return NextResponse.json({ error: "缺少 bvid 参数" }, { status: 400 });
    }

    // 获取视频和字幕
    const video = await prisma.video.findUnique({ where: { bvid } });
    if (!video) {
      return NextResponse.json({ error: "视频不存在" }, { status: 404 });
    }

    if (video.knowledgeExtracted) {
      return NextResponse.json({ message: "知识点已提取过", count: 0 });
    }

    // 调用 LLM 提取结构化知识
    const { text } = await generateText({
      model: getLanguageModel(typeof modelId === "string" ? modelId : undefined, clientModelConfig),
      prompt: KNOWLEDGE_EXTRACTION_PROMPT(video.title, video.subtitleText),
    });

    // 解析 JSON 结果
    let points: Array<{
      type: string;
      content: string;
      timestamp?: number;
      metadata?: Record<string, unknown>;
    }>;

    try {
      // 尝试从返回文本中提取 JSON 数组
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("未找到 JSON 数组");
      points = JSON.parse(jsonMatch[0]);
    } catch {
      // JSON 解析失败，重试一次用更简单的 prompt
      const retryResult = await generateText({
        model: getLanguageModel(typeof modelId === "string" ? modelId : undefined, clientModelConfig),
        prompt: `请从以下字幕中提取10个关键知识点，每个包含type(topic/keyPoint/concept)、content(内容)、timestamp(秒)。\n\n视频：${video.title}\n字幕：${video.subtitleText.slice(0, 8000)}\n\n只返回JSON数组。`,
      });
      const jsonMatch = retryResult.text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return NextResponse.json({ error: "知识提取失败" }, { status: 500 });
      }
      points = JSON.parse(jsonMatch[0]);
    }

    // 保存知识点到数据库
    const savedPoints = [];
    for (const point of points.slice(0, 30)) {
      if (!point.type || !point.content) continue;

      const knowledgePoint = await prisma.knowledgePoint.create({
        data: {
          videoId: video.id,
          type: point.type,
          content: point.content,
          timestamp: point.timestamp || null,
          metadata: point.metadata ? JSON.parse(JSON.stringify(point.metadata)) : undefined,
        },
      });

      // 异步生成 embedding（不阻塞响应）
      generateEmbedding(point.content)
        .then(async (embedding) => {
          await prisma.$executeRaw`
            INSERT INTO embeddings (id, knowledge_point_id, vector, "createdAt")
            VALUES (
              ${crypto.randomUUID()},
              ${knowledgePoint.id},
              ${toVectorString(embedding)}::vector,
              NOW()
            )
          `;
        })
        .catch((err) => console.error("生成 embedding 失败:", err));

      savedPoints.push(knowledgePoint);
    }

    // 标记视频已提取知识
    await prisma.video.update({
      where: { bvid },
      data: { knowledgeExtracted: true },
    });

    return NextResponse.json({
      message: "知识提取完成",
      count: savedPoints.length,
      points: savedPoints,
    });
  } catch (error) {
    console.error("知识提取错误:", error);
    return NextResponse.json({ error: "知识提取失败" }, { status: 500 });
  }
}
