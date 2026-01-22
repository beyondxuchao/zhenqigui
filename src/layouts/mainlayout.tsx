import React, { useState, useEffect, useRef } from 'react';
import { Layout, theme, Menu, Typography } from 'antd';
import {
  VideoCameraOutlined,
  SettingOutlined,
  LinkOutlined,
  CalendarOutlined,
  ToolOutlined,
  PieChartOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import CustomTitleBar from '../components/customtitlebar';
import { useApp } from '../context/appcontext';
import { getConfig, saveConfig } from '../services/api';

const { Content, Sider } = Layout;
const { Text } = Typography;

const MainLayout: React.FC = () => {
  const { isDark, setTheme } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(200);
  const sidebarWidthRef = useRef(200);
  const isResizing = useRef(false);
  const lastSavedWidth = useRef(200);

  const {
    token,
  } = theme.useToken();
  const { colorBgContainer, borderRadiusLG, colorPrimary, colorTextSecondary, colorSplit, colorBgLayout, colorText } = token;
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Sync ref with state
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  useEffect(() => {
    // Load initial sidebar width from config
    const loadSidebarConfig = async () => {
        try {
            const config = await getConfig();
            if (config.sidebar_width) {
                setSidebarWidth(config.sidebar_width);
                sidebarWidthRef.current = config.sidebar_width;
                lastSavedWidth.current = config.sidebar_width;
            }
        } catch (error) {
            console.error('Failed to load sidebar width:', error);
        }
    };
    loadSidebarConfig();

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      // Use requestAnimationFrame to avoid excessive re-renders
      requestAnimationFrame(() => {
          const newWidth = e.clientX;
          if (newWidth >= 160 && newWidth <= 400) {
            setSidebarWidth(newWidth);
            sidebarWidthRef.current = newWidth;
          }
      });
    };

    const handleMouseUp = async () => {
      if (isResizing.current) {
        isResizing.current = false;
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';

        const currentWidth = sidebarWidthRef.current;
        // Save new width to config if it changed significantly
        if (Math.abs(currentWidth - lastSavedWidth.current) > 2) {
            try {
                const config = await getConfig();
                await saveConfig({
                    ...config,
                    sidebar_width: currentWidth
                });
                lastSavedWidth.current = currentWidth;
            } catch (error) {
                console.error('Failed to save sidebar width:', error);
            }
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const navItems = [
    { key: '/', label: '首页', icon: <VideoCameraOutlined /> },
    { key: '/calendar', label: '日历', icon: <CalendarOutlined /> },
    { key: '/match', label: '匹配', icon: <LinkOutlined /> },
    { key: '/tools', label: '工具', icon: <ToolOutlined /> },
    { key: '/statistics', label: '统计', icon: <PieChartOutlined /> },
    { key: '/settings', label: '设置', icon: <SettingOutlined /> },
  ];

  const selectedKey = navItems.find(item => 
    location.pathname === item.key || (item.key !== '/' && location.pathname.startsWith(item.key))
  )?.key || '/';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: colorBgLayout }}>
        <style>
          {`
            .ant-menu-light .ant-menu-item-selected {
              background-color: transparent !important;
              color: ${colorPrimary} !important;
              font-weight: 600 !important;
            }
            .ant-menu-dark .ant-menu-item-selected {
              background-color: transparent !important;
              color: ${colorPrimary} !important;
              font-weight: 600 !important;
            }
            .ant-menu-item-selected::before {
              content: "";
              position: absolute;
              left: 0;
              top: 15%;
              height: 70%;
              width: 3px;
              background-color: ${colorPrimary};
              border-radius: 0 4px 4px 0;
            }
            .ant-menu-item {
              transition: all 0.2s !important;
            }
            .ant-menu-item:hover {
              color: ${colorPrimary} !important;
            }

            /* Page Transition Animation */
            .page-container {
                animation: fadeIn 0.3s ease-out;
                height: 100%;
                display: flex;
                flex-direction: column;
            }

            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(5px); }
                to { opacity: 1; transform: translateY(0); }
            }
          `}
        </style>
        <CustomTitleBar isDark={isDark} toggleTheme={toggleTheme} />
        
        <Layout style={{ 
            flex: 1, 
            background: 'transparent', 
            overflow: 'hidden',
        }}>
            {/* Sidebar Navigation */}
            <div style={{ position: 'relative', height: '100%', display: 'flex' }}>
                <Sider 
                    width={sidebarWidth}
                    collapsed={collapsed} 
                    theme={isDark ? 'dark' : 'light'}
                    style={{
                        background: colorBgContainer,
                        borderRight: `1px solid ${colorSplit}`,
                        display: 'flex',
                        flexDirection: 'column',
                        transition: isResizing.current ? 'none' : 'all 0.2s',
                        paddingTop: 32 // Space for CustomTitleBar
                    }}
                >
                    <div style={{ 
                        height: 56, 
                        display: 'flex', 
                        alignItems: 'center', 
                        padding: collapsed ? '0' : '0 16px',
                        justifyContent: collapsed ? 'center' : 'space-between',
                        borderBottom: `1px solid ${colorSplit}`,
                        marginBottom: 8
                    }}>
                        {!collapsed && <Text strong style={{ fontSize: '15px', color: colorText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>影视匹配管理</Text>}
                        <div 
                            onClick={() => setCollapsed(!collapsed)} 
                            style={{ 
                                cursor: 'pointer', 
                                color: colorTextSecondary,
                                fontSize: '18px',
                                display: 'flex',
                                alignItems: 'center',
                                marginLeft: collapsed ? 0 : 8
                            }}
                        >
                            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                        </div>
                    </div>

                    <Menu
                        mode="inline"
                        selectedKeys={[selectedKey]}
                        items={navItems}
                        onClick={({ key }) => navigate(key)}
                        style={{ 
                            borderRight: 0, 
                            background: 'transparent',
                            padding: '0 8px'
                        }}
                        inlineIndent={16}
                    />
                </Sider>
                
                {!collapsed && (
                    <div
                        onMouseDown={(e) => {
                            e.preventDefault();
                            isResizing.current = true;
                            document.body.style.cursor = 'col-resize';
                            document.body.style.userSelect = 'none';
                        }}
                        style={{
                            position: 'absolute',
                            right: -2,
                            top: 0,
                            width: 4,
                            height: '100%',
                            cursor: 'col-resize',
                            zIndex: 10,
                            transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = colorPrimary)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    />
                )}
            </div>

            {/* Main Content Area */}
            <Layout style={{ background: 'transparent', display: 'flex', flexDirection: 'column', paddingTop: 32 }}>
                <Content style={{ margin: '16px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div
                        style={{
                            padding: location.pathname === '/' ? 0 : 24,
                            background: colorBgContainer,
                            borderRadius: borderRadiusLG,
                            flex: 1,
                            overflowY: location.pathname === '/' ? 'hidden' : 'scroll',
                            display: 'flex', 
                            flexDirection: 'column',
                            boxShadow: token.boxShadowTertiary
                        }}
                    >
                        <div key={location.pathname} className="page-container">
                            <Outlet />
                        </div>
                    </div>
                </Content>
            </Layout>
        </Layout>
    </div>
  );
};

export default MainLayout;
