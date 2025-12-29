import React from 'react';
import { Layout, theme, Button, Input, Space } from 'antd';
import {
  VideoCameraOutlined,
  SettingOutlined,
  SearchOutlined,
  LinkOutlined,
  CalendarOutlined,
  ToolOutlined,
  PieChartOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import CustomTitleBar from '../components/customtitlebar';
import { useApp } from '../context/appcontext';

const { Content } = Layout;

const MainLayout: React.FC = () => {
  const { isDark, setTheme, searchQuery, setSearchQuery } = useApp();
  const {
    token: { colorBgContainer, borderRadiusLG, colorPrimary, colorTextSecondary },
  } = theme.useToken();
  const navigate = useNavigate();
  const location = useLocation();

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const navItems = [
    { key: '/', label: '影视列表', icon: <VideoCameraOutlined /> },
    { key: '/calendar', label: '日历', icon: <CalendarOutlined /> },
    { key: '/match', label: '素材匹配', icon: <LinkOutlined /> },
    { key: '/tools', label: '工具箱', icon: <ToolOutlined /> },
    { key: '/statistics', label: '统计', icon: <PieChartOutlined /> },
    { key: '/settings', label: '设置', icon: <SettingOutlined /> },
  ];

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: isDark ? '#141414' : '#f5f5f5' }}>
        <CustomTitleBar isDark={isDark} toggleTheme={toggleTheme} />
        
        {/* Top Navigation Bar */}
        <div style={{
            height: 64,
            background: colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            boxShadow: isDark ? '0 1px 2px rgba(255,255,255,0.05)' : '0 1px 2px rgba(0,0,0,0.05)',
            marginBottom: 8,
            marginTop: 32
        }}>
            <Space size="small">
                {navItems.map(item => {
                    const isActive = location.pathname === item.key || (item.key !== '/' && location.pathname.startsWith(item.key));
                    return (
                        <Button
                            key={item.key}
                            type={isActive ? 'primary' : 'default'}
                            icon={item.icon}
                            onClick={() => navigate(item.key)}
                            style={{ 
                                height: 40, 
                                borderRadius: 6,
                                border: isActive ? undefined : '1px solid transparent',
                                background: isActive ? colorPrimary : 'transparent',
                                boxShadow: 'none',
                                color: isActive ? '#fff' : colorTextSecondary,
                                fontWeight: isActive ? 500 : 400
                            }}
                        >
                            {item.label}
                        </Button>
                    );
                })}
            </Space>

            <div style={{ display: 'flex', alignItems: 'center' }}>
                 <Input 
                    prefix={<SearchOutlined style={{ color: colorTextSecondary }} />} 
                    placeholder="搜索影视/素材..." 
                    style={{ width: 240, borderRadius: 6 }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    allowClear
                />
            </div>
        </div>

        <Layout style={{ flex: 1, overflow: 'hidden', background: 'transparent' }}>
            <Content style={{ margin: '0 24px 16px 24px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  padding: location.pathname === '/' ? 0 : 24, // Remove padding for Home page to let virtual list fill full width/height
                  background: colorBgContainer,
                  borderRadius: borderRadiusLG,
                  flex: 1,
                  overflowY: location.pathname === '/' ? 'hidden' : 'scroll', // Force scrollbar to prevent layout shift
                  display: 'flex', 
                  flexDirection: 'column',
                  boxShadow: isDark ? '0 1px 2px rgba(255,255,255,0.05)' : '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                <Outlet />
              </div>
            </Content>
        </Layout>
    </div>
  );
};

export default MainLayout;
