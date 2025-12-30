import React, { useState, useEffect } from 'react';
import { Card, Typography, Button, message, Radio, Space, theme, Form, Input, Progress, Steps, Spin } from 'antd';
import { InboxOutlined, AudioOutlined, FileOutlined, FolderOpenOutlined, CheckCircleOutlined, SwapOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { listen } from '@tauri-apps/api/event';
import { extractAudio, openFileWithPlayer } from '../../services/api';
import { open } from '@tauri-apps/plugin-dialog';

const { Text, Title, Paragraph } = Typography;

interface AudioExtractorProps {
    initialFile?: string;
}

const AudioExtractor: React.FC<AudioExtractorProps> = ({ initialFile }) => {
    const { token } = theme.useToken();
    const [file, setFile] = useState<{ path: string; name: string } | null>(null);
    const [format, setFormat] = useState('mp3');
    const [outputDir, setOutputDir] = useState<string>('');
    const [outputFilename, setOutputFilename] = useState<string>('');
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
        
        const lastDot = name.lastIndexOf('.');
        const nameWithoutExt = lastDot > -1 ? name.substring(0, lastDot) : name;
        setOutputFilename(`${nameWithoutExt}`);
        
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
        if (!file || !outputDir || !outputFilename) return;

        setProcessing(true);
        setStatus('process');
        setCurrentStep(2);
        setProgress(0);
        
        const separator = outputDir.includes('\\') ? '\\' : '/';
        const cleanDir = outputDir.endsWith(separator) ? outputDir.substring(0, outputDir.length - 1) : outputDir;
        const outputPath = `${cleanDir}${separator}${outputFilename}.${format}`;

        if (file.path === outputPath) {
            message.error('输出文件路径不能与输入文件相同');
            setProcessing(false);
            return;
        }

        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 95) return 95;
                return prev + 5;
            });
        }, 300);
        
        try {
            await extractAudio(file.path, outputPath);
            clearInterval(timer);
            setProgress(100);
            setStatus('finish');
            message.success('提取成功！');
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
                    name: 'Media Files',
                    extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'mp3', 'wav', 'aac']
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
            <p style={{ fontSize: '16px', color: token.colorText, marginBottom: 4 }}>点击或拖拽文件到此区域</p>
            <p style={{ fontSize: '14px', color: token.colorTextSecondary }}>支持视频/音频文件</p>
        </div>
    );

    const renderConfig = () => (
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
            <Card title="提取配置" bordered={false} style={{ boxShadow: token.boxShadowTertiary }}>
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
                        <Input value={outputFilename} onChange={e => setOutputFilename(e.target.value)} addonAfter={`.${format}`} />
                    </Form.Item>

                    <Form.Item label="输出格式">
                        <Radio.Group value={format} onChange={e => setFormat(e.target.value)} buttonStyle="solid">
                            <Radio.Button value="mp3">MP3</Radio.Button>
                            <Radio.Button value="aac">AAC</Radio.Button>
                            <Radio.Button value="wav">WAV</Radio.Button>
                            <Radio.Button value="flac">FLAC</Radio.Button>
                        </Radio.Group>
                    </Form.Item>

                    <Form.Item style={{ marginTop: 32, textAlign: 'center' }}>
                        <Button type="primary" size="large" onClick={handleExtract} icon={<AudioOutlined />} loading={processing} style={{ minWidth: 120 }}>
                            开始提取
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
                    <Title level={4} style={{ marginTop: 24 }}>正在提取音频...</Title>
                    <Paragraph type="secondary">正在从源文件中分离音频流</Paragraph>
                    <Progress percent={progress} status="active" />
                </>
             )}
             
             {status === 'finish' && (
                <>
                    <CheckCircleOutlined style={{ fontSize: 64, color: token.colorSuccess }} />
                    <Title level={3} style={{ marginTop: 16 }}>提取完成</Title>
                    <Paragraph>文件已保存至：</Paragraph>
                    <div style={{ background: token.colorFillAlter, padding: 12, borderRadius: 6, marginBottom: 24, wordBreak: 'break-all' }}>
                        <Text code>{outputDir}\{outputFilename}.{format}</Text>
                    </div>
                    <Space>
                        <Button onClick={() => openFileWithPlayer(outputDir)}>打开文件夹</Button>
                        <Button type="primary" onClick={reset}>继续提取</Button>
                    </Space>
                </>
             )}

             {status === 'error' && (
                <>
                    <CloseCircleOutlined style={{ fontSize: 64, color: token.colorError }} />
                    <Title level={3} style={{ marginTop: 16 }}>提取失败</Title>
                    <Paragraph type="secondary">请检查文件格式或是否包含音频流</Paragraph>
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

export default AudioExtractor;