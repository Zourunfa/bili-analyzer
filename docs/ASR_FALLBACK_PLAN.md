# 语音转写兜底方案

本文档记录章节解析和普通视频分析中的语音转写兜底策略。目标是在 B 站没有 CC 字幕、免费 ASR 通道不稳定时，仍然尽量完成章节解析，并让用户清楚知道当前失败点和后续选择。

## 背景问题

当前默认转写依赖 `videocaptioner transcribe`，免费通道主要是：

- `jianying`
- `bijian`

此前 `bijian` 曾持续返回 `BcutASR duration limit exceeded`，当时即使音频切到 15 秒小段仍然失败。这说明问题不一定只在本地切块长度，也可能是免费 ASR 后端本身被限制或策略变化。

## 兜底顺序

推荐转写链路：

```text
1. B站 CC 字幕
2. jianying
3. bijian
4. whisper-api
5. 用户交互：重试当前章节 / 跳过继续 / 停止队列
```

说明：

- 有 CC 字幕时直接使用 CC 字幕，不走语音转写。
- `jianying`、`bijian` 免费但不稳定，适合作为低成本优先方案。
- `whisper-api` 付费但稳定，适合作为最终兜底。
- 章节队列中某一章失败时，不应阻塞整个合集，交给用户决定是否跳过。

## 环境变量

不要把真实 API Key 写进代码或文档。只放在服务器 `.env` 或部署平台 Secret 中。

```bash
# ASR 后端顺序。没有 OpenAI/Whisper Key 时建议：
TRANSCRIBE_ASR_PROVIDERS=bijian,jianying

# 配置 Whisper 后建议：
TRANSCRIBE_ASR_PROVIDERS=bijian,jianying,whisper-api

# Whisper API Key。优先读 WHISPER_API_KEY，没有则读 OPENAI_API_KEY。
WHISPER_API_KEY=sk-...

# 如果使用 OpenAI 官方接口，可以不配 base。
# 如果使用兼容 OpenAI 的第三方接口，再配置：
WHISPER_API_BASE=https://api.openai.com/v1

# 默认 whisper-1，也可以改成兼容服务支持的模型名。
WHISPER_MODEL=whisper-1

# 单段音频切片时长。默认接近 videocaptioner 原始内部分块长度。
TRANSCRIBE_SEGMENT_SECONDS=600
```

## 代码策略

`src/lib/videocaptioner.ts` 应保持以下行为：

- 先按较大的时间段切分音频，避免单段音频过长，也避免过多 ASR 请求。
- 每个小段按 ASR provider 顺序尝试。
- 如果 provider 返回 `duration limit exceeded`，切换到下一个 provider。
- 如果 provider 返回网络波动、429、5xx、缺字段等瞬时错误，对当前 provider 重试。
- 每个小段成功后，将 SRT 时间轴按 offset 平移。
- 全部小段完成后重新编号并合并为完整 SRT。

## 章节队列交互

章节解析失败时弹窗：

```text
P13 解析失败
语音转写失败：...

[重试当前章节] [跳过继续]
```

交互规则：

- `重试当前章节`：刷新当前章节，重新执行 CC 字幕检查和转写。
- `跳过继续`：进入下一章节，保留当前章节未完成状态。
- 最后一章失败时，第二按钮改为 `停止队列`。

从章节合集重新进入时：

- 检查合集里是否存在 `BVxxx_pN` 形式的视频。
- 获取原始 B 站分 P 列表。
- 对比已保存章节和完整章节。
- 如果发现未完成章节，弹窗询问是否从第一个未完成章节继续。

## 安全要求

- 不要在 Git、文档、聊天记录、部署脚本中写真实 API Key。
- 如果 Key 曾经暴露，应立即在控制台撤销并重新生成。
- 服务器 `.env` 更新后，需要重新启动 PM2 进程。

## 部署步骤

1. 在服务器 `.env` 增加 Whisper 相关配置。
2. 本地或 CI 重新构建 standalone 产物。
3. 上传 release。
4. 切换 PM2 到新 release。
5. 验证 `/api/transcribe` 能在 `jianying/bijian` 失败后进入 `whisper-api`。

## 后续优化

- 在模型配置弹窗里新增“语音转写模型”设置，让用户选择免费优先或稳定优先。
- 支持火山/阿里/腾讯 ASR，作为比 OpenAI Whisper 更适合中文视频的可选付费通道。
- 给章节队列增加整体进度面板，展示每个章节状态：已完成、解析中、失败、已跳过。
