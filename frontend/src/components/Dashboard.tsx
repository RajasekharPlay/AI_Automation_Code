/**
 * Dashboard Tab — Restyled with deep navy theme
 */
import { useState } from 'react';
import {
  Card, Table, Tag, Space, Badge, Typography,
  Statistic, Row, Col, Button, Empty, Popconfirm, message,
} from 'antd';
import {
  CheckCircleFilled, CloseCircleFilled, ClockCircleFilled,
  BarChartOutlined, FileTextOutlined, LinkOutlined,
  RocketOutlined, TrophyOutlined, BugOutlined, CodeOutlined,
  DeleteOutlined, StopOutlined, ReloadOutlined,
} from '@ant-design/icons';
import {
  PieChart, Pie, Cell, Tooltip as RTooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchRuns, fetchScripts, deleteRun, cancelRun, clearAllRuns, clearAllData } from '../api/client';
import { useProjectContext } from '../context/ProjectContext';
import type { ExecutionRun, GeneratedScript } from '../types';
import { colors, STATUS_COLORS } from '../theme';

const { Text } = Typography;

// Order: Scripts Generated, Total Runs, Passed, Failed
const STAT_ICONS = [
  <CodeOutlined   style={{ fontSize: 22, color: colors.violet  }} />,
  <RocketOutlined style={{ fontSize: 22, color: colors.info    }} />,
  <TrophyOutlined style={{ fontSize: 22, color: colors.success }} />,
  <BugOutlined    style={{ fontSize: 22, color: colors.danger  }} />,
];
const STAT_CLASSES = ['stat-purple', 'stat-blue', 'stat-green', 'stat-red'];

