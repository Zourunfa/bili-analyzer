# SSE 流式输出修复文档

## 问题

Next.js 15 App Router + AI SDK 场景下，`streamText().toTextStreamResponse()` 返回的响应在 Nginx 反向代理后无法流式推送——客户端必须等整个响应结束后才能拿到数据。

### 影响范围

| 接口 | 状态 |
|------|------|
| `/api/transcribe` | ✅ 正常（未用 AI SDK） |
| `/api/summarize` | ❌ 无流式（已修复） |
| `/api/chat` | ❌ 无流式（已修复） |

## 根因

AI SDK 的 `toTextStreamResponse()` 返回：

```
Content-Type: text/plain; charset=utf-8
```

Next.js 15 App Router 将 `text/plain` 识别为 RSC 兼容格式，会经过缓冲层——**等流中所有数据收集完毕后才向下游推送**。`text/event-stream`（SSE）则不会被缓冲，原样透传。

## 解决方案

统一改为原生 SSE 格式，手动构建 `ReadableStream`，显式设置 `Content-Type: text/event-stream; charset=utf-8`。

### 后端实现（参考 `/api/summarize/route.ts`）

```typescript
import { streamText } from "ai";
import { qwen } from "@/lib/qwen";
import { SUMMARY_SYSTEM_PROMPT } from "@/lib/prompts";

export async function POST(req: NextRequest) {
  const { subtitleText } = await req.json();

  const result = streamText({
    model: qwen("qwen-plus"),
    system: SUMMARY_SYSTEM_PROMPT,
    messages: [{ role: "user", content: `请分析以下视频字幕内容并生成摘要：\n\n${subtitleText}` }],
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text: string) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "text", content: text })}\n\n`)
        );
      };

      try {
        for await (const chunk of result.textStream) {
          send(chunk);
        }
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "finish" })}\n\n`)
        );
        controller.close();
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: err instanceof Error ? err.message : "失败" })}\n\n`)
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
```

### SSE 格式规范

```
data: {"type":"text","content":"逐字内容"}
data: {"type":"text","content":"下一个"}
data: {"type":"finish"}
```

| 事件类型 | 用途 |
|----------|------|
| `text` | 流式文本片段，前端累加显示 |
| `finish` | 结束信号 |
| `error` | 错误信息 |

### 前端解析逻辑

```typescript
const reader = res.body?.getReader();
const decoder = new TextDecoder();
if (reader) {
  let sseBuffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });
    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() || ""; // 保留不完整的行，等待下次补全
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (event.type === "text") {
          setText((prev) => prev + event.content); // 累加显示
        } else if (event.type === "error") {
          setError(event.message);
        }
      } catch {
        // 忽略解析错误（SSE 行可能不完整）
      }
    }
  }
}
```

**关键点**：必须用 `sseBuffer` 累积未完成的行，因为 TCP 分包可能导致一行数据被切割到多个 chunk。

### Nginx 配置要点

```nginx
proxy_cache off;
proxy_buffering off;
chunked_transfer_encoding on;
proxy_http_version 1.1;
```

关键响应头（后端设置，Nginx 透传）：

```
Content-Type: text/event-stream
Cache-Control: no-cache
X-Accel-Buffering: no
```

## 已修复文件

| 文件 | 修改 |
|------|------|
| `src/app/api/summarize/route.ts` | `toTextStreamResponse()` → SSE `ReadableStream` |
| `src/app/api/chat/route.ts` | `toTextStreamResponse()` → SSE `ReadableStream` |
| `src/app/analyze/[bvid]/page.tsx` | `handleChat` 改为 SSE 事件解析 |

## 验证命令

```bash
curl -si --max-time 15 -X POST https://www.afai.asia/api/summarize \
  -H "Content-Type: application/json" \
  -d '{"subtitleText":"仁科今年35岁，是乐队主唱"}'

curl -si --max-time 15 -X POST https://www.afai.asia/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"你好"}],"subtitleText":"仁科35岁"}'
```

**成功标志**：`Content-Type: text/event-stream` + `Transfer-Encoding: chunked`，逐字返回。

## 教训

- AI SDK `toTextStreamResponse()` 对 Next.js 15 App Router 不是真正的流式（`text/plain` 被缓冲）
- 真正的服务端推送必须用 `text/event-stream`，Next.js 识别为原生流式类型
- SSE 行解析必须处理 TCP 分包：缓冲不完整行，等待下次 `read()` 补全
