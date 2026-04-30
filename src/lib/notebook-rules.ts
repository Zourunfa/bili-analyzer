import type { Prisma } from "@/generated/prisma/client";

export type SmartNotebookRule = {
  keyword?: string;
  ownerName?: string;
  tagIds?: string[];
};

export function normalizeSmartNotebookRule(input: unknown): SmartNotebookRule {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;

  const keyword = typeof raw.keyword === "string" ? raw.keyword.trim() : "";
  const ownerName = typeof raw.ownerName === "string" ? raw.ownerName.trim() : "";
  const tagIds = Array.isArray(raw.tagIds)
    ? raw.tagIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return {
    ...(keyword ? { keyword } : {}),
    ...(ownerName ? { ownerName } : {}),
    ...(tagIds.length > 0 ? { tagIds: Array.from(new Set(tagIds)) } : {}),
  };
}

export function buildSmartNotebookVideoWhere(
  userId: string,
  ruleInput: unknown
): Prisma.VideoWhereInput {
  const rule = normalizeSmartNotebookRule(ruleInput);
  const and: Prisma.VideoWhereInput[] = [
    {
      userVideos: {
        some: { userId },
      },
    },
  ];

  if (rule.keyword) {
    and.push({
      OR: [
        { title: { contains: rule.keyword, mode: "insensitive" } },
        { subtitleText: { contains: rule.keyword, mode: "insensitive" } },
        { summary: { contains: rule.keyword, mode: "insensitive" } },
      ],
    });
  }

  if (rule.ownerName) {
    and.push({
      ownerName: { contains: rule.ownerName, mode: "insensitive" },
    });
  }

  if (rule.tagIds && rule.tagIds.length > 0) {
    for (const tagId of rule.tagIds) {
      and.push({
        tagRelations: {
          some: {
            userId,
            tagId,
          },
        },
      });
    }
  }

  return { AND: and };
}