export default function Dashboard() {
  const { selectedProjectId } = useProjectContext();
  const [allureRunId, setAllureRunId] = useState('');
  const queryClient = useQueryClient();

  const handleDelete = async (id: string) => {
    try {
      await deleteRun(id);
      message.success('Run deleted');
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    } catch {
      message.error('Failed to delete run');
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelRun(id);
      message.success('Run cancelled');
    } catch (err: any) {
      // 400 means the run already finished — just refresh the list silently
      if (err?.response?.status === 400) {
        message.info('Run already completed');
      } else {
        message.error('Failed to cancel run');
      }
    } finally {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    }
  };

  const { data: runs = [], refetch: refetchRuns, isFetching: fetchingRuns } = useQuery<ExecutionRun[]>({
    queryKey: ['runs', selectedProjectId],
    queryFn:  () => fetchRuns(selectedProjectId ?? undefined),
    refetchInterval: 5_000,
  });

  const { data: scripts = [], refetch: refetchScripts, isFetching: fetchingScripts } = useQuery<GeneratedScript[]>({
    queryKey: ['scripts', selectedProjectId],
    queryFn:  () => fetchScripts(selectedProjectId ?? undefined),
    refetchInterval: 10_000,
  });

  const handleRefresh = () => { refetchRuns(); refetchScripts(); };

  const handleClearAll = async () => {
    try {
      const res = await clearAllRuns();
      message.success(`Cleared ${res.deleted} run${res.deleted !== 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    } catch {
      message.error('Failed to clear runs');
    }
  };

  const [clearing, setClearing] = useState(false);
  const handleResetAll = async () => {
    setClearing(true);
    try {
      const res = await clearAllData();
      message.success(
        `Reset complete — removed ${res.deleted_scripts} scripts, ${res.deleted_test_cases} test cases, ${res.deleted_runs} runs`
      );
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      queryClient.invalidateQueries({ queryKey: ['scripts'] });
    } catch {
      message.error('Failed to reset data');
    } finally {
      setClearing(false);
    }
  };

  const passed  = runs.filter((r) => r.status === 'passed').length;
  const failed  = runs.filter((r) => r.status === 'failed').length;
  const running = runs.filter((r) => r.status === 'running').length;
  const total   = runs.length;

  const pieData = [
    { name: 'Passed',  value: passed,  color: colors.success },
    { name: 'Failed',  value: failed,  color: colors.danger },
    { name: 'Running', value: running, color: colors.running },
  ].filter((d) => d.value > 0);

  const runColumns = [
    {
      title: 'Status', width: 110,
      render: (_: unknown, r: ExecutionRun) => (
        <Tag
          color={STATUS_COLORS[r.status]}
          icon={
            r.status === 'passed'  ? <CheckCircleFilled /> :
            r.status === 'failed'  ? <CloseCircleFilled /> :
            <ClockCircleFilled />
          }
          style={{ borderRadius: 4, fontWeight: 600 }}
        >
          {r.status.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: 'Target', width: 80,
      render: (_: unknown, r: ExecutionRun) => {
        const isLocal = r.run_target === 'local';
        return (
          <Tag style={{
            background: isLocal ? '#0ea5e915' : '#f59e0b15',
            color: isLocal ? '#38bdf8' : '#fbbf24',
            border: 'none',
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 600,
          }}>
            {isLocal ? '💻 Local' : '🔄 GHA'}
          </Tag>
        );
      },
    },
    { title: 'Env', dataIndex: 'environment', width: 60,
      render: (v: string) => <Tag color="blue" style={{ borderRadius: 4 }}>{v}</Tag>,
    },
    { title: 'Browser', dataIndex: 'browser', width: 90 },
    { title: 'Device', dataIndex: 'device', ellipsis: true },
    {
      title: 'Mode', dataIndex: 'execution_mode', width: 100,
      render: (v: string) => (
        <Tag color={v === 'headed' ? 'purple' : 'default'} style={{ borderRadius: 4 }}>
          {v === 'headed' ? '🖥️' : '👻'} {v}
        </Tag>
      ),
    },
    {
      title: 'Tags', width: 160,
      render: (_: unknown, r: ExecutionRun) =>
        r.tags?.map((t) => (
          <Tag key={t} style={{ background: '#8b5cf622', color: colors.violet, border: 'none', borderRadius: 4 }}>
            @{t}
          </Tag>
        )),
    },
    {
      title: 'Started', width: 130,
      render: (_: unknown, r: ExecutionRun) =>
        r.start_time ? (
          <Text style={{ fontSize: 11, color: colors.textSecondary }}>
            {new Date(r.start_time).toLocaleString()}
          </Text>
        ) : '—',
    },
    {
      title: 'Duration', width: 90,
      render: (_: unknown, r: ExecutionRun) => {
        if (!r.start_time || !r.end_time) return '—';
        const ms = new Date(r.end_time).getTime() - new Date(r.start_time).getTime();
        return <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{(ms / 1000).toFixed(1)}s</Text>;
      },
    },
    {
      title: 'Report', width: 80,
      render: (_: unknown, r: ExecutionRun) =>
        r.allure_report_path ? (
          <Space>
            <Button
              size="small"
              icon={<LinkOutlined />}
              href={r.allure_report_path}
              target="_blank"
              style={{ borderColor: colors.primary, color: colors.primaryLight }}
            >
              Open
            </Button>
          </Space>
        ) : <Text style={{ color: colors.textMuted }}>—</Text>,
    },
    {
      title: 'Actions', width: 100, fixed: 'right' as const,
      render: (_: unknown, r: ExecutionRun) => (
        <Space size={4}>
          {(r.status === 'queued' || r.status === 'running') && (
            <Popconfirm
              title="Cancel this run?"
              okText="Yes"
              cancelText="No"
              onConfirm={() => handleCancel(r.id)}
            >
              <Button
                size="small"
                icon={<StopOutlined />}
                style={{ borderColor: '#f97316', color: '#f97316' }}
                title="Stop run"
              />
            </Popconfirm>
          )}
          <Popconfirm
            title="Delete this run record?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="Cancel"
            onConfirm={() => handleDelete(r.id)}
          >
            <Button
              size="small"
              icon={<DeleteOutlined />}
              danger
              title="Delete run"
            />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const scriptColumns = [
    {
      title: 'File', dataIndex: 'file_path', ellipsis: true,
      render: (v: string) => (
        <Text style={{ fontSize: 12, color: colors.textPrimary }}>
          {v?.split('/').pop() ?? '—'}
        </Text>
      ),
    },
    {
      title: 'Validation', dataIndex: 'validation_status', width: 110,
      render: (v: string) => (
        <Badge
          status={v === 'valid' ? 'success' : v === 'invalid' ? 'error' : 'default'}
          text={<span style={{ color: v === 'valid' ? colors.success : v === 'invalid' ? colors.danger : colors.textMuted }}>{v}</span>}
        />
      ),
    },
    {
      title: 'Created', width: 130,
      render: (_: unknown, s: GeneratedScript) => (
        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
          {new Date(s.created_at).toLocaleString()}
        </Text>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Top action bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>
        <Button
          size="small" icon={<ReloadOutlined />}
          loading={fetchingRuns || fetchingScripts}
          onClick={handleRefresh}
          style={{ color: colors.textMuted, borderColor: colors.border, background: colors.bgCard }}
        >
          Refresh
        </Button>
        <Popconfirm
          title="Reset all application data?"
          description="This permanently deletes ALL scripts, test cases, and execution history."
          okText="Reset Everything"
          okButtonProps={{ danger: true }}
          cancelText="Cancel"
          onConfirm={handleResetAll}
        >
          <Button
            size="small" danger icon={<DeleteOutlined />}
            loading={clearing}
          >
            Reset All Data
          </Button>
        </Popconfirm>
      </div>

      {/* Stats row */}
      <Row gutter={16}>
        {[
          { title: 'Scripts Generated', value: scripts.length, color: colors.violet },
          { title: 'Total Runs',        value: total,          color: colors.info },
          { title: 'Passed',            value: passed,         color: colors.success },
          { title: 'Failed',            value: failed,         color: colors.danger },
        ].map(({ title, value, color }, i) => (
          <Col span={6} key={title}>
            <Card size="small" className={`stat-card ${STAT_CLASSES[i]}`} style={{ background: colors.bgCard, border: `1px solid ${colors.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{
                  width: 44, height: 44,
                  borderRadius: 10,
                  background: `${color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  {STAT_ICONS[i]}
                </div>
                <Statistic
                  title={<span style={{ color: colors.textMuted, fontSize: 12 }}>{title}</span>}
                  value={value}
                  valueStyle={{ color, fontSize: 30, fontWeight: 700 }}
                />
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Chart + Scripts */}
      <Row gutter={16}>
        <Col span={7}>
          <Card
            size="small"
            className="glow-card section-card"
            title={<Space><BarChartOutlined style={{ color: colors.primaryLight }} /> <span>Pass / Fail</span></Space>}
            style={{ height: 300, background: colors.bgCard, border: `1px solid ${colors.border}` }}
          >
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={88}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{ background: colors.bgCard, border: `1px solid ${colors.border}`, borderRadius: 8 }}
                    itemStyle={{ color: colors.textPrimary }}
                  />
                  <Legend wrapperStyle={{ color: colors.textSecondary, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty description={<span style={{ color: colors.textMuted }}>No runs yet</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>

        <Col span={17}>
          <Card
            size="small"
            className="glow-card section-card"
            title={<Space><FileTextOutlined style={{ color: colors.primaryLight }} /> <span>Script Library</span></Space>}
            extra={
              <Popconfirm
                title="Delete all scripts & test cases?"
                description="This also removes all execution history."
                okText="Delete All"
                okButtonProps={{ danger: true }}
                cancelText="Cancel"
                onConfirm={handleResetAll}
              >
                <Button type="text" size="small" icon={<DeleteOutlined />}
                  style={{ color: colors.danger }} title="Clear all scripts" loading={clearing}
                />
              </Popconfirm>
            }
            style={{ height: 300, background: colors.bgCard, border: `1px solid ${colors.border}` }}
          >
            <Table
              dataSource={scripts}
              columns={scriptColumns}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 5, size: 'small' }}
              scroll={{ y: 180 }}
            />
          </Card>
        </Col>
      </Row>

      {/* Execution History */}
      <Card
        size="small"
        className="glow-card section-card"
        title={<Space><ClockCircleFilled style={{ color: colors.primaryLight }} /> <span>Execution History</span></Space>}
        extra={
          <Space size={6}>
            <Button
              type="text" size="small" icon={<ReloadOutlined />}
              loading={fetchingRuns}
              onClick={handleRefresh}
              style={{ color: colors.textMuted }}
              title="Refresh results"
            />
            <Popconfirm
              title="Clear all runs?"
              description="This will permanently delete all execution history from the database."
              okText="Clear All"
              okButtonProps={{ danger: true }}
              cancelText="Cancel"
              onConfirm={handleClearAll}
            >
              <Button
                type="text" size="small" icon={<DeleteOutlined />}
                style={{ color: colors.danger }}
                title="Clear all runs"
              />
            </Popconfirm>
          </Space>
        }
        style={{ background: colors.bgCard, border: `1px solid ${colors.border}` }}
      >
        <Table
          dataSource={runs}
          columns={runColumns}
          rowKey="id"
          size="small"
          pagination={{ pageSize: 8, size: 'small' }}
          scroll={{ x: 1300 }}
          rowClassName={(r: ExecutionRun) => `status-row-${r.status}`}
        />
      </Card>

      {/* Allure embed */}
      {allureRunId && (
        <Card
          size="small"
          className="glow-card"
          title="Allure Report"
          extra={<Button size="small" onClick={() => setAllureRunId('')}>Close</Button>}
          style={{ background: colors.bgCard, border: `1px solid ${colors.border}` }}
        >
          <iframe
            src={`http://localhost:8000/api/reports/${allureRunId}`}
            style={{ width: '100%', height: 600, border: 'none', borderRadius: 6 }}
            title="Allure Report"
          />
        </Card>
      )}
    </div>
  );
}
