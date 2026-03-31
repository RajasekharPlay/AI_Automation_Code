import { Select, Badge, Space, Typography } from 'antd';
import { AppstoreOutlined } from '@ant-design/icons';
import { useProjectContext } from '../context/ProjectContext';
import { colors } from '../theme';

const { Text } = Typography;

export default function ProjectSelector() {
  const { projects, selectedProjectId, setSelectedProjectId, isLoading } = useProjectContext();

  return (
    <Space align="center" size={8}>
      <AppstoreOutlined style={{ color: colors.textMuted, fontSize: 15 }} />
      <Select
        value={selectedProjectId ?? '__all__'}
        onChange={(v) => setSelectedProjectId(v === '__all__' ? null : v)}
        loading={isLoading}
        popupMatchSelectWidth={false}
        style={{ minWidth: 180 }}
        dropdownStyle={{
          background: colors.bgSurface,
          border: `1px solid ${colors.border}`,
          borderRadius: 8,
        }}
        options={[
          {
            value: '__all__',
            label: (
              <Space size={8} align="center">
                <span style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: colors.textMuted,
                  border: `1px solid ${colors.borderLight}`,
                }} />
                <Text style={{ color: colors.textPrimary, fontSize: 13 }}>All Projects</Text>
              </Space>
            ),
          },
          ...projects
            .filter((p) => p.is_active)
            .map((p) => ({
              value: p.id,
              label: (
                <Space size={8} align="center">
                  <span style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: p.icon_color || colors.primary,
                    boxShadow: `0 0 6px ${p.icon_color || colors.primary}44`,
                  }} />
                  <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{p.name}</Text>
                  <Badge
                    count={p.github_repo.split('/').pop()}
                    style={{
                      background: `${colors.primary}22`,
                      color: colors.primaryLight,
                      fontSize: 10,
                      fontWeight: 500,
                      border: 'none',
                      padding: '0 6px',
                      height: 18,
                      lineHeight: '18px',
                    }}
                  />
                </Space>
              ),
            })),
        ]}
      />
    </Space>
  );
}
