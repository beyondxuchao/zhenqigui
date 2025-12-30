import React, { useState, useEffect } from 'react';
import { Card, Typography, Button, message, List, Space, theme, Form, Input, Progress, Steps } from 'antd';
import { InboxOutlined, FileTextOutlined, DownloadOutlined, FolderOpenOutlined, CheckCircleOutlined, SwapOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { listen } from '@tauri-apps/api/event';
import { extractSubtitles, openFileWithPlayer } from '../../services/api';
import { open } from '@tauri-apps/plugin-dialog';

const { Text, Title, Paragraph } = Typography;

interface SubtitleToolProps {
    initialFile?: string;
}

const SubtitleTool: React.FC<SubtitleToolProps> = ({ initialFile }) => {
    const { token } = theme.useToken();
    const [file, setFile] = useState<{ path: string; name: string } | null>(null);
    const [outputDir, setOutputDir] = useState<string>('');
    const [extractedFiles, setExtractedFiles] = useState<string[]>([]);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<'wait' | 'process' | 'finish' | 'error'>('wait');
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        if (initialFile) {
            handleFileSelect(initialFile);
        }
    }, [initialFile]);

    useEffect(() => {
        const unlisten = listen('tauri://drag-drop', (event) => {
            if (processing) return;
            const payload = event.payload as { paths: string[] };
            if (payload.paths && payload.paths.length > 0) {
                handleFileSelect(payload.paths[0]);
            }
        });

        return () => {
            unlisten.then(f => f());
        };
    }, [processing]);

    const handleFileSelect = (path: string) => {
        const parts = path.split(/[/\\]/);
        const name = parts[parts.length - 1];
        const dir = path.substring(0, path.lastIndexOf(name));
        
        setFile({ path, name });
        setOutputDir(dir);
        setCurrentStep(1);
        setStatus('wait');
    };

    const handleSelectOutputDir = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                defaultPath: outputDir || undefined,
            });
            if (selected) {
                setOutputDir(Array.isArray(selected) ? selected[0] : selected);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleExtract = async () => {
        if (!file || !outputDir) return;

        setProcessing(true);
        setStatus('process');
        setCurrentStep(2);
        setProgress(0);
        
        // Simulate progress
        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 90) return 90;
                return prev + 10;
            });
        }, 200);
        
        try {
            const results = await extractSubtitles(file.path, outputDir);
            clearInterval(timer);
            setProgress(100);
            
            if (results.length === 0) {
                message.warning('未在文件中发现可提取的字幕流');
                setStatus('error'); // Technically not an error, but no result
            } else {
                setExtractedFiles(results);
                setStatus('finish');
                message.success(`成功提取 ${results.length} 个字幕文件`);
            }
        } catch (error: any) {
            clearInterval(timer);
            setStatus('error');
            console.error(error);
            message.error('提取失败: ' + error.toString());
        } finally {
            setProcessing(false);
        }
    };

    const handleOpen = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'MKV Files',
                    extensions: ['mkv']
                }]
            });
            if (selected) {
                const path = Array.isArray(selected) ? selected[0] : selected;
                if (path) handleFileSelect(path);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const reset = () => {
        setFile(null);
        setCurrentStep(0);
        setStatus('wait');
        setProgress(0);
        setExtractedFiles([]);
    };

    const renderUpload = () => (
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
            }}
            onMouseEnter={(e) => e.currentTarget.style.borderColor = token.colorPrimary}
            onMouseLeave={(e) => e.currentTarget.style.borderColor = token.colorBorder}
        >
            <p style={{ fontSize: '48px', color: token.colorPrimary, marginBottom: 16 }}><InboxOutlined /></p>
            <p style={{ fontSize: '16px', color: token.colorText, marginBottom: 4 }}>点击或拖拽 MKV 文件到此区域</p>
            <p style={{ fontSize: '14px', color: token.colorTextSecondary }}>仅支持封装了软字幕的 MKV 格式</p>
        </div>
    );

    const renderConfig = () => (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <Card title="提取配置" bordered={false} style={{ boxShadow: token.boxShadowTertiary }}>
                <Form layout="vertical">
                    <Form.Item label="已选文件">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: token.colorFillAlter, borderRadius: 6 }}>
                            <FileTextOutlined style={{ color: token.colorPrimary }} />
                            <Text ellipsis style={{ flex: 1 }}>{file?.path}</Text>
                            <Button type="text" size="small" icon={<SwapOutlined />} onClick={handleOpen}>更换</Button>
                        </div>
                    </Form.Item>
                    
                    <Form.Item label="输出目录">
                        <div style={{ display: 'flex', gap: 8 }}>
                            <Input value={outputDir} onChange={e => setOutputDir(e.target.value)} />
                            <Button icon={<FolderOpenOutlined />} onClick={handleSelectOutputDir}>选择</Button>
                        </div>
                    </Form.Item>

                    <Form.Item style={{ marginTop: 32, textAlign: 'center' }}>
                        <Button type="primary" size="large" onClick={handleExtract} icon={<DownloadOutlined />} loading={processing} style={{ minWidth: 120 }}>
                            开始提取
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );

    const renderProcessing = () => (
        <div style={{ textAlign: 'center', padding: '40px 20px', maxWidth: 600, margin: '0 auto' }}>
             {status === 'process' && (
                <>
                    <Title level={4} style={{ marginTop: 24 }}>正在扫描并提取字幕...</Title>
                    <Paragraph type="secondary">正在分析 MKV 文件结构</Paragraph>
                    <Progress percent={progress} status="active" />
                </>
             )}
             
             {status === 'finish' && (
                <>
                    <CheckCircleOutlined style={{ fontSize: 64, color: token.colorSuccess }} />
                    <Title level={3} style={{ marginTop: 16 }}>提取完成</Title>
                    <Paragraph>成功提取 {extractedFiles.length} 个字幕文件：</Paragraph>
                    
                    <List
                        size="small"
                        bordered
                        dataSource={extractedFiles}
                        renderItem={item => <List.Item><FileTextOutlined /> {item}</List.Item>}
                        style={{ marginBottom: 24, textAlign: 'left', background: token.colorBgContainer }}
                    />
                    
                    <Space>
                        <Button onClick={() => openFileWithPlayer(outputDir)}>打开文件夹</Button>
                        <Button type="primary" onClick={reset}>继续提取</Button>
                    </Space>
                </>
             )}

             {status === 'error' && (
                <>
                    <CloseCircleOutlined style={{ fontSize: 64, color: token.colorError }} />
                    <Title level={3} style={{ marginTop: 16 }}>提取结束</Title>
                    <Paragraph type="secondary">未能提取到字幕，可能文件中没有字幕流或格式不支持。</Paragraph>
                    <Button type="primary" onClick={() => { setStatus('wait'); setCurrentStep(1); }}>返回配置</Button>
                </>
             )}
        </div>
    );

    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Steps 
                current={currentStep} 
                items={[
                    { title: '选择文件', icon: <FileTextOutlined /> },
                    { title: '参数配置', icon: <FolderOpenOutlined /> },
                    { title: '提取完成', icon: <CheckCircleOutlined /> }
                ]}
                style={{ maxWidth: 800, margin: '0 auto', width: '100%' }}
            />
            
            <div style={{ flex: 1, overflow: 'auto' }}>
                {currentStep === 0 && renderUpload()}
                {currentStep === 1 && renderConfig()}
                {currentStep === 2 && renderProcessing()}
            </div>
        </div>
    );
};

export default SubtitleTool;