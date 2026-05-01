## Why

当前 AI 能力默认绑定千问/DashScope，用户无法在 DeepSeek、MiniMax、OpenAI GPT、Kimi、GLM 等模型之间按成本、速度和效果切换。需要把模型选择从代码常量升级为可配置能力，降低后续接入新模型的成本。

## What Changes

- 新增统一模型供应商配置，支持 DashScope/Qwen、DeepSeek、MiniMax、OpenAI、Kimi、GLM、小米 MiMo 以及自定义 OpenAI-compatible Endpoint。
- 分析页新增“配置模型”按钮，用户可在弹窗中选择供应商、模型并填写自己的 API Key。
- 保持现有千问作为默认配置，未配置时不破坏现有功能。
- 后端 AI 调用统一通过模型解析器创建 provider/model，不再直接调用 `qwen(...)`。
- 提供模型配置读取接口，前端可展示当前可用供应商与模型。
- 分析页提供模型选择和模型配置入口，用户可在摘要、对话、知识提取等生成任务中使用所选模型。

## Capabilities

### New Capabilities
- `model-provider-config`: 管理多模型供应商配置、默认模型、用户选择和运行时模型解析。

### Modified Capabilities
- 无。

## Impact

- 后端：替换 `src/lib/qwen.ts` 的固定千问封装，新增统一 LLM 配置模块与模型配置 API。
- 前端：分析页新增模型选择控件，并在 AI 请求中携带模型偏好。
- 环境变量：新增各供应商 API Key/Base URL/Model 配置，兼容现有 `DASHSCOPE_API_KEY` 与 `ANALYZE_MODEL`。
- 安全：服务端环境变量 Key 不暴露；用户自行填写的 Key 仅存当前浏览器 localStorage，并随请求发送给后端用于本次调用。

## 非目标

- 不在数据库保存用户私有 API Key。
- 不实现模型调用费用统计、限流和配额。
- 不承诺内置所有厂商的实时完整模型列表；通过“预设 + 自定义模型名/Base URL”覆盖新模型。
