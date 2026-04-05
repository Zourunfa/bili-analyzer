import { createHash } from "crypto";
import { mkdir, writeFile, createWriteStream } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { Writable } from "stream";

const BILIBILI_API_BASE = "https://api.bilibili.com";

const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 16,
  4, 9, 23, 37, 49, 13, 1, 33, 49, 19, 10, 40, 26, 11, 19, 24,
  26, 41, 55, 34, 54, 16, 23, 22, 46, 40, 31, 53, 6, 42, 51, 30,
];

interface VideoInfo {
  bvid: string;
  aid: number;
  title: string;
  desc: string;
  pic: string;
  owner: {
    name: string;
    face: string;
  };
  duration: number;
  cid: number;
}

interface SubtitleItem {
  from: number;
  to: number;
  content: string;
}

function getMixinKey(raw: string): string {
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i]).join("").slice(0, 32);
}

async function getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  const res = await fetch(`${BILIBILI_API_BASE}/x/web-interface/nav`, {
    headers: getHeaders(),
  });
  const data = await res.json();

  const wbiImg = data.data.wbi_img;
  const imgUrl = wbiImg.img_url || wbiImg.url;
  const subUrl = wbiImg.sub_url;

  if (!imgUrl || !subUrl) {
    throw new Error(`WBI keys 获取失败，wbi_img: ${JSON.stringify(wbiImg)}`);
  }

  const imgKey = imgUrl.split("/").pop()!.split(".")[0];
  const subKey = subUrl.split("/").pop()!.split(".")[0];

  return { imgKey, subKey };
}

function signWbiParams(params: Record<string, string>, imgKey: string, subKey: string): string {
  const mixinKey = getMixinKey(imgKey + subKey);
  const wts = Math.floor(Date.now() / 1000).toString();
  const allParams: Record<string, string> = { ...params, wts };

  // 按 key 排序
  const query = Object.keys(allParams)
    .sort()
    .map((key) => {
      // 过滤特殊字符
      const val = allParams[key].replace(/[!'()*]/g, "");
      return `${encodeURIComponent(key)}=${encodeURIComponent(val)}`;
    })
    .join("&");

  // 计算 w_rid (md5)
  const w_rid = md5(query + mixinKey);

  return `${query}&w_rid=${w_rid}`;
}

function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}

function getHeaders() {
  const sessdata = process.env.BILIBILI_SESSDATA;
  return {
    Cookie: sessdata ? `SESSDATA=${sessdata}` : "",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://www.bilibili.com",
  };
}

/**
 * 从URL中提取BV号
 */
export function extractBvId(url: string): string | null {
  const patterns = [
    /bilibili\.com\/video\/(BV[\w]+)/,
    /b23\.tv\/(BV[\w]+)/,
    /^BV[\w]+$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1] || match[0];
  }
  return null;
}

/**
 * 获取视频信息
 */
export async function getVideoInfo(bvid: string): Promise<VideoInfo> {
  const res = await fetch(
    `${BILIBILI_API_BASE}/x/web-interface/view?bvid=${bvid}`,
    { headers: getHeaders() }
  );

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`获取视频信息失败: ${data.message}`);
  }

  const v = data.data;
  return {
    bvid: v.bvid,
    aid: v.aid,
    title: v.title,
    desc: v.desc,
    pic: v.pic,
    owner: {
      name: v.owner.name,
      face: v.owner.face,
    },
    duration: v.duration,
    cid: v.cid,
  };
}

/**
 * 获取字幕列表并下载字幕内容（带 WBI 签名）
 */
