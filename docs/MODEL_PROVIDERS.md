# 模型供应商配置

本项目支持两种模型配置方式：

1. 部署方通过环境变量配置公共可选模型。
2. 用户在分析页点击“配置模型”，选择供应商、模型并填写自己的 API Key。

用户在弹窗里填写的 API Key 只保存在当前浏览器 localStorage，不写入数据库；发起摘要、对话、知识提取、模板生成等请求时，会随请求发送给本应用后端用于本次模型调用。

## 通用规则

- `DEFAULT_LLM_PROVIDER`: 默认供应商，默认 `dashscope`
- `DEFAULT_LLM_MODEL` / `ANALYZE_MODEL`: 默认模型名
- 各供应商的 `*_MODELS` 使用英文逗号分隔
- 支持自定义 OpenAI-compatible Endpoint，用于接入其他兼容厂商

## 供应商变量

```bash
# DashScope / 通义千问
DASHSCOPE_API_KEY=
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
DASHSCOPE_MODELS=qwen-plus,qwen-turbo

# DeepSeek
DEEPSEEK_API_KEY=
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODELS=deepseek-chat,deepseek-reasoner

# MiniMax
MINIMAX_API_KEY=
MINIMAX_BASE_URL=https://api.minimax.io/v1
MINIMAX_MODELS=MiniMax-M2.7,MiniMax-M2.7-highspeed,MiniMax-Text-01

# OpenAI / GPT
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODELS=gpt-4.1-mini,gpt-4o-mini

# Kimi / Moonshot
KIMI_API_KEY=
KIMI_BASE_URL=https://api.moonshot.cn/v1
KIMI_MODELS=moonshot-v1-8k,kimi-k2-0711-preview

# GLM / 智谱
GLM_API_KEY=
GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4
GLM_MODELS=glm-4-flash,glm-4-plus

# 小米 MiMo
XIAOMI_API_KEY=
XIAOMI_BASE_URL=https://api.xiaomimimo.com/v1
XIAOMI_MODELS=mimo-v2.5-pro,mimo-v2.5,mimo-v2.5-flash

# Anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=
ANTHROPIC_MODELS=claude-3-5-haiku-latest

# 自定义 OpenAI-compatible
CUSTOM_LLM_NAME=自定义模型
CUSTOM_LLM_API_KEY=
CUSTOM_LLM_BASE_URL=
CUSTOM_LLM_MODELS=my-model
```

配置完成后重启服务，分析页顶部会出现可选模型。

## 页面内配置

分析页顶部点击“配置模型”，可选择：

- 通义千问
- DeepSeek
- MiniMax
- OpenAI GPT
- Kimi
- 智谱 GLM
- 小米 MiMo
- Anthropic
- 自定义 OpenAI-compatible Endpoint

填写 API Key 后点击“保存并使用”，顶部模型下拉会出现“我的配置”。例如要切换到 MiniMax：

1. 点击“配置模型”。
2. 供应商选择 `MiniMax`。
3. 模型选择或输入 `MiniMax-M2.7`。
4. 填写 MiniMax API Key。
5. 保存并使用。
