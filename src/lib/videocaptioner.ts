import { execFile } from "child_process";
import { mkdir, readFile, rm, readdir, stat } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const VC = "videocaptioner";
const TMP_BASE = "/tmp/bilibili-subtitle";

function getEnvMs(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(raw) && raw > 10_000 ? raw : fallback;
}

function getEnvNumber(name: string, fallback: number, min: number, max?: number): number {
  const raw = Number.parseFloat(process.env[name] || "");
  const value = Number.isFinite(raw) && raw >= min ? raw : fallback;
  return typeof max === "number" ? Math.min(value, max) : value;
}

interface SubtitleItem {
  from: number;
  to: number;
  content: string;
}

function exec(
  cmd: string,
  args: string[],
  timeout = 300_000
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// bijian/jianying API 偶发返回缺字段（如 'data'/'state'/'task_id'/'result'）、
// 网络抖动或 5xx，都属于可重试的瞬时错误。
function isTransientTranscribeError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    /error:\s*'(data|state|task_id|result|utterances|download_url)'/.test(msg) ||
    /keyerror/.test(msg) ||
    /econnreset|etimedout|enetunreach|socket hang up/.test(msg) ||
    /\b(429|500|502|503|504)\b/.test(msg) ||
    /connection (reset|aborted|refused)/.test(msg) ||
    /read timed out|timeout/.test(msg)
  );
}

function isAsrProviderLimitError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    /duration limit exceeded/.test(msg) ||
    /时长.*限制/.test(msg) ||
    /音频.*过长/.test(msg)
  );
}

function getAsrProviders(): string[] {
  const whisperApiKey = process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY || "";
  const defaultProviders = whisperApiKey ? "bijian,jianying,whisper-api" : "bijian,jianying";
  const raw = process.env.TRANSCRIBE_ASR_PROVIDERS || defaultProviders;
  const supported = new Set(["faster-whisper", "whisper-api", "bijian", "jianying", "whisper-cpp"]);
  const providers = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item && supported.has(item))
    .filter((item) => item !== "whisper-api" || !!whisperApiKey);
  return providers.length > 0 ? [...new Set(providers)] : ["bijian", "jianying"];
}

function hasWhisperApiKey(): boolean {
  return !!(process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY);
}

