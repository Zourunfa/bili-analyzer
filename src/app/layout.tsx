import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "B站视频分析",
  description: "粘贴B站视频链接，AI 自动提取字幕并生成摘要，支持对话追问",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
