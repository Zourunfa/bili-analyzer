# Knowledge Workflow E2E Checklist

## Preconditions

- User already logged in
- At least one analyzed video with subtitle + summary
- Database migration `20260425103000_add_notes_tags_smart_notebooks` applied

## A. 时间戳笔记链路

1. 打开 `/analyze/{bvid}`
2. 通过 `POST /api/videos/{bvid}/notes` 创建一条笔记
3. 通过 `GET /api/videos/{bvid}/notes` 校验返回顺序为时间升序
4. 通过 `PATCH /api/videos/{bvid}/notes/{noteId}` 修改内容
5. 通过 `DELETE /api/videos/{bvid}/notes/{noteId}` 删除并确认列表减少

## B. 标签与智能合集链路

1. 在分析页点击“标签”，创建标签并绑定当前视频
2. 调用 `GET /api/videos/{bvid}/tags` 校验绑定结果
3. 创建普通笔记本（`mode=manual`）并手动添加视频成功
4. 创建智能合集（`mode=smart` + rule）并验证 notebook 详情返回规则命中视频
5. 对智能合集执行手动添加/移除视频，预期收到错误提示

## C. 全局搜索链路

1. 调用 `POST /api/search/subtitles`，验证返回 `source=subtitle`
2. 调用 `POST /api/knowledge/search`，验证返回 `source=knowledge`
3. 调用 `POST /api/search/global`，验证混合结果可分页，且支持来源筛选
4. 在 `/search` 页面执行检索，验证“字幕命中/知识点命中”分组展示

## D. 模板输出链路

1. 分析页点击“模板输出”，选择模板并生成内容
2. 生成过程应为流式逐步输出
3. 点击“复制”后粘贴到外部编辑器，校验内容完整
4. 缺少摘要或字幕时，生成接口应返回参数错误

## E. 用户隔离验证

1. 用户 A 创建笔记/标签/智能合集
2. 切换用户 B 登录
3. 用户 B 不应查询到用户 A 的笔记/标签/搜索结果/智能合集内容

