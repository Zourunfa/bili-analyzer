import { NextResponse } from "next/server";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { qwen } from "@/lib/qwen";
import { SKILL_EXPORT_PROMPT } from "@/lib/prompts";

export async function POST(req: Request) {
  try {
    const { notebookId, format } = await req.json();

    if (!notebookId || !format) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    const notebook = await prisma.notebook.findUnique({
      where: { id: notebookId },
      include: {
        videos: {
          include: {
            video: {
              include: {
                knowledgePoints: true,
              },
            },
          },
        },
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: "笔记本不存在" }, { status: 404 });
    }

    const allPoints = notebook.videos.flatMap((nv) =>
      nv.video.knowledgePoints.map((kp) => ({
        ...kp,
        videoTitle: nv.video.title,
        videoBvid: nv.video.bvid,
      }))
    );

    if (allPoints.length === 0) {
      return NextResponse.json({ error: "笔记本中没有知识点，请先分析视频并提取知识" }, { status: 400 });
    }

    if (format === "skill-folder") {
      return await exportSkillFolder(notebook, allPoints);
    }

    if (format === "markdown") {
      return await exportMarkdown(notebook, allPoints);
    }

    return await exportSystemPrompt(notebook, allPoints);
  } catch (error) {
    console.error("导出错误:", error);
    return NextResponse.json({ error: "导出失败" }, { status: 500 });
  }
}

async function exportSkillFolder(
  notebook: {
    title: string;
    description: string | null;
    createdAt: Date;
    videos: Array<{
      video: {
        title: string;
        bvid: string;
        ownerName: string;
        duration: number;
        summary: string | null;
      };
    }>;
  },
  allPoints: Array<{
    type: string;
    content: string;
    timestamp: number | null;
    videoTitle: string;
    videoBvid: string;
  }>
) {
  const folderName = notebook.title.replace(/[/\\?%*:|"<>]/g, "-");

  // 1. 构建元数据
  const videoSources = notebook.videos.map((nv) => ({
    title: nv.video.title,
    bvid: nv.video.bvid,
    url: `https://www.bilibili.com/video/${nv.video.bvid}`,
  }));

  // 2. LLM 生成指令层
  const pointsText = allPoints
    .map((p) => `[${p.type}] ${p.content} (来源: ${p.videoTitle})`)
    .join("\n");

  const { text: instructions } = await generateText({
    model: qwen("qwen-plus"),
    prompt: SKILL_EXPORT_PROMPT(notebook.title, pointsText),
  });

  // 3. 构建 SKILL.md
  const skillMd = `---
name: ${folderName}
description: 从 ${notebook.videos.length} 个视频中提取的关于「${notebook.title}」的结构化知识
metadata:
  author: videonote
  version: "1.0"
  generatedAt: "${new Date().toISOString().split("T")[0]}"
  source:
    notebook: "${notebook.title}"
    videos: ${JSON.stringify(videoSources)}
  knowledgePoints: ${allPoints.length}
---

${instructions}

## 参考资源

- \`resources/knowledge.json\` - 完整结构化知识点数据
- \`resources/summaries.md\` - 各视频摘要
`;

  // 4. 构建 knowledge.json
  const knowledgeJson = allPoints.map((p) => ({
    type: p.type,
    content: p.content,
    ...(p.timestamp !== null && { timestamp: p.timestamp }),
    videoTitle: p.videoTitle,
    videoUrl: `https://www.bilibili.com/video/${p.videoBvid}`,
  }));

  // 5. 构建 summaries.md
  const summariesLines: string[] = ["# 视频摘要\n"];
  for (const nv of notebook.videos) {
    summariesLines.push(`## ${nv.video.title}\n`);
    summariesLines.push(`UP主: ${nv.video.ownerName} | 时长: ${Math.floor(nv.video.duration / 60)}分${nv.video.duration % 60}秒\n`);
    summariesLines.push(nv.video.summary || "（暂无摘要）");
    summariesLines.push("");
  }

  return NextResponse.json({
    folderName,
    files: {
      "SKILL.md": skillMd,
      "resources/knowledge.json": JSON.stringify(knowledgeJson, null, 2),
      "resources/summaries.md": summariesLines.join("\n"),
    },
    stats: {
      videos: notebook.videos.length,
      knowledgePoints: allPoints.length,
    },
  });
}

async function exportMarkdown(
  notebook: {
    title: string;
    description: string | null;
    videos: Array<{
      video: {
        title: string;
        ownerName: string;
        duration: number;
      };
    }>;
  },
  allPoints: Array<{
    type: string;
    content: string;
    timestamp: number | null;
    videoTitle: string;
  }>
) {
  const sections: string[] = [];
  sections.push(`# ${notebook.title}\n`);
  if (notebook.description) {
    sections.push(`## 概述\n\n${notebook.description}\n`);
  }

  sections.push("## 视频列表\n");
  notebook.videos.forEach((nv, i) => {
    sections.push(`${i + 1}. **${nv.video.title}** - ${nv.video.ownerName} - ${Math.floor(nv.video.duration / 60)}分${nv.video.duration % 60}秒`);
  });
  sections.push("");

  const byType: Record<string, typeof allPoints> = {};
  for (const p of allPoints) {
    if (!byType[p.type]) byType[p.type] = [];
    byType[p.type].push(p);
  }

  const typeNames: Record<string, string> = {
    topic: "主题",
    keyPoint: "关键要点",
    concept: "核心概念",
    qaPair: "常见问答",
  };

  for (const [type, points] of Object.entries(byType)) {
    sections.push(`## ${typeNames[type] || type}\n`);
    for (const p of points) {
      sections.push(`- ${p.content}`);
      if (p.timestamp !== null) {
        const m = Math.floor(p.timestamp / 60);
        const s = p.timestamp % 60;
        sections.push(`  - 来源: ${p.videoTitle} (${m}:${s.toString().padStart(2, "0")})`);
      }
    }
    sections.push("");
  }

  const content = sections.join("\n");
  return NextResponse.json({ content, filename: `${notebook.title}.md` });
}

async function exportSystemPrompt(
  notebook: { title: string },
  allPoints: Array<{ type: string; content: string; videoTitle: string }>
) {
  const pointsText = allPoints
    .map((p) => `[${p.type}] ${p.content} (来源: ${p.videoTitle})`)
    .join("\n");

  const { text } = await generateText({
    model: qwen("qwen-plus"),
    prompt: SKILL_EXPORT_PROMPT(notebook.title, pointsText),
  });

  return NextResponse.json({ content: text, filename: `${notebook.title}-skill.md` });
}
