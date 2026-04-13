# 规范：知识检索与 Skill 导出

## 知识检索

### 全文搜索
- 基于关键词搜索知识点的 content 字段
- 使用 PostgreSQL `ILIKE` 或全文索引
- 支持按 type 筛选（topic/keyPoint/concept/qaPair）
- 支持按视频/笔记本筛选

### 语义搜索
- 用户输入查询文本
- DashScope embedding 生成查询向量
- pgvector 余弦相似度搜索 top-K 结果
- 返回知识点 + 关联视频信息 + 相似度分数

### 搜索结果展示
- 知识点内容（高亮匹配词）
- 来源视频标题 + UP主
- 时间戳（可跳转）
- 相似度分数（语义搜索时）

```
POST /api/knowledge/search
Body: {
  query: "什么是所有权",
  mode: "semantic" | "fulltext",
  filters?: { type?: string, notebookId?: string, videoId?: string },
  topK?: 10
}
Response: { results: [{ point, video, score }] }
```

## Skill 导出

### 导出格式

#### Markdown 导出
```markdown
# [笔记本标题]

## 概述
[笔记本描述]

## 视频列表
1. [视频标题] - UP主 - 时长
2. ...

## 知识体系

### [主题1]
- 要点1
- 要点2

### [主题2]
- 概念：xxx
- Q: xxx A: xxx
```

#### System Prompt 导出
```
你是一个[笔记本主题]领域的专家助手。以下是你掌握的知识：

## 核心概念
[从concept类型知识点提取]

## 关键要点
[从keyPoint类型知识点提取]

## 常见问答
[从qaPair类型知识点提取]

当用户问及相关问题，请基于以上知识回答，并注明来源。
```

### 导出 API
```
POST /api/skills/export
Body: {
  notebookId: "xxx",
  format: "markdown" | "system-prompt"
}
Response: { content: "...", filename: "..." }
```
