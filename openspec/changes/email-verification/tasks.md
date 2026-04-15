# Tasks - 邮箱验证功能

## P0 - 核心功能

### Task 1: 数据库迁移
**文件**: `prisma/schema.prisma`
**内容**:
- User 模型新增 `emailVerified DateTime? @map("email_verified_at")`
- 新增 `EmailVerificationToken` 模型
- 执行 `npx prisma migrate dev --name add-email-verification`

### Task 2: Resend 依赖安装和配置
**文件**: `.env.local`, `package.json`
**内容**:
- `npm install resend`
- 添加环境变量 `RESEND_API_KEY`
- 创建 `src/lib/email.ts` 封装发送函数

### Task 3: 发送验证邮件
**文件**: `src/app/api/auth/register/route.ts`
**修改**:
- 注册后生成验证 Token（crypto.randomBytes）
- Token 存入 `EmailVerificationToken` 表（24小时过期）
- 调用 Resend 发送验证邮件

### Task 4: 验证链接 API
**文件**: `src/app/api/auth/verify-email/route.ts` (新建)
**内容**:
- GET 接口，接收 token 和 email 参数
- 查找 Token，校验过期
- 更新 User.emailVerified
- 删除已使用 Token
- 返回 JSON 结果

## P1 - 前端体验

### Task 5: 登录状态展示验证提示
**文件**: 前端布局组件
**内容**:
- Session 携带 emailVerified 状态
- 未验证用户展示 Banner 提示
- 提供"重新发送验证邮件"按钮（可选）

### Task 6: 验证结果页面
**文件**: `src/app/api/auth/verify-email/page.tsx` (可选，前端页面)
**内容**:
- 验证成功页面
- 验证失败/过期页面

## 依赖关系

```
Task 1 → Task 3 → Task 4
    ↓
Task 2 → Task 3
    ↓
Task 5, 6
```

## 环境变量

```env
RESEND_API_KEY=re_xxxxx
```
