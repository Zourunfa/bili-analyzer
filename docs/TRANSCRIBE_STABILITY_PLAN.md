# 转写稳态优化方案（P0 已落地）

## 1. 背景与问题现象

线上处理较大音频（例如约 94MB）时，出现以下问题链路：

1. 音频下载完成后，转写阶段长时间无响应。
2. 前端最终显示“处理失败，请重试”。
3. 服务器负载升高，极端情况下 SSH 连接也超时或无法连接。

该问题在本地不明显，在低配/共享资源服务器上更容易复现。

---

## 2. 根因判断

结合代码与日志，属于“长任务 + 资源竞争 + SSE 长连接稳定性”复合问题：

1. 转写为高 CPU/内存任务，多个并发会放大资源压力。
2. 大音频文件会显著拉长处理时长并增加 IO 压力。
3. 转写阶段如果长时间不输出，SSE 可能被网关判定为空闲连接。
4. 下载阶段若不处理写盘背压，可能在高负载时出现写入堆积。

---

## 3. 本次已落地改动（代码）

### 3.1 转写并发保护（全局队列）

- 新增：`src/lib/transcribe-guard.ts`
- 能力：全局可配置并发（默认 1），超出后排队，任务完成后释放槽位。

接入点：

- `src/app/api/transcribe/route.ts`
- `src/app/api/upowner/analyze/route.ts`

效果：防止多个转写同时执行把服务器打满。

### 3.2 大音频限制 + 下载超时

文件：`src/lib/bilibili.ts`

- 新增环境变量：
  - `TRANSCRIBE_MAX_AUDIO_MB`（默认 `60`）
  - `AUDIO_DOWNLOAD_TIMEOUT_MS`（默认 `300000`）
- 当 `content-length` 或实际流式下载累计大小超过阈值时提前失败。

效果：提前拦截超大任务，避免机器被拖垮。

### 3.3 下载写盘稳定性（背压处理）

文件：`src/lib/bilibili.ts`

- 对 `writeStream.write()` 增加 `drain` 等待。
- 下载结束后等待 `finish` 再返回。
- 增加超时 `AbortController` 控制。

效果：降低大文件下载时写入阻塞与不完整写入风险。

### 3.4 转写超时可配置

文件：`src/lib/videocaptioner.ts`

- 新增环境变量：`TRANSCRIBE_TIMEOUT_MS`（默认 `900000`，15 分钟）
- 转写命令超时从固定值改为可配置。

效果：避免“中等偏大视频”因 5 分钟默认超时被误杀。

### 3.5 SSE 心跳保活

文件：`src/app/api/transcribe/route.ts`

- 转写阶段每 15 秒推送一次状态消息。

效果：降低反向代理/网关因“长时间无数据”主动断开 SSE 的概率。

---

## 4. 生产环境配置（必做）

在服务器 `.env.local` 中增加：

```bash
TRANSCRIBE_MAX_CONCURRENCY=1
TRANSCRIBE_MAX_AUDIO_MB=60
AUDIO_DOWNLOAD_TIMEOUT_MS=300000
TRANSCRIBE_TIMEOUT_MS=900000
```

说明：

- 若机器规格较小（1C2G/2C2G），建议先保持 `MAX_CONCURRENCY=1`。
- `MAX_AUDIO_MB` 可按机器能力从 60 逐步调高到 80/100，先观测再调整。

---

## 5. PM2 建议配置

建议启用内存保护，避免单进程异常占用拖垮整机：

```bash
pm2 delete subtitle
pm2 start npm --name subtitle -- start --max-memory-restart 700M
pm2 save
```

更新环境变量后：

```bash
pm2 restart subtitle --update-env
```

---

## 6. Nginx 建议（SSE）

针对 `/api/transcribe`（以及批量分析 SSE 路由）提高超时并关闭缓冲：

```nginx
location /api/transcribe {
  proxy_read_timeout 900s;
  proxy_send_timeout 900s;
  proxy_buffering off;
}
```

应用配置：

```bash
nginx -t && nginx -s reload
```

---

## 7. 验证清单

部署后按以下顺序验收：

1. 小视频（<20MB 音频）可完整走完下载->转写->摘要。
2. 中视频（30-60MB）可成功或在超时内明确失败并清理临时文件。
3. 超限视频（>60MB）会快速返回“音频过大”错误（预期行为）。
4. 并发发起 2 个转写时：一个执行、一个排队（日志可见）。
5. 服务器在压力测试后仍可正常 SSH 登录。

---

## 8. 运维排障命令（建议）

```bash
# 查看系统资源
free -h
top
df -h

# 查看内核 OOM 记录
dmesg -T | egrep -i 'killed process|out of memory|oom'

# 查看进程与日志
pm2 ls
pm2 logs subtitle --lines 200
```

---

## 9. 回滚策略

若新策略影响业务可临时回滚：

1. 提高音频阈值：`TRANSCRIBE_MAX_AUDIO_MB=100`
2. 放宽转写超时：`TRANSCRIBE_TIMEOUT_MS=1200000`
3. 仍建议保留 `TRANSCRIBE_MAX_CONCURRENCY=1`（不要回滚并发保护）

回滚后执行：

```bash
pm2 restart subtitle --update-env
```

---

## 10. 下一步（P1/P2）

建议后续升级为“异步任务队列模式”（API 提交任务 + Worker 执行 + 状态轮询/订阅）：

1. 避免 Web 请求与重计算强耦合。
2. 失败重试、任务去重、可观测性更完整。
3. 便于水平扩容。

