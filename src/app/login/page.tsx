"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Input, Button, Tabs, Alert, Form } from "antd";
import { MailOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("login");

  const handleLogin = async (values: { email: string; password: string }) => {
    setError("");
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });
      if (result?.error) {
        setError("邮箱或密码错误");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (values: { email: string; password: string; name: string }) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "注册失败");
        return;
      }
      await signIn("credentials", {
        email: values.email,
        password: values.password,
        redirect: false,
      });
      router.push("/");
      router.refresh();
    } catch {
      setError("注册失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Animated background */}
      <div className="login-bg">
        <div className="login-bg-orb login-bg-orb-1" />
        <div className="login-bg-orb login-bg-orb-2" />
        <div className="login-bg-orb login-bg-orb-3" />
      </div>

      <div className="login-container">
        {/* Logo */}
        <div className="login-header">
          <div className="login-logo-icon">&#9672;</div>
          <h1 className="login-title">视记</h1>
          <p className="login-subtitle">将视频转化为结构化知识</p>
        </div>

        {/* Card */}
        <div className="login-card">
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            centered
            items={[
              {
                key: "login",
                label: "登录",
                children: (
                  <Form onFinish={handleLogin} layout="vertical" size="large">
                    <Form.Item name="email" rules={[{ required: true, message: "请输入邮箱" }]}>
                      <Input prefix={<MailOutlined />} placeholder="邮箱" type="email" />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="密码" />
                    </Form.Item>
                    {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
                    <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, fontWeight: 600 }}>
                      登录
                    </Button>
                  </Form>
                ),
              },
              {
                key: "register",
                label: "注册",
                children: (
                  <Form onFinish={handleRegister} layout="vertical" size="large">
                    <Form.Item name="name" rules={[{ required: true, message: "请输入昵称" }]}>
                      <Input prefix={<UserOutlined />} placeholder="昵称" />
                    </Form.Item>
                    <Form.Item name="email" rules={[{ required: true, message: "请输入邮箱" }, { type: "email", message: "邮箱格式不正确" }]}>
                      <Input prefix={<MailOutlined />} placeholder="邮箱" type="email" />
                    </Form.Item>
                    <Form.Item name="password" rules={[{ required: true, message: "请输入密码" }, { min: 6, message: "密码至少6位" }]}>
                      <Input.Password prefix={<LockOutlined />} placeholder="密码（至少6位）" />
                    </Form.Item>
                    {error && <Alert message={error} type="error" showIcon style={{ marginBottom: 16 }} />}
                    <Button type="primary" htmlType="submit" loading={loading} block style={{ height: 44, fontWeight: 600 }}>
                      注册
                    </Button>
                  </Form>
                ),
              },
            ]}
          />
        </div>
      </div>

      <style jsx>{`
        .login-page {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          background: #0a0a1a;
        }
        .login-bg {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .login-bg-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          opacity: 0.4;
        }
        .login-bg-orb-1 {
          width: 400px;
          height: 400px;
          background: #fb7299;
          top: -100px;
          right: -100px;
          animation: float1 8s ease-in-out infinite;
        }
        .login-bg-orb-2 {
          width: 300px;
          height: 300px;
          background: #4cc9f0;
          bottom: -80px;
          left: -80px;
          animation: float2 10s ease-in-out infinite;
        }
        .login-bg-orb-3 {
          width: 200px;
          height: 200px;
          background: #a78bfa;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          animation: float3 12s ease-in-out infinite;
        }
        @keyframes float1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-40px, 40px); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(40px, -30px); }
        }
        @keyframes float3 {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.2); }
        }
        .login-container {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 420px;
          padding: 24px;
          animation: fadeInUp 0.6s ease-out;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .login-header {
          text-align: center;
          margin-bottom: 36px;
        }
        .login-logo-icon {
          font-size: 40px;
          margin-bottom: 12px;
        }
        .login-title {
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(135deg, #fb7299, #4cc9f0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin: 0 0 8px;
        }
        .login-subtitle {
          color: var(--muted-foreground);
          font-size: 14px;
          margin: 0;
        }
        .login-card {
          background: rgba(18, 18, 42, 0.7);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(251, 114, 153, 0.12);
          border-radius: 20px;
          padding: 32px 28px;
        }
      `}</style>
    </div>
  );
}
