## ADDED Requirements

### Requirement: Server exposes configured model providers
系统 SHALL 提供模型配置接口，返回当前服务端已配置且可供前端选择的模型供应商和模型列表。

#### Scenario: List configured providers
- **WHEN** 客户端请求模型配置接口
- **THEN** 系统返回至少一个默认模型，并且不返回任何 API Key 或敏感环境变量

#### Scenario: Hide unconfigured providers
- **WHEN** 某个供应商没有配置 API Key
- **THEN** 系统不在可选模型列表中展示该供应商

### Requirement: AI APIs accept model preference
系统 SHALL 允许 AI 生成接口接收模型偏好并使用对应供应商调用模型。

#### Scenario: Use selected model
- **WHEN** 客户端请求摘要或对话并携带有效 `modelId`
- **THEN** 系统使用该 `modelId` 对应的供应商和模型生成回复

#### Scenario: Fallback to default model
- **WHEN** 客户端未携带 `modelId` 或携带不可用的 `modelId`
- **THEN** 系统使用默认模型生成回复，不中断现有流程

#### Scenario: Use user supplied runtime config
- **WHEN** 客户端携带有效 `modelConfig`，包含供应商类型、模型名、API Key 和必要的 Base URL
- **THEN** 系统使用该运行时配置完成本次 AI 调用，并且不把 API Key 写入数据库

### Requirement: Support common and custom providers
系统 SHALL 支持 DashScope/Qwen、DeepSeek、MiniMax、OpenAI、Kimi、GLM、小米 MiMo、Anthropic 以及自定义 OpenAI-compatible Endpoint。

#### Scenario: Configure custom provider
- **WHEN** 运维配置自定义 Base URL、API Key 和模型名
- **THEN** 系统将该自定义模型作为可选项展示并可用于 AI 生成

#### Scenario: Preserve Qwen default
- **WHEN** 仅配置现有 `DASHSCOPE_API_KEY` 和 `ANALYZE_MODEL`
- **THEN** 系统继续使用千问作为默认模型，现有功能保持可用

### Requirement: Persist client model selection locally
系统 SHALL 在前端保存用户最近选择的模型，并在后续 AI 请求中自动携带。

#### Scenario: Remember selected model
- **WHEN** 用户在分析页选择一个模型
- **THEN** 页面刷新后仍默认选中该模型，并在摘要和对话请求中携带该模型

### Requirement: Configure personal model in analyze page
系统 SHALL 在分析页提供模型配置入口，允许用户自行填写供应商 API Key 并立即切换使用。

#### Scenario: Configure MiniMax from UI
- **WHEN** 用户点击“配置模型”，选择 MiniMax，填写模型名和 API Key 后保存
- **THEN** 系统在模型下拉中展示该用户配置，并在后续摘要和对话请求中携带该配置

#### Scenario: Clear personal model config
- **WHEN** 用户在配置弹窗中清除本地配置
- **THEN** 系统删除浏览器中的用户模型配置，并回退到服务端已配置模型或默认模型
