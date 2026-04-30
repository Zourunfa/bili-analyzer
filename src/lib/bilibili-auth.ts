import { mkdir, readFile, writeFile, rename } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { AsyncLocalStorage } from "async_hooks";

// ─── Types ──────────────────────────────────────────────────────────────────

export type BiliCookieSet = {
  sessdata?: string;
  dedeUserId?: string;
  biliJct?: string;
};

export type BiliLoginStatus = {
  valid: boolean;
  username?: string;
  face?: string;
  mid?: number;
};

export type BiliCookieVerifyStatus = "valid" | "invalid" | "unknown";

export type BiliCookieVerifyResult = {
  status: BiliCookieVerifyStatus;
  reason?: string;
  username?: string;
  face?: string;
  mid?: number;
};

// ─── Constants ──────────────────────────────────────────────────────────────

const BILIBILI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const COOKIE_FILE_PATH = join(process.cwd(), "data", "bilibili-cookies.json");
const NAV_TIMEOUT_MS = 10_000;
const RISK_CONTROL_CODES = new Set([-352, -412, -799]);
const cookieContextStore = new AsyncLocalStorage<BiliCookieSet | null>();

// ─── Env helpers ────────────────────────────────────────────────────────────

function setEnvKey(
  key: "BILIBILI_SESSDATA" | "BILIBILI_DEDE_USERID" | "BILIBILI_BILI_JCT",
  value?: string
) {
  if (value && value.trim()) process.env[key] = value.trim();
  else delete process.env[key];
}

export function applyCookieSet(set: BiliCookieSet) {
  setEnvKey("BILIBILI_SESSDATA", set.sessdata);
  setEnvKey("BILIBILI_DEDE_USERID", set.dedeUserId);
  setEnvKey("BILIBILI_BILI_JCT", set.biliJct);
}

export function readServerCookieSet(): BiliCookieSet {
  return {
    sessdata: process.env.BILIBILI_SESSDATA,
    dedeUserId: process.env.BILIBILI_DEDE_USERID,
    biliJct: process.env.BILIBILI_BILI_JCT,
  };
}

export function getScopedCookieSet(): BiliCookieSet | null {
  return cookieContextStore.getStore() ?? null;
}

export async function runWithCookieSet<T>(
  set: BiliCookieSet | null | undefined,
  task: () => Promise<T>
): Promise<T> {
  return await cookieContextStore.run(set ?? null, task);
}

function isTransientBilibiliError(code: number, message: string): boolean {
  if (RISK_CONTROL_CODES.has(code)) return true;
  return [
    "request was banned",
    "请求过于频繁",
    "风控",
    "访问权限不足",
    "timeout",
  ].some((kw) => message.includes(kw));
}

function buildCookieHeader(set: BiliCookieSet): string {
  const cookieParts: string[] = [];
  if (set.sessdata?.trim()) cookieParts.push(`SESSDATA=${set.sessdata.trim()}`);
  if (set.dedeUserId?.trim()) cookieParts.push(`DedeUserID=${set.dedeUserId.trim()}`);
  if (set.biliJct?.trim()) cookieParts.push(`bili_jct=${set.biliJct.trim()}`);
  return cookieParts.join("; ");
}

