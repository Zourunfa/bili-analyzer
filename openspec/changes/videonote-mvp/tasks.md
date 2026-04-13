# 任务清单：videonote-mvp

## 阶段一：基础设施 (P0)

### 任务1：数据库搭建
- [x] 安装 Prisma：`npm install prisma @prisma/client`
- [x] 初始化 Prisma：`npx prisma init`
- [x] 编写 schema.prisma（参考 data-model.md）
- [x] 配置 pgvector 扩展
- [ ] 运行迁移：`npx prisma migrate dev`（需 PostgreSQL 就绪）
- [x] 创建 `src/lib/db.ts` 导出 PrismaClient 单例
- **预估**：2h
- **依赖**：PostgreSQL 实例就绪

### 任务2：用户认证
- [x] 安装 NextAuth.js：`npm install next-auth`
- [x] 配置 `.env`（NEXTAUTH_SECRET, NEXTAUTH_URL）
- [x] 创建 `src/lib/auth.ts`（NextAuth 配置, Credentials Provider）
- [x] 创建 `src/app/api/auth/[...nextauth]/route.ts`
- [x] 创建注册 API：`src/app/api/auth/register/route.ts`
- [x] 创建登录/注册页面组件
- **预估**：3h
- **依赖**：任务1

### 任务3：导航布局
- [x] 创建 `src/components/Navbar.tsx` 导航栏
- [x] 导航项：首页、笔记本、UP主分析、知识检索、登录/注册
- [x] 创建 `src/components/AuthProvider.tsx` Session Provider
- [x] 修改 `src/app/layout.tsx` 集成导航和 AuthProvider
- **预估**：2h
- **依赖**：任务2

## 阶段二：核心功能 (P0)

### 任务4：结构化知识提取
- [x] 在 `src/lib/prompts.ts` 新增 KNOWLEDGE_EXTRACTION_PROMPT
- [x] 创建 `src/app/api/knowledge/extract/route.ts`
  - 接收 bvid，获取字幕，调用 LLM 提取
  - 解析 JSON 结果，写入 KnowledgePoint 表
- [x] 创建 `src/lib/embedding.ts`（DashScope embedding 调用）
- [x] 提取完成后异步生成 embedding 写入 Embedding 表
- **预估**：4h
- **依赖**：任务1

### 任务5：笔记本 CRUD
- [x] 创建 `src/app/api/notebooks/route.ts`（GET 列表 / POST 创建）
- [x] 创建 `src/app/api/notebooks/[id]/route.ts`（GET/PATCH/DELETE）
- [x] 创建 `src/app/api/notebooks/[id]/videos/route.ts`（POST 关联/DELETE 移除）
- [x] 创建 `src/app/notebooks/page.tsx` 笔记本列表页
- [x] 创建 `src/app/notebooks/[id]/page.tsx` 笔记本详情页
- [x] 笔记本卡片UI（Ant Design Card + Modal 创建）
- **预估**：4h
- **依赖**：任务1, 任务2

### 任务6：视频分析页集成
- [x] 修改 `src/app/analyze/[bvid]/page.tsx`
  - 添加「保存到笔记本」按钮
  - 弹窗选择目标笔记本
  - 保存视频到数据库并触发知识提取
- [x] 创建 `src/app/api/videos/route.ts`（视频 upsert + 查询）
- **预估**：3h
- **依赖**：任务4, 任务5

## 阶段三：UP主分析 (P1)

### 任务7：UP主视频列表
- [x] 在 `src/lib/bilibili.ts` 新增 `getUPownerVideos(mid, page, keyword)`
- [x] 创建 `src/app/api/upowner/videos/route.ts`
- [x] 创建 `src/app/upowner/page.tsx` UP主分析页
  - 输入UP主URL/mid
  - 展示UP主信息和视频列表
  - 勾选视频 + 批量分析按钮
- **预估**：3h
- **依赖**：任务3

### 任务8：批量分析
- [x] 创建 `src/app/api/upowner/analyze/route.ts`
  - 接收 bvids 数组或 all=true
  - SSE 推送进度
  - 依次处理：视频信息保存
- [x] UP主分析页添加进度展示UI（Progress 组件）
- **预估**：4h
- **依赖**：任务4, 任务7

## 阶段四：搜索与导出 (P1)

### 任务9：知识检索
- [x] 创建 `src/app/api/knowledge/search/route.ts`
  - 全文搜索：contains 查询
  - 语义搜索：pgvector 余弦相似度
- [x] 创建 `src/app/search/page.tsx` 搜索页面
  - 搜索框 + 模式切换（全文/语义）
  - 结果列表：知识点内容 + 来源视频 + 时间戳 + 相似度
- **预估**：3h
- **依赖**：任务4

### 任务10：Skill 导出
- [x] 创建 `src/app/api/skills/export/route.ts`
  - Markdown 模板渲染
  - System Prompt LLM 生成
- [x] 笔记本详情页添加导出按钮
- [x] 前端下载逻辑（Blob + createObjectURL）
- **预估**：2h
- **依赖**：任务5, 任务9

## 阶段五：打磨 (P2)

### 任务11：首页重构
- [x] 改造 `src/app/page.tsx` 为产品首页
  - Hero 区域 + 产品介绍
  - 功能展示卡片
  - 快速输入BV号入口
  - 快捷导航入口
- **预估**：2h
- **依赖**：任务3, 任务5

### 任务12：错误处理 + 体验优化
- [x] 创建 `src/app/error.tsx` 全局错误边界
- [x] 创建 `src/app/not-found.tsx` 404 页面
- [x] API 统一错误格式（{ error: string }）
- [x] Loading 状态（各页面 Spin 组件）
- [x] 空状态（各页面 Empty 组件）
- **预估**：3h
- **依赖**：以上所有任务

## 总估时：~32h
## 代码编写状态：全部完成 ✅
## 待办：PostgreSQL 数据库就绪后运行 `npx prisma migrate dev`
