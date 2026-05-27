"use client";

import { useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { Button, Dropdown, Avatar } from "antd";
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
  { key: "/upowner", icon: <ThunderboltOutlined />, label: "UP主", href: "/upowner" },
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
          {navLinks.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={`navbar-link ${pathname === link.key || (link.key !== "/" && link.key !== "/analyze" && pathname.startsWith(link.key)) || (link.key === "/analyze" && pathname.startsWith("/analyze")) ? "active" : ""}`}
            >
              {link.icon}
              <span>{link.label}</span>
            </Link>
          ))}
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
              onClick={() => setMobileOpen(false)}
            >
              {link.icon}
              <span>{link.label}</span>
            </Link>
          ))}
        </nav>
      )}

      <style jsx>{`
        .navbar {
          position: sticky;
          top: 0;
          z-index: 100;
          background: var(--navbar-bg);
          backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border);
        }
        .navbar-inner {
          max-width: 1200px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 56px;
          padding: 0 24px;
        }
        .navbar-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          flex-shrink: 0;
        }
        .navbar-logo-icon {
          font-size: 22px;
          filter: none;
        }
        .navbar-logo-text {
          font-size: 18px;
          font-weight: 700;
          background: linear-gradient(135deg, #fb7299, #4cc9f0);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          letter-spacing: -0.5px;
        }
        .navbar-links {
          display: flex;
          gap: 4px;
          align-items: center;
        }
        .navbar-link {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 8px;
          color: var(--muted-foreground);
          text-decoration: none;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .navbar-link:hover {
          color: var(--foreground);
          background: rgba(251, 114, 153, 0.08);
        }
        .navbar-link.active {
          color: #fb7299;
          background: rgba(251, 114, 153, 0.12);
        }
        .navbar-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }
        .theme-toggle {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          height: 34px;
          padding: 0 11px;
          border-radius: 8px;
          border: 1px solid var(--border);
          background: var(--card);
          color: var(--muted-foreground);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .theme-toggle:hover {
          color: var(--foreground);
          border-color: rgba(251, 114, 153, 0.35);
          background: rgba(251, 114, 153, 0.08);
        }
        .navbar-user {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          padding: 4px 10px;
          border-radius: 20px;
          transition: background 0.2s;
        }
        .navbar-user:hover {
          background: var(--hover-bg);
        }
        .navbar-username {
          color: var(--foreground);
          font-size: 14px;
          font-weight: 500;
        }
        .navbar-mobile-toggle {
          display: none;
          background: none;
          border: none;
          cursor: pointer;
          width: 32px;
          height: 32px;
          position: relative;
        }
        .hamburger,
        .hamburger::before,
        .hamburger::after {
          display: block;
          width: 20px;
          height: 2px;
          background: var(--foreground);
          border-radius: 1px;
          transition: all 0.3s;
          position: absolute;
          left: 6px;
        }
        .hamburger { top: 15px; }
        .hamburger::before { content: ""; top: -6px; }
        .hamburger::after { content: ""; top: 6px; }
        .hamburger.open { background: transparent; }
        .hamburger.open::before { top: 0; transform: rotate(45deg); }
        .hamburger.open::after { top: 0; transform: rotate(-45deg); }
        .navbar-mobile {
          display: none;
          flex-direction: column;
          padding: 8px 16px;
          border-top: 1px solid var(--border);
        }
        .navbar-mobile-link {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          color: var(--muted-foreground);
          text-decoration: none;
          border-radius: 8px;
          font-weight: 500;
          transition: all 0.2s;
        }
        .navbar-mobile-link:hover,
        .navbar-mobile-link.active {
          color: #fb7299;
          background: rgba(251, 114, 153, 0.1);
        }
        @media (max-width: 768px) {
          .navbar-links { display: none; }
          .navbar-mobile-toggle { display: block; }
          .navbar-mobile { display: flex; }
          .navbar-username { display: none; }
          .theme-toggle span { display: none; }
          .theme-toggle {
            width: 34px;
            justify-content: center;
            padding: 0;
          }
        }
      `}</style>
    </header>
  );
}
