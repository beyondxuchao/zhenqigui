import React, { useState, useEffect, useRef } from 'react';
import { Card, Row, Col, Modal } from 'antd';
import { useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { 
    InfoCircleOutlined, 
    SwapOutlined, 
    AudioOutlined, 
    FileTextOutlined,
    FontSizeOutlined
} from '@ant-design/icons';
import FileRenamer from '../components/tools/filerenamer';
import MediaInfo from '../components/tools/mediainfo';
import Transcoder from '../components/tools/transcoder';
import SubtitleTool from '../components/tools/subtitletool';
import SubtitleConverter from '../components/tools/subtitleconverter';
import AudioExtractor from '../components/tools/audioextractor';
import AudioProcessor from '../components/tools/audioprocessor';

const { Meta } = Card;

interface ToolItem {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    component?: React.ReactNode;
    path?: string; // Route path for full-page tools
    width?: number; // Modal width
}

const Tools: React.FC = () => {
    const [activeTool, setActiveTool] = useState<ToolItem | null>(null);
    const [droppedFile, setDroppedFile] = useState<string | undefined>(undefined);
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const navigate = useNavigate();

    // Memoize tools array to prevent unnecessary re-registrations
    const tools: ToolItem[] = React.useMemo(() => [
        {
            id: 'renamer',
            title: '批量重命名',
            description: '批量修改文件名，支持替换、前后缀、正则等',
            icon: <FileTextOutlined style={{ fontSize: 32, color: '#1677ff' }} />,
            component: <FileRenamer />,
            width: 1000
        },
        {
            id: 'mediainfo',
            title: '媒体信息检测',
            description: '查看视频编码、分辨率、码率等详细信息',
            icon: <InfoCircleOutlined style={{ fontSize: 32, color: '#faad14' }} />,
            component: <MediaInfo />,
            width: 800
        },
        {
            id: 'transcoder',
            title: '视频转码/封装',
            description: 'MKV 转 MP4，或转码为 H.264 格式',
            icon: <SwapOutlined style={{ fontSize: 32, color: '#13c2c2' }} />,
            component: <Transcoder />,
            width: 600
        },
        {
            id: 'subtitle',
            title: '字幕提取',
            description: '提取 MKV 视频中的内封字幕文件',
            icon: <FontSizeOutlined style={{ fontSize: 32, color: '#722ed1' }} />,
            component: <SubtitleTool />,
            width: 600
        },
        {
            id: 'subtitleconverter',
            title: '字幕格式转换',
            description: 'ASS/SSA/SRT 等格式互转，或转换为纯文本',
            icon: <FileTextOutlined style={{ fontSize: 32, color: '#eb2f96' }} />,
            component: <SubtitleConverter />,
            width: 600
        },
        {
            id: 'audio',
            title: '音频分离',
            description: '提取视频中的音频为 MP3/WAV',
            icon: <AudioOutlined style={{ fontSize: 32, color: '#eb2f96' }} />,
            component: <AudioExtractor />,
            width: 600
        },
        {
            id: 'audioprocessor',
            title: '音频处理',
            description: '音频强力限制 (Forced Limiter) 与增益调整',
            icon: <AudioOutlined style={{ fontSize: 32, color: '#f5222d' }} />,
            component: <AudioProcessor />,
            width: 1000
        }
    ], []);

    const handleToolClick = (tool: ToolItem) => {
        if (tool.path) {
            navigate(tool.path);
        } else {
            setActiveTool(tool);
        }
    };

    const handleClose = () => {
        setActiveTool(null);
        setDroppedFile(undefined);
    };

    useEffect(() => {
        const unlistenPromise = listen('tauri://drag-drop', (event: any) => {
            const payload = event.payload as { paths: string[], position: { x: number, y: number } };
            if (payload.paths && payload.paths.length > 0) {
                // Tauri drag-drop position is in physical pixels, convert to logical pixels
                const scaleFactor = window.devicePixelRatio || 1;
                const x = payload.position.x / scaleFactor;
                const y = payload.position.y / scaleFactor;
                
                // Iterate over registered cards to check if drop occurred on one of them
                for (const [id, element] of cardRefs.current.entries()) {
                    const rect = element.getBoundingClientRect();
                    // Check if point (x, y) is within the rectangle
                    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                        const tool = tools.find(t => t.id === id);
                        if (tool) {
                            setDroppedFile(payload.paths[0]);
                            setActiveTool(tool);
                        }
                        break;
                    }
                }
            }
        });

        return () => {
            unlistenPromise.then(unlisten => unlisten());
        };
    }, [tools]); // Add tools to dependency array to capture current instances
    // Wait, tools is defined inside the component on every render.
    // However, the effect runs only once on mount. 
    // The `tools` array inside the effect will be the one from the initial render.
    // Since `tools` depends on `FileRenamer`, `MediaInfo` etc which are imported components, they are stable.
    // But `handleToolClick` depends on `navigate` and `setActiveTool`.
    // The closure inside `useEffect` captures the initial `handleToolClick`.
    // This should be fine as `setActiveTool` is stable.
    
    // Let's try to debug why it's not opening. 
    // Maybe `cardRefs` are not populated correctly?
    // Or coordinate system mismatch? 
    // Tauri coordinates might be screen coordinates vs client coordinates.
    // But usually they match if window is maximized or normal.
    
    // Let's try to fix the dependency issue first. `tools` is recreated on every render.
    // We should move `tools` definition outside or wrap in useMemo, but since it contains JSX, it's tricky.
    // Better to use a ref or just rely on IDs.
    
    // The issue might be that `tools` inside the effect closure is stale? 
    // No, `tools` is constant structure wise.
    
    // Let's try to use `activeTool` state directly.
    
    // Wait, `handleToolClick` uses `navigate` which might change? No, usually stable.
    
    // The most likely issue is that `cardRefs` are not yet populated when the listener is attached? 
    // No, listener is attached on mount. Refs are populated on render.
    
    // One possibility: `tools` array is defined inside the component body.
    // The `useEffect` has `[]` dependency.
    // It captures the `tools` from the first render.
    // That should be fine.
    
    // However, let's try to make `tools` available via a ref or recreate it.
    
    // Another potential issue: `handleToolClick` calls `setActiveTool`.
    
    // Let's verify if `handleToolClick` is being called.
    // Since I cannot add logs easily and see them, I will modify the logic to be more robust.
    
    // I will try to rebuild the `tools` map inside the effect if needed, but `tools` is local.
    
    // Let's try to update the `useEffect` to depend on `tools`? No, that would re-register listener too often.
    
    // Let's move `tools` definition to `useMemo` to be safe, although not strictly necessary if we don't depend on it.
    
    // Actually, `tools` is defined at the top level of the component.
    // The `useEffect` closure captures the *first* `tools` array.
    // `handleToolClick` is also captured.
    
    // Let's try to use `setActiveTool` directly in the loop as shown in the new_str.
    
    // Also, I will fix the Ant Design warning in audioprocessor.tsx.

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            style={{ minHeight: '100vh' }}
        >
            <Row gutter={[16, 16]}>
                {tools.map(tool => (
                    <Col xs={24} sm={12} md={8} lg={6} xl={4} key={tool.id}>
                        <div ref={el => {
                            if (el) cardRefs.current.set(tool.id, el);
                            else cardRefs.current.delete(tool.id);
                        }} style={{ height: '100%' }}>
                            <Card
                                hoverable
                                onClick={() => handleToolClick(tool)}
                                style={{ height: '100%' }}
                                styles={{ 
                                    body: { 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        alignItems: 'center', 
                                        textAlign: 'center',
                                        paddingTop: 32,
                                        paddingBottom: 32
                                    }
                                }}
                            >
                            <div style={{ marginBottom: 16 }}>
                                {tool.icon}
                            </div>
                            <Meta 
                                title={tool.title} 
                                description={
                                    <div style={{ 
                                        height: 40, 
                                        overflow: 'hidden', 
                                        textOverflow: 'ellipsis', 
                                        display: '-webkit-box', 
                                        WebkitLineClamp: 2, 
                                        WebkitBoxOrient: 'vertical' 
                                    }}>
                                        {tool.description}
                                    </div>
                                } 
                            />
                            </Card>
                        </div>
                    </Col>
                ))}
            </Row>

            <Modal
                title={activeTool?.title}
                open={!!activeTool}
                onCancel={handleClose}
                width={activeTool?.width || 800}
                centered
                destroyOnHidden
                maskClosable={false}
                footer={null}
            >
                {activeTool?.component && React.isValidElement(activeTool.component) 
                    ? React.cloneElement(activeTool.component as React.ReactElement, { initialFile: droppedFile } as any)
                    : activeTool?.component}
            </Modal>
        </div>
    );
};

export default Tools;
