## Context

当前注册流程：
1. 用户提交 email + password + name
2. 后端直接创建用户（已激活）
3. 返回成功，用户可立即登录

现有代码关键点：
- `POST /api/auth/register` 直接创建用户并返回
- `User` 模型仅含 `email`, `password`, `name` 字段
- NextAuth `CredentialsProvider` 直接验证密码登录
- 项目已有 `bcrypt` 依赖

## Goals / Non-Goals

**Goals:**
- 注册后发送验证邮件（Resend API）
- 用户点击邮件链接完成验证
- 验证链接格式：`/api/auth/verify-email?token=xxx&email=xxx`
- 未验证用户登录时展示提示（但不阻止登录）
- 验证状态持久化到数据库

**Non-Goals:**
- 不做邮箱验证码（OTP）方案
- 不做发送失败重试机制
- 不做 SMTP 自建邮件服务（用 Resend API）
- 不做验证链接有效期配置（默认 24 小时即可）
- 不做管理员手动激活账号功能

## Decisions

### 1. 使用 Resend 作为邮件发送服务

**理由**：
- API 简单，注册即送免费额度（1000封/天）
- 支持 React Email 模板
- TypeScript SDK 支持好

**配置**：
```env
RESEND_API_KEY=re_xxxxx
```

### 2. 验证 Token 用数据库存储，而非 JWT

**方案A - JWT**: `Token = JWT({ userId, email }, secret)`
- 优点：无状态，无需查库
- 缺点：无法在后端撤销（万一邮箱被盗想重发？）

**方案B - 数据库 Token**: 创建 `EmailVerificationToken` 表
- 优点：可追踪、可撤销、可查状态
- 缺点：多一次数据库查询

**选择方案B**，理由：简单可控，满足当前需求。

### 3. 数据模型变更

```prisma
model User {
  // ... 现有字段
  emailVerified  DateTime?  @map("email_verified_at")  // 验证时间
  @@map("users")
}

model EmailVerificationToken {
  id        String   @id @default(cuid())
  email     String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([email])
  @@map("email_verification_tokens")
}
```

### 4. 验证链接格式

```
http://localhost:3000/api/auth/verify-email?token=xxx&email=xxx
```

用户点击后：
1. 后端根据 token 查找 EmailVerificationToken
2. 校验是否过期
3. 更新 User.emailVerified
4. 删除已使用的 Token
5. 返回成功页面或重定向

### 5. 注册流程变更

**Before:**
```
注册 → 创建用户 → 返回成功
```

**After:**
```
注册 → 创建用户(未验证) → 生成Token → 发送邮件 → 返回成功+提示验证
```

### 6. 登录体验

未验证用户登录后：
- Session 中携带 `emailVerified` 状态
- 前端检测到未验证，展示 Banner："请去邮箱验证账号，验证后可解锁全部功能"
- 不阻止登录，但限制部分功能（如导出）

### 7. 验证 API 设计

**POST /api/auth/verify-email**
```
Request: ?token=xxx&email=xxx
Response: 
  - 成功: { success: true, message: "验证成功" }
  - 失败: { error: "链接已过期或无效" }, status 400
```

## Risks / Trade-offs

- **[邮件到达率]** 国内邮件可能被拦截 → 后续可加短信验证作为备选（v2）
- **[Token 安全]** Token 生成用 crypto.randomBytes → 被预测风险极低
- **[并发验证]** 用户多次点击 → 第一次成功后删除Token，后续请求返回"已使用"

## Implementation Sequence

1. **P0 - 数据库迁移**: 新增 User.emailVerified 字段
2. **P0 - Resend 集成**: 安装依赖，配置 API Key
3. **P0 - 发送验证邮件**: 修改 register API
4. **P0 - 验证链接 API**: 实现 verify-email 接口
5. **P1 - 前端验证状态**: 登录后检测并展示提示
6. **P1 - 验证页面 UI**: 美化验证成功/失败页面
