import { execFile } from "child_process";
import { mkdir, readFile, rm, readdir } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

const VC = "videocaptioner";
const TMP_BASE = "/tmp/bilibili-subtitle";

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
    execFile(cmd, args, { timeout }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * 只下载B站视频的音频轨道，返回音频文件路径
 * 使用 yt-dlp -x 只提取音频，文件更小、下载更快
 */
export async function downloadAudio(bvid: string): Promise<string> {
  const workDir = join(TMP_BASE, randomUUID());
  await mkdir(workDir, { recursive: true });

  const url = `https://www.bilibili.com/video/${bvid}`;
  const outputPath = join(workDir, "audio.%(ext)s");

  const args = [
    "-x",                        // 只提取音频
    "--audio-format", "m4a",     // 输出 m4a 格式
    "-o", outputPath,
    "--no-playlist",
  ];

  // 带 SESSDATA cookie 避免 B站 412 错误
  const sessdata = process.env.BILIBILI_SESSDATA;
  if (sessdata) {
    args.push("--add-header", `Cookie: SESSDATA=${sessdata}`);
  }

  args.push(url);

  await exec("yt-dlp", args);

  // 找到下载的音频文件
  const files = await readdir(workDir);
  const audioFile = files.find((f) => f.endsWith(".m4a") || f.endsWith(".opus") || f.endsWith(".webm"));

  if (!audioFile) {
    throw new Error("下载音频失败：未找到音频文件");
  }

  return join(workDir, audioFile);
}

/**
 * 语音转写，返回 SRT 文本
 */
export async function transcribeAudio(
  videoPath: string
): Promise<string> {
  const workDir = join(TMP_BASE, randomUUID());
  await mkdir(workDir, { recursive: true });

  const outputPath = join(workDir, "subtitle.srt");
  await exec(VC, [
    "transcribe",
    videoPath,
    "--asr", "bijian",
    "--format", "srt",
    "-o", outputPath,
    "-q",
  ]);

  const srtText = await readFile(outputPath, "utf-8");
  return srtText;
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
 * 清理临时文件
 */
export async function cleanup(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}
