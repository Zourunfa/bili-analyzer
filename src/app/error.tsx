"use client";

import { useEffect } from "react";
import { Card, Typography, Button } from "antd";
import { AlertOutlined, ReloadOutlined } from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("应用错误:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "60vh",
        padding: 24,
      }}
    >
      <Card style={{ maxWidth: 480, textAlign: "center", borderRadius: 12 }}>
        <AlertOutlined style={{ fontSize: 48, color: "#ff4d4f", marginBottom: 16 }} />
        <Title level={4}>出错了</Title>
        <Paragraph type="secondary">
          {error.message || "发生了未知错误，请稍后重试"}
        </Paragraph>
        <Button type="primary" icon={<ReloadOutlined />} onClick={reset}>
          重试
        </Button>
      </Card>
    </div>
  );
}
