import { execFile } from "child_process";
import { mkdir, readFile, rm, readdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const VC = "videocaptioner";
const TMP_BASE = "/tmp/bilibili-subtitle";

function getEnvMs(name: string, fallback: number): number {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(raw) && raw > 10_000 ? raw : fallback;
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

// bcut/bijian/jianying API 偶发返回缺字段（如 'data'/'state'/'task_id'/'result'）、
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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
 * 对 bcut/bijian/jianying 接口的瞬时错误（KeyError: 'data' 等）自动重试。
 * BaseASR 使用 CRC32 缓存（2天），已成功的分块不会重复请求接口。
 */
export async function transcribeAudio(
  videoPath: string
): Promise<string> {
  const transcribeTimeoutMs = getEnvMs("TRANSCRIBE_TIMEOUT_MS", 900_000);
  const maxAttempts = Math.max(
    1,
    Number.parseInt(process.env.TRANSCRIBE_MAX_RETRIES || "3", 10) || 3
  );
  const workDir = join(TMP_BASE, randomUUID());
  await mkdir(workDir, { recursive: true });

  const outputPath = join(workDir, "subtitle.srt");

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await exec(VC, [
        "transcribe",
        videoPath,
        "--asr", "bijian",
        "--format", "srt",
        "-o", outputPath,
        "-q",
      ], transcribeTimeoutMs);
      return await readFile(outputPath, "utf-8");
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts || !isTransientTranscribeError(err)) {
        throw err;
      }
      const backoffMs = 2_000 * attempt + Math.floor(Math.random() * 1_000);
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[transcribe] attempt ${attempt}/${maxAttempts} failed (transient): ${msg.slice(0, 200)} — retrying in ${backoffMs}ms`
      );
      await sleep(backoffMs);
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("转写失败");
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