function getTranscribeArgs(inputPath: string, outputPath: string, asrProvider: string): string[] {
  const args = [
    "transcribe",
    inputPath,
    "--asr", asrProvider,
    "--format", "srt",
    "-o", outputPath,
    "-q",
  ];

  if (asrProvider === "whisper-api") {
    const apiKey = process.env.WHISPER_API_KEY || process.env.OPENAI_API_KEY || "";
    const apiBase = process.env.WHISPER_API_BASE || process.env.OPENAI_BASE_URL || "";
    const model = process.env.WHISPER_MODEL || "whisper-1";
    if (apiKey) args.push("--whisper-api-key", apiKey);
    if (apiBase) args.push("--whisper-api-base", apiBase);
    if (model) args.push("--whisper-model", model);
  }

  return args;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function getMediaDurationSeconds(filePath: string): Promise<number> {
  const output = await exec("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ], 60_000);
  const duration = Number.parseFloat(output);
  return Number.isFinite(duration) && duration > 0 ? duration : 0;
}

function formatSrtTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const secs = Math.floor(clamped % 60);
  const millis = Math.round((clamped - Math.floor(clamped)) * 1000);
  return [
    String(hours).padStart(2, "0"),
    String(minutes).padStart(2, "0"),
    String(secs).padStart(2, "0"),
  ].join(":") + `,${String(millis).padStart(3, "0")}`;
}

function shiftSrtTimestamps(srtText: string, offsetSeconds: number): string {
  return srtText.replace(
    /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/g,
    (line, h1, m1, s1, ms1, h2, m2, s2, ms2) => {
      const from =
        Number(h1) * 3600 + Number(m1) * 60 + Number(s1) + Number(ms1) / 1000 + offsetSeconds;
      const to =
        Number(h2) * 3600 + Number(m2) * 60 + Number(s2) + Number(ms2) / 1000 + offsetSeconds;
      return `${formatSrtTime(from)} --> ${formatSrtTime(to)}`;
    }
  );
}

function renumberSrt(srtText: string): string {
  const blocks = srtText
    .trim()
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(Boolean);

  return blocks
    .map((block, index) => {
      const lines = block.split("\n");
      if (/^\d+$/.test(lines[0]?.trim() || "")) {
        return [String(index + 1), ...lines.slice(1)].join("\n");
      }
      return [String(index + 1), ...lines].join("\n");
    })
    .join("\n\n");
}

async function splitAudioForTranscribe(
  audioPath: string,
  workDir: string,
  segmentSeconds: number
): Promise<Array<{ path: string; offsetSeconds: number }>> {
  const duration = await getMediaDurationSeconds(audioPath);
  if (!duration || duration <= segmentSeconds) {
    return [{ path: audioPath, offsetSeconds: 0 }];
  }

  const chunks: Array<{ path: string; offsetSeconds: number }> = [];
  for (let offset = 0, index = 1; offset < duration; offset += segmentSeconds, index++) {
    const chunkPath = join(workDir, `chunk-${String(index).padStart(3, "0")}.m4a`);
    await exec("ffmpeg", [
      "-ss", String(offset),
      "-t", String(segmentSeconds),
      "-i", audioPath,
      "-vn",
      "-ac", "1",
      "-ar", "16000",
      "-c:a", "aac",
      "-b:a", "64k",
      "-y",
      chunkPath,
    ], 120_000);

    const info = await stat(chunkPath).catch(() => null);
    if (info && info.size > 0) {
      chunks.push({ path: chunkPath, offsetSeconds: offset });
    }
  }

  return chunks.length > 0 ? chunks : [{ path: audioPath, offsetSeconds: 0 }];
}

/**
 * 下载B站视频并用 ffmpeg 提取音频轨道
 * videocaptioner 内部处理 B站认证（避免 yt-dlp 的 412 问题）
 */
export async function downloadAudio(bvid: string): Promise<string> {
  const workDir = join(TMP_BASE, randomUUID());
  await mkdir(workDir, { recursive: true });

  // Step 1: 用 videocaptioner 下载视频（它内部处理 B站 WBI 认证）
  const url = `https://www.bilibili.com/video/${bvid}`;
  await exec(VC, ["download", url, "-o", workDir]);

  const files = await readdir(workDir);
  const videoFile = files.find(
    (f) => f.endsWith(".mp4") || f.endsWith(".mkv") || f.endsWith(".webm")
  );
  if (!videoFile) {
    throw new Error("下载视频失败：未找到视频文件");
  }
  const videoPath = join(workDir, videoFile);

  // Step 2: 用 ffmpeg 提取音频轨道（文件更小，转写更快）
  const audioPath = join(workDir, "audio.m4a");
  await exec("ffmpeg", [
    "-i", videoPath,
    "-vn",              // 不要视频
    "-acodec", "copy",  // 直接拷贝音频流，不重新编码（极快）
    "-y",               // 覆盖已有文件
    audioPath,
  ]);

  // 删掉视频文件，只保留音频
  await rm(videoPath, { force: true });

  return audioPath;
}

/**
 * 语音转写，返回 SRT 文本
 *
 * 对 bijian/jianying 接口的瞬时错误（KeyError: 'data' 等）自动重试。
 * BaseASR 使用 CRC32 缓存（2天），已成功的分块不会重复请求接口。
 */
export async function transcribeAudio(
  videoPath: string
): Promise<string> {
  const transcribeTimeoutMs = getEnvMs("TRANSCRIBE_TIMEOUT_MS", 900_000);
  // Keep the pre-split interval close to videocaptioner's original internal
  // chunk length, so long videos do not explode into hundreds of ASR requests.
  const segmentSeconds = getEnvNumber("TRANSCRIBE_SEGMENT_SECONDS", 600, 30);
  const maxAttempts = Math.max(
    1,
    Number.parseInt(process.env.TRANSCRIBE_MAX_RETRIES || "3", 10) || 3
  );
  const workDir = join(TMP_BASE, randomUUID());
  await mkdir(workDir, { recursive: true });

  const chunks = await splitAudioForTranscribe(videoPath, workDir, segmentSeconds);
  const merged: string[] = [];
  const asrProviders = getAsrProviders();
  const triedProviders = new Set<string>();

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const chunk = chunks[chunkIndex];
    const outputPath = join(workDir, `subtitle-${String(chunkIndex + 1).padStart(3, "0")}.srt`);

    let lastErr: unknown;
    let chunkDone = false;
    for (const asrProvider of asrProviders) {
      triedProviders.add(asrProvider);
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await exec(VC, getTranscribeArgs(chunk.path, outputPath, asrProvider), transcribeTimeoutMs);

          const srt = await readFile(outputPath, "utf-8");
          if (srt.trim()) {
            merged.push(shiftSrtTimestamps(srt, chunk.offsetSeconds));
          }
          chunkDone = true;
          break;
        } catch (err) {
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          const canTryNextProvider = attempt >= maxAttempts && asrProviders.length > 1;

          if (isAsrProviderLimitError(err) && canTryNextProvider) {
            console.warn(
              `[transcribe] ${asrProvider} rejected chunk ${chunkIndex + 1}/${chunks.length}: ${msg.slice(0, 200)} — trying next ASR provider`
            );
            break;
          }

          if (attempt >= maxAttempts || !isTransientTranscribeError(err)) {
            break;
          }

          const backoffMs = 2_000 * attempt + Math.floor(Math.random() * 1_000);
          console.warn(
            `[transcribe] ${asrProvider} chunk ${chunkIndex + 1}/${chunks.length} attempt ${attempt}/${maxAttempts} failed (transient): ${msg.slice(0, 200)} — retrying in ${backoffMs}ms`
          );
          await sleep(backoffMs);
        }
      }

      if (chunkDone) {
        break;
      }
    }

    if (!chunkDone) {
      const suffix = `（已尝试 ASR: ${[...triedProviders].join(", ")}）`;
      const whisperHint = hasWhisperApiKey()
        ? ""
        : "。免费 ASR 通道失败，且未配置 WHISPER_API_KEY / OPENAI_API_KEY，无法进入 whisper-api 兜底";
      if (lastErr instanceof Error) {
        throw new Error(`${lastErr.message}${suffix}${whisperHint}`);
      }
      throw new Error(`转写失败${suffix}${whisperHint}`);
    }
  }

  return renumberSrt(merged.join("\n\n"));
}

