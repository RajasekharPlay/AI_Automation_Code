/**
 * Run Testcase Tab — Restyled with deep navy theme
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Card, Select, Button, Tag, Space,
  Badge, Typography, Table, Tooltip, Spin, Empty, Popconfirm, message,
} from 'antd';
import {
  PlayCircleOutlined, StopOutlined, LinkOutlined,
  CheckCircleFilled, CloseCircleFilled, LoadingOutlined,
  ReloadOutlined, BranchesOutlined, FileTextOutlined,
  SettingOutlined, ThunderboltOutlined, DeleteOutlined,
} from '@ant-design/icons';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSpecFiles, fetchRuns, runSpec, connectRunSocket, fetchRunLogs, deleteRun, cancelRun } from '../api/client';
import type { ExecutionRun, RunParams, SpecFile } from '../types';
import { colors, STATUS_COLORS } from '../theme';

const { Text } = Typography;
const { Option } = Select;

const ENVIRONMENTS = ['dev', 'sit', 'uat'];
const BROWSERS     = ['chromium', 'firefox', 'webkit'];
// Device names map to Playwright projects in playwright.config.ts:
//   Desktop Chrome/Firefox/Safari → ai-chromium / ai-firefox / ai-webkit
//   iPhone* / iPad*               → ai-mobile-safari  (devices['iPhone 14'])
//   Pixel* / Galaxy*              → ai-mobile-chrome  (devices['Pixel 7'])
const DEVICES = [
  // Desktop
  'Desktop Chrome',
  'Desktop Firefox',
  'Desktop Safari',
  // Mobile Safari (ai-mobile-safari → iPhone 14 viewport)
  'iPhone 13',
  'iPhone 14',
  'iPhone 15 Pro',
  'iPad Pro',
  'iPad Air',
  // Mobile Chrome (ai-mobile-chrome → Pixel 7 viewport)
  'Pixel 7',
  'Galaxy S23',
  'Galaxy S24',
];
const MODES          = ['headless', 'headed'];
const AVAILABLE_TAGS = ['regression', 'smoke', 'sanity', 'e2e', 'critical'];

const STATUS_ICON: Record<string, React.ReactNode> = {
  queued:  <LoadingOutlined style={{ color: colors.warning }} />,
  running: <LoadingOutlined spin style={{ color: colors.running }} />,
  passed:  <CheckCircleFilled style={{ color: colors.success }} />,
  failed:  <CloseCircleFilled style={{ color: colors.danger }} />,
  error:   <CloseCircleFilled style={{ color: colors.dangerLight }} />,
};

export default function RunTab() {
  const [selectedSpec, setSelectedSpec] = useState<SpecFile | null>(null);
  const [params, setParams] = useState<RunParams>({
    environment:    'sit',
    browser:        'chromium',
    device:         'Desktop Chrome',
    execution_mode: 'headless',
    browser_version:'stable',
    tags:           ['regression'],
  });
  const [running, setRunning]           = useState(false);
  const [currentRunId, setCurrentRunId] = useState('');
  const [logs, setLogs]                 = useState<string[]>([]);
  const [runStatus, setRunStatus]       = useState<string>('');
  const [ghaUrl, setGhaUrl]             = useState<string>('');
  const logRef     = useRef<HTMLDivElement>(null);
  const wsRef      = useRef<WebSocket | null>(null);
  const pollRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsLogsRef  = useRef<number>(0);

  const {
    data: specData,
    isLoading: specsLoading,
    refetch: refetchSpecs,
  } = useQuery<{ specs: SpecFile[]; default_branch: string }>({
    queryKey: ['spec-files'],
    queryFn:  () => fetchSpecFiles(),
    refetchInterval: 30000,
  });

  const specFiles = specData?.specs ?? [];
  const defaultBranch = specData?.default_branch ?? 'ai-playwright-tests';

  const { data: runs = [], refetch: refetchRuns } = useQuery<ExecutionRun[]>({
    queryKey: ['runs'],
    queryFn:  fetchRuns,
    refetchInterval: running ? 2000 : 10000,
  });

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    if (!currentRunId) return;
    const run = runs.find((r) => r.id === currentRunId);
    if (run && ['passed', 'failed', 'error'].includes(run.status)) {
      setRunning(false);
      setRunStatus(run.status);
      if (run.status === 'passed') toast.success('Test passed');
      else toast.error('Test failed');
    }
  }, [runs, currentRunId]);

  const handleRun = useCallback(async () => {
    if (!selectedSpec) { toast.error('Select a spec file first'); return; }

    setLogs([]);
    setRunStatus('');
    setGhaUrl('');
    setRunning(true);
    wsLogsRef.current = 0;

    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    try {
      const mode = params.execution_mode;
      console.log('[RunTab] execution_mode from state:', mode, '| all params:', JSON.stringify(params));
      toast(`Triggering ${mode.toUpperCase()} mode on ${params.browser}`, {
        icon: mode === 'headed' ? '🖥️' : '👻',
        duration: 4000,
      });

      // Show the mode in the live logs so user can verify
      setLogs((prev) => [
        ...prev,
        `🔧 UI Config: execution_mode=${mode}, browser=${params.browser}, env=${params.environment}`,
        `📤 Sending to backend with execution_mode="${mode}"...`,
      ]);

      const payload = {
        spec_file_path: selectedSpec.path,
        branch:         selectedSpec.branch,
        environment:    params.environment,
        browser:        params.browser,
        device:         params.device,
        execution_mode: mode,
        tags:           params.tags.join(','),
      };
      console.log('[RunTab] sending to /api/run-spec:', JSON.stringify(payload));
      const { run_id } = await runSpec(payload);

      setCurrentRunId(run_id);

      wsRef.current?.close();
      wsRef.current = connectRunSocket(
        run_id,
        (line) => {
          if (line === '__DONE__') {
            setRunning(false);
            refetchRuns();
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            return;
          }
          wsLogsRef.current += 1;
          const ghaMatch = line.match(/https:\/\/github\.com\/[^\s]+\/actions\/runs\/\d+/);
          if (ghaMatch) setGhaUrl(ghaMatch[0]);
          setLogs((prev) => [...prev, line]);
        },
        () => setRunning(false),
      );

      setTimeout(async () => {
        if (wsLogsRef.current > 0) return;
        let lastCount = 0;
        pollRef.current = setInterval(async () => {
          try {
            const lines = await fetchRunLogs(run_id);
            if (lines.length > lastCount) {
              const newLines = lines.slice(lastCount);
              lastCount = lines.length;
              newLines.forEach((line) => {
                if (line === '__DONE__') {
                  setRunning(false);
                  refetchRuns();
                  if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                  return;
                }
                const ghaMatch = line.match(/https:\/\/github\.com\/[^\s]+\/actions\/runs\/\d+/);
                if (ghaMatch) setGhaUrl(ghaMatch[0]);
                setLogs((prev) => [...prev, line]);
              });
            }
          } catch { /* ignore */ }
        }, 3000);
      }, 6000);
    } catch (err) {
      setRunning(false);
      toast.error(`Failed to start run: ${err}`);
    }
  }, [selectedSpec, params, refetchRuns]);

  const handleStop = () => {
    wsRef.current?.close();
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setRunning(false);
    toast('Run disconnected (process may still be running)');
  };

  const setParam = <K extends keyof RunParams>(key: K, val: RunParams[K]) =>
    setParams((p) => ({ ...p, [key]: val }));

  const queryClient = useQueryClient();

  const handleDeleteRun = async (id: string) => {
    try {
      await deleteRun(id);
      message.success('Run deleted');
      queryClient.invalidateQueries({ queryKey: ['runs'] });
    } catch {
      message.error('Failed to delete run');
    }
  };

  const handleCancelRun = async (id: string) => {
    try {
      await cancelRun(id);
      message.success('Run cancelled');
    } catch (err: any) {
      // 400 = run already finished — refresh silently instead of showing error
      if (err?.response?.status === 400) {
        message.info('Run already completed');
      } else {
        message.error('Failed to cancel run');
      }
    } finally {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      refetchRuns();
    }
  };

  const handleSpecSelect = (value: string) => {
    const spec = specFiles.find((s) => `${s.path}|||${s.branch}` === value);
    setSelectedSpec(spec ?? null);
  };

  const runColumns = [
    {
      title: 'Status', width: 80,
      render: (_: unknown, r: ExecutionRun) => (
        <Space>{STATUS_ICON[r.status]} <Text style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[r.status] }}>{r.status}</Text></Space>
      ),
    },
    {
      title: 'Spec File', ellipsis: true,
      render: (_: unknown, r: ExecutionRun) => (
        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
          {r.spec_file_path?.split('/').pop() ?? '—'}
        </Text>
      ),
    },
    { title: 'Env', dataIndex: 'environment', width: 55,
      render: (v: string) => <Tag color="blue" style={{ borderRadius: 4 }}>{v}</Tag>,
    },
    { title: 'Browser', dataIndex: 'browser', width: 85 },
    { title: 'Device', dataIndex: 'device', ellipsis: true },
    {
      title: 'Tags', width: 130,
      render: (_: unknown, r: ExecutionRun) =>
        r.tags?.map((t) => (
          <Tag key={t} style={{ background: '#8b5cf622', color: colors.violet, border: 'none', borderRadius: 4, fontSize: 10 }}>
            @{t}
          </Tag>
        )),
    },
    {
      title: 'Started', width: 110,
      render: (_: unknown, r: ExecutionRun) =>
        r.start_time ? (
          <Text style={{ fontSize: 10, color: colors.textMuted }}>{new Date(r.start_time).toLocaleTimeString()}</Text>
        ) : '—',
    },
    {
      title: 'GHA', width: 45,
      render: (_: unknown, r: ExecutionRun) =>
        r.allure_report_path ? (
          <Tooltip title="Open GitHub Actions run">
            <a href={r.allure_report_path} target="_blank" rel="noreferrer" style={{ color: colors.primaryLight }}>
              <LinkOutlined />
            </a>
          </Tooltip>
        ) : <Text style={{ color: colors.textMuted }}>—</Text>,
    },
    {
      title: 'Actions', width: 80, fixed: 'right' as const,
      render: (_: unknown, r: ExecutionRun) => (
        <Space size={4}>
          {(r.status === 'queued' || r.status === 'running') && (
            <Popconfirm
              title="Cancel this run?"
              okText="Yes"
              cancelText="No"
              onConfirm={() => handleCancelRun(r.id)}
            >
              <Button size="small" icon={<StopOutlined />}
                style={{ borderColor: '#f97316', color: '#f97316' }}
                title="Stop run"
              />
            </Popconfirm>
          )}
          <Popconfirm
            title="Delete this run?"
            okText="Delete"
            okButtonProps={{ danger: true }}
            cancelText="No"
            onConfirm={() => handleDeleteRun(r.id)}
          >
            <Button size="small" icon={<DeleteOutlined />} danger title="Delete run" />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const labelStyle = { fontSize: 11, color: colors.textMuted, marginBottom: 4, textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600 };

  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 130px)' }}>

      {/* LEFT — config panel */}
      <div style={{ width: 370, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Spec file selector */}
        <Card
          size="small"
          className="glow-card section-card"
          title={
            <Space>
              <FileTextOutlined style={{ color: colors.primaryLight }} />
              <span>1. Select Spec File</span>
            </Space>
          }
          extra={
            <Tooltip title="Refresh from GitHub">
              <Button type="text" size="small" icon={<ReloadOutlined />}
                onClick={() => refetchSpecs()} loading={specsLoading}
                style={{ color: colors.textMuted }}
              />
            </Tooltip>
          }
          style={{ background: colors.bgCard, border: `1px solid ${colors.border}` }}
        >
          {specsLoading ? (
            <Spin size="small" />
          ) : specFiles.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span style={{ color: colors.textMuted }}>No spec files — generate tests in AI Phase tab</span>}
              style={{ margin: '8px 0' }}
            />
          ) : (
            <Select
              style={{ width: '100%' }}
              placeholder="Choose a spec file..."
              value={selectedSpec ? `${selectedSpec.path}|||${selectedSpec.branch}` : undefined}
              onChange={handleSpecSelect}
              showSearch
              optionFilterProp="label"
            >
              {specFiles.map((s) => {
                const key = `${s.path}|||${s.branch}`;
                return (
                  <Option key={key} value={key} label={s.name}>
                    <Space>
                      <FileTextOutlined style={{ color: colors.primaryLight, fontSize: 12 }} />
                      <Text style={{ fontSize: 12 }} ellipsis>{s.name}</Text>
                      <Tag style={{ background: `${colors.cyan}15`, color: colors.cyan, border: 'none', fontSize: 10, borderRadius: 4 }}>
                        <BranchesOutlined /> {s.branch}
                      </Tag>
                    </Space>
                  </Option>
                );
              })}
            </Select>
          )}
          {selectedSpec && (
            <div style={{ marginTop: 8, fontSize: 11 }}>
              <Tag style={{ background: `${colors.cyan}15`, color: colors.cyan, border: 'none', borderRadius: 4 }}>
                <BranchesOutlined /> {selectedSpec.branch}
              </Tag>
              <Text style={{ fontSize: 10, color: colors.textMuted, marginLeft: 4 }}>{selectedSpec.path}</Text>
            </div>
          )}
        </Card>

        {/* Execution parameters */}
        <Card
          size="small"
          className="glow-card section-card"
          title={<Space><SettingOutlined style={{ color: colors.primaryLight }} /> <span>2. Execution Parameters</span></Space>}
          style={{ background: colors.bgCard, border: `1px solid ${colors.border}` }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <div><div style={labelStyle}>Environment</div>
              <Select value={params.environment} style={{ width: '100%' }}
                onChange={(v) => setParam('environment', v)}>
                {ENVIRONMENTS.map((e) => <Option key={e} value={e}>{e.toUpperCase()}</Option>)}
              </Select>
            </div>

            <div><div style={labelStyle}>Browser</div>
              <Select value={params.browser} style={{ width: '100%' }}
                onChange={(v) => setParam('browser', v)}>
                {BROWSERS.map((b) => <Option key={b} value={b}>{b}</Option>)}
              </Select>
            </div>

            <div><div style={labelStyle}>Device</div>
              <Select value={params.device} style={{ width: '100%' }}
                onChange={(v) => setParam('device', v)}
                showSearch optionFilterProp="children">
                <Select.OptGroup label="Desktop">
                  {DEVICES.filter((d) => d.startsWith('Desktop')).map((d) => (
                    <Option key={d} value={d}>{d}</Option>
                  ))}
                </Select.OptGroup>
                <Select.OptGroup label="Mobile">
                  {DEVICES.filter((d) => !d.startsWith('Desktop') && !d.startsWith('iPad')).map((d) => (
                    <Option key={d} value={d}>{d}</Option>
                  ))}
                </Select.OptGroup>
                <Select.OptGroup label="Tablet">
                  {DEVICES.filter((d) => d.startsWith('iPad')).map((d) => (
                    <Option key={d} value={d}>{d}</Option>
                  ))}
                </Select.OptGroup>
              </Select>
            </div>

            <div><div style={labelStyle}>Execution Mode</div>
              <Select value={params.execution_mode} style={{ width: '100%' }}
                onChange={(v) => setParam('execution_mode', v)}>
                {MODES.map((m) => (
                  <Option key={m} value={m}>
                    {m === 'headed' ? '🖥️' : '👻'} {m.charAt(0).toUpperCase() + m.slice(1)}
                  </Option>
                ))}
              </Select>
            </div>

            <div><div style={labelStyle}>Tags</div>
              <Select mode="multiple" value={params.tags} style={{ width: '100%' }}
                onChange={(v) => setParam('tags', v)}>
                {AVAILABLE_TAGS.map((t) => (
                  <Option key={t} value={t}>
                    <Tag style={{ background: '#8b5cf622', color: colors.violet, border: 'none', borderRadius: 4 }}>@{t}</Tag>
                  </Option>
                ))}
              </Select>
            </div>
          </Space>
        </Card>

        {/* Mode confirmation badge */}
        <div style={{
          background: params.execution_mode === 'headed' ? '#166534' : '#1e3a5f',
          border: `1px solid ${params.execution_mode === 'headed' ? '#16a34a' : '#3b82f6'}`,
          borderRadius: 8,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
          color: params.execution_mode === 'headed' ? '#86efac' : '#93c5fd',
        }}>
          <span style={{ fontSize: 18 }}>{params.execution_mode === 'headed' ? '🖥️' : '👻'}</span>
          Will run in <span style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{params.execution_mode}</span> mode
          {params.execution_mode === 'headed' && <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.8 }}> — browser window will open on runner machine</span>}
        </div>

        {/* Run button */}
        <Space.Compact block>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            block
            loading={running}
            disabled={!selectedSpec}
            onClick={handleRun}
            size="large"
            className="gradient-btn"
          >
            {running ? 'Running...' : 'Run Test'}
          </Button>
          {running && (
            <Button danger icon={<StopOutlined />} onClick={handleStop} size="large" />
          )}
        </Space.Compact>
      </div>

      {/* RIGHT — logs + history */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Live log terminal */}
        <Card
          size="small"
          className="glow-card"
          title={
            <Space wrap>
              <span style={{ fontWeight: 600 }}>Live Logs</span>
              {running && <Badge status="processing" text={<span style={{ color: colors.primaryLight }}>Running</span>} />}
              {runStatus === 'passed' && <Badge status="success" text={<span style={{ color: colors.success }}>Passed</span>} />}
              {runStatus === 'failed' && <Badge status="error" text={<span style={{ color: colors.danger }}>Failed</span>} />}
              {ghaUrl && (
                <a href={ghaUrl} target="_blank" rel="noreferrer"
                   style={{ fontSize: 11, color: colors.primaryLight }}>
                  <LinkOutlined /> GitHub Actions
                </a>
              )}
            </Space>
          }
          style={{ flex: 1, background: colors.bgCard, border: `1px solid ${colors.border}` }}
          bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column' }}
        >
          {/* Terminal header with dots */}
          <div className="log-terminal-header">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
            <span style={{ fontSize: 10, color: colors.textMuted, marginLeft: 8 }}>terminal</span>
          </div>

          <div
            ref={logRef}
            className={`live-log-terminal ${running ? 'is-active' : ''}`}
            style={{
              color: '#e2e8f0',
              fontFamily: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
              fontSize: 12,
              padding: '12px 16px',
              height: 340,
              overflowY: 'auto',
              lineHeight: 1.7,
            }}
          >
            {logs.length === 0 && !running && (
              <span style={{ color: colors.textMuted }}>
                Select a spec file and click "Run Test" to start...
              </span>
            )}
            {logs.map((line, i) => {
              let colour = '#e2e8f0';
              if (line.includes('PASSED') || line.includes('✅')) colour = colors.success;
              else if (line.includes('FAILED') || line.includes('❌')) colour = colors.danger;
              else if (line.includes('⏳') || line.includes('🔍')) colour = colors.primaryLight;
              else if (line.includes('✓')) colour = colors.successLight;
              else if (line.includes('🚀')) colour = colors.violet;
              return (
                <div key={i} style={{ color: colour }}>
                  {line}
                </div>
              );
            })}
            {running && (
              <span className="pulse-dot" style={{
                display: 'inline-block',
                width: 8, height: 8,
                borderRadius: '50%',
                background: colors.primary,
                marginTop: 4,
              }} />
            )}
          </div>
        </Card>

        {/* Execution history */}
        <Card
          size="small"
          className="glow-card section-card"
          title={<Space><CloseCircleFilled style={{ color: colors.primaryLight }} /> <span>Execution History</span></Space>}
          style={{ flex: 1, overflow: 'auto', background: colors.bgCard, border: `1px solid ${colors.border}` }}
        >
          <Table
            dataSource={runs}
            columns={runColumns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 8, size: 'small' }}
            scroll={{ y: 220, x: 900 }}
            rowClassName={(r: ExecutionRun) => `status-row-${r.status}`}
          />
        </Card>
      </div>
    </div>
  );
}
