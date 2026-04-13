import type { Metadata } from "next";
import "./globals.css";
import AuthProvider from "@/components/AuthProvider";
import Navbar from "@/components/Navbar";
import { ConfigProvider, theme } from "antd";

export const metadata: Metadata = {
  title: "视记 VideoNote - 视频学习知识管理平台",
  description: "将B站视频转化为可检索、可对话、可导出的结构化知识",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <ConfigProvider
          theme={{
            algorithm: theme.darkAlgorithm,
            token: {
              colorPrimary: "#fb7299",
              colorBgContainer: "#12122a",
              colorBgElevated: "#1a1a36",
              colorBgLayout: "#0a0a1a",
              colorBorder: "#1e1e3a",
              colorBorderSecondary: "#1e1e3a",
              colorText: "#e4e4f0",
              colorTextSecondary: "#8b8ba8",
              colorTextTertiary: "#5b5b7d",
              colorFillSecondary: "#1a1a36",
              borderRadius: 8,
              fontFamily: "'PingFang SC', 'Noto Sans SC', system-ui, -apple-system, sans-serif",
            },
          }}
        >
          <AuthProvider>
            <Navbar />
            <main style={{ flex: 1 }}>{children}</main>
          </AuthProvider>
        </ConfigProvider>
      </body>
    </html>
  );
}
