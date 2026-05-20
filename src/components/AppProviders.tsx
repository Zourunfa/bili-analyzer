"use client";

import { App as AntdApp, ConfigProvider, theme as antdTheme } from "antd";
import AuthProvider from "@/components/AuthProvider";
import DeveloperWechatFloat from "@/components/DeveloperWechatFloat";
import Navbar from "@/components/Navbar";
import ThemeProvider, { useThemeMode } from "@/components/ThemeProvider";

function AppShell({ children }: { children: React.ReactNode }) {
  const { mode } = useThemeMode();
  const tokens =
    mode === "dark"
      ? {
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
        }
      : {
          colorPrimary: "#fb7299",
          colorBgContainer: "#ffffff",
          colorBgElevated: "#ffffff",
          colorBgLayout: "#f7f8fb",
          colorBorder: "#e6e8f0",
          colorBorderSecondary: "#eef0f5",
          colorText: "#202338",
          colorTextSecondary: "#5f667a",
          colorTextTertiary: "#8a92a6",
          colorFillSecondary: "#f4f6fb",
          borderRadius: 8,
          fontFamily: "'PingFang SC', 'Noto Sans SC', system-ui, -apple-system, sans-serif",
        };

  return (
    <ConfigProvider
      theme={{
        algorithm: mode === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: tokens,
      }}
    >
      <AntdApp>
        <AuthProvider>
          <Navbar />
          <main style={{ flex: 1 }}>{children}</main>
          <DeveloperWechatFloat />
        </AuthProvider>
      </AntdApp>
    </ConfigProvider>
  );
}

export default function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AppShell>{children}</AppShell>
    </ThemeProvider>
  );
}
