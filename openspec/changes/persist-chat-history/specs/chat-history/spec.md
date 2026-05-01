## ADDED Requirements

### Requirement: Persist video chat messages
系统 SHALL 为已登录用户按视频持久保存字幕对话消息。

#### Scenario: Save completed chat turn
- **WHEN** 已登录用户在已保存的视频详情中发送问题并收到 AI 回复
- **THEN** 系统保存本轮 user 消息和 assistant 消息，并关联当前用户与视频

#### Scenario: Skip persistence for temporary chat
- **WHEN** 未登录用户或没有数据库 videoId 的页面发起对话
- **THEN** 系统继续返回 AI 回复但不写入对话历史

### Requirement: Restore chat history by video
系统 SHALL 在用户打开已保存视频详情时恢复该用户对该视频的历史对话。

#### Scenario: Load existing history
- **WHEN** 用户从历史记录进入某个已保存视频详情
- **THEN** 系统按创建时间升序展示该用户对该视频的历史对话

#### Scenario: Isolate history between videos
- **WHEN** 用户从一个历史视频切换到另一个历史视频
- **THEN** 系统展示目标视频的对话历史，不混入上一个视频的消息

### Requirement: Protect chat history ownership
系统 SHALL 对对话历史执行用户隔离和视频访问校验。

#### Scenario: Read own video chat
- **WHEN** 用户请求自己可访问视频的对话历史
- **THEN** 系统返回该用户在该视频下的消息

#### Scenario: Reject unauthorized video chat
- **WHEN** 用户请求不存在或自己无权访问的视频对话历史
- **THEN** 系统返回错误且不泄露其他用户消息

### Requirement: Clean up chat history with video deletion
系统 SHALL 在视频记录删除时清理关联的对话历史。

#### Scenario: Delete video with chat history
- **WHEN** 系统删除一个视频记录
- **THEN** 该视频关联的对话历史同时被删除
