import { NextResponse } from "next/server";
import { generateText } from "ai";
import {
  downloadAudioViaApi,
  getSubtitle,
  getUPownerVideos,
  getVideoInfo,
  subtitleToText,
} from "@/lib/bilibili";
import prisma from "@/lib/db";
import { generateEmbedding, toVectorString } from "@/lib/embedding";
import { KNOWLEDGE_EXTRACTION_PROMPT } from "@/lib/prompts";
import { qwen } from "@/lib/qwen";
import { cleanup, parseSrt, transcribeAudio } from "@/lib/videocaptioner";
import { acquireTranscribeSlot } from "@/lib/transcribe-guard";

type BiliCookieSet = {
  sessdata?: string;
  dedeUserId?: string;
  biliJct?: string;
};

type AnalyzeVideoInfo = Awaited<ReturnType<typeof getVideoInfo>>;
type SubtitleResult = {
  text: string;
  subtitleSource: "cc" | "transcribed";
  count: number;
};
type ExtractedPoint = {
  type: string;
  content: string;
  timestamp?: number;
  metadata?: Record<string, unknown>;
};

function setEnvKey(key: "BILIBILI_SESSDATA" | "BILIBILI_DEDE_USERID" | "BILIBILI_BILI_JCT", value?: string) {
  if (value && value.trim()) process.env[key] = value.trim();
  else delete process.env[key];
}

function applyCookieSet(set: BiliCookieSet) {
  setEnvKey("BILIBILI_SESSDATA", set.sessdata);
  setEnvKey("BILIBILI_DEDE_USERID", set.dedeUserId);
  setEnvKey("BILIBILI_BILI_JCT", set.biliJct);
}

function readServerCookieSet(): BiliCookieSet {
  return {
    sessdata: process.env.BILIBILI_SESSDATA,
    dedeUserId: process.env.BILIBILI_DEDE_USERID,
    biliJct: process.env.BILIBILI_BILI_JCT,
  };
}

async function verifyCookieSet(set: BiliCookieSet): Promise<boolean> {
  if (!set.sessdata?.trim()) return false;
  const cookieParts = [`SESSDATA=${set.sessdata.trim()}`];
  if (set.dedeUserId?.trim()) cookieParts.push(`DedeUserID=${set.dedeUserId.trim()}`);
  if (set.biliJct?.trim()) cookieParts.push(`bili_jct=${set.biliJct.trim()}`);

  try {
    const res = await fetch("https://api.bilibili.com/x/web-interface/nav", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: "https://www.bilibili.com",
        Cookie: cookieParts.join("; "),
      },
      redirect: "manual",
    });
    const data = await res.json();
    return data?.code === 0 && data?.data?.isLogin === true;
  } catch {
    return false;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || "处理失败";
  return String(error || "处理失败");
}

function isRetryableError(message: string): boolean {
  return [
    "request was banned",
    "请求过于频繁",
    "风控校验失败",
    "timeout",
    "timed out",
    "fetch failed",
    "ECONN",
    "ENOTFOUND",
    "EAI_AGAIN",
    "429",
    "-412",
    "-799",
    "-352",
  ].some((kw) => message.includes(kw));
}

function getSkippableReason(message: string): string | null {
  if (["啥都木有", "视频不存在", "稿件不存在", "稿件已失效", "视频已失效", "视频已删除"].some((kw) => message.includes(kw))) {
    return "视频不可访问（已删除/失效）";
  }
  if (["访问权限不足", "仅限", "不可见", "无权限"].some((kw) => message.includes(kw))) {
    return "视频无访问权限";
  }
  return null;
}

function isNoSubtitleError(message: string): boolean {
  return [
    "没有可用的字幕",
    "subtitle",
    "字幕",
  ].some((kw) => message.includes(kw));
}

function bumpReason(map: Map<string, number>, reason: string): void {
  map.set(reason, (map.get(reason) || 0) + 1);
}

