import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

export type ModelProviderId =
  | "dashscope"
  | "deepseek"
  | "minimax"
  | "openai"
  | "kimi"
  | "glm"
  | "xiaomi"
  | "anthropic"
  | "custom";

export type PublicModelOption = {
  id: string;
  name: string;
  model: string;
};

export type PublicModelProvider = {
  id: ModelProviderId;
  name: string;
  models: PublicModelOption[];
};

export type ClientModelConfig = {
  providerId?: string;
  providerName?: string;
  kind?: "openai-compatible" | "anthropic";
  baseURL?: string;
  apiKey?: string;
  model?: string;
};

type ProviderConfig = {
  id: ModelProviderId;
  name: string;
  kind: "openai-compatible" | "anthropic";
  baseURL?: string;
  apiKey?: string;
  models: string[];
};

function isProviderConfigured(provider: ProviderConfig): boolean {
  return Boolean(provider.apiKey && (provider.kind === "anthropic" || provider.baseURL));
}

function isValidHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeClientModelConfig(config?: ClientModelConfig | null): ClientModelConfig | null {
  if (!config || typeof config !== "object") return null;

  const kind = config.kind === "anthropic" ? "anthropic" : "openai-compatible";
  const apiKey = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
  const model = typeof config.model === "string" ? config.model.trim() : "";
  const baseURL = typeof config.baseURL === "string" ? config.baseURL.trim() : "";
  const providerId = typeof config.providerId === "string" ? config.providerId.trim() : "custom";
  const providerName = typeof config.providerName === "string" ? config.providerName.trim() : "自定义模型";

  if (!apiKey || !model) return null;
  if (kind === "openai-compatible" && !isValidHttpUrl(baseURL)) return null;

  return {
    kind,
    apiKey,
    model,
    baseURL: kind === "anthropic" ? (isValidHttpUrl(baseURL) ? baseURL : undefined) : baseURL,
    providerId: providerId || "custom",
    providerName: providerName || "自定义模型",
  };
}

const DEFAULT_PROVIDER_ID: ModelProviderId =
  (process.env.DEFAULT_LLM_PROVIDER as ModelProviderId | undefined) || "dashscope";

const LEGACY_DEFAULT_MODEL =
  process.env.ANALYZE_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  process.env.DEFAULT_LLM_MODEL ||
  "qwen-plus";

function splitModels(value: string | undefined, fallback: string[]): string[] {
  const parsed = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return parsed && parsed.length > 0 ? Array.from(new Set(parsed)) : Array.from(new Set(fallback));
}

