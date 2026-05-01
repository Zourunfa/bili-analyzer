## 1. LLM Configuration

- [x] 1.1 [P0] Add unified LLM config module with provider presets, env parsing, default fallback, and OpenAI-compatible/Anthropic model factories
- [x] 1.2 [P0] Keep backward-compatible exports for existing `qwen()` and `getAnalyzeModel()` callers during migration

## 2. API Integration

- [x] 2.1 [P0] Add `GET /api/models` returning safe provider/model metadata
- [x] 2.2 [P0] Update summarize/chat/knowledge/template/skill/upowner AI routes to accept optional `modelId`
- [x] 2.3 [P0] Ensure invalid or missing `modelId` falls back to the configured default model
- [x] 2.4 [P0] Allow AI routes to accept request-scoped `modelConfig` without persisting user API Key

## 3. Frontend

- [x] 3.1 [P0] Add model selector state, localStorage persistence, and model metadata loading to analyze page
- [x] 3.2 [P0] Send selected `modelId` with summary and chat requests
- [x] 3.3 [P1] Add compact UI affordance showing current model and fallback state
- [x] 3.4 [P0] Add “配置模型” button and modal for provider/model/API Key input
- [x] 3.5 [P0] Persist user runtime model config in localStorage and send it as `modelConfig`
- [x] 3.6 [P0] Add MiniMax M2.7 and Xiaomi MiMo presets to model configuration UI

## 4. Documentation and Verification

- [x] 4.1 [P1] Document environment variables for DeepSeek, MiniMax, OpenAI, Kimi, GLM, Xiaomi MiMo, Anthropic, DashScope, and custom provider
- [x] 4.2 [P0] Run OpenSpec validation and production build