async function getVideoInfoViaPublicApi(bvid: string): Promise<AnalyzeVideoInfo> {
  const res = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Referer: "https://www.bilibili.com",
      Accept: "application/json, text/plain, */*",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
    redirect: "manual",
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`view 接口返回非 JSON（${res.status}）`);
  }
  if ((data.code as number) !== 0) {
    throw new Error(`获取视频信息失败: ${data.message}`);
  }
  const v = (data.data || {}) as Record<string, unknown>;
  return {
    bvid: (v.bvid as string) || bvid,
    aid: Number(v.aid || 0),
    title: (v.title as string) || "",
    desc: (v.desc as string) || "",
    pic: (v.pic as string) || "",
    owner: {
      name: ((v.owner as Record<string, unknown> | undefined)?.name as string) || "",
      face: ((v.owner as Record<string, unknown> | undefined)?.face as string) || "",
    },
    duration: Number(v.duration || 0),
    cid: Number(v.cid || 0),
  };
}

async function getVideoInfoWithRetry(bvid: string, maxAttempts = 3): Promise<AnalyzeVideoInfo> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await getVideoInfo(bvid);
    } catch (err) {
      lastError = err;
      const msg = normalizeErrorMessage(err);

      // 某些环境下带失效 cookie 会触发“啥都木有”，尝试匿名再取一次
      if (msg.includes("啥都木有")) {
        try {
          return await getVideoInfoViaPublicApi(bvid);
        } catch (fallbackErr) {
          lastError = fallbackErr;
        }
      }

      if (attempt < maxAttempts && isRetryableError(msg)) {
        await sleep(attempt * 700);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError || new Error("获取视频信息失败");
}

async function getSubtitleWithTranscribeFallback(
  bvid: string,
  cid: number
): Promise<SubtitleResult> {
  try {
    const subtitles = await getSubtitle(bvid, cid);
    const text = subtitleToText(subtitles).trim();
    if (!text) {
      throw new Error("CC 字幕为空");
    }
    return {
      text,
      subtitleSource: "cc",
      count: subtitles.length,
    };
  } catch (err) {
    const message = normalizeErrorMessage(err);
    if (!isNoSubtitleError(message)) {
      throw err;
    }
  }

  let audioPath: string | undefined;
  let workDir: string | undefined;
  let releaseSlot: (() => void) | undefined;
  try {
    releaseSlot = await acquireTranscribeSlot();
    audioPath = await downloadAudioViaApi(bvid, cid);
    workDir = audioPath.slice(0, Math.max(0, audioPath.lastIndexOf("/")));
    const srtText = await transcribeAudio(audioPath);
    if (!srtText.trim()) {
      throw new Error("语音转写结果为空");
    }
    const subtitles = parseSrt(srtText);
    const text = subtitleToText(subtitles).trim();
    if (!text) {
      throw new Error("转写字幕为空");
    }
    return {
      text,
      subtitleSource: "transcribed",
      count: subtitles.length,
    };
  } catch (err) {
    throw new Error(`字幕获取失败（无 CC 且转写失败）: ${normalizeErrorMessage(err)}`);
  } finally {
    if (releaseSlot) releaseSlot();
    if (audioPath) await cleanup(audioPath);
    if (workDir) await cleanup(workDir);
  }
}

function tryParseKnowledgePoints(text: string): ExtractedPoint[] | null {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return null;
    return parsed as ExtractedPoint[];
  } catch {
    return null;
  }
}

async function extractKnowledgePoints(title: string, subtitleText: string): Promise<ExtractedPoint[]> {
  const { text } = await generateText({
    model: qwen("qwen-plus"),
    prompt: KNOWLEDGE_EXTRACTION_PROMPT(title, subtitleText.slice(0, 24000)),
  });

  let points = tryParseKnowledgePoints(text);
  if (!points) {
    const retry = await generateText({
      model: qwen("qwen-plus"),
      prompt:
        `请从以下字幕中提取10个关键知识点，每个包含type(topic/keyPoint/concept/qaPair)、content、timestamp(秒)。\n\n` +
        `视频：${title}\n` +
        `字幕：${subtitleText.slice(0, 8000)}\n\n` +
        "只返回 JSON 数组。",
    });
    points = tryParseKnowledgePoints(retry.text);
  }

  if (!points || points.length === 0) {
    throw new Error("知识提取失败：模型未返回可解析的知识点");
  }

  return points;
}

