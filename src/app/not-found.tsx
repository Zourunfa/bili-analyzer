"use client";

import { Card, Typography, Button } from "antd";
import { HomeOutlined } from "@ant-design/icons";
import Link from "next/link";

const { Title, Paragraph } = Typography;

export default function NotFound() {
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
      <Card style={{ maxWidth: 400, textAlign: "center", borderRadius: 12 }}>
        <Title level={1} style={{ color: "#1677ff" }}>404</Title>
        <Paragraph type="secondary">页面不存在</Paragraph>
        <Link href="/">
          <Button type="primary" icon={<HomeOutlined />}>返回首页</Button>
        </Link>
      </Card>
    </div>
  );
}
