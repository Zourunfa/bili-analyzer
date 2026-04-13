# 规范：结构化知识提取

## 概述
在视频分析完成后，自动从字幕中提取结构化知识，存储到数据库并生成向量嵌入。

## 输入
- 视频字幕全文（subtitleText）
- 视频元信息（title, ownerName, duration）

## 输出
结构化 JSON，包含以下类型的知识点：

### Topic（主题）
```json
{
  "type": "topic",
  "content": "主题描述",
  "timestamp": 120,
  "metadata": { "importance": "high" }
}
```

### KeyPoint（要点）
```json
{
  "type": "keyPoint",
  "content": "要点内容",
  "timestamp": 180,
  "metadata": { "category": "definition" }
}
```

### Concept（概念）
```json
{
  "type": "concept",
  "content": "概念名称：概念解释",
  "timestamp": 240,
  "metadata": { "domain": "programming" }
}
```

### QAPair（问答对）
```json
{
  "type": "qaPair",
  "content": "Q: 问题\nA: 回答",
  "timestamp": 300,
  "metadata": { "difficulty": "intermediate" }
}
```

## 提取 Prompt 设计
使用 Qwen 模型，通过结构化 Prompt 指导提取：
- 输入：字幕文本（带时间戳）+ 视频标题
- 输出：JSON 数组，每个元素包含 type、content、timestamp、metadata
- 约束：知识点数量适中（10-30个），时间戳准确，内容简洁

## 向量化
- 模型：DashScope text-embedding-v3
- 维度：1024
- 对每个知识点的 content 字段生成 embedding
- 存储到 Embedding 表，关联 KnowledgePoint

## 触发时机
- 视频分析完成后自动触发
- 用户可手动重新提取
- 批量分析时队列处理