function providerConfigs(): ProviderConfig[] {
  return [
    {
      id: "dashscope",
      name: "通义千问",
      kind: "openai-compatible",
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: process.env.DASHSCOPE_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      models: splitModels(process.env.DASHSCOPE_MODELS, [LEGACY_DEFAULT_MODEL, "qwen-plus", "qwen-turbo"]),
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      kind: "openai-compatible",
      apiKey: process.env.DEEPSEEK_API_KEY,
      baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
      models: splitModels(process.env.DEEPSEEK_MODELS, ["deepseek-chat", "deepseek-reasoner"]),
    },
    {
      id: "minimax",
      name: "MiniMax",
      kind: "openai-compatible",
      apiKey: process.env.MINIMAX_API_KEY,
      baseURL: process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1",
      models: splitModels(process.env.MINIMAX_MODELS, ["MiniMax-M2.7", "MiniMax-M2.7-highspeed", "MiniMax-Text-01"]),
    },
    {
      id: "openai",
      name: "OpenAI",
      kind: "openai-compatible",
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
      models: splitModels(process.env.OPENAI_MODELS, ["gpt-4.1-mini", "gpt-4o-mini"]),
    },
    {
      id: "kimi",
      name: "Kimi",
      kind: "openai-compatible",
      apiKey: process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY,
      baseURL: process.env.KIMI_BASE_URL || process.env.MOONSHOT_BASE_URL || "https://api.moonshot.cn/v1",
      models: splitModels(process.env.KIMI_MODELS || process.env.MOONSHOT_MODELS, ["moonshot-v1-8k", "kimi-k2-0711-preview"]),
    },
    {
      id: "glm",
      name: "智谱 GLM",
      kind: "openai-compatible",
      apiKey: process.env.GLM_API_KEY || process.env.ZHIPU_API_KEY,
      baseURL: process.env.GLM_BASE_URL || process.env.ZHIPU_BASE_URL || "https://open.bigmodel.cn/api/paas/v4",
      models: splitModels(process.env.GLM_MODELS || process.env.ZHIPU_MODELS, ["glm-4-flash", "glm-4-plus"]),
    },
    {
      id: "xiaomi",
      name: "小米 MiMo",
      kind: "openai-compatible",
      apiKey: process.env.XIAOMI_API_KEY || process.env.MIMO_API_KEY,
      baseURL: process.env.XIAOMI_BASE_URL || process.env.MIMO_BASE_URL || "https://api.xiaomimimo.com/v1",
      models: splitModels(process.env.XIAOMI_MODELS || process.env.MIMO_MODELS, ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2.5-flash"]),
    },
    {
      id: "anthropic",
      name: "Anthropic",
      kind: "anthropic",
      apiKey: process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_BASE_URL,
      models: splitModels(process.env.ANTHROPIC_MODELS || process.env.ANTHROPIC_MODEL, ["claude-3-5-haiku-latest"]),
    },
    {
      id: "custom",
      name: process.env.CUSTOM_LLM_NAME || "自定义模型",
      kind: "openai-compatible",
      apiKey: process.env.CUSTOM_LLM_API_KEY || process.env.LLM_API_KEY,
      baseURL: process.env.CUSTOM_LLM_BASE_URL || process.env.LLM_BASE_URL,
      models: splitModels(process.env.CUSTOM_LLM_MODELS || process.env.LLM_MODELS, ["custom-model"]),
    },
  ];
}

export function getConfiguredModelProviders(): PublicModelProvider[] {
  return providerConfigs()
    .filter(isProviderConfigured)
    .map((provider) => ({
      id: provider.id,
      name: provider.name,
      models: provider.models.map((model) => ({
        id: `${provider.id}:${model}`,
        name: model,
        model,
      })),
    }));
}

export function getDefaultModelId(): string {
  const configured = getConfiguredModelProviders();
  const preferredProvider = configured.find((provider) => provider.id === DEFAULT_PROVIDER_ID) || configured[0];
  const preferredModel =
    preferredProvider?.models.find((item) => item.model === LEGACY_DEFAULT_MODEL) ||
    preferredProvider?.models[0];
  return preferredModel?.id || `dashscope:${LEGACY_DEFAULT_MODEL}`;
}

function parseModelId(modelId?: string): { providerId: ModelProviderId; model: string } {
  if (!modelId) {
    const [providerId, ...modelParts] = getDefaultModelId().split(":");
    return { providerId: providerId as ModelProviderId, model: modelParts.join(":") };
  }

  const [providerId, ...modelParts] = modelId.split(":");
  const model = modelParts.join(":").trim();
  if (!providerId || !model) return parseModelId();
  return { providerId: providerId as ModelProviderId, model };
}

export function getLanguageModel(modelId?: string, clientConfig?: ClientModelConfig | null) {
  const runtimeConfig = normalizeClientModelConfig(clientConfig);
  if (runtimeConfig) {
    if (runtimeConfig.kind === "anthropic") {
      return createAnthropic({
        apiKey: runtimeConfig.apiKey,
        baseURL: runtimeConfig.baseURL,
      })(runtimeConfig.model || "claude-3-5-haiku-latest");
    }

    return createOpenAICompatible({
      name: `client-${runtimeConfig.providerId || "custom"}`,
      apiKey: runtimeConfig.apiKey || "",
      baseURL: runtimeConfig.baseURL || "",
    })(runtimeConfig.model || "custom-model");
  }

  const requested = parseModelId(modelId);
  const configs = providerConfigs().filter(isProviderConfigured);
  const config =
    configs.find((provider) => provider.id === requested.providerId) ||
    configs.find((provider) => provider.id === DEFAULT_PROVIDER_ID) ||
    configs[0];

  if (!config) {
    throw new Error("未配置可用的 LLM Provider API Key");
  }

  const model = config.models.includes(requested.model) || requested.providerId === "custom"
    ? requested.model
    : config.models[0];

  if (config.kind === "anthropic") {
    return createAnthropic({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    })(model);
  }

  return createOpenAICompatible({
    name: config.id,
    apiKey: config.apiKey || "",
    baseURL: config.baseURL || "",
  })(model);
}

export function getAnalyzeModel(preferred?: string): string {
  if (!preferred || preferred === "qwen-plus") return LEGACY_DEFAULT_MODEL;
  return preferred;
}

export function qwen(model: string) {
  return getLanguageModel(`dashscope:${model}`);
}
