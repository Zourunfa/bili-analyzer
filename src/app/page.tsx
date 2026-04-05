"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Button, Card, Typography, Alert, Space } from "antd";
import { SearchOutlined, PlayCircleOutlined } from "@ant-design/icons";

const { Title, Text, Paragraph } = Typography;

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/video-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "获取视频信息失败");
        return;
      }

      router.push(`/analyze/${data.bvid}?cid=${data.cid}`);
    } catch {
      setError("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: 24,
        background: "linear-gradient(135deg, #f5f7fa 0%, #e4e9f2 100%)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 640 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <PlayCircleOutlined style={{ fontSize: 48, color: "#1677ff", marginBottom: 16 }} />
          <Title level={2} style={{ marginBottom: 8 }}>
            B站视频分析
          </Title>
          <Paragraph type="secondary" style={{ fontSize: 16 }}>
            粘贴B站视频链接，AI 自动提取字幕并生成摘要
          </Paragraph>
        </div>

        <Card style={{ borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.08)" }}>
          <Space.Compact style={{ width: "100%" }}>
            <Input
              size="large"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPressEnter={handleSubmit}
              placeholder="粘贴B站视频链接，如 https://www.bilibili.com/video/BV..."
              disabled={loading}
              prefix={<SearchOutlined style={{ color: "#bbb" }} />}
              style={{ flex: 1 }}
            />
            <Button
              type="primary"
              size="large"
              onClick={handleSubmit}
              loading={loading}
              disabled={!url.trim()}
              style={{ padding: "0 32px" }}
            >
              {loading ? null : "分析"}
            </Button>
          </Space.Compact>
          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              style={{ marginTop: 12 }}
            />
          )}
        </Card>

        <div style={{ textAlign: "center", marginTop: 24 }}>
          <Space direction="vertical" size={4}>
            <Text type="secondary" style={{ fontSize: 13 }}>
              支持带有CC字幕（AI生成或手动上传）的B站视频
            </Text>
            <Text type="secondary" style={{ fontSize: 13 }}>
              由通义千问提供 AI 分析能力
            </Text>
          </Space>
        </div>
      </div>
    </div>
  );
}