async function saveKnowledgePoints(videoId: string, points: ExtractedPoint[]): Promise<number> {
  await prisma.knowledgePoint.deleteMany({ where: { videoId } });

  const accepted = points
    .filter((p) => p && typeof p.type === "string" && typeof p.content === "string" && p.type && p.content)
    .slice(0, 30);

  let savedCount = 0;
  for (const point of accepted) {
    const knowledgePoint = await prisma.knowledgePoint.create({
      data: {
        videoId,
        type: point.type,
        content: point.content,
        timestamp: Number.isFinite(Number(point.timestamp))
          ? Math.max(0, Math.round(Number(point.timestamp)))
          : null,
        metadata: point.metadata ? JSON.parse(JSON.stringify(point.metadata)) : undefined,
      },
    });

    savedCount++;

    // embedding 异步生成，不阻塞主流程
    generateEmbedding(point.content)
      .then(async (embedding) => {
        await prisma.$executeRaw`
          INSERT INTO embeddings (id, knowledge_point_id, vector, "createdAt")
          VALUES (
            ${crypto.randomUUID()},
            ${knowledgePoint.id},
            ${toVectorString(embedding)}::vector,
            NOW()
          )
        `;
      })
      .catch((e) => console.error("生成 embedding 失败:", e));
  }

  return savedCount;
}

