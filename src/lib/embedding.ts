import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// DashScope embedding 客户端
const dashscope = createOpenAICompatible({
  name: "dashscope-embedding",
  apiKey: process.env.DASHSCOPE_API_KEY!,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

/**
 * 生成文本的向量嵌入
 * 使用 DashScope text-embedding-v3 模型
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(
    "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "text-embedding-v3",
        input: text,
        dimensions: 1024,
      }),
    }
  );

  const data = await response.json();

  if (!data.data?.[0]?.embedding) {
    throw new Error("生成向量嵌入失败: " + JSON.stringify(data));
  }

  return data.data[0].embedding;
}

/**
 * 批量生成向量嵌入
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  // DashScope embedding API 支持批量，这里逐个调用以确保稳定性
  for (const text of texts) {
    const embedding = await generateEmbedding(text);
    embeddings.push(embedding);
  }
  return embeddings;
}

/**
 * 将向量数组转换为 PostgreSQL vector 字符串
 */
export function toVectorString(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
