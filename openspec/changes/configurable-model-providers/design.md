## Context

当前 AI 调用散落在摘要、对话、知识提取、UP 主分析、Skill 导出和模板生成接口中，统一通过 `src/lib/qwen.ts` 的 `qwen(getAnalyzeModel())` 创建模型。该实现默认 DashScope/Qwen，并有少量 Anthropic 兼容环境变量，但供应商、Base URL、API Key 和模型选择没有统一抽象，也没有前端选择入口。

## Goals / Non-Goals

**Goals:**
- 统一封装文本生成模型解析，支持多供应商与自定义 OpenAI-compatible Endpoint。
- 默认继续使用现有千问配置，保持无破坏升级。
- 前端可获取可用模型配置并在分析页选择模型。
- 摘要、对话、知识提取、UP 主分析、Skill 导出、模板生成复用同一个模型解析器。

**Non-Goals:**
- 不在数据库保存用户私有 API Key。
- 不内置实时模型列表同步。
- 不改 Embedding 模型，`text-embedding-v3` 暂继续走 DashScope。

## Decisions

### 决策 1：支持环境变量预设与用户运行时配置

新增 `src/lib/llm.ts`，读取环境变量生成 `ModelProviderConfig[]`：
- DashScope/Qwen：`DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`、`DASHSCOPE_MODELS`
- DeepSeek：`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODELS`
- MiniMax：`MINIMAX_API_KEY`、`MINIMAX_BASE_URL`、`MINIMAX_MODELS`
- OpenAI：`OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_MODELS`
- Kimi/Moonshot：`KIMI_API_KEY`、`KIMI_BASE_URL`、`KIMI_MODELS`
- GLM/Zhipu：`GLM_API_KEY`、`GLM_BASE_URL`、`GLM_MODELS`
- 小米 MiMo：`XIAOMI_API_KEY`、`XIAOMI_BASE_URL`、`XIAOMI_MODELS`
- Custom：`CUSTOM_LLM_API_KEY`、`CUSTOM_LLM_BASE_URL`、`CUSTOM_LLM_MODELS`
- Anthropic：沿用 `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_BASE_URL`

模型列表用逗号分隔。未配置模型列表时使用安全默认值；未配置 API Key 的供应商不出现在前端可选项中。

同时，分析页提供“配置模型”弹窗，用户可选择供应商预设、填写模型名和 API Key。该配置保存在浏览器 localStorage，并以 `modelConfig` 随摘要、对话、知识提取和模板生成请求发送给后端。后端优先使用 `modelConfig` 创建本次调用的模型，不将该 Key 写入数据库。

### 决策 2：默认采用 OpenAI-compatible Provider

DeepSeek、MiniMax、OpenAI、Kimi、GLM、小米 MiMo、DashScope 都通过 `@ai-sdk/openai-compatible` 接入。Anthropic 使用 `@ai-sdk/anthropic` 单独处理。

原因：最少依赖、覆盖面最大，且用户可通过自定义 Base URL 接入后续新增厂商。

### 决策 3：用模型 id 表示选择

前端与 API 传递 `modelId`，格式为 `<providerId>:<modelName>`，例如：
- `dashscope:qwen-plus`
- `deepseek:deepseek-chat`
- `openai:gpt-4.1-mini`
- `custom:my-model`

服务端解析并校验 provider 是否已配置。若 `modelId` 缺失或不可用，回退默认模型。

### 决策 4：前端选择和用户 Key 不落库

分析页用 localStorage 保存用户最近选择的模型和用户自填配置。请求摘要、对话等接口时携带 `modelId` 或 `modelConfig`。这避免新增用户设置表，同时满足单机使用的模型切换需求。

## 数据模型设计

首版不新增数据库表。部署级模型供应商使用环境变量；用户自填模型配置和最近选择是前端偏好，存储在 localStorage。

## Risks / Trade-offs

- [Risk] 某些厂商虽 OpenAI-compatible 但参数细节不同 → Mitigation：首版只使用通用 chat/completion 能力，不传厂商特有参数。
- [Risk] 前端暴露未配置供应商造成调用失败 → Mitigation：`GET /api/models` 只返回服务端检测到 API Key 的供应商；用户自填配置由弹窗校验 API Key、模型名和 Base URL。
- [Risk] 用户 API Key 存在浏览器 localStorage 中 → Mitigation：不落库、不写日志、不通过模型配置接口返回，界面明确说明存储位置。
- [Risk] 模型名更新频繁 → Mitigation：支持环境变量覆盖与 custom provider。

## Migration Plan

1. 新增 `src/lib/llm.ts` 并兼容导出原 `qwen/getAnalyzeModel`。
2. 替换 API 调用中的模型解析。
3. 新增 `/api/models` 配置读取接口。
4. 分析页增加模型选择控件和“配置模型”弹窗，传递 `modelId` 或用户 `modelConfig`。
5. 部署时按需补充供应商 API Key 与模型列表环境变量。

## Open Questions

- 是否后续需要按用户保存默认模型？首版先不做，等部署级配置稳定后再评估。
