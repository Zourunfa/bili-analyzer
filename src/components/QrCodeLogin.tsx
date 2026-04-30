"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, Button, Typography, Space, Spin, message } from "antd";
import {
  QrcodeOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
  CloseOutlined,
  MobileOutlined,
} from "@ant-design/icons";
import QRCode from "qrcode";

const { Text } = Typography;

type QrState =
  | "idle"
  | "loading"
  | "showing"
  | "scanned"
  | "confirmed"
  | "expired"
  | "error";

interface QrCodeLoginProps {
  onSuccess: (cookies: {
    sessdata: string;
    dedeUserId: string;
    biliJct: string;
  }) => void;
  onCancel: () => void;
}

export default function QrCodeLogin({ onSuccess, onCancel }: QrCodeLoginProps) {
  const [qrState, setQrState] = useState<QrState>("loading");
  const [qrImageData, setQrImageData] = useState<string>("");
  const [qrcodeKey, setQrcodeKey] = useState<string>("");
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [countdown, setCountdown] = useState<number>(180);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const errorCountRef = useRef(0);

  const clearTimers = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const generateQrCode = useCallback(async () => {
    setQrState("loading");
    setErrorMsg("");
    errorCountRef.current = 0;

    try {
      const res = await fetch("/api/auth/bilibili/qrcode", { method: "POST" });
      const data = await res.json();

      if (!res.ok || data.error) {
        setQrState("error");
        setErrorMsg(data.error || "二维码生成失败");
        return;
      }

      // 用 qrcode 库渲染图片
      const dataUrl = await QRCode.toDataURL(data.url, {
        width: 256,
        margin: 2,
        color: { dark: "#000000", light: "#ffffff" },
      });

      setQrImageData(dataUrl);
      setQrcodeKey(data.qrcode_key);
      setExpiresAt(data.expiresAt);
      setCountdown(Math.floor((data.expiresAt - Date.now()) / 1000));
      setQrState("showing");
    } catch {
      setQrState("error");
      setErrorMsg("网络错误，请重试");
    }
  }, []);

  // 生成二维码
  useEffect(() => {
    generateQrCode();
    return clearTimers;
  }, [generateQrCode, clearTimers]);

  // 倒计时
  useEffect(() => {
    if (qrState !== "showing" && qrState !== "scanned") return;

    countdownRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setQrState("expired");
          clearTimers();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [qrState, clearTimers]);

  // 轮询扫码状态
  useEffect(() => {
    if (qrState !== "showing" && qrState !== "scanned") return;
    if (!qrcodeKey) return;

    pollTimerRef.current = setInterval(async () => {
      // 已过期则停止
      if (Date.now() > expiresAt) {
        setQrState("expired");
        clearTimers();
        return;
      }

      try {
        const res = await fetch("/api/auth/bilibili/qrcode/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrcode_key: qrcodeKey }),
        });
        const data = await res.json();
        errorCountRef.current = 0;

        if (data.status === "pending") {
          // 继续等待
        } else if (data.status === "scanned") {
          setQrState("scanned");
        } else if (data.status === "confirmed") {
          setQrState("confirmed");
          clearTimers();
          // 短暂展示成功状态后回调
          setTimeout(() => {
            onSuccess(data.cookies);
            message.success("B站登录成功");
          }, 500);
        } else if (data.status === "expired") {
          setQrState("expired");
          clearTimers();
        } else {
          setQrState("error");
          setErrorMsg(data.message || "未知错误");
          clearTimers();
        }
      } catch {
        errorCountRef.current++;
        if (errorCountRef.current >= 3) {
          setQrState("error");
          setErrorMsg("网络错误，请重试");
          clearTimers();
        }
      }
    }, 2000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [qrState, qrcodeKey, expiresAt, onSuccess, clearTimers]);

  // 渲染状态文字
  const renderStatus = () => {
    switch (qrState) {
      case "loading":
        return (
          <Space>
            <Spin size="small" />
            <Text type="secondary">正在生成二维码...</Text>
          </Space>
        );
      case "showing":
        return (
          <Space direction="vertical" align="center" size={4}>
            <Space>
              <MobileOutlined />
              <Text>请使用 B站 APP 扫描二维码</Text>
            </Space>
            <Text type="secondary" style={{ fontSize: 12 }}>
              剩余 {countdown} 秒
            </Text>
          </Space>
        );
      case "scanned":
        return (
          <Space>
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
            <Text style={{ color: "#52c41a" }}>已扫描，请在手机上确认登录</Text>
          </Space>
        );
      case "confirmed":
        return (
          <Space>
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
            <Text style={{ color: "#52c41a" }}>登录成功！</Text>
          </Space>
        );
      case "expired":
        return (
          <Space>
            <WarningOutlined style={{ color: "#faad14" }} />
            <Text type="warning">二维码已过期</Text>
          </Space>
        );
      case "error":
        return (
          <Space>
            <WarningOutlined style={{ color: "#ff4d4f" }} />
            <Text type="danger">{errorMsg || "发生错误"}</Text>
          </Space>
        );
      default:
        return null;
    }
  };

  return (
    <Card
      size="small"
      style={{
        maxWidth: 320,
        margin: "12px auto",
        textAlign: "center",
      }}
    >
      <Space direction="vertical" align="center" size={12} style={{ width: "100%" }}>
        <Space>
          <QrcodeOutlined />
          <Text strong>B站扫码登录</Text>
        </Space>

        {qrState !== "loading" && qrImageData && (
          <div
            style={{
              padding: 8,
              background: "#fff",
              borderRadius: 8,
              display: "inline-block",
              opacity: qrState === "expired" ? 0.3 : 1,
              transition: "opacity 0.3s",
            }}
          >
            <img
              src={qrImageData}
              alt="B站登录二维码"
              style={{ width: 220, height: 220, display: "block" }}
            />
          </div>
        )}

        {qrState === "loading" && (
          <div style={{ height: 220, display: "flex", alignItems: "center" }}>
            <Spin size="large" />
          </div>
        )}

        {renderStatus()}

        <Space>
          {(qrState === "expired" || qrState === "error") && (
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={generateQrCode}
            >
              刷新二维码
            </Button>
          )}
          <Button size="small" icon={<CloseOutlined />} onClick={onCancel}>
            取消
          </Button>
        </Space>
      </Space>
    </Card>
  );
}
