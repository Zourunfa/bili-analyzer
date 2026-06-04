"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Button, Dropdown, Avatar, Tooltip } from "antd";
import {
  HomeOutlined,
  BookOutlined,
  UserOutlined,
  LogoutOutlined,
  SearchOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  SunOutlined,
  MoonOutlined,
  TeamOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useThemeMode } from "@/components/ThemeProvider";

const navLinks = [
  { key: "/", icon: <HomeOutlined />, label: "首页", href: "/" },
  { key: "/analyze", icon: <HistoryOutlined />, label: "历史", href: "/analyze/history" },
  { key: "/notebooks", icon: <BookOutlined />, label: "笔记本", href: "/notebooks" },
  {
    key: "/upowner",
    icon: <ThunderboltOutlined />,
    label: "B站登录态配置",
    href: "/upowner",
    description: "配置 B 站登录态后，视频解析会更快、更稳定；可提升字幕、音频和 UP 主视频列表获取成功率，减少风控或未登录导致的失败。",
    highlight: true,
  },
  { key: "/search", icon: <SearchOutlined />, label: "检索", href: "/search" },
];

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { mode, toggleMode } = useThemeMode();
  const showAdmin = status === "authenticated" && isAdmin;

  useEffect(() => {
    let ignore = false;
    if (status !== "authenticated") {
      return;
    }

    fetch("/api/admin/me")
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => {
        if (!ignore) setIsAdmin(false);
      });

    return () => {
      ignore = true;
    };
  }, [status]);

  const userMenu = session
    ? {
        items: [
          { key: "profile", icon: <UserOutlined />, label: session.user?.name || "用户", disabled: true },
          ...(showAdmin
            ? [
                {
                  key: "admin-users",
                  icon: <TeamOutlined />,
                  label: <Link href="/admin/users">用户管理</Link>,
                },
                {
                  key: "admin-logs",
                  icon: <FileSearchOutlined />,
                  label: <Link href="/admin/logs">日志中心</Link>,
                },
              ]
            : []),
          { type: "divider" as const },
          { key: "logout", icon: <LogoutOutlined />, label: "退出登录", onClick: () => signOut() },
        ],
      }
    : null;

  return (
    <header className="navbar">
      <div className="navbar-inner">
        {/* Logo */}
        <Link href="/" className="navbar-logo">
          <span className="navbar-logo-icon">&#9672;</span>
          <span className="navbar-logo-text">视记</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="navbar-links">
          {navLinks.map((link) => {
            const navLink = (
              <Link
                key={link.key}
                href={link.href}
                className={`navbar-link ${link.highlight ? "navbar-link-highlight" : ""} ${pathname === link.key || (link.key !== "/" && link.key !== "/analyze" && pathname.startsWith(link.key)) || (link.key === "/analyze" && pathname.startsWith("/analyze")) ? "active" : ""}`}
              >
                {link.icon}
                <span>{link.label}</span>
              </Link>
            );

            return link.description ? (
              <Tooltip key={link.key} title={link.description} placement="bottom">
                {navLink}
              </Tooltip>
            ) : navLink;
          })}
        </nav>

        {/* Right Section */}
        <div className="navbar-right">
          <button
            className="theme-toggle"
            type="button"
            onClick={toggleMode}
            aria-label={mode === "dark" ? "切换到白天版" : "切换到黑夜版"}
            title={mode === "dark" ? "切换到白天版" : "切换到黑夜版"}
            suppressHydrationWarning
          >
            {mode === "dark" ? <SunOutlined /> : <MoonOutlined />}
            <span>{mode === "dark" ? "白天版" : "黑夜版"}</span>
          </button>
          {status === "loading" ? (
            <span style={{ color: "var(--muted-foreground)" }}>...</span>
          ) : session ? (
            <Dropdown menu={userMenu!} placement="bottomRight">
              <div className="navbar-user">
                <Avatar
                  size="small"
                  icon={<UserOutlined />}
                  src={session.user?.image}
                  style={{ background: "var(--primary)", flexShrink: 0 }}
                />
                <span className="navbar-username">{session.user?.name}</span>
              </div>
            </Dropdown>
          ) : (
            <Link href="/login">
              <Button
                type="primary"
                icon={<UserOutlined />}
                style={{ borderRadius: 8, fontWeight: 500 }}
              >
                登录
              </Button>
            </Link>
          )}
        </div>

        {/* Mobile Toggle */}
        <button
          className="navbar-mobile-toggle"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <span className={`hamburger ${mobileOpen ? "open" : ""}`} />
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <nav className="navbar-mobile">
          {navLinks.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={`navbar-mobile-link ${pathname === link.key || (link.key === "/analyze" && pathname.startsWith("/analyze")) ? "active" : ""}`}
              title={link.description}
              onClick={() => setMobileOpen(false)}
            >
              {link.icon}
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
      )}

    </header>
  );
}
