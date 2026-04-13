# Obsidian 集成方案

## 目标

将视频知识与 Obsidian 做链接，实现知识管理的双向流动。

---

## 方案一：Markdown 双向导出 + 双向链接（最轻量）

将每个知识点的导出格式改为 Obsidian 友好的 Markdown，用 `[[wikilink]]` 语法建立链接关系。

- 每个 Video 导出为一个 Obsidian note，frontmatter 记录元数据（BVID、UP主、时间戳）
- 知识点用 `[[概念名]]` 互相链接
- 自动生成 MOC（Map of Content）索引页
- **优势**：改动最小，复用现有导出功能
- **劣势**：单向同步，Obsidian 侧修改不会回传

## 方案二：通过 Obsidian Local REST API 插件实时同步

利用 Obsidian 的 Local REST API 社区插件，直接向本地 Obsidian vault 写入笔记。

- 提取知识后自动 POST 到 Obsidian
- 支持双向：从 Obsidian 读取笔记关联回系统
- 可以实时推送，不需要手动导出
- **优势**：实时、双向、自动化
- **劣势**：需要用户安装插件并保持 Obsidian 运行

## 方案三：Git-based Vault 同步（中等复杂度）

将 Obsidian Vault 设为 Git 仓库，系统通过 GitHub API 推送生成的 Markdown 文件。

- 知识提取完成后 commit/push 到用户的 vault 仓库
- 用户在 Obsidian 中 pull 即可获得最新知识
- **优势**：不需要 Obsidian 常驻运行，有版本历史
- **劣势**：非实时，需要用户手动 pull 或配置自动 pull 插件

## 方案四：生成 Obsidian 兼容的 Vault 文件夹（离线导出）

导出时直接生成一个完整的 Obsidian Vault 文件夹结构。

```
vault/
├── .obsidian/
├── 00-MOC/
│   └── 知识地图.md
├── 01-视频/
│   ├── BV1xx..标题.md
│   └── ...
├── 02-概念/
│   ├── 概念A.md
│   └── ...
├── 03-UP主/
│   └── UP主名.md
└── templates/
    └── 视频笔记模板.md
```

- 用 Dataview 查询语法动态聚合
- 内嵌时间戳链接回 Bilibili 视频
- **优势**：一键下载即用，零配置
- **劣势**：增量更新需要重新导出或手动合并

---

## 推荐路径

1. **短期**：改造现有 Markdown 导出，加入 Obsidian 兼容的 frontmatter 和 `[[wikilink]]`
2. **中期**：增加"导出为 Vault"功能，生成完整文件夹结构供下载
3. **长期**（可选）：如果需要实时同步，再考虑 Local REST API 方案
