import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

const API = "https://api.bilibili.com";
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 16,
  4, 9, 23, 37, 49, 13, 1, 33, 49, 19, 10, 40, 26, 11, 19, 24,
  26, 41, 55, 34, 54, 16, 23, 22, 46, 40, 31, 53, 6, 42, 51, 30,
];

function getMixinKey(raw: string) {
  return MIXIN_KEY_ENC_TAB.map((i) => raw[i]).join("").slice(0, 32);
}

function bilibiliHeaders() {
  const s = process.env.BILIBILI_SESSDATA;
  return {
    Cookie: s ? `SESSDATA=${s}` : "",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://www.bilibili.com",
  };
}

// GET /api/debug?url=https://www.bilibili.com/video/BVxxxx
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") || "";
  const bvMatch = url.match(/BV[\w]+/);
  if (!bvMatch) {
    return NextResponse.json({ error: "请提供 B站视频链接: ?url=..." });
  }
  const bvid = bvMatch[0];

  const sessdata = process.env.BILIBILI_SESSDATA;
  const steps: Record<string, unknown> = {
    env_check: {
      SESSDATA_set: !!sessdata,
      SESSDATA_length: sessdata?.length || 0,
      SESSDATA_preview: sessdata ? sessdata.slice(0, 6) + "..." : "(empty)",
    },
  };

  try {
    // Step 1: video info
    const vRes = await fetch(`${API}/x/web-interface/view?bvid=${bvid}`, {
      headers: bilibiliHeaders(),
    });
    const vData = await vRes.json();
    steps["1_video_info"] = {
      code: vData.code,
      title: vData.data?.title,
      cid: vData.data?.cid,
    };

    if (vData.code !== 0) {
      return NextResponse.json({ steps, error: `视频信息失败: ${vData.message}` });
    }

    const cid = vData.data.cid;

    // Step 2: check login via nav
    const navRes = await fetch(`${API}/x/web-interface/nav`, {
      headers: bilibiliHeaders(),
    });
    const navData = await navRes.json();
    steps["2_login_check"] = {
      code: navData.code,
      isLogin: navData.data?.isLogin,
      message: navData.message,
    };

    if (!navData.data?.isLogin) {
      return NextResponse.json({
        steps,
        error:
          "B站登录态无效！SESSDATA 未配置或已过期。请按以下步骤操作：\n" +
          "1. 用浏览器登录 bilibili.com\n" +
          "2. F12 → Application → Cookies → 找到 SESSDATA\n" +
          "3. 复制 SESSDATA 的值（注意不要包含前面的 %XX 编码以外的部分）\n" +
          "4. 粘贴到 .env.local 的 BILIBILI_SESSDATA 字段",
      });
    }

    // Step 3: get wbi keys
    const wbiImg = navData.data.wbi_img;
    steps["3_wbi_img_raw"] = wbiImg;

    if (!wbiImg) {
      return NextResponse.json({ steps, error: "无法获取 WBI keys: wbi_img 为空" });
    }

    // 兼容不同字段名：url/img_url, sub_url/sub_url
    const imgUrl = wbiImg.img_url || wbiImg.url;
    const subUrl = wbiImg.sub_url;

    if (!imgUrl || !subUrl) {
      return NextResponse.json({ steps, error: "无法获取 WBI keys: 字段缺失", wbiImg });
    }

    const imgKey = imgUrl.split("/").pop().split(".")[0];
    const subKey = subUrl.split("/").pop().split(".")[0];
    steps["3_wbi_keys"] = { ok: true };

    // Step 4: sign + call player API
    const mixinKey = getMixinKey(imgKey + subKey);
    const wts = Math.floor(Date.now() / 1000).toString();
    const allParams: Record<string, string> = { bvid, cid: cid.toString(), wts };
    const sortedKeys = Object.keys(allParams).sort();
    const queryString = sortedKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
      .join("&");
    const wRid = createHash("md5")
      .update(queryString + mixinKey)
      .digest("hex");
    const signedUrl = `${API}/x/player/wbi/v2?${queryString}&w_rid=${wRid}`;

    const pRes = await fetch(signedUrl, { headers: bilibiliHeaders() });
    const pData = await pRes.json();
    steps["4_player_wbi"] = {
      code: pData.code,
      message: pData.message,
      subtitle_count: pData.data?.subtitle?.subtitles?.length || 0,
      subtitle_list: pData.data?.subtitle?.subtitles?.map(
        (s: { lan: string; lan_doc: string }) => ({ lan: s.lan, doc: s.lan_doc })
      ),
    };

    if (pData.code !== 0) {
      return NextResponse.json({ steps, error: `player API 报错: ${pData.message}` });
    }

    if (!pData.data?.subtitle?.subtitles?.length) {
      steps["conclusion"] = "接口调用成功，但该视频没有CC字幕";
      return NextResponse.json({ steps });
    }

    steps["conclusion"] = "字幕获取成功！";
    return NextResponse.json({ steps });
  } catch (err) {
    return NextResponse.json({
      steps,
      error: err instanceof Error ? `${err.message}\n${err.stack}` : "未知错误",
    });
  }
}