async function fetchNavJson(cookieHeader: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NAV_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.bilibili.com/x/web-interface/nav", {
      headers: {
        "User-Agent": BILIBILI_UA,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        Referer: "https://www.bilibili.com",
        Cookie: cookieHeader,
      },
      redirect: "manual",
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ─── Verify ─────────────────────────────────────────────────────────────────

export async function verifyCookieSet(set: BiliCookieSet): Promise<boolean> {
  const result = await verifyCookieSetDetailed(set);
  return result.status === "valid";
}

export async function verifyCookieSetDetailed(
  set: BiliCookieSet
): Promise<BiliCookieVerifyResult> {
  if (!set.sessdata?.trim()) {
    return { status: "invalid", reason: "缺少 SESSDATA" };
  }

  const cookieHeader = buildCookieHeader(set);
  try {
    const data = (await fetchNavJson(cookieHeader)) as {
      code?: number;
      message?: string;
      msg?: string;
      data?: {
        isLogin?: boolean;
        uname?: string;
        face?: string;
        mid?: number;
      };
    };
    const code = Number(data?.code ?? -1);
    const message = String(data?.message || data?.msg || "");
    const isLogin = data?.data?.isLogin === true;

    if (code === 0 && isLogin) {
      return {
        status: "valid",
        username: data.data?.uname || undefined,
        face: data.data?.face || undefined,
        mid: data.data?.mid || undefined,
      };
    }
    if (code === 0 && !isLogin) {
      return { status: "invalid", reason: "B站未识别此登录态" };
    }

    if (isTransientBilibiliError(code, message)) {
      return { status: "unknown", reason: message || `code=${code}` };
    }

    if (code === -101 || message.includes("请先登录")) {
      return { status: "invalid", reason: message || "登录态失效" };
    }

    return { status: "unknown", reason: message || `code=${code}` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "网络异常";
    return { status: "unknown", reason };
  }
}

// ─── Login status (rich info) ───────────────────────────────────────────────

export async function getLoginStatus(): Promise<BiliLoginStatus> {
  const verified = await verifyCookieSetDetailed(readServerCookieSet());
  if (verified.status !== "valid") {
    return { valid: false };
  }
  return {
    valid: true,
    username: verified.username,
    face: verified.face,
    mid: verified.mid,
  };
}

// ─── Cookie persistence (JSON file) ────────────────────────────────────────

async function ensureDataDir() {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

export async function persistCookies(set: BiliCookieSet): Promise<void> {
  try {
    await ensureDataDir();
    const payload = {
      sessdata: set.sessdata || "",
      dedeUserId: set.dedeUserId || "",
      biliJct: set.biliJct || "",
      updatedAt: new Date().toISOString(),
    };
    const tmpPath = COOKIE_FILE_PATH + ".tmp";
    await writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf-8");
    await rename(tmpPath, COOKIE_FILE_PATH);
    // Also update process.env immediately
    applyCookieSet(set);
    console.log("[bilibili-auth] Cookies persisted to", COOKIE_FILE_PATH);
  } catch (err) {
    console.warn("[bilibili-auth] Failed to persist cookies:", err);
  }
}

export async function loadPersistedCookies(): Promise<void> {
  try {
    const hasPersisted = existsSync(COOKIE_FILE_PATH);
    if (hasPersisted) {
      const raw = await readFile(COOKIE_FILE_PATH, "utf-8");
      const data = JSON.parse(raw) as BiliCookieSet;
      applyCookieSet({
        sessdata: data.sessdata,
        dedeUserId: data.dedeUserId,
        biliJct: data.biliJct,
      });
      console.log("[bilibili-auth] Loaded persisted cookies from file");
      return;
    }

    const hasEnvCookie = process.env.BILIBILI_SESSDATA?.trim();
    if (hasEnvCookie) {
      console.log("[bilibili-auth] No persisted cookie file, using environment cookies");
    }
  } catch (err) {
    console.warn("[bilibili-auth] Failed to load persisted cookies:", err);
  }
}

// ─── Extract cookies from Set-Cookie headers (QR poll response) ─────────────

export function extractCookiesFromHeaders(
  setCookieHeaders: string[]
): BiliCookieSet {
  const result: BiliCookieSet = {};

  for (const header of setCookieHeaders) {
    const match = header.match(/^([^=]+)=([^;]*)/);
    if (!match) continue;

    const [, name, value] = match;
    if (name === "SESSDATA") result.sessdata = decodeURIComponent(value);
    else if (name === "DedeUserID") result.dedeUserId = value;
    else if (name === "bili_jct") result.biliJct = value;
  }

  return result;
}

// ─── Load on module import ──────────────────────────────────────────────────

loadPersistedCookies().catch(() => {});
