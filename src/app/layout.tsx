import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import AppProviders from "@/components/AppProviders";

export const metadata: Metadata = {
  title: "视记 VideoNote - 视频学习知识管理平台",
  description: "将视频内容转化为可检索、可对话、可导出的结构化知识，支持B站/抖音/小红书",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased dark" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <AppProviders>{children}</AppProviders>
        <Script id="videonote-theme-script" strategy="beforeInteractive">
          {`(() => { try { const mode = localStorage.getItem("videonote-theme") || "dark"; const root = document.documentElement; root.classList.toggle("dark", mode !== "light"); root.classList.toggle("light", mode === "light"); root.style.colorScheme = mode === "light" ? "light" : "dark"; } catch (_) {} })();`}
        </Script>
      </body>
    </html>
  );
}
