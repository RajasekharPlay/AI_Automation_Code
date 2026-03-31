import { useState, useEffect } from 'react';
import {
  Card, Button, Form, Input, Switch, Space, Typography, Divider,
  ColorPicker, List, Badge, Empty, Popconfirm, message, Collapse, Tag,
} from 'antd';
import {
  PlusOutlined, GithubOutlined, SettingOutlined, KeyOutlined,
  LinkOutlined, SaveOutlined, DeleteOutlined, CheckCircleFilled,
  FolderOutlined,
} from '@ant-design/icons';
import { useProjectContext } from '../context/ProjectContext';
import { createProject, updateProject, deleteProject } from '../api/client';
import type { Project } from '../types';
import { colors, gradients } from '../theme';

const { Text, Title } = Typography;

const EMPTY_PROJECT: Partial<Project> = {
  name: '',
  description: '',
  icon_color: '#6366f1',
  github_repo: '',
  github_token: '',
  ai_tests_branch: 'ai-playwright-tests',
  workflow_path: '',
  playwright_project_path: '',
  generated_tests_dir: 'tests/generated',
  runner_label: 'self-hosted',
  pw_host: '',
  pw_testuser: '',
  pw_password: '',
  pw_email: '',
  jira_url: '',
  system_prompt_override: '',
};

