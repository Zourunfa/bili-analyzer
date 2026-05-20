"use client";

import { useState, type CSSProperties } from "react";
import Image from "next/image";
import { WechatOutlined } from "@ant-design/icons";

const WECHAT_IMAGE_SRC = "/wx_img.png";

export default function DeveloperWechatFloat() {
  const [imageAvailable, setImageAvailable] = useState(true);
  const [open, setOpen] = useState(false);

  const rootStyle: CSSProperties = {
    position: "fixed",
    right: 18,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 1100,
    display: "flex",
    alignItems: "center",
  };

  const triggerStyle: CSSProperties = {
    width: 56,
    minHeight: 64,
    border: "1px solid rgba(251, 114, 153, 0.32)",
    borderRadius: 8,
    background: "var(--popover)",
    color: "var(--foreground)",
    boxShadow: "0 14px 34px rgba(15, 18, 35, 0.16)",
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    cursor: "default",
    fontSize: 12,
    lineHeight: 1.1,
    padding: "8px 6px",
  };

  const popoverStyle: CSSProperties = {
    position: "absolute",
    right: 68,
    top: "50%",
    transform: open ? "translateY(-50%) translateX(0)" : "translateY(-50%) translateX(8px)",
    opacity: open ? 1 : 0,
    visibility: open ? "visible" : "hidden",
    pointerEvents: open ? "auto" : "none",
    transition: "opacity 0.18s ease, transform 0.18s ease, visibility 0.18s ease",
  };

  const cardStyle: CSSProperties = {
    width: 280,
    maxWidth: "calc(100vw - 96px)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "#ffffff",
    boxShadow: "0 18px 50px rgba(15, 18, 35, 0.22)",
    padding: 8,
  };

  return (
    <div
      className="developer-wechat-float"
      style={rootStyle}
      aria-label="开发者微信"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button className="developer-wechat-trigger" type="button" style={triggerStyle}>
        <WechatOutlined style={{ color: "#22c55e", fontSize: 22 }} />
        <span>微信</span>
      </button>
      <div className="developer-wechat-popover" role="tooltip" style={popoverStyle}>
        <div className="developer-wechat-card" style={cardStyle}>
          {imageAvailable ? (
            <Image
              className="developer-wechat-image"
              src={WECHAT_IMAGE_SRC}
              alt="开发者微信二维码"
              width={540}
              height={746}
              style={{ display: "block", width: "100%", height: "auto", borderRadius: 6 }}
              onError={() => setImageAvailable(false)}
            />
          ) : (
            <div
              className="developer-wechat-fallback"
              style={{
                minHeight: 220,
                padding: 24,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                color: "#202338",
                textAlign: "center",
                fontSize: 13,
              }}
            >
              <WechatOutlined style={{ color: "#22c55e", fontSize: 32 }} />
              <strong>开发者微信</strong>
              <span>请确认 public/wx_img.png 已存在</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
