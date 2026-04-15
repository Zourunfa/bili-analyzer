## Why

当前注册流程无邮箱验证，任何人可用任意邮箱注册账号，无法确认邮箱真实性和所有者。这导致：
- 垃圾账号泛滥
- 无法通过邮件找回密码
- 无法发送通知（如视频分析完成）

增加邮箱验证可以确保账号安全、提升用户质量、为后续功能（如通知推送）打下基础。

## What Changes

- 用户注册后账号默认"未验证"状态，发送验证邮件到用户邮箱
- 用户登录后引导去邮箱点击验证链接
- 验证完成后账号变为"已验证"状态
- 未验证账号部分功能受限（如无法使用笔记本导出等）

## Capabilities

### New Capabilities

- `email-verification-send`: 注册时触发验证邮件发送
- `email-verification-verify`: 用户点击链接完成验证
- `email-verification-status`: 查询和展示验证状态

### Modified Capabilities

- `register`: 注册后自动发送验证邮件，而非直接激活账号
- `login`: 未验证用户展示引导验证提示，但不影响登录

## Impact

- **数据库**: `User` 模型新增 `emailVerified` 字段（DateTime | null）和 `verificationToken` 字段
- **API 新增**: `POST /api/auth/verify-email` 验证链接处理
- **注册流程**: 先创建用户（未激活）→ 发送邮件 → 用户验证 → 账号激活
- **非目标**: 不做邮件发送重试机制、不做验证码有效期配置、不做管理员后台审核
