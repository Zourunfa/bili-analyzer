"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card, Button, Modal, Form, Input, Tag, Empty, Spin, Typography, Space, Row, Col, message,
} from "antd";
import {
  PlusOutlined, BookOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined,
} from "@ant-design/icons";
import Link from "next/link";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface Notebook {
  id: string;
  title: string;
  description: string | null;
  tags: string[];
  videoCount: number;
  updatedAt: string;
  _count: { videos: number };
}

export default function NotebooksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      fetchNotebooks();
    }
  }, [status, router]);

  const fetchNotebooks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notebooks");
      const data = await res.json();
      if (res.ok) setNotebooks(data.notebooks);
    } catch {
      message.error("获取笔记本列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (values: { title: string; description?: string; tags?: string }) => {
    try {
      const tags = values.tags
        ? values.tags.split(",").map((t: string) => t.trim()).filter(Boolean)
        : [];
      const res = await fetch("/api/notebooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, tags }),
      });
      if (res.ok) {
        message.success("创建成功");
        setModalOpen(false);
        form.resetFields();
        fetchNotebooks();
      } else {
        const data = await res.json();
        message.error(data.error || "创建失败");
      }
    } catch {
      message.error("创建失败");
    }
  };

  const handleDelete = async (id: string) => {
    Modal.confirm({
      title: "确认删除",
      content: "删除笔记本后，关联的视频不会被删除。",
      okText: "删除",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          const res = await fetch(`/api/notebooks/${id}`, { method: "DELETE" });
          if (res.ok) {
            message.success("删除成功");
            fetchNotebooks();
          }
        } catch {
          message.error("删除失败");
        }
      },
    });
  };

  if (status === "loading" || loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="notebooks-page">
      <div className="notebooks-header">
        <div className="notebooks-header-left">
          <BookOutlined className="notebooks-header-icon" />
          <Title level={3} style={{ margin: 0, color: "var(--foreground)" }}>我的笔记本</Title>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          新建笔记本
        </Button>
      </div>

      {notebooks.length === 0 ? (
        <div className="notebooks-empty">
          <Empty
            description={
              <Space direction="vertical">
                <Text type="secondary">还没有笔记本</Text>
                <Button type="primary" onClick={() => setModalOpen(true)}>
                  创建第一个笔记本
                </Button>
              </Space>
            }
          />
        </div>
      ) : (
        <Row gutter={[16, 16]}>
          {notebooks.map((nb, idx) => (
            <Col key={nb.id} xs={24} sm={12} md={8} lg={6}>
              <Link href={`/analyze/history?notebookId=${nb.id}`} className="notebook-card-link">
                <div
                  className="notebook-card"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                >
                  <div className="notebook-card-header">
                    <BookOutlined className="notebook-card-book-icon" />
                  </div>
                  <h3 className="notebook-card-title">{nb.title}</h3>
                  {nb.description && (
                    <p className="notebook-card-desc">{nb.description}</p>
                  )}
                  <div className="notebook-card-meta">
                    <Tag icon={<PlayCircleOutlined />} color="blue">{nb._count.videos} 个视频</Tag>
                    {nb.tags.slice(0, 3).map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </div>
                  <div className="notebook-card-actions">
                    <span className="notebook-card-action notebook-card-action-edit">
                      <EditOutlined /> 打开
                    </span>
                    <span
                      className="notebook-card-action notebook-card-action-delete"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(nb.id); }}
                    >
                      <DeleteOutlined /> 删除
                    </span>
                  </div>
                </div>
              </Link>
            </Col>
          ))}
        </Row>
      )}

      <Modal
        title="新建笔记本"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
      >
        <Form form={form} onFinish={handleCreate} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
            <Input placeholder="如：Rust 学习笔记" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <TextArea rows={3} placeholder="可选，描述这个笔记本的用途" />
          </Form.Item>
          <Form.Item name="tags" label="标签" extra="用逗号分隔多个标签">
            <Input placeholder="如：Rust, 编程, 入门" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit">创建</Button>
          </Form.Item>
        </Form>
      </Modal>

      <style jsx>{`
        .notebooks-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 24px;
        }
        .notebooks-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 28px;
        }
        .notebooks-header-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .notebooks-header-icon {
          color: #fb7299;
          font-size: 22px;
        }
        .notebooks-empty {
          padding: 80px 0;
        }
        .notebook-card-link {
          text-decoration: none;
          display: block;
        }
        .notebook-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 20px;
          height: 100%;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          animation: fadeInUp 0.5s ease-out both;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .notebook-card:hover {
          border-color: rgba(251, 114, 153, 0.3);
          transform: translateY(-3px);
          box-shadow: 0 8px 32px rgba(251, 114, 153, 0.1);
        }
        .notebook-card-header {
          margin-bottom: 12px;
        }
        .notebook-card-book-icon {
          font-size: 20px;
          color: #4cc9f0;
        }
        .notebook-card-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--foreground);
          margin: 0 0 6px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .notebook-card-desc {
          font-size: 13px;
          color: var(--muted-foreground);
          margin: 0 0 12px;
          line-height: 1.5;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .notebook-card-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-bottom: 12px;
        }
        .notebook-card-actions {
          display: flex;
          gap: 16px;
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }
        .notebook-card-action {
          font-size: 13px;
          color: var(--muted-foreground);
          cursor: pointer;
          transition: color 0.2s;
        }
        .notebook-card-action:hover {
          color: var(--foreground);
        }
        .notebook-card-action-delete:hover {
          color: #ff4757;
        }
      `}</style>
    </div>
  );
}