/**
 * 解析 SRT 字幕为统一的 SubtitleItem 格式
 */
export function parseSrt(srtText: string): SubtitleItem[] {
  const blocks = srtText.trim().split(/\n\n+/);
  const items: SubtitleItem[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    // SRT format: index, timestamp, text
    if (lines.length < 3) continue;

    const timeLine = lines[1];
    const textLines = lines.slice(2).filter((l) => l.trim());
    if (!timeLine || textLines.length === 0) continue;

    const match = timeLine.match(
      /(\d{2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/
    );
    if (!match) continue;

    const fromSec =
      parseInt(match[1]) * 3600 +
      parseInt(match[2]) * 60 +
      parseInt(match[3]) +
      parseInt(match[4]) / 1000;

    const toSec =
      parseInt(match[5]) * 3600 +
      parseInt(match[6]) * 60 +
      parseInt(match[7]) +
      parseInt(match[8]) / 1000;

    items.push({
      from: fromSec,
      to: toSec,
      content: textLines.join(" "),
    });
  }

  return items;
}

/**
 * 从任意视频 URL 下载音频（使用 yt-dlp）
 * 支持抖音、小红书等平台
 */
export async function downloadAudioFromUrl(videoUrl: string, cookieFile?: string): Promise<string> {
  const workDir = join(TMP_BASE, randomUUID());
  await mkdir(workDir, { recursive: true });

  const args = [
    "--no-playlist",
    "-f", "bestaudio",
    "-o", join(workDir, "audio.%(ext)s"),
    "--extract-audio",
    "--audio-format", "m4a",
    "--no-warnings",
    "-q",
  ];
  if (cookieFile) args.push("--cookies", cookieFile);
  args.push(videoUrl);

  // yt-dlp 下载最佳音轨并提取音频
  await exec("yt-dlp", args);

  // yt-dlp 输出文件名不确定，找最新的 m4a 文件
  const files = await readdir(workDir);
  const audioFile = files.find((f) => f.endsWith(".m4a"));
  if (!audioFile) {
    throw new Error("下载音频失败：未找到音频文件");
  }
  return join(workDir, audioFile);
}

/**
 * 清理临时文件
 */
export async function cleanup(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}
