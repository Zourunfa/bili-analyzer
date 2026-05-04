import { NextRequest } from "next/server";

const ALLOWED_HOSTS = new Set([
  "i0.hdslb.com",
  "i1.hdslb.com",
  "i2.hdslb.com",
  "archive.biliimg.com",
]);

function parseImageUrl(raw: string | null): URL | null {
  if (!raw) return null;
  const normalized = raw.startsWith("//") ? `https:${raw}` : raw.replace(/^http:\/\//, "https://");
  try {
    const url = new URL(normalized);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (!ALLOWED_HOSTS.has(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = parseImageUrl(req.nextUrl.searchParams.get("url"));
  if (!url) {
    return new Response("Invalid image url", { status: 400 });
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Referer: "https://www.bilibili.com/",
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
    cache: "force-cache",
  });

  if (!res.ok) {
    return new Response("Image fetch failed", { status: res.status });
  }

  const contentType = res.headers.get("content-type") || "image/jpeg";
  if (!contentType.startsWith("image/")) {
    return new Response("Unsupported content type", { status: 415 });
  }

  return new Response(await res.arrayBuffer(), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
    },
  });
}
