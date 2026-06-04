"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Avatar,
  Button,
  Input,
  message,
  Popconfirm,
  Result,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import type { Key } from "react";
import {
  CheckCircleOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";

type UserRow = {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  emailVerified: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    notebooks: number;
    userVideos: number;
    timestampNotes: number;
    videoTags: number;
    chatMessages: number;
  };
};

type AdminStats = {
  totalUsers: number;
  verifiedUsers: number;
  unverifiedUsers: number;
  newUsersLast7Days: number;
  activeUsers: number;
  totalVideoLinks: number;
};

type UsersResponse = {
  users: UserRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  stats: AdminStats;
  error?: string;
};

const defaultStats: AdminStats = {
  totalUsers: 0,
  verifiedUsers: 0,
  unverifiedUsers: 0,
  newUsersLast7Days: 0,
  activeUsers: 0,
  totalVideoLinks: 0,
};

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function AdminUsersPage() {
  const { status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<AdminStats>(defaultStats);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [verified, setVerified] = useState("all");
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20, total: 0 });
  const [sorter, setSorter] = useState<{ field: string; order: "ascend" | "descend" }>({
    field: "createdAt",
    order: "ascend",
  });
  const currentPage = pagination.current;
  const pageSize = pagination.pageSize;

  const fetchUsers = useCallback(async (pageOverride?: number) => {
    setLoading(true);
    setForbidden(false);
    try {
      const page = pageOverride || currentPage;
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        keyword,
        verified,
        sortField: sorter.field,
        sortOrder: sorter.order,
      });
      const res = await fetch(`/api/admin/users?${params.toString()}`);
      const data = (await res.json()) as UsersResponse;

      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        throw new Error(data.error || "获取用户列表失败");
      }

      setUsers(data.users);
      setStats(data.stats);
      setPagination((prev) => ({
        ...prev,
        current: data.pagination.page,
        pageSize: data.pagination.pageSize,
        total: data.pagination.total,
      }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : "获取用户列表失败");
    } finally {
      setLoading(false);
    }
  }, [currentPage, keyword, pageSize, router, sorter.field, sorter.order, verified]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      fetchUsers();
    }
  }, [fetchUsers, router, status]);

  const updateVerification = useCallback(async (user: UserRow, nextVerified: boolean) => {
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailVerified: nextVerified }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "更新失败");
      message.success(nextVerified ? "已标记为已验证" : "已取消验证");
      fetchUsers();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "更新失败");
    }
  }, [fetchUsers]);

  const deleteUser = useCallback(async (user: UserRow) => {
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "删除失败");
      message.success(`已删除 ${user.email}`);
      fetchUsers();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "删除失败");
    }
  }, [fetchUsers]);

  const columns: ColumnsType<UserRow> = useMemo(
    () => [
      {
        title: "用户",
        dataIndex: "name",
        sorter: true,
        width: 260,
        render: (_, record) => (
          <div className="admin-user-cell">
            <Avatar src={record.avatar} icon={<UserOutlined />} />
            <div className="admin-user-text">
              <div className="admin-user-name">{record.name || "未命名用户"}</div>
              <div className="admin-user-email">{record.email}</div>
            </div>
          </div>
        ),
      },
      {
        title: "邮箱状态",
        dataIndex: "emailVerified",
        filters: [
          { text: "已验证", value: "yes" },
          { text: "未验证", value: "no" },
        ],
        filteredValue: verified === "all" ? null : [verified],
        width: 120,
        render: (value: string | null) =>
          value ? <Tag color="green">已验证</Tag> : <Tag color="default">未验证</Tag>,
      },
      {
        title: "内容资产",
        key: "assets",
        width: 260,
        render: (_, record) => (
          <Space size={[4, 6]} wrap>
            <Tooltip title="笔记本">
              <Tag color="blue">{record._count.notebooks} 本</Tag>
            </Tooltip>
            <Tooltip title="视频历史">
              <Tag color="cyan">{record._count.userVideos} 视频</Tag>
            </Tooltip>
            <Tooltip title="时间戳笔记">
              <Tag color="purple">{record._count.timestampNotes} 笔记</Tag>
            </Tooltip>
            <Tooltip title="聊天消息">
              <Tag color="gold">{record._count.chatMessages} 对话</Tag>
            </Tooltip>
          </Space>
        ),
      },
      {
        title: "注册时间",
        dataIndex: "createdAt",
        sorter: true,
        defaultSortOrder: "ascend",
        width: 170,
        render: formatDate,
      },
      {
        title: "最近更新",
        dataIndex: "updatedAt",
        sorter: true,
        width: 170,
        render: formatDate,
      },
      {
        title: "操作",
        key: "actions",
        fixed: "right",
        width: 180,
        render: (_, record) => (
          <Space>
            <Button
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => updateVerification(record, !record.emailVerified)}
            >
              {record.emailVerified ? "取消验证" : "设为验证"}
            </Button>
            <Popconfirm
              title="删除用户"
              description="该用户的笔记本、历史、标签和聊天记录会一并删除。"
              okText="删除"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => deleteUser(record)}
            >
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [deleteUser, updateVerification, verified],
  );

  const handleTableChange = (
    nextPagination: TablePaginationConfig,
    filters: Record<string, (Key | boolean)[] | null>,
    nextSorter: SorterResult<UserRow> | SorterResult<UserRow>[],
  ) => {
    const singleSorter = Array.isArray(nextSorter) ? nextSorter[0] : nextSorter;
    const nextVerified = filters.emailVerified?.[0];

    setPagination({
      current: nextPagination.current || 1,
      pageSize: nextPagination.pageSize || 20,
      total: nextPagination.total || 0,
    });
    setVerified(typeof nextVerified === "string" ? nextVerified : "all");
    if (singleSorter?.field && singleSorter.order) {
      setSorter({ field: String(singleSorter.field), order: singleSorter.order });
    }
  };

  const runSearch = () => {
    setPagination((prev) => ({ ...prev, current: 1 }));
    fetchUsers(1);
  };

  if (forbidden) {
    return (
      <Result
        status="403"
        title="没有后台管理权限"
        subTitle="请确认当前登录邮箱已配置到 ADMIN_EMAILS 或 ADMIN_EMAIL 环境变量。"
        extra={<Button onClick={() => router.push("/")}>返回首页</Button>}
      />
    );
  }

  return (
    <div className="admin-users-page">
      <section className="admin-users-header">
        <div>
          <div className="admin-eyebrow">
            <TeamOutlined />
            后台管理
          </div>
          <h1>用户管理</h1>
        </div>
        <Button icon={<ReloadOutlined />} onClick={() => fetchUsers()} loading={loading}>
          刷新
        </Button>
      </section>

      <section className="admin-metrics">
        <div className="admin-metric">
          <span>总用户</span>
          <strong>{stats.totalUsers}</strong>
        </div>
        <div className="admin-metric">
          <span>7日新增</span>
          <strong>{stats.newUsersLast7Days}</strong>
        </div>
        <div className="admin-metric">
          <span>已验证</span>
          <strong>{stats.verifiedUsers}</strong>
        </div>
        <div className="admin-metric">
          <span>活跃用户</span>
          <strong>{stats.activeUsers}</strong>
        </div>
        <div className="admin-metric">
          <span>视频保存</span>
          <strong>{stats.totalVideoLinks}</strong>
        </div>
      </section>

      <section className="admin-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索邮箱或昵称"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onPressEnter={runSearch}
        />
        <Select
          value={verified}
          onChange={(value) => {
            setVerified(value);
            setPagination((prev) => ({ ...prev, current: 1 }));
          }}
          options={[
            { label: "全部状态", value: "all" },
            { label: "已验证", value: "yes" },
            { label: "未验证", value: "no" },
          ]}
        />
        <Button type="primary" icon={<SearchOutlined />} onClick={runSearch}>
          查询
        </Button>
      </section>

      <Table<UserRow>
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={users}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 位用户`,
        }}
        scroll={{ x: 1160 }}
        onChange={handleTableChange}
      />

      <style jsx>{`
        .admin-users-page {
          max-width: 1240px;
          margin: 0 auto;
          padding: 32px 24px 48px;
        }
        .admin-users-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin-bottom: 24px;
        }
        .admin-eyebrow {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--primary);
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 6px;
        }
        h1 {
          color: var(--foreground);
          font-size: 28px;
          line-height: 1.25;
          margin: 0;
        }
        .admin-metrics {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 18px;
        }
        .admin-metric {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 16px;
        }
        .admin-metric span {
          display: block;
          color: var(--muted-foreground);
          font-size: 13px;
          margin-bottom: 8px;
        }
        .admin-metric strong {
          color: var(--foreground);
          font-size: 26px;
          line-height: 1;
        }
        .admin-toolbar {
          display: grid;
          grid-template-columns: minmax(220px, 1fr) 140px auto;
          gap: 12px;
          align-items: center;
          margin-bottom: 16px;
        }
        .admin-user-cell {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .admin-user-text {
          min-width: 0;
        }
        .admin-user-name {
          color: var(--foreground);
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .admin-user-email {
          color: var(--muted-foreground);
          font-size: 12px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        @media (max-width: 760px) {
          .admin-users-page {
            padding: 24px 16px 40px;
          }
          .admin-users-header {
            align-items: flex-start;
            flex-direction: column;
          }
          .admin-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .admin-toolbar {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
