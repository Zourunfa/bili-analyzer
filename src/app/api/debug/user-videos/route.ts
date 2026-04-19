import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/db";

/**
 * GET /api/debug/user-videos?bvid=BVxxxx
 * GET /api/debug/user-videos?email=xxx@example.com
 * GET /api/debug/user-videos?bvid=BVxxxx&email=xxx@example.com
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    // 默认仅开发环境开放；生产可通过环境变量显式开启
    const allowInProd = process.env.ALLOW_DEBUG_AUDIT === "1";
    if (process.env.NODE_ENV === "production" && !allowInProd) {
      return NextResponse.json({ error: "生产环境已禁用调试接口" }, { status: 403 });
    }

    const bvid = (req.nextUrl.searchParams.get("bvid") || "").trim();
    const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();

    if (!bvid && !email) {
      return NextResponse.json(
        { error: "请提供 bvid 或 email 参数，例如 /api/debug/user-videos?bvid=BVxxxx" },
        { status: 400 }
      );
    }

    if (bvid) {
      const video = await prisma.video.findUnique({
        where: { bvid },
        select: {
          id: true,
          bvid: true,
          title: true,
          createdAt: true,
          updatedAt: true,
          userVideos: {
            select: {
              userId: true,
              createdAt: true,
              updatedAt: true,
              user: {
                select: { email: true, name: true },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!video) {
        return NextResponse.json({ video: null, relations: [] });
      }

      return NextResponse.json({
        video: {
          id: video.id,
          bvid: video.bvid,
          title: video.title,
          createdAt: video.createdAt,
          updatedAt: video.updatedAt,
        },
        relations: video.userVideos.map((uv) => ({
          userId: uv.userId,
          email: uv.user.email,
          name: uv.user.name,
          boundAt: uv.createdAt,
          updatedAt: uv.updatedAt,
        })),
      });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        userVideos: {
          include: {
            video: {
              select: { id: true, bvid: true, title: true, createdAt: true, updatedAt: true },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ user: null, videos: [] });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      },
      videos: user.userVideos.map((uv) => ({
        relationCreatedAt: uv.createdAt,
        relationUpdatedAt: uv.updatedAt,
        video: uv.video,
      })),
    });
  } catch (error) {
    console.error("调试 user-videos 错误:", error);
    return NextResponse.json({ error: "调试查询失败" }, { status: 500 });
  }
}
