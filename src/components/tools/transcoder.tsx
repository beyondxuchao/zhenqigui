import React, { useState, useEffect } from 'react';
import { Card, Typography, Radio, Button, message, Spin, Space, theme, Input, Form, Progress, Steps } from 'antd';
import { InboxOutlined, SwapOutlined, FileOutlined, FolderOpenOutlined, CheckCircleOutlined, SyncOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { listen } from '@tauri-apps/api/event';
import { convertVideo, openFileWithPlayer } from '../../services/api';
import { open } from '@tauri-apps/plugin-dialog';

const { Text, Paragraph, Title } = Typography;

interface TranscodeItem {
    path: string;
    name: string;
    size?: number;
}

interface TranscoderProps {
    initialFile?: string;
}

const Transcoder: React.FC<TranscoderProps> = ({ initialFile }) => {
    const { token } = theme.useToken();
    
    // Initialize state from initialFile if present
    const initFileState = () => {
        if (initialFile) {
            const parts = initialFile.split(/[/\\]/);
            const name = parts[parts.length - 1];
            return { path: initialFile, name };
        }
        return null;
    };

    const initOutputDir = () => {
        if (initialFile) {
            const parts = initialFile.split(/[/\\]/);
            const name = parts[parts.length - 1];
            return initialFile.substring(0, initialFile.lastIndexOf(name));
        }
        return '';
    };

    const initOutputFilename = () => {
        if (initialFile) {
            const parts = initialFile.split(/[/\\]/);
            const name = parts[parts.length - 1];
            const lastDot = name.lastIndexOf('.');
            const nameWithoutExt = lastDot > -1 ? name.substring(0, lastDot) : name;
            return `${nameWithoutExt}_converted`;
        }
        return '';
    };

    const [file, setFile] = useState<TranscodeItem | null>(initFileState());
    const [mode, setMode] = useState<'copy' | 'mp4_compatible'>('copy');
    const [outputDir, setOutputDir] = useState<string>(initOutputDir());
    const [outputFilename, setOutputFilename] = useState<string>(initOutputFilename());
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<'wait' | 'process' | 'finish' | 'error'>('wait');
    const [currentStep, setCurrentStep] = useState(initialFile ? 1 : 0);

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
        
        // Default output filename
        const lastDot = name.lastIndexOf('.');
        const nameWithoutExt = lastDot > -1 ? name.substring(0, lastDot) : name;
        setOutputFilename(`${nameWithoutExt}_converted`);
        
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

    const handleConvert = async () => {
        if (!file || !outputDir || !outputFilename) return;
        
        const ext = 'mp4'; 
        // Ensure separator logic is correct for Windows (since we are in Windows env)
        // But better to check env or use a safe join. For now assuming Windows '\' or generic '/'
        const separator = outputDir.includes('\\') ? '\\' : '/';
        // Remove trailing slash if exists
        const cleanDir = outputDir.endsWith(separator) ? outputDir.substring(0, outputDir.length - 1) : outputDir;
        const outputPath = `${cleanDir}${separator}${outputFilename}.${ext}`;

        setProcessing(true);
        setStatus('process');
        setCurrentStep(2);
        setProgress(0);
        
        // Simulate progress since we don't have real progress yet
        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 95) return 95;
                return prev + 5;
            });
        }, 500);
        
        try {
            await convertVideo(file.path, outputPath, mode);
            clearInterval(timer);
            setProgress(100);
            setStatus('finish');
            message.success('转换成功！');
        } catch (error: any) {
            clearInterval(timer);
            setStatus('error');
            console.error(error);
            message.error('转换失败: ' + error.toString());
        } finally {
            setProcessing(false);
        }
    };

    const handleOpen = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Video Files',
                    extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'ts', 'm2ts']
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
            <p style={{ fontSize: '16px', color: token.colorText, marginBottom: 4 }}>点击或拖拽视频文件到此区域</p>
            <p style={{ fontSize: '14px', color: token.colorTextSecondary }}>支持 MP4, MKV, AVI, MOV 等常见格式</p>
        </div>
    );

    const renderConfig = () => (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <Card title="转换配置" variant="borderless" style={{ boxShadow: token.boxShadowTertiary }}>
                <Form layout="vertical">
                    <Form.Item label="已选文件">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: token.colorFillAlter, borderRadius: 6 }}>
                            <FileOutlined style={{ color: token.colorPrimary }} />
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

                    <Form.Item label="输出文件名 (不含扩展名)">
                        <Input value={outputFilename} onChange={e => setOutputFilename(e.target.value)} suffix=".mp4" />
                    </Form.Item>

                    <Form.Item label="转换模式">
                        <Radio.Group value={mode} onChange={e => setMode(e.target.value)} buttonStyle="solid">
                            <Radio.Button value="copy">快速混流 (Copy)</Radio.Button>
                            <Radio.Button value="mp4_compatible">兼容模式 (Transcode)</Radio.Button>
                        </Radio.Group>
                        <div style={{ marginTop: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                {mode === 'copy' ? '直接复制流，速度极快，但如果原编码不被目标容器支持可能会失败。' : '重新编码为 H.264/AAC，兼容性最好，但速度较慢。'}
                            </Text>
                        </div>
                    </Form.Item>

                    <Form.Item style={{ marginTop: 32, textAlign: 'center' }}>
                        <Button type="primary" size="large" onClick={handleConvert} icon={<SyncOutlined />} loading={processing} style={{ minWidth: 120 }}>
                            开始转换
                        </Button>
                    </Form.Item>
                </Form>
            </Card>
        </div>
    );

    const renderProcessing = () => (
        <div style={{ textAlign: 'center', padding: '40px 20px', maxWidth: 500, margin: '0 auto' }}>
             {status === 'process' && (
                <>
                    <Spin size="large" />
                    <Title level={4} style={{ marginTop: 24 }}>正在转换中...</Title>
                    <Paragraph type="secondary">请耐心等待，不要关闭窗口</Paragraph>
                    <Progress percent={progress} status="active" strokeColor={{ from: '#108ee9', to: '#87d068' }} />
                </>
             )}
             
             {status === 'finish' && (
                <>
                    <CheckCircleOutlined style={{ fontSize: 64, color: token.colorSuccess }} />
                    <Title level={3} style={{ marginTop: 16 }}>转换完成</Title>
                    <Paragraph>文件已保存至：</Paragraph>
                    <div style={{ background: token.colorFillAlter, padding: 12, borderRadius: 6, marginBottom: 24, wordBreak: 'break-all' }}>
                        <Text code>{outputDir}\{outputFilename}.mp4</Text>
                    </div>
                    <Space>
                        <Button onClick={() => openFileWithPlayer(outputDir)}>打开文件夹</Button>
                        <Button type="primary" onClick={reset}>继续转换其他文件</Button>
                    </Space>
                </>
             )}

             {status === 'error' && (
                <>
                    <CloseCircleOutlined style={{ fontSize: 64, color: token.colorError }} />
                    <Title level={3} style={{ marginTop: 16 }}>转换失败</Title>
                    <Paragraph type="secondary">请检查源文件是否损坏或格式是否支持</Paragraph>
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
                    { title: '选择文件', icon: <FileOutlined /> },
                    { title: '配置参数', icon: <FolderOpenOutlined /> },
                    { title: '处理完成', icon: <CheckCircleOutlined /> }
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

export default Transcoder;