export async function getSubtitle(
  bvid: string,
  cid: number
): Promise<SubtitleItem[]> {
  const { imgKey, subKey } = await getWbiKeys();

  const params: Record<string, string> = {
    bvid,
    cid: cid.toString(),
  };

  const query = signWbiParams(params, imgKey, subKey);
  const url = `${BILIBILI_API_BASE}/x/player/wbi/v2?${query}`;

  const res = await fetch(url, { headers: getHeaders() });
  const data = await res.json();

  console.log(`[bilibili] player/wbi/v2 response:`, JSON.stringify(data).slice(0, 500));

  if (data.code !== 0) {
    throw new Error(`获取字幕信息失败: ${data.message} (code: ${data.code})`);
  }

  console.log(`[bilibili] subtitle data:`, JSON.stringify(data.data?.subtitle).slice(0, 500));

  const subtitles = data.data?.subtitle?.subtitles;
  if (!subtitles || subtitles.length === 0) {
    throw new Error(
      "该视频没有可用的字幕。请确认视频有CC字幕（AI生成或手动上传）。"
    );
  }

  // 优先中文（ai-generated），其次中文字幕
  const zhSubtitle =
    subtitles.find(
      (s: { lan: string }) =>
        s.lan === "ai-zh" || s.lan === "zh-CN" || s.lan === "zh-Hans"
    ) || subtitles[0];

  const subtitleUrl = zhSubtitle.subtitle_url.startsWith("http")
    ? zhSubtitle.subtitle_url
    : `https:${zhSubtitle.subtitle_url}`;

  const subtitleRes = await fetch(subtitleUrl);
  const subtitleData = await subtitleRes.json();

  return subtitleData.body as SubtitleItem[];
}

/**
 * 将字幕转为纯文本（带时间戳）
 */
export function subtitleToText(subtitles: SubtitleItem[]): string {
  return subtitles
    .map((s) => {
      const start = formatTime(s.from);
      return `[${start}] ${s.content}`;
    })
    .join("\n");
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * 通过 B站 API 直接获取音频流并下载（绕过 yt-dlp 的 412 问题）
 * onProgress: (percent: number, downloadedMB: string, totalMB: string) => void
 */
export async function downloadAudioViaApi(
  bvid: string,
  cid: number,
  onProgress?: (percent: number, downloaded: string, total: string) => void
): Promise<string> {
  const { imgKey, subKey } = await getWbiKeys();

  // 请求 DASH 格式的视频流信息
  const params: Record<string, string> = {
    bvid,
    cid: cid.toString(),
    fnval: "16",       // 请求 DASH 格式
    fourk: "1",
  };

  const query = signWbiParams(params, imgKey, subKey);
  const url = `${BILIBILI_API_BASE}/x/player/wbi/playurl?${query}`;

  const res = await fetch(url, { headers: getHeaders() });
  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(`获取视频流地址失败: ${data.message}`);
  }

  // 从 DASH 响应中提取音频流
  const audioList = data.data?.dash?.audio;
  if (!audioList || audioList.length === 0) {
    throw new Error("未找到音频流");
  }

  // 选最后一个（通常是最高音质中我们能拿到的）
  const audio = audioList[audioList.length - 1];
  const audioUrl = audio.baseUrl || audio.base_url;

  if (!audioUrl) {
    throw new Error("音频流 URL 为空");
  }

  // 下载音频到临时文件
  const tmpDir = join("/tmp/bilibili-subtitle", randomUUID());
  await mkdir(tmpDir, { recursive: true });
  const outputPath = join(tmpDir, "audio.m4a");

  console.log(`[bilibili] 开始下载音频: ${audioUrl.slice(0, 80)}...`);

  const audioRes = await fetch(audioUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://www.bilibili.com",
    },
  });

  if (!audioRes.ok) {
    throw new Error(`下载音频失败: HTTP ${audioRes.status}`);
  }

  // 流式下载，支持进度回调
  const contentLength = parseInt(audioRes.headers.get("content-length") || "0", 10);
  const totalMB = contentLength ? (contentLength / 1024 / 1024).toFixed(1) : "?";
  let downloaded = 0;

  const fileStream = (await import("fs")).createWriteStream(outputPath);
  const reader = audioRes.body?.getReader();

  if (!reader) {
    throw new Error("无法读取音频流");
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fileStream.write(value);
    downloaded += value.length;
    if (onProgress && contentLength) {
      const percent = Math.round((downloaded / contentLength) * 100);
      onProgress(percent, (downloaded / 1024 / 1024).toFixed(1), totalMB);
    }
  }

  fileStream.end();

  console.log(`[bilibili] 音频下载完成: ${outputPath} (${(downloaded / 1024 / 1024).toFixed(1)}MB)`);

  return outputPath;
}
