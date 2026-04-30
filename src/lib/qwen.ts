import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createAnthropic } from "@ai-sdk/anthropic";

export const DEFAULT_ANALYZE_MODEL =
  process.env.ANALYZE_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  "qwen-plus";

const useAnthropicProvider = Boolean(
  (process.env.ANTHROPIC_BASE_URL || process.env.LLM_BASE_URL) &&
  (process.env.ANTHROPIC_AUTH_TOKEN || process.env.LLM_API_KEY)
);

export function getAnalyzeModel(preferred?: string): string {
  if (!preferred || preferred === "qwen-plus") return DEFAULT_ANALYZE_MODEL;
  return preferred;
}

const anthropicProvider = createAnthropic({
  baseURL: process.env.ANTHROPIC_BASE_URL || process.env.LLM_BASE_URL,
  apiKey: process.env.ANTHROPIC_AUTH_TOKEN || process.env.LLM_API_KEY,
});

const openAICompatibleProvider = createOpenAICompatible({
  name: "qwen",
  apiKey: process.env.DASHSCOPE_API_KEY || "",
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
});

export function qwen(model: string) {
  if (useAnthropicProvider) {
    return anthropicProvider(model);
  }
  return openAICompatibleProvider(model);
}
