export type TemplatePreset = {
  id: "ppt-outline" | "wechat-article" | "xiaohongshu-post";
  name: string;
  description: string;
  instruction: string;
};

export const TEMPLATE_PRESETS: TemplatePreset[] = [
  {
    id: "ppt-outline",
    name: "PPT 大纲",
    description: "用于汇报/分享的分章节演示大纲",
    instruction:
      "请输出结构化 PPT 大纲，包含：标题页、问题背景、关键观点、案例/证据、行动建议、总结页。每页给出标题与3-5条要点。",
  },
  {
    id: "wechat-article",
    name: "公众号文章",
    description: "适合公众号发布的长文结构",
    instruction:
      "请输出公众号风格文章，包含：引子、核心观点拆解、小节标题、案例说明、结尾行动建议。语言清晰，避免口语化碎片。",
  },
  {
    id: "xiaohongshu-post",
    name: "小红书文案",
    description: "适合小红书发布的图文文案",
    instruction:
      "请输出小红书风格文案，包含：标题（3版可选）、开头钩子、正文分点、结尾互动引导、推荐标签。",
  },
];

export function getTemplatePresetById(id: string): TemplatePreset | null {
  return TEMPLATE_PRESETS.find((item) => item.id === id) || null;
}

