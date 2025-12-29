import React, { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Button, theme } from 'antd';
import { MinusOutlined, BorderOutlined, CloseOutlined, MoonOutlined, SunOutlined, SwitcherOutlined } from '@ant-design/icons';

interface CustomTitleBarProps {
    isDark: boolean;
    toggleTheme: () => void;
}

const CustomTitleBar: React.FC<CustomTitleBarProps> = ({ isDark, toggleTheme }) => {
    const { token } = theme.useToken();
    const [appWindow, setAppWindow] = useState<any>(null);
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        let win: any;
        try {
            // @ts-ignore
            if (typeof window !== 'undefined' && window.__TAURI_INTERNALS__) {
                win = getCurrentWindow();
                setAppWindow(win);
            }
        } catch (e) {
            console.warn("Not in Tauri environment");
        }

        if (!win) return;

        const checkMaximized = async () => {
            try {
                const max = await win.isMaximized();
                setIsMaximized(max);
            } catch (e) {
                console.error(e);
            }
        };
        
        checkMaximized();

        const unlisten = win.listen('tauri://resize', checkMaximized);

        return () => {
            unlisten.then((f: any) => f());
        };
    }, []);

    const buttonStyle: React.CSSProperties = {
        width: 46,
        height: 32,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        cursor: 'pointer',
        transition: 'background 0.2s',
        color: token.colorText,
    };

    return (
        <div 
            data-tauri-drag-region 
            style={{
            height: 32,
            background: token.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            borderBottom: `1px solid ${token.colorSplit}`,
            userSelect: 'none',
            zIndex: 1000,
            width: '100%',
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0
        }}>
            {/* Drag Region - Occupies all remaining space */}
            <div data-tauri-drag-region style={{ flex: 1, height: '100%' }} />
            
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <Button 
                    type="text" 
                    size="small" 
                    icon={isDark ? <SunOutlined /> : <MoonOutlined />} 
                    onClick={toggleTheme} 
                    style={{ marginRight: 8 }} 
                />
                
                <div 
                    onClick={() => appWindow.minimize()} 
                    style={buttonStyle}
                    className="titlebar-button"
                >
                    <MinusOutlined style={{ fontSize: 14 }} />
                </div>
                <div 
                    onClick={() => appWindow.toggleMaximize()} 
                    style={buttonStyle}
                    className="titlebar-button"
                >
                    {isMaximized ? <SwitcherOutlined style={{ fontSize: 14 }} /> : <BorderOutlined style={{ fontSize: 14 }} />}
                </div>
                <div 
                    onClick={() => appWindow.close()} 
                    style={{ ...buttonStyle, ':hover': { background: '#ff4d4f', color: 'white' } } as any}
                    className="titlebar-button-close"
                >
                    <CloseOutlined style={{ fontSize: 14 }} />
                </div>
            </div>
            <style>{`
                .titlebar-button:hover {
                    background-color: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'};
                }
                .titlebar-button-close:hover {
                    background-color: #ff4d4f !important;
                    color: white !important;
                }
            `}</style>
        </div>
    );
};

export default CustomTitleBar;
