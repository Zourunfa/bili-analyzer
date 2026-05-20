import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import prisma from "@/lib/db";

const SORT_FIELDS = new Set(["createdAt", "updatedAt", "email", "name"]);

export async function GET(req: Request) {
  const auth = await requireAdminSession();
  if (auth.response) return auth.response;

  try {
    const url = new URL(req.url);
    const page = Math.max(1, Number.parseInt(url.searchParams.get("page") || "1", 10));
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get("pageSize") || "20", 10)));
    const keyword = url.searchParams.get("keyword")?.trim() || "";
    const verified = url.searchParams.get("verified") || "all";
    const sortFieldParam = url.searchParams.get("sortField") || "createdAt";
    const sortOrder = url.searchParams.get("sortOrder") === "ascend" ? "asc" : "desc";
    const sortField = SORT_FIELDS.has(sortFieldParam) ? sortFieldParam : "createdAt";

    const where = {
      ...(keyword
        ? {
            OR: [
              { email: { contains: keyword, mode: "insensitive" as const } },
              { name: { contains: keyword, mode: "insensitive" as const } },
            ],
          }
        : {}),
      ...(verified === "yes" ? { emailVerified: { not: null } } : {}),
      ...(verified === "no" ? { emailVerified: null } : {}),
    };

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [users, total, totalUsers, verifiedUsers, newUsersLast7Days, activeUsers, totalVideoLinks] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { [sortField]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          emailVerified: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              notebooks: true,
              userVideos: true,
              timestampNotes: true,
              videoTags: true,
              chatMessages: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: { not: null } } }),
      prisma.user.count({ where: { createdAt: { gte: since } } }),
      prisma.user.count({ where: { userVideos: { some: {} } } }),
      prisma.userVideo.count(),
    ]);

    return NextResponse.json({
      users,
      pagination: { page, pageSize, total },
      stats: {
        totalUsers,
        verifiedUsers,
        unverifiedUsers: totalUsers - verifiedUsers,
        newUsersLast7Days,
        activeUsers,
        totalVideoLinks,
      },
    });
  } catch (error) {
    console.error("后台用户列表获取失败:", error);
    return NextResponse.json({ error: "获取用户列表失败" }, { status: 500 });
  }
}
