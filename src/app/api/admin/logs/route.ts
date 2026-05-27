import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";

const execFileAsync = promisify(execFile);

type LogSource = {
  label: string;
  path: string;
  level: "info" | "error";
};

function firstExistingPath(paths: string[]) {
  return paths.find((item) => existsSync(item)) || paths[0];
}

function getLogSources() {
  const cwd = process.cwd();
  const home = process.env.HOME || "";
  const devLogPath = path.join(cwd, ".next/dev/logs/next-development.log");
  const localPm2Dir = home ? path.join(home, ".pm2/logs") : "";
  const hasRootPm2 = existsSync("/root/.pm2/logs/subtitle-out.log") || existsSync("/root/.pm2/logs/subtitle-error.log");
  const hasLocalPm2 = localPm2Dir
    ? existsSync(path.join(localPm2Dir, "subtitle-out.log")) || existsSync(path.join(localPm2Dir, "subtitle-error.log"))
    : false;
  const useDevLog = process.env.NODE_ENV !== "production" && existsSync(devLogPath) && !hasRootPm2 && !hasLocalPm2;

  if (useDevLog) {
    return {
      "pm2-out": {
        label: "本地开发日志",
        path: devLogPath,
        level: "info" as const,
      },
      "pm2-error": {
        label: "本地开发日志",
        path: devLogPath,
        level: "error" as const,
      },
    };
  }

  return {
    "pm2-out": {
      label: "应用输出日志",
      path: firstExistingPath([
        process.env.ADMIN_LOG_OUT_PATH || "",
        "/root/.pm2/logs/subtitle-out.log",
        localPm2Dir ? path.join(localPm2Dir, "subtitle-out.log") : "",
      ].filter(Boolean)),
      level: "info" as const,
    },
    "pm2-error": {
      label: "应用错误日志",
      path: firstExistingPath([
        process.env.ADMIN_LOG_ERROR_PATH || "",
        "/root/.pm2/logs/subtitle-error.log",
        localPm2Dir ? path.join(localPm2Dir, "subtitle-error.log") : "",
      ].filter(Boolean)),
      level: "error" as const,
    },
  } satisfies Record<string, LogSource>;
}

type LogSourceKey = "pm2-out" | "pm2-error";

function clampLines(value: string | null) {
  const parsed = Number.parseInt(value || "200", 10);
  if (Number.isNaN(parsed)) return 200;
  return Math.min(1000, Math.max(20, parsed));
}

function redactLog(line: string) {
  return line
    .replace(/(SESSDATA=)[^;&\s]+/gi, "$1[redacted]")
    .replace(/(BILIBILI_SESSDATA=)[^;&\s]+/gi, "$1[redacted]")
    .replace(/(NEXTAUTH_SECRET=)[^;&\s]+/gi, "$1[redacted]")
    .replace(/(DATABASE_URL=)[^;&\s]+/gi, "$1[redacted]")
    .replace(/sk-[A-Za-z0-9_-]{16,}/g, "[api-key-redacted]");
}

async function tailLog(source: LogSourceKey, lines: number) {
  const config = getLogSources()[source];
  if (!existsSync(config.path)) {
    return [
      {
        source,
        label: config.label,
        level: "info",
        message: `日志文件暂不存在：${config.path}`,
      },
    ];
  }

  try {
    const { stdout } = await execFileAsync("tail", ["-n", String(lines), config.path], {
      timeout: 5000,
      maxBuffer: 1024 * 1024 * 2,
    });
    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => ({
        source,
        label: config.label,
        level: config.level,
        message: redactLog(line),
      }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "日志读取失败";
    return [
      {
        source,
        label: config.label,
        level: "error",
        message: `${config.path} 读取失败：${redactLog(message)}`,
      },
    ];
  }
}

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (auth.response) return auth.response;

  const url = new URL(req.url);
  const type = url.searchParams.get("type") || "all";
  const keyword = url.searchParams.get("keyword")?.trim().toLowerCase() || "";
  const lines = clampLines(url.searchParams.get("lines"));
  const requestedSources: LogSourceKey[] =
    type === "out"
      ? ["pm2-out"]
      : type === "error"
        ? ["pm2-error"]
        : ["pm2-out", "pm2-error"];

  const chunks = await Promise.all(requestedSources.map((source) => tailLog(source, lines)));
  const logs = chunks
    .flat()
    .filter((entry) => !keyword || entry.message.toLowerCase().includes(keyword))
    .slice(-lines * requestedSources.length);

  return NextResponse.json({
    logs,
    sources: getLogSources(),
    lines,
    keyword,
    type,
    fetchedAt: new Date().toISOString(),
  });
}
