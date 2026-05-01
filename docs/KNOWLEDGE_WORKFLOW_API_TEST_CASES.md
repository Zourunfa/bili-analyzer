# Knowledge Workflow API Test Cases

## 1. 鉴权用例

### 1.1 未登录访问标签接口
- Endpoint: `GET /api/tags`
- 预期: `401` + `{ error: "请先登录" }`

### 1.2 未登录访问时间戳笔记接口
- Endpoint: `POST /api/videos/{bvid}/notes`
- 预期: `401` + `{ error: "请先登录" }`

## 2. 归属校验用例

### 2.1 访问非本人视频的笔记
- Endpoint: `GET /api/videos/{other_user_bvid}/notes`
- 预期: `404` + `{ error: "视频不存在或无权限" }`

### 2.2 修改非本人 noteId
- Endpoint: `PATCH /api/videos/{bvid}/notes/{other_user_note_id}`
- 预期: `404` + `{ error: "笔记不存在或无权限" }`

### 2.3 为非本人视频绑定标签
- Endpoint: `POST /api/videos/{other_user_bvid}/tags`
- 预期: `404` + `{ error: "视频不存在或无权限" }`

## 3. 参数校验用例

### 3.1 创建时间戳笔记内容为空
- Endpoint: `POST /api/videos/{bvid}/notes`
- Body: `{ \"timestampSec\": 12, \"content\": \"\" }`
- 预期: `400` + `{ error: \"笔记内容不能为空\" }`

### 3.2 创建时间戳笔记时间非法
- Body: `{ \"timestampSec\": -1, \"content\": \"x\" }`
- 预期: `400` + `{ error: \"timestampSec 必须是非负数字\" }`

### 3.3 创建 notebook mode 非法
- Endpoint: `POST /api/notebooks`
- Body: `{ \"title\": \"test\", \"mode\": \"invalid\" }`
- 预期: `400` + `{ error: \"mode 仅支持 manual 或 smart\" }`

### 3.4 模板生成缺少摘要或字幕
- Endpoint: `POST /api/templates/generate`
- Body: `{ \"templateId\": \"ppt-outline\", \"summary\": \"\", \"subtitleText\": \"\" }`
- 预期: `400` + `{ error: \"摘要和字幕内容不能为空\" }`

## 4. 规则查询用例（智能合集）

### 4.1 keyword 规则命中
- notebook.rule: `{ \"keyword\": \"Agent\" }`
- Endpoint: `GET /api/notebooks/{id}`
- 预期: 返回视频标题/字幕/摘要包含 `Agent` 的结果

### 4.2 ownerName 规则命中
- notebook.rule: `{ \"ownerName\": \"不吃辣\" }`
- 预期: 仅返回指定 UP 主视频

### 4.3 多 tagIds AND 逻辑
- notebook.rule: `{ \"tagIds\": [\"tagA\", \"tagB\"] }`
- 预期: 仅返回同时拥有 tagA 与 tagB 的视频

### 4.4 smart 模式阻止手动增删视频
- Endpoint: `POST /api/notebooks/{id}/videos`
- 预期: `400` + `{ error: \"智能合集不支持手动添加视频\" }`

