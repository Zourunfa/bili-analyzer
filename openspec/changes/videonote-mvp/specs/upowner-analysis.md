# 规范：UP主分析

## 概述
用户可以查看B站UP主的视频列表，选择特定视频批量分析，或全量分析UP主所有视频。

## 用户场景

### 场景1：选集分析
用户发现一个好的教学UP主，想挑选其中与「Rust入门」相关的视频分析。

### 场景2：全量分析
用户想全面了解某个UP主的内容方向和知识体系。

## 功能需求

### UP主视频列表
- 输入UP主主页URL或mid
- 展示UP主信息：头像、名称、签名、视频数量
- 分页展示视频列表：封面、标题、时长、播放量、发布时间
- 支持按标题搜索筛选
- 支持全选/反选

### 选集分析
- 用户勾选视频后点击「批量分析」
- 后台队列处理：依次获取字幕 → 转写（如无CC字幕）→ 摘要 → 知识提取
- 展示进度：已完成 X/Y 个，当前处理中
- 分析完成后可添加到笔记本

### 全量分析
- 点击「全量分析」触发UP主所有视频的分析
- 先获取视频总数，确认后开始
- 队列处理 + 进度展示
- 分析完成后生成UP主知识图谱：
  - 内容方向分布
  - 高频知识点
  - 内容演进趋势

## API 设计

### 获取UP主视频列表
```
GET /api/upowner/videos?mid=12345&page=1&pageSize=30&keyword=rust
Response: { upowner: {...}, videos: [...], total: 100 }
```

### 批量分析
```
POST /api/upowner/analyze
Body: { mid: "12345", bvids: ["BV1xx...", "BV2yy..."] }
Response: SSE stream with progress events
```

### 全量分析
```
POST /api/upowner/analyze
Body: { mid: "12345", all: true }
Response: SSE stream with progress events
```

## 技术要点
- B站搜索API获取UP主视频列表（需要WBI签名）
- 批量分析使用队列避免并发过高
- 长时间任务通过 SSE 推送进度
- UPProfile 缓存避免重复请求
