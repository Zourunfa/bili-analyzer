import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import AppProviders from "@/components/AppProviders";
import { DEFAULT_OG_IMAGE, HOME_DESCRIPTION, HOME_TITLE, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/share";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: HOME_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: HOME_DESCRIPTION,
  keywords: [
    "视频转知识笔记",
    "AI视频摘要",
    "B站视频总结",
    "视频思维导图",
    "个人知识库",
    "视记",
    "VideoNote",
  ],
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "zh_CN",
    type: "website",
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased light" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <AppProviders>{children}</AppProviders>
        <Script id="videonote-theme-script" strategy="beforeInteractive">
          {`(() => { try { const mode = localStorage.getItem("videonote-theme") || "light"; const root = document.documentElement; root.classList.toggle("dark", mode === "dark"); root.classList.toggle("light", mode !== "dark"); root.style.colorScheme = mode === "dark" ? "dark" : "light"; } catch (_) {} })();`}
        </Script>
      </body>
    </html>
  );
}
