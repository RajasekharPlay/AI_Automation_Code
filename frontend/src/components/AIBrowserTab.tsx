import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Card, Input, Select, Switch, Button, Tag, Space, Tooltip, Badge, Empty, Spin, Typography, Radio,
} from 'antd';
import {
  CompassOutlined, ThunderboltOutlined, PauseCircleOutlined, CaretRightOutlined,
  StopOutlined, CameraOutlined, CopyOutlined, CheckCircleOutlined,
  CloseCircleOutlined, EyeOutlined, EyeInvisibleOutlined, CodeOutlined,
  GlobalOutlined, AimOutlined, LoadingOutlined, SendOutlined,
} from '@ant-design/icons';
import MonacoEditor from '@monaco-editor/react';
import toast from 'react-hot-toast';
import { colors } from '../theme';
import { useProjectContext } from '../context/ProjectContext';
import type { MCPStep, MCPEvent } from '../types';
import {
  startMCPSession, mcpAutoExplore, mcpGenerateScript,
  mcpPause, mcpResume, stopMCPSession, mcpAction, fetchLLMProvider,
} from '../api/client';

const { TextArea } = Input;
const { Text } = Typography;

type LLMProvider = 'anthropic' | 'gemini';
interface ProviderInfo {
  default_provider: LLMProvider;
  anthropic: { model: string; configured: boolean };
  gemini: { model: string; configured: boolean };
}

