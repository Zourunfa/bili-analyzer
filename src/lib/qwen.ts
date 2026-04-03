import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export const qwen = createOpenAICompatible({
  name: "qwen",
  apiKey: process.env.DASHSCOPE_API_KEY!,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});
