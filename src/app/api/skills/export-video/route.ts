import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

interface ExportRequest {
  bvid: string;
  // 前端直传数据（视频未保存到数据库时使用）
  videoData?: {
    title: string;
    ownerName: string;
    duration: number;
    subtitleText: string;
    summary?: string | null;
  };
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const body: ExportRequest = await req.json();
    const { bvid, videoData: clientData } = body;

    if (!bvid) {
      return NextResponse.json({ error: "缺少 bvid 参数" }, { status: 400 });
    }

    // 优先从数据库获取，如果没有则使用前端传来的数据
    const dbVideo = await prisma.video.findUnique({
      where: { bvid },
      include: { knowledgePoints: true },
    });

    const title = dbVideo?.title ?? clientData?.title ?? bvid;
    const ownerName = dbVideo?.ownerName ?? clientData?.ownerName ?? "未知";
    const duration = dbVideo?.duration ?? clientData?.duration ?? 0;
    const subtitleText = dbVideo?.subtitleText ?? clientData?.subtitleText ?? "";
    const summary = dbVideo?.summary ?? clientData?.summary ?? null;
    const knowledgePoints = dbVideo?.knowledgePoints ?? [];

    if (!dbVideo && !clientData) {
      return NextResponse.json({ error: "视频不存在，请先分析视频" }, { status: 404 });
    }

    // 导出为 SKILL 格式
    const folderName = title.replace(/[/\\?%*:|"<>]/g, "-");

    // 构建元数据
    const videoSource = {
      title,
      bvid,
      url: `https://www.bilibili.com/video/${bvid}`,
      owner: ownerName,
      duration,
    };

    // 按类型分组知识点
    const byType: Record<string, typeof knowledgePoints> = {};
    for (const p of knowledgePoints) {
      if (!byType[p.type]) byType[p.type] = [];
      byType[p.type].push(p);
    }

    const typeNames: Record<string, string> = {
      topic: "主题",
      keyPoint: "关键要点",
      concept: "核心概念",
      qaPair: "问答对",
    };

    // 构建 SKILL.md
    const skillMd = `---
name: ${folderName}
description: 从视频「${title}」中提取的结构化知识
metadata:
  author: videonote
  version: "1.0"
  generatedAt: "${new Date().toISOString().split("T")[0]}"
  source:
    type: bilibili-video
    video: ${JSON.stringify(videoSource)}
  knowledgePoints: ${knowledgePoints.length}
---

# ${title}

> UP主: ${ownerName} | 时长: ${Math.floor(duration / 60)}分${duration % 60}秒
> 视频链接: https://www.bilibili.com/video/${bvid}

${summary ? `## 视频摘要\n\n${summary}\n` : ""}

## 知识点结构

${knowledgePoints.length === 0 ? "（暂无知识点，可基于字幕内容进行提取）" : Object.entries(byType).map(([type, points]) => `
### ${typeNames[type] || type}

${points.map((p) => {
  let line = "- " + p.content;
  if (p.timestamp !== null) {
    const m = Math.floor(p.timestamp / 60);
    const s = p.timestamp % 60;
    line += " [" + m + ":" + s.toString().padStart(2, "0") + "]";
  }
  return line;
}).join("\n")}
`).join("")}

## 完整字幕

\`\`\`
${subtitleText.slice(0, 2000)}${subtitleText.length > 2000 ? "\n... (字幕过长已截断)" : ""}
\`\`\`

---

*由 视记 VideoNote 自动生成 | https://github.com/Zourunfa/bili-analyzer*
`;

    // 构建知识点的 JSON 导出
    const knowledgeJson = knowledgePoints.map((p) => ({
      type: p.type,
      content: p.content,
      ...(p.timestamp !== null && { timestamp: p.timestamp }),
      metadata: p.metadata,
    }));

    // 生成可复用的 System Prompt
    const systemPrompt = `你是一个知识助手，基于以下视频内容回答用户问题。

## 视频信息
- 标题: ${title}
- UP主: ${ownerName}
- 链接: https://www.bilibili.com/video/${bvid}

## 视频摘要
${summary || "（暂无）"}

## 知识点

${knowledgePoints.length === 0 ? "（暂无知识点）" : knowledgePoints.map((p) => {
  let line = "[" + (typeNames[p.type] || p.type) + "] " + p.content;
  if (p.timestamp !== null) {
    const m = Math.floor(p.timestamp / 60);
    const s = p.timestamp % 60;
    line += " (时间: " + m + ":" + s.toString().padStart(2, "0") + ")";
  }
  return line;
}).join("\n")}

## 回答要求
1. 基于上述知识点内容准确回答
2. 如果涉及时间点，尽量标注
3. 如需深入讲解，可参考字幕原文
4. 回答友好、有条理`;

    return NextResponse.json({
      folderName,
      files: {
        "SKILL.md": skillMd,
        "resources/knowledge.json": JSON.stringify(knowledgeJson, null, 2),
        "resources/system-prompt.md": systemPrompt,
      },
      stats: {
        video: title,
        bvid,
        knowledgePoints: knowledgePoints.length,
      },
    });
  } catch (error) {
    console.error("导出错误:", error);
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}