export default function AIBrowserTab() {
  const { selectedProjectId } = useProjectContext();

  // ── Session config state ──────────────────────────────────────────────────
  const [url, setUrl] = useState('');
  const [testDescription, setTestDescription] = useState('');
  const [browser, setBrowser] = useState('chromium');
  const [headless, setHeadless] = useState(true);
  const [provider, setProvider] = useState<LLMProvider>('anthropic');
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(null);

  // ── Session state ─────────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState('');
  const [sessionStatus, setSessionStatus] = useState<'idle' | 'starting' | 'active' | 'paused' | 'exploring' | 'generating' | 'completed' | 'error'>('idle');
  const [steps, setSteps] = useState<MCPStep[]>([]);
  const [currentScreenshot, setCurrentScreenshot] = useState('');
  const [currentSnapshot, setCurrentSnapshot] = useState('');
  const [showSnapshot, setShowSnapshot] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [currentUrl, setCurrentUrl] = useState('');

  // ── Script state ──────────────────────────────────────────────────────────
  const [scriptCode, setScriptCode] = useState('');
  const [scriptId, setScriptId] = useState('');
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [validationErrors, setValidationErrors] = useState('');

  // ── Manual action state ───────────────────────────────────────────────────
  const [manualAction, setManualAction] = useState('click');
  const [manualElement, setManualElement] = useState('');
  const [manualValue, setManualValue] = useState('');

  const abortRef = useRef<(() => void) | null>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  // Load provider info
  useEffect(() => {
    fetchLLMProvider().then(setProviderInfo).catch(() => {});
  }, []);

  // Auto-scroll action log
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStart = useCallback(async () => {
    if (!url) { toast.error('Enter a URL to explore'); return; }
    if (!testDescription) { toast.error('Enter a test case description'); return; }

    setSessionStatus('starting');
    setSteps([]);
    setScriptCode('');
    setScriptId('');
    setIsValid(null);
    setCurrentScreenshot('');
    setCurrentSnapshot('');
    setStatusMessage('Starting browser session...');

    try {
      const res = await startMCPSession({
        url,
        browser,
        headless,
        test_case_description: testDescription,
        project_id: selectedProjectId || undefined,
        llm_provider: provider,
      });

      setSessionId(res.session_id);
      setSessionStatus('exploring');
      setCurrentUrl(url);
      toast.success('Browser session started');

      // Start auto-exploration
      const abort = mcpAutoExplore(
        res.session_id,
        testDescription,
        url,
        (event: MCPEvent) => {
          if (event.type === 'step' && event.step) {
            setSteps(prev => [...prev, event.step!]);
            if (event.screenshot) setCurrentScreenshot(event.screenshot);
            if (event.step.url) setCurrentUrl(event.step.url);
          } else if (event.type === 'status') {
            setStatusMessage(event.message || '');
          } else if (event.type === 'error') {
            setStatusMessage(`Error: ${event.message}`);
            toast.error(event.message || 'Exploration error');
          }
        },
        () => {
          setSessionStatus('active');
          setStatusMessage('Exploration complete. Generate script or continue manually.');
          toast.success('Exploration complete!');
        },
        (msg) => {
          setSessionStatus('error');
          setStatusMessage(`Error: ${msg}`);
          toast.error(msg);
        },
        provider,
        selectedProjectId || '',
      );
      abortRef.current = abort;

    } catch (e: any) {
      setSessionStatus('error');
      setStatusMessage(`Failed: ${e.message || e}`);
      toast.error(`Failed to start: ${e.message || e}`);
    }
  }, [url, testDescription, browser, headless, provider, selectedProjectId]);

  const handlePause = useCallback(async () => {
    if (!sessionId) return;
    await mcpPause(sessionId);
    setSessionStatus('paused');
    setStatusMessage('Paused — you can execute manual actions');
  }, [sessionId]);

  const handleResume = useCallback(async () => {
    if (!sessionId) return;
    await mcpResume(sessionId);
    setSessionStatus('exploring');
    setStatusMessage('Resumed exploration...');
  }, [sessionId]);

  const handleStop = useCallback(async () => {
    abortRef.current?.();
    if (sessionId) {
      await stopMCPSession(sessionId).catch(() => {});
    }
    setSessionStatus('completed');
    setStatusMessage('Session stopped');
  }, [sessionId]);

  const handleManualAction = useCallback(async () => {
    if (!sessionId || !manualElement) return;
    try {
      const res = await mcpAction(sessionId, manualAction, {
        element: manualElement,
        value: manualValue,
        ref: manualElement,
      });
      if (res.screenshot) setCurrentScreenshot(res.screenshot);
      setSteps(prev => [...prev, {
        step_number: prev.length + 1,
        action: manualAction,
        ref: manualElement,
        value: manualValue,
        reasoning: 'Manual action by user',
        timestamp: new Date().toISOString(),
      }]);
      setManualElement('');
      setManualValue('');
      toast.success(`Action: ${manualAction}`);
    } catch (e: any) {
      toast.error(`Action failed: ${e.message || e}`);
    }
  }, [sessionId, manualAction, manualElement, manualValue]);

  const handleGenerateScript = useCallback(async () => {
    if (!sessionId) return;
    setSessionStatus('generating');
    setScriptCode('');
    setStatusMessage('Generating Playwright script from exploration...');

    const abort = mcpGenerateScript(
      sessionId,
      testDescription,
      (text) => setScriptCode(prev => prev + text),
      (id, valid, errors) => {
        setScriptId(id);
        setIsValid(valid);
        setValidationErrors(errors);
        setSessionStatus('completed');
        setStatusMessage(valid ? 'Script generated and validated!' : 'Script generated with validation errors');
        toast.success('Script generated!');
      },
      (msg) => {
        setSessionStatus('active');
        setStatusMessage(`Script generation failed: ${msg}`);
        toast.error(msg);
      },
      provider,
      selectedProjectId || '',
    );
    abortRef.current = abort;
  }, [sessionId, testDescription, provider, selectedProjectId]);

  const copyScript = () => {
    navigator.clipboard.writeText(scriptCode);
    toast.success('Copied!');
  };

  const isExploring = sessionStatus === 'exploring';
  const isPaused = sessionStatus === 'paused';
  const isActive = sessionStatus === 'active';
  const isGenerating = sessionStatus === 'generating';
  const isStarting = sessionStatus === 'starting';
  const canStart = sessionStatus === 'idle' || sessionStatus === 'completed' || sessionStatus === 'error' || isStarting;
  const canExplore = isExploring || isPaused || isActive;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', gap: 16, height: 'calc(100vh - 160px)' }}>
      {/* ═══ LEFT PANEL — Config + Action Log ═══ */}
      <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'hidden' }}>
        {/* Config Card */}
        <Card size="small" className="glow-card section-card" title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CompassOutlined style={{ color: '#14b8a6' }} /> Session Config
          </span>
        } style={{ background: colors.bgCard, border: `1px solid ${colors.border}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Target URL
              </Text>
              <Input
                prefix={<GlobalOutlined style={{ color: colors.textMuted }} />}
                placeholder="https://app.example.com"
                value={url}
                onChange={e => setUrl(e.target.value)}
                disabled={!canStart}
                style={{ background: colors.bgSurface, borderColor: colors.border }}
              />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Test Case Description
              </Text>
              <TextArea
                rows={3}
                placeholder="Describe what to test: e.g. 'Verify user can log in with valid credentials and see the dashboard'"
                value={testDescription}
                onChange={e => setTestDescription(e.target.value)}
                disabled={!canStart}
                style={{ background: colors.bgSurface, borderColor: colors.border, fontSize: 12 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>Browser</Text>
                <Select value={browser} onChange={setBrowser} disabled={!canStart}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'chromium', label: 'Chromium' },
                    { value: 'firefox', label: 'Firefox' },
                    { value: 'webkit', label: 'WebKit' },
                  ]}
                />
              </div>
              <div style={{ flex: 1 }}>
                <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>Mode</Text>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 4 }}>
                  <Switch
                    checked={!headless}
                    onChange={v => setHeadless(!v)}
                    disabled={!canStart}
                    size="small"
                  />
                  <Text style={{ fontSize: 12 }}>{headless ? 'Headless' : 'Headed'}</Text>
                </div>
              </div>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 11, textTransform: 'uppercase' }}>LLM Provider</Text>
              <Radio.Group
                value={provider}
                onChange={e => setProvider(e.target.value)}
                className="llm-radio"
                size="small"
                disabled={!canStart}
                style={{ display: 'flex', marginTop: 4 }}
              >
                <Radio.Button value="anthropic" style={{ flex: 1, textAlign: 'center', fontSize: 12 }}>
                  Claude {providerInfo?.anthropic.configured ? '✓' : ''}
                </Radio.Button>
                <Radio.Button value="gemini" style={{ flex: 1, textAlign: 'center', fontSize: 12 }}>
                  Gemini {providerInfo?.gemini.configured ? '✓' : ''}
                </Radio.Button>
              </Radio.Group>
            </div>
          </div>
        </Card>

        {/* Control Buttons */}
        <Space.Compact style={{ width: '100%' }}>
          {canStart ? (
            <Button
              type="primary"
              icon={<ThunderboltOutlined />}
              className="gradient-btn"
              style={{ flex: 1 }}
              onClick={handleStart}
              loading={isStarting}
            >
              Start Exploration
            </Button>
          ) : (
            <>
              {isExploring && (
                <Button icon={<PauseCircleOutlined />} onClick={handlePause} style={{ flex: 1 }}>Pause</Button>
              )}
              {isPaused && (
                <Button icon={<CaretRightOutlined />} onClick={handleResume} type="primary" style={{ flex: 1 }}>Resume</Button>
              )}
              <Button icon={<StopOutlined />} danger onClick={handleStop} style={{ flex: 1 }}>Stop</Button>
            </>
          )}
        </Space.Compact>

        {/* Action Log */}
        <Card size="small" className="glow-card" title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AimOutlined style={{ color: '#14b8a6' }} />
            Action Log
            {steps.length > 0 && <Badge count={steps.length} style={{ backgroundColor: '#14b8a6' }} />}
          </span>
        } style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, flex: 1, overflow: 'hidden' }}
          bodyStyle={{ padding: 8, overflow: 'auto', maxHeight: 'calc(100% - 42px)' }}
        >
          {steps.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<Text type="secondary" style={{ fontSize: 12 }}>No actions yet</Text>}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className={`mcp-step-card ${selectedStepIdx === idx ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedStepIdx(idx);
                    if (step.screenshot) setCurrentScreenshot(step.screenshot);
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 6,
                    background: selectedStepIdx === idx ? 'var(--mcp-step-active-bg)' : 'var(--mcp-step-bg)',
                    border: `1px solid ${selectedStepIdx === idx ? '#14b8a666' : 'var(--border)'}`,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Tag color="cyan" style={{ margin: 0, fontSize: 10, lineHeight: '18px' }}>
                      {step.step_number}
                    </Tag>
                    <Tag style={{ margin: 0, fontSize: 10, lineHeight: '18px', textTransform: 'uppercase' }}>
                      {step.action}
                    </Tag>
                    <Text type="secondary" style={{ fontSize: 10, marginLeft: 'auto' }}>
                      {step.ref || ''}
                    </Text>
                  </div>
                  <Text style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block' }}>
                    {step.reasoning?.slice(0, 80)}{(step.reasoning?.length || 0) > 80 ? '...' : ''}
                  </Text>
                </div>
              ))}
              <div ref={stepsEndRef} />
            </div>
          )}
        </Card>
      </div>

      {/* ═══ CENTER PANEL — Browser View ═══ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        {/* URL Bar */}
        <div className="mcp-url-bar" style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '6px 12px',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}>
          <GlobalOutlined style={{ color: '#14b8a6', fontSize: 14 }} />
          <Text ellipsis style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
            {currentUrl || 'No page loaded'}
          </Text>
          {(isExploring || isGenerating) && (
            <Spin size="small" indicator={<LoadingOutlined style={{ color: '#14b8a6' }} />} />
          )}
          {sessionStatus !== 'idle' && (
            <Tag color={
              isExploring ? 'processing' :
              isPaused ? 'warning' :
              sessionStatus === 'completed' ? 'success' :
              sessionStatus === 'error' ? 'error' : 'default'
            } style={{ margin: 0, fontSize: 10 }}>
              {sessionStatus.toUpperCase()}
            </Tag>
          )}
        </div>

        {/* Screenshot Display */}
        <div className="mcp-screenshot-container" style={{
          flex: 1,
          border: '1px solid var(--mcp-screenshot-border, var(--border))',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'var(--mcp-screenshot-bg, var(--bg-surface))',
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {currentScreenshot ? (
            <img
              src={`data:image/png;base64,${currentScreenshot}`}
              alt="Browser screenshot"
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                objectFit: 'contain',
              }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <CameraOutlined style={{ fontSize: 48, color: 'var(--text-muted)', marginBottom: 12 }} />
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {sessionStatus === 'idle'
                  ? 'Start an exploration to see the browser here'
                  : 'Waiting for screenshot...'}
              </div>
            </div>
          )}
          {(isExploring || isGenerating) && (
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(0,0,0,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(1px)',
            }}>
              <Spin size="large" tip={statusMessage} />
            </div>
          )}
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div style={{
            padding: '4px 12px', borderRadius: 6,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text-secondary)',
          }}>
            {statusMessage}
          </div>
        )}

        {/* Accessibility Tree Toggle + Manual Actions (when paused) */}
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            size="small"
            icon={showSnapshot ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            onClick={() => setShowSnapshot(!showSnapshot)}
            disabled={!currentSnapshot && !sessionId}
          >
            {showSnapshot ? 'Hide' : 'Show'} Accessibility Tree
          </Button>
          {isPaused && (
            <div style={{ display: 'flex', gap: 6, flex: 1 }}>
              <Select value={manualAction} onChange={setManualAction} size="small" style={{ width: 100 }}>
                <Select.Option value="click">Click</Select.Option>
                <Select.Option value="fill">Fill</Select.Option>
                <Select.Option value="navigate">Navigate</Select.Option>
                <Select.Option value="hover">Hover</Select.Option>
              </Select>
              <Input
                size="small" placeholder="Element / ref" value={manualElement}
                onChange={e => setManualElement(e.target.value)} style={{ flex: 1 }}
              />
              {manualAction === 'fill' && (
                <Input size="small" placeholder="Value" value={manualValue}
                  onChange={e => setManualValue(e.target.value)} style={{ width: 120 }}
                />
              )}
              <Button size="small" type="primary" icon={<SendOutlined />} onClick={handleManualAction}>
                Go
              </Button>
            </div>
          )}
        </div>

        {/* Accessibility Tree Viewer */}
        {showSnapshot && (
          <div className="mcp-tree-viewer" style={{
            maxHeight: 200, overflow: 'auto',
            background: 'var(--terminal-bg)',
            border: '1px solid var(--terminal-border)',
            borderRadius: 8, padding: 12,
            fontFamily: 'monospace', fontSize: 11, color: '#94a3b8',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {currentSnapshot || 'No snapshot available — take a screenshot or wait for exploration to capture one.'}
          </div>
        )}
      </div>

      {/* ═══ RIGHT PANEL — Generated Script ═══ */}
      <div style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Script Header */}
        <Card size="small" className="glow-card section-card" title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CodeOutlined style={{ color: '#14b8a6' }} /> Generated Script
            {isValid === true && <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>Valid</Tag>}
            {isValid === false && <Tag color="error" icon={<CloseCircleOutlined />} style={{ margin: 0 }}>Invalid</Tag>}
          </span>
        } style={{ background: colors.bgCard, border: `1px solid ${colors.border}`, flex: 1, overflow: 'hidden' }}
          bodyStyle={{ padding: 0, height: 'calc(100% - 42px)', display: 'flex', flexDirection: 'column' }}
        >
          <div className={`editor-wrapper ${isGenerating ? 'is-generating' : ''}`} style={{ flex: 1 }}>
            <MonacoEditor
              language="typescript"
              theme="vs-dark"
              value={scriptCode || '// Generated script will appear here after exploration\n// Click "Generate Script" to create a Playwright test\n// from the recorded browser actions.'}
              options={{
                readOnly: isGenerating,
                minimap: { enabled: false },
                fontSize: 12,
                wordWrap: 'on',
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                automaticLayout: true,
              }}
              onChange={(v) => setScriptCode(v || '')}
            />
          </div>
          {validationErrors && (
            <div style={{
              padding: '6px 10px',
              background: 'rgba(239, 68, 68, 0.1)',
              borderTop: '1px solid rgba(239, 68, 68, 0.2)',
              fontSize: 11, color: '#f87171',
              maxHeight: 80, overflow: 'auto',
              fontFamily: 'monospace',
            }}>
              {validationErrors}
            </div>
          )}
        </Card>

        {/* Action Buttons */}
        <Space.Compact style={{ width: '100%' }}>
          <Button
            type="primary"
            icon={<ThunderboltOutlined />}
            className="gradient-btn"
            style={{ flex: 1 }}
            onClick={handleGenerateScript}
            loading={isGenerating}
            disabled={!sessionId || steps.length === 0 || isExploring}
          >
            Generate Script
          </Button>
          <Tooltip title="Copy to clipboard">
            <Button icon={<CopyOutlined />} onClick={copyScript} disabled={!scriptCode} />
          </Tooltip>
        </Space.Compact>
      </div>
    </div>
  );
}
