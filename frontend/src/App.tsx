import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, Layout, Tabs, theme, Spin } from 'antd';
import {
  DashboardOutlined, RobotOutlined, PlaySquareOutlined,
} from '@ant-design/icons';
import { Toaster } from 'react-hot-toast';
import { colors, gradients, antThemeTokens, antComponentTokens } from './theme';

const Dashboard  = lazy(() => import('./components/Dashboard'));
const AIPhaseTab = lazy(() => import('./components/AIPhaseTab'));
const RunTab     = lazy(() => import('./components/RunTab'));

const { Header, Content } = Layout;
const qc = new QueryClient({ defaultOptions: { queries: { retry: 1 } } });

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <ConfigProvider
        theme={{
          algorithm: theme.darkAlgorithm,
          token: antThemeTokens,
          components: antComponentTokens,
        }}
      >
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: colors.bgCard,
              color: colors.textPrimary,
              border: `1px solid ${colors.border}`,
              borderRadius: 8,
            },
          }}
        />

        <Layout style={{ minHeight: '100vh', background: colors.bgDeepest }}>

          {/* Animated gradient accent bar */}
          <div className="header-accent-bar" />

          {/* Header */}
          <Header style={{
            background: gradients.header,
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '0 28px',
            height: 56,
          }}>
            <div style={{
              width: 36, height: 36,
              borderRadius: 10,
              background: gradients.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 16px rgba(99, 102, 241, 0.3)',
            }}>
              <RobotOutlined style={{ fontSize: 20, color: '#fff' }} />
            </div>
            <span style={{
              fontWeight: 700,
              fontSize: 17,
              color: colors.textPrimary,
              letterSpacing: '-0.01em',
            }}>
              AI Test Automation Platform
            </span>
            <span style={{ marginLeft: 'auto' }}>
              <span className="version-pill">AI_SDET v2.0</span>
            </span>
          </Header>

          {/* Main content */}
          <Content style={{ padding: '16px 28px' }}>
            <Tabs
              defaultActiveKey="dashboard"
              size="large"
              items={[
                {
                  key:   'dashboard',
                  label: <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                           <DashboardOutlined /> Dashboard
                         </span>,
                  children: (
                    <Suspense fallback={<Spin size="large" style={{ display: 'block', margin: '80px auto' }} />}>
                      <Dashboard />
                    </Suspense>
                  ),
                },
                {
                  key:   'ai-phase',
                  label: <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                           <RobotOutlined /> AI Phase
                         </span>,
                  children: (
                    <Suspense fallback={<Spin size="large" style={{ display: 'block', margin: '80px auto' }} />}>
                      <AIPhaseTab />
                    </Suspense>
                  ),
                },
                {
                  key:   'run',
                  label: <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                           <PlaySquareOutlined /> Run Testcase
                         </span>,
                  children: (
                    <Suspense fallback={<Spin size="large" style={{ display: 'block', margin: '80px auto' }} />}>
                      <RunTab />
                    </Suspense>
                  ),
                },
              ]}
            />
          </Content>
        </Layout>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
