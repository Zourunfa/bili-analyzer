import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

/**
 * 发送邮箱验证邮件
 */
export async function sendVerificationEmail(email: string, name: string, token: string) {
  const verifyUrl = `${BASE_URL}/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`;

  const { data, error } = await resend.emails.send({
    from: "视记 VideoNote <noreply@videonote.ai>",
    to: email,
    subject: "【视记】请验证您的邮箱",
    html: `
      <div style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 40px;">
          <h1 style="color: #fb7299; font-size: 28px; margin: 0;">视记 VideoNote</h1>
          <p style="color: #8b8ba8; font-size: 14px; margin-top: 8px;">视频学习知识管理平台</p>
        </div>

        <div style="background: #12122a; border-radius: 12px; padding: 32px; border: 1px solid #1e1e3a;">
          <h2 style="color: #e4e4f0; font-size: 20px; margin: 0 0 20px;">Hi ${name}，欢迎加入视记！</h2>

          <p style="color: #c4c4d4; font-size: 16px; line-height: 1.8;">
            请点击下面的按钮验证您的邮箱地址：
          </p>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${verifyUrl}"
               style="display: inline-block; background: linear-gradient(135deg, #fb7299, #fc8ea4); color: #fff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
              验证邮箱
            </a>
          </div>

          <p style="color: #8b8ba8; font-size: 14px; line-height: 1.6;">
            或者复制链接到浏览器打开：
          </p>
          <p style="color: #4cc9f0; font-size: 13px; word-break: break-all;">
            ${verifyUrl}
          </p>

          <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #1e1e3a;">
            <p style="color: #5b5b7d; font-size: 12px;">
              此链接 24 小时内有效。<br/>
              如果您没有注册视记账号，请忽略此邮件。
            </p>
          </div>
        </div>

        <div style="text-align: center; margin-top: 32px; color: #5b5b7d; font-size: 12px;">
          <p>视记 VideoNote - 将视频转化为知识</p>
        </div>
      </div>
    `,
  });

  if (error) {
    console.error("发送验证邮件失败:", error);
    throw new Error("发送邮件失败");
  }

  return data;
}
