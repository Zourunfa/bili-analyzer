"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Result, Button, Spin } from "antd";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const verify = async () => {
      const token = searchParams.get("token");
      const email = searchParams.get("email");

      if (!token || !email) {
        setStatus("error");
        setMessage("验证链接不完整，请检查邮件中的链接是否正确");
        return;
      }

      try {
        const res = await fetch(`/api/auth/verify-email?token=${token}&email=${encodeURIComponent(email)}`);
        const data = await res.json();

        if (res.ok) {
          setStatus("success");
          setMessage(data.message || "邮箱验证成功！");
        } else {
          setStatus("error");
          setMessage(data.error || "验证失败，请稍后重试");
        }
      } catch {
        setStatus("error");
        setMessage("网络错误，请稍后重试");
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0a0a1a",
      padding: "20px"
    }}>
      <div style={{
        background: "#12122a",
        borderRadius: "16px",
        padding: "48px",
        maxWidth: "480px",
        width: "100%",
        border: "1px solid #1e1e3a",
        textAlign: "center"
      }}>
        {status === "loading" && (
          <Spin size="large" />
        )}

        {status === "success" && (
          <Result
            status="success"
            title="验证成功！"
            subTitle={message}
            extra={
              <Button type="primary" href="/">
                返回首页
              </Button>
            }
          />
        )}

        {status === "error" && (
          <Result
            status="error"
            title="验证失败"
            subTitle={message}
            extra={
              <Button type="primary" href="/login">
                返回登录页
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
