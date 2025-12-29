import React, { useState } from 'react';
import { Card, Row, Col, Modal } from 'antd';
import { useNavigate } from 'react-router-dom';
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
import AudioExtractor from '../components/tools/audioextractor';

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
    const navigate = useNavigate();

    const tools: ToolItem[] = [
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
            id: 'audio',
            title: '音频分离',
            description: '提取视频中的音频为 MP3/WAV',
            icon: <AudioOutlined style={{ fontSize: 32, color: '#eb2f96' }} />,
            component: <AudioExtractor />,
            width: 600
        }
    ];

    const handleToolClick = (tool: ToolItem) => {
        if (tool.path) {
            navigate(tool.path);
        } else {
            setActiveTool(tool);
        }
    };

    const handleClose = () => {
        setActiveTool(null);
    };

    return (
        <div>
            <Row gutter={[16, 16]}>
                {tools.map(tool => (
                    <Col xs={24} sm={12} md={8} lg={6} xl={4} key={tool.id}>
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
                {activeTool?.component}
            </Modal>
        </div>
    );
};

export default Tools;
