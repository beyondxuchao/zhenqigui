import React, { useState, useEffect } from 'react';
import { Card, Typography, Button, App, Descriptions, Tabs, Spin, theme } from 'antd';
import { InboxOutlined, FileOutlined, ReloadOutlined } from '@ant-design/icons';
import { listen } from '@tauri-apps/api/event';
import { getMediaInfo, checkFfmpeg } from '../../services/api';
import { open } from '@tauri-apps/plugin-dialog';

const { Text, Title } = Typography;

interface MediaInfoProps {
    initialFile?: string;
}

const MediaInfo: React.FC<MediaInfoProps> = ({ initialFile }) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const [info, setInfo] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [ffmpegReady, setFfmpegReady] = useState(false);
    const [fileName, setFileName] = useState<string>('');

    useEffect(() => {
        checkFfmpeg().then(setFfmpegReady);

        if (initialFile) {
            analyzeFile(initialFile);
        }

        const unlisten = listen('tauri://drag-drop', (event) => {
            const payload = event.payload as { paths: string[] };
            if (payload.paths && payload.paths.length > 0) {
                analyzeFile(payload.paths[0]);
            }
        });

        return () => {
            unlisten.then(f => f());
        };
    }, []);

    const handleOpen = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Media Files',
                    extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'mp3', 'flac', 'wav', 'm4a']
                }]
            });
            if (selected) {
                const path = Array.isArray(selected) ? selected[0] : selected;
                if (path) analyzeFile(path);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const analyzeFile = async (path: string) => {
        setLoading(true);
        setInfo(null);
        setFileName(path.split(/[/\\]/).pop() || '');
        try {
            const jsonStr = await getMediaInfo(path);
            const data = JSON.parse(jsonStr);
            setInfo(data);
        } catch (error) {
            console.error(error);
            message.error('无法读取媒体信息，请确认文件格式或 FFmpeg 是否安装');
        } finally {
            setLoading(false);
        }
    };

    if (!ffmpegReady) {
        return (
            <div style={{ textAlign: 'center', padding: 40 }}>
                <Text type="danger">未检测到 FFmpeg 环境。请安装 FFmpeg 并将其添加到系统环境变量 PATH 中。</Text>
            </div>
        );
    }

    const renderStreams = () => {
        if (!info || !info.streams) return null;

        const videoStreams = info.streams.filter((s: any) => s.codec_type === 'video');
        const audioStreams = info.streams.filter((s: any) => s.codec_type === 'audio');
        const subtitleStreams = info.streams.filter((s: any) => s.codec_type === 'subtitle');

        const items = [
            {
                key: 'video',
                label: `视频流 (${videoStreams.length})`,
                children: videoStreams.map((s: any, i: number) => (
                    <Card key={i} size="small" type="inner" title={`Stream #${s.index}`} style={{ marginBottom: 16 }}>
                        <Descriptions bordered column={2} size="small">
                            <Descriptions.Item label="编码">{s.codec_name} ({s.codec_long_name})</Descriptions.Item>
                            <Descriptions.Item label="分辨率">{s.width} x {s.height}</Descriptions.Item>
                            <Descriptions.Item label="帧率">{s.avg_frame_rate}</Descriptions.Item>
                            <Descriptions.Item label="像素格式">{s.pix_fmt}</Descriptions.Item>
                            <Descriptions.Item label="色彩范围">{s.color_range || 'N/A'}</Descriptions.Item>
                            <Descriptions.Item label="码率">{s.bit_rate ? `${(parseInt(s.bit_rate) / 1000).toFixed(0)} kbps` : 'N/A'}</Descriptions.Item>
                            <Descriptions.Item label="Profile">{s.profile || 'N/A'}</Descriptions.Item>
                            <Descriptions.Item label="Level">{s.level || 'N/A'}</Descriptions.Item>
                        </Descriptions>
                    </Card>
                ))
            },
            {
                key: 'audio',
                label: `音频流 (${audioStreams.length})`,
                children: audioStreams.map((s: any, i: number) => (
                    <Card key={i} size="small" type="inner" title={`Stream #${s.index}`} variant="outlined" style={{ marginBottom: 16 }}>
                        <Descriptions bordered column={2} size="small">
                            <Descriptions.Item label="编码">{s.codec_name}</Descriptions.Item>
                            <Descriptions.Item label="声道">{s.channels} ({s.channel_layout})</Descriptions.Item>
                            <Descriptions.Item label="采样率">{s.sample_rate} Hz</Descriptions.Item>
                            <Descriptions.Item label="语言">{s.tags?.language || 'und'}</Descriptions.Item>
                            <Descriptions.Item label="码率">{s.bit_rate ? `${(parseInt(s.bit_rate) / 1000).toFixed(0)} kbps` : 'N/A'}</Descriptions.Item>
                        </Descriptions>
                    </Card>
                ))
            },
            {
                key: 'subtitle',
                label: `字幕流 (${subtitleStreams.length})`,
                children: subtitleStreams.map((s: any, i: number) => (
                    <Card key={i} size="small" type="inner" title={`Stream #${s.index}`} variant="outlined" style={{ marginBottom: 16 }}>
                        <Descriptions bordered column={2} size="small">
                            <Descriptions.Item label="格式">{s.codec_name}</Descriptions.Item>
                            <Descriptions.Item label="语言">{s.tags?.language || 'und'}</Descriptions.Item>
                            <Descriptions.Item label="标题" span={2}>{s.tags?.title || 'N/A'}</Descriptions.Item>
                        </Descriptions>
                    </Card>
                ))
            }
        ];

        return <Tabs items={items} type="card" />;
    };

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {!info && !loading ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div 
                        onClick={handleOpen}
                        style={{ 
                            border: `1px dashed ${token.colorBorder}`, 
                            borderRadius: '8px', 
                            backgroundColor: token.colorFillAlter,
                            padding: '60px 0', 
                            textAlign: 'center', 
                            cursor: 'pointer',
                            transition: 'border-color 0.3s',
                            margin: '0 24px'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = token.colorPrimary}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = token.colorBorder}
                    >
                        <p style={{ fontSize: '48px', color: token.colorPrimary, marginBottom: 16 }}><InboxOutlined /></p>
                        <p style={{ fontSize: '16px', color: token.colorText, marginBottom: 4 }}>点击或拖拽文件到此区域</p>
                        <p style={{ fontSize: '14px', color: token.colorTextSecondary }}>支持视频、音频文件</p>
                    </div>
                </div>
            ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <div style={{ padding: '0 0 16px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <FileOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
                            <Title level={4} style={{ margin: 0 }} ellipsis={{ tooltip: fileName }}>{fileName}</Title>
                         </div>
                         <Button icon={<ReloadOutlined />} onClick={handleOpen}>打开新文件</Button>
                    </div>

                    {loading ? (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 16 }}>
                            <Spin size="large" />
                            <Text type="secondary">正在分析媒体信息...</Text>
                        </div>
                    ) : (
                        <div style={{ flex: 1, overflow: 'auto', paddingRight: 8 }}>
                            <Card title="基础信息" variant="borderless" style={{ marginBottom: 16, boxShadow: token.boxShadowTertiary }}>
                                <Descriptions column={2}>
                                    <Descriptions.Item label="封装格式">{info.format?.format_name}</Descriptions.Item>
                                    <Descriptions.Item label="时长">{info.format?.duration ? `${(parseFloat(info.format.duration) / 60).toFixed(2)} 分钟` : 'N/A'}</Descriptions.Item>
                                    <Descriptions.Item label="总大小">{info.format?.size ? `${(parseInt(info.format.size) / 1024 / 1024).toFixed(2)} MB` : 'N/A'}</Descriptions.Item>
                                    <Descriptions.Item label="总码率">{info.format?.bit_rate ? `${(parseInt(info.format.bit_rate) / 1000).toFixed(0)} kbps` : 'N/A'}</Descriptions.Item>
                                    <Descriptions.Item label="流数量">{info.format?.nb_streams}</Descriptions.Item>
                                    <Descriptions.Item label="创建时间">{info.format?.tags?.creation_time || 'N/A'}</Descriptions.Item>
                                </Descriptions>
                            </Card>
                            
                            <div style={{ background: token.colorBgContainer, padding: 16, borderRadius: 8, boxShadow: token.boxShadowTertiary }}>
                                {renderStreams()}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MediaInfo;