export default function ProjectsTab() {
  const { projects, refetchProjects, setSelectedProjectId } = useProjectContext();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const activeProjects = projects.filter((p) => p.is_active);
  const selected = activeProjects.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    if (selected && !isNew) {
      form.setFieldsValue({
        ...selected,
        icon_color: selected.icon_color || '#6366f1',
        framework_fetch_paths: selected.framework_fetch_paths?.join('\n') ?? '',
      });
    }
  }, [selected, isNew, form]);

  const handleNew = () => {
    setSelectedId(null);
    setIsNew(true);
    form.setFieldsValue({
      ...EMPTY_PROJECT,
      framework_fetch_paths: '',
    });
  };

  const handleSelect = (id: string) => {
    setIsNew(false);
    setSelectedId(id);
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);

      // Convert icon_color from ColorPicker object if needed
      const iconColor = typeof values.icon_color === 'string'
        ? values.icon_color
        : values.icon_color?.toHexString?.() ?? '#6366f1';

      const payload: Partial<Project> = {
        ...values,
        icon_color: iconColor,
        framework_fetch_paths: values.framework_fetch_paths
          ? values.framework_fetch_paths.split('\n').map((s: string) => s.trim()).filter(Boolean)
          : [],
      };

      if (isNew) {
        const created = await createProject(payload);
        message.success(`Project "${created.name}" created`);
        setIsNew(false);
        refetchProjects();
        setTimeout(() => setSelectedId(created.id), 300);
      } else if (selectedId) {
        await updateProject(selectedId, payload);
        message.success('Project updated');
        refetchProjects();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Validation failed';
      message.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    try {
      await deleteProject(selectedId);
      message.success('Project deactivated');
      setSelectedId(null);
      setIsNew(false);
      refetchProjects();
    } catch {
      message.error('Failed to delete project');
    }
  };

  // ── Styles ──────────────────────────────────────────────────────────────
  const cardStyle: React.CSSProperties = {
    background: colors.bgCard,
    border: `1px solid ${colors.border}`,
    borderRadius: 12,
  };

  const inputStyle: React.CSSProperties = {
    background: colors.bgSurface,
    border: `1px solid ${colors.border}`,
    borderRadius: 8,
    color: colors.textPrimary,
  };

  return (
    <div style={{ display: 'flex', gap: 20, minHeight: 'calc(100vh - 180px)' }}>

      {/* ── Left Panel: Project List ─────────────────────────────────────── */}
      <Card
        style={{ ...cardStyle, width: 350, flexShrink: 0, overflow: 'auto' }}
        bodyStyle={{ padding: 16 }}
        title={
          <Space>
            <FolderOutlined style={{ color: colors.primaryLight }} />
            <Text strong style={{ color: colors.textPrimary }}>Projects</Text>
            <Badge
              count={activeProjects.length}
              style={{ background: `${colors.primary}33`, color: colors.primaryLight, border: 'none' }}
            />
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            onClick={handleNew}
            style={{
              background: gradients.primary,
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
            }}
          >
            Create
          </Button>
        }
      >
        {activeProjects.length === 0 && !isNew ? (
          <Empty
            description={<Text style={{ color: colors.textMuted }}>No projects yet</Text>}
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        ) : (
          <List
            dataSource={activeProjects}
            renderItem={(p) => {
              const isSelected = p.id === selectedId && !isNew;
              return (
                <div
                  key={p.id}
                  onClick={() => handleSelect(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    cursor: 'pointer',
                    marginBottom: 6,
                    transition: 'all 0.2s ease',
                    background: isSelected ? `${colors.primary}15` : 'transparent',
                    border: isSelected ? `1px solid ${colors.primary}44` : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = colors.bgCardHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: p.icon_color || colors.primary,
                    boxShadow: `0 0 8px ${p.icon_color || colors.primary}44`,
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{
                      color: colors.textPrimary,
                      fontSize: 14,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {p.name}
                    </Text>
                    <Text style={{
                      color: colors.textMuted,
                      fontSize: 11,
                      display: 'block',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {p.github_repo}
                    </Text>
                  </div>
                  {isSelected && (
                    <CheckCircleFilled style={{ color: colors.primary, fontSize: 16, flexShrink: 0 }} />
                  )}
                </div>
              );
            }}
          />
        )}
      </Card>

      {/* ── Right Panel: Project Form ────────────────────────────────────── */}
      <Card
        style={{ ...cardStyle, flex: 1, overflow: 'auto' }}
        bodyStyle={{ padding: 24 }}
        title={
          <Space>
            <SettingOutlined style={{ color: colors.primaryLight }} />
            <Text strong style={{ color: colors.textPrimary }}>
              {isNew ? 'New Project' : selected ? selected.name : 'Select a Project'}
            </Text>
          </Space>
        }
        extra={
          (isNew || selected) && (
            <Space>
              {selected && !isNew && (
                <Popconfirm
                  title="Deactivate this project?"
                  description="The project will be hidden but data is preserved."
                  onConfirm={handleDelete}
                  okText="Yes"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />} size="small">
                    Delete
                  </Button>
                </Popconfirm>
              )}
              <Button
                type="primary"
                icon={<SaveOutlined />}
                size="small"
                loading={saving}
                onClick={handleSave}
                style={{
                  background: gradients.primary,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                {isNew ? 'Create' : 'Save'}
              </Button>
            </Space>
          )
        }
      >
        {!isNew && !selected ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 400,
            gap: 16,
          }}>
            <FolderOutlined style={{ fontSize: 48, color: colors.textMuted }} />
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>
              Select a project or create a new one
            </Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleNew}
              style={{
                background: gradients.primary,
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
              }}
            >
              Create Project
            </Button>
          </div>
        ) : (
          <Form
            form={form}
            layout="vertical"
            requiredMark="optional"
            style={{ maxWidth: 720 }}
          >
            <Collapse
              defaultActiveKey={['general', 'github']}
              ghost
              style={{ background: 'transparent' }}
              items={[
                {
                  key: 'general',
                  label: (
                    <Text strong style={{ color: colors.textPrimary, fontSize: 14 }}>
                      General
                    </Text>
                  ),
                  children: (
                    <>
                      <Form.Item
                        name="name"
                        label={<Text style={{ color: colors.textSecondary }}>Project Name</Text>}
                        rules={[{ required: true, message: 'Project name is required' }]}
                      >
                        <Input placeholder="e.g. MGA, Banorte" style={inputStyle} />
                      </Form.Item>

                      <Form.Item
                        name="description"
                        label={<Text style={{ color: colors.textSecondary }}>Description</Text>}
                      >
                        <Input.TextArea
                          rows={2}
                          placeholder="Short description of this project"
                          style={inputStyle}
                        />
                      </Form.Item>

                      <Form.Item
                        name="icon_color"
                        label={<Text style={{ color: colors.textSecondary }}>Color</Text>}
                      >
                        <ColorPicker
                          presets={[{
                            label: 'Recommended',
                            colors: ['#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#ef4444',
                                     '#f59e0b', '#10b981', '#14b8a6', '#3b82f6', '#22d3ee'],
                          }]}
                        />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  key: 'github',
                  label: (
                    <Space>
                      <GithubOutlined style={{ color: colors.textSecondary }} />
                      <Text strong style={{ color: colors.textPrimary, fontSize: 14 }}>
                        GitHub
                      </Text>
                    </Space>
                  ),
                  children: (
                    <>
                      <Form.Item
                        name="github_repo"
                        label={<Text style={{ color: colors.textSecondary }}>Repository</Text>}
                        rules={[{ required: true, message: 'GitHub repository is required' }]}
                      >
                        <Input placeholder="owner/repo" style={inputStyle} prefix={<GithubOutlined style={{ color: colors.textMuted }} />} />
                      </Form.Item>

                      <Form.Item
                        name="github_token"
                        label={<Text style={{ color: colors.textSecondary }}>Personal Access Token</Text>}
                        extra={<Text style={{ color: colors.textMuted, fontSize: 11 }}>Leave empty to use global token from .env</Text>}
                      >
                        <Input.Password placeholder="ghp_xxxx (optional)" style={inputStyle} />
                      </Form.Item>

                      <Form.Item
                        name="ai_tests_branch"
                        label={<Text style={{ color: colors.textSecondary }}>AI Tests Branch</Text>}
                      >
                        <Input placeholder="ai-playwright-tests" style={inputStyle} />
                      </Form.Item>

                      <Form.Item
                        name="workflow_path"
                        label={<Text style={{ color: colors.textSecondary }}>Workflow YAML Path</Text>}
                      >
                        <Input placeholder=".github/workflows/ai-tests.yml" style={inputStyle} />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  key: 'playwright',
                  label: (
                    <Space>
                      <SettingOutlined style={{ color: colors.textSecondary }} />
                      <Text strong style={{ color: colors.textPrimary, fontSize: 14 }}>
                        Playwright
                      </Text>
                    </Space>
                  ),
                  children: (
                    <>
                      <Form.Item
                        name="playwright_project_path"
                        label={<Text style={{ color: colors.textSecondary }}>Project Path</Text>}
                        extra={<Text style={{ color: colors.textMuted, fontSize: 11 }}>Local path to Playwright project on disk</Text>}
                      >
                        <Input placeholder="C:/path/to/playwright-project" style={inputStyle} />
                      </Form.Item>

                      <Form.Item
                        name="generated_tests_dir"
                        label={<Text style={{ color: colors.textSecondary }}>Generated Tests Directory</Text>}
                      >
                        <Input placeholder="tests/generated" style={inputStyle} />
                      </Form.Item>

                      <Form.Item
                        name="runner_label"
                        label={<Text style={{ color: colors.textSecondary }}>Runner Label</Text>}
                      >
                        <Input placeholder="self-hosted" style={inputStyle} />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  key: 'credentials',
                  label: (
                    <Space>
                      <KeyOutlined style={{ color: colors.textSecondary }} />
                      <Text strong style={{ color: colors.textPrimary, fontSize: 14 }}>
                        Credentials
                      </Text>
                    </Space>
                  ),
                  children: (
                    <>
                      <Form.Item
                        name="pw_host"
                        label={<Text style={{ color: colors.textSecondary }}>Host URL</Text>}
                      >
                        <Input placeholder="https://app.example.com" style={inputStyle} />
                      </Form.Item>

                      <Form.Item
                        name="pw_testuser"
                        label={<Text style={{ color: colors.textSecondary }}>Test User</Text>}
                      >
                        <Input placeholder="testuser" style={inputStyle} />
                      </Form.Item>

                      <Form.Item
                        name="pw_password"
                        label={<Text style={{ color: colors.textSecondary }}>Password</Text>}
                      >
                        <Input.Password placeholder="****" style={inputStyle} />
                      </Form.Item>

                      <Form.Item
                        name="pw_email"
                        label={<Text style={{ color: colors.textSecondary }}>Email</Text>}
                      >
                        <Input placeholder="test@example.com" style={inputStyle} />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  key: 'advanced',
                  label: (
                    <Space>
                      <SettingOutlined style={{ color: colors.textSecondary }} />
                      <Text strong style={{ color: colors.textPrimary, fontSize: 14 }}>
                        Advanced
                      </Text>
                    </Space>
                  ),
                  children: (
                    <>
                      <Form.Item
                        name="framework_fetch_paths"
                        label={<Text style={{ color: colors.textSecondary }}>Framework Fetch Paths</Text>}
                        extra={<Text style={{ color: colors.textMuted, fontSize: 11 }}>One path per line, e.g. "skye-e2e-tests/pages/"</Text>}
                      >
                        <Input.TextArea rows={3} placeholder="skye-e2e-tests/fixtures/&#10;skye-e2e-tests/pages/" style={inputStyle} />
                      </Form.Item>

                      <Form.Item
                        name="system_prompt_override"
                        label={<Text style={{ color: colors.textSecondary }}>Custom LLM System Prompt</Text>}
                        extra={<Text style={{ color: colors.textMuted, fontSize: 11 }}>Override the default system prompt for script generation</Text>}
                      >
                        <Input.TextArea rows={4} placeholder="Optional: custom instructions for the LLM" style={inputStyle} />
                      </Form.Item>

                      <Form.Item
                        name="jira_url"
                        label={<Text style={{ color: colors.textSecondary }}>Jira URL</Text>}
                      >
                        <Input placeholder="https://company.atlassian.net" style={inputStyle} prefix={<LinkOutlined style={{ color: colors.textMuted }} />} />
                      </Form.Item>
                    </>
                  ),
                },
              ]}
            />
          </Form>
        )}
      </Card>
    </div>
  );
}