// UP主批量分析 - SSE 流式进度
export async function POST(req: Request) {
  const serverCookies = readServerCookieSet();
  try {
    const { mid, bvids, all } = await req.json();

    if (!mid) {
      return NextResponse.json({ error: "缺少 mid 参数" }, { status: 400 });
    }

    const clientCookies: BiliCookieSet = {
      sessdata: req.headers.get("x-bilibili-sessdata") || undefined,
      dedeUserId: req.headers.get("x-bilibili-dede-userid") || undefined,
      biliJct: req.headers.get("x-bilibili-bili-jct") || undefined,
    };
    if (clientCookies.sessdata?.trim()) {
      const validClientCookie = await verifyCookieSet(clientCookies);
      if (!validClientCookie) {
        return NextResponse.json(
          { error: "客户端 SESSDATA 已失效，请在“B站 Cookie 配置”更新后重试。" },
          { status: 401 }
        );
      }
      applyCookieSet(clientCookies);
    } else {
      applyCookieSet(serverCookies);
    }

    // 获取视频列表
    let targetBvids: string[] = [];
    if (all) {
      // 全量：分页获取所有视频
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        const result = await getUPownerVideos(mid, page, 50);
        targetBvids.push(...result.videos.map((v) => v.bvid));
        hasMore = targetBvids.length < result.total;
        page++;
      }
    } else if (bvids?.length) {
      targetBvids = bvids;
    } else {
      return NextResponse.json({ error: "请选择视频或设置 all=true" }, { status: 400 });
    }
    targetBvids = [...new Set(targetBvids.filter(Boolean))];

    // 创建 SSE 流
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
        };

        const total = targetBvids.length;
        send("status", { message: `开始分析 ${total} 个视频...` });

        let completed = 0;
        let failed = 0;
        let succeeded = 0;
        let skipped = 0;
        const failedReasons = new Map<string, number>();
        const skippedReasons = new Map<string, number>();

        for (const bvid of targetBvids) {
          try {
            send("status", { message: `正在处理 ${completed + 1}/${total}: ${bvid}` });

            // 检查是否已分析过
            const existing = await prisma.video.findUnique({
              where: { bvid },
              include: { _count: { select: { knowledgePoints: true } } },
            });
            const alreadyDone = Boolean(
              existing &&
              existing.knowledgeExtracted &&
              existing.subtitleText?.trim() &&
              existing.subtitleSource &&
              existing.subtitleSource !== "none" &&
              existing._count.knowledgePoints > 0
            );
            if (alreadyDone) {
              skipped++;
              completed++;
              bumpReason(skippedReasons, "已分析过");
              send("progress", {
                completed, total, failed, succeeded, skipped, bvid, skippedFlag: true, reason: "已分析过",
              });
              continue;
            }

            // 获取视频信息（带重试 + 匿名兜底）
            const v = await getVideoInfoWithRetry(bvid, 3);
            if (!v.cid || v.cid <= 0) {
              throw new Error("视频缺少 CID，无法获取字幕");
            }

            // 保存视频到数据库
            const video = await prisma.video.upsert({
              where: { bvid },
              update: {
                title: v.title,
                pic: v.pic,
                desc: v.desc,
                duration: v.duration,
                ownerName: v.owner?.name || "",
                ownerMid: String(mid),
                cid: String(v.cid),
                knowledgeExtracted: false,
              },
              create: {
                bvid,
                title: v.title,
                pic: v.pic,
                desc: v.desc,
                duration: v.duration,
                ownerName: v.owner?.name || "",
                ownerMid: String(mid),
                cid: String(v.cid),
                subtitleText: "",
                subtitleSource: "none",
                knowledgeExtracted: false,
              },
            });

            send("status", { message: `正在获取字幕: ${bvid}` });
            const subtitle = await getSubtitleWithTranscribeFallback(bvid, v.cid);
            await prisma.video.update({
              where: { id: video.id },
              data: {
                subtitleText: subtitle.text,
                subtitleSource: subtitle.subtitleSource,
                knowledgeExtracted: false,
              },
            });

            send("status", { message: `正在提取知识点: ${bvid}` });
            const points = await extractKnowledgePoints(v.title, subtitle.text);
            const savedCount = await saveKnowledgePoints(video.id, points);
            if (savedCount <= 0) {
              throw new Error("知识提取为空：未写入有效知识点");
            }

            await prisma.video.update({
              where: { id: video.id },
              data: { knowledgeExtracted: true },
            });

            succeeded++;
            completed++;
            send("progress", {
              completed,
              total,
              failed,
              succeeded,
              skipped,
              bvid,
              subtitleSource: subtitle.subtitleSource,
              points: savedCount,
            });
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : "处理失败";
            const skippableReason = getSkippableReason(errorMessage);

            if (skippableReason) {
              skipped++;
              completed++;
              bumpReason(skippedReasons, skippableReason);
              send("status", { message: `跳过: ${bvid} (${skippableReason})` });
              send("progress", {
                completed, total, failed, succeeded, skipped, bvid, skippedFlag: true, reason: skippableReason, error: errorMessage,
              });
              continue;
            }

            failed++;
            completed++;
            bumpReason(failedReasons, errorMessage);
            send("status", { message: `处理失败: ${bvid} (${errorMessage})` });
            send("progress", { completed, total, failed, succeeded, skipped, bvid, error: errorMessage });
          } finally {
            // 限速，减少连续触发风控概率
            await sleep(180);
          }
        }

        send("done", {
          completed,
          total,
          failed,
          succeeded,
          skipped,
          failedReasons: [...failedReasons.entries()].map(([reason, count]) => ({ reason, count })).slice(0, 5),
          skippedReasons: [...skippedReasons.entries()].map(([reason, count]) => ({ reason, count })).slice(0, 5),
        });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("UP主分析错误:", error);
    return NextResponse.json({ error: "分析失败" }, { status: 500 });
  } finally {
    // 避免请求级 cookie 覆盖污染后续请求
    applyCookieSet(serverCookies);
  }
}
