import React, { useState, useEffect } from 'react';
import { Card, Typography, Button, App, Space, theme, Form, Input, Progress, Steps, Table, Checkbox, Tag, Tooltip } from 'antd';
import { InboxOutlined, FileTextOutlined, DownloadOutlined, FolderOpenOutlined, CheckCircleOutlined, SwapOutlined, CloseCircleOutlined, FileSyncOutlined } from '@ant-design/icons';
import { listen } from '@tauri-apps/api/event';
import { extractSubtitles, openFileWithPlayer, getSubtitleTracks, SubtitleTrack, convertSrtToTxt } from '../../services/api';
import { open } from '@tauri-apps/plugin-dialog';

const { Text, Title, Paragraph } = Typography;

interface SubtitleToolProps {
    initialFile?: string;
}

const SubtitleTool: React.FC<SubtitleToolProps> = ({ initialFile }) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    
    // Initialize state
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

    const [file, setFile] = useState<{ path: string; name: string } | null>(initFileState());
    const [outputDir, setOutputDir] = useState<string>(initOutputDir());
    const [extractedFiles, setExtractedFiles] = useState<string[]>([]);
    const [processing, setProcessing] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState<'wait' | 'process' | 'finish' | 'error'>('wait');
    const [currentStep, setCurrentStep] = useState(initialFile ? 1 : 0);
    
    const [tracks, setTracks] = useState<SubtitleTrack[]>([]);
    const [selectedTrackIndices, setSelectedTrackIndices] = useState<React.Key[]>([]);
    const [convertToSrt, setConvertToSrt] = useState(false);

    useEffect(() => {
        if (initialFile) {
            handleFileSelect(initialFile);
        }
    }, [initialFile]);

    useEffect(() => {
        const unlistenDrop = listen('tauri://drag-drop', (event) => {
            if (processing || scanning) return;
            const payload = event.payload as { paths: string[] };
            if (payload.paths && payload.paths.length > 0) {
                handleFileSelect(payload.paths[0]);
            }
        });

        const unlistenProgress = listen('extract-progress', (event) => {
             setProgress(event.payload as number);
        });

        return () => {
            unlistenDrop.then(f => f());
            unlistenProgress.then(f => f());
        };
    }, [processing, scanning]);

    const handleFileSelect = async (path: string) => {
        const parts = path.split(/[/\\]/);
        const name = parts[parts.length - 1];
        const dir = path.substring(0, path.lastIndexOf(name));
        
        setFile({ path, name });
        setOutputDir(dir);
        setCurrentStep(1);
        setStatus('wait');
        
        // Scan for tracks
        setScanning(true);
        try {
            const foundTracks = await getSubtitleTracks(path);
            setTracks(foundTracks);
            // Default select all
            setSelectedTrackIndices(foundTracks.map(t => t.index));
        } catch (err: any) {
            message.error('无法读取字幕流: ' + err.toString());
            setTracks([]);
        } finally {
            setScanning(false);
        }
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
        if (selectedTrackIndices.length === 0) {
            message.warning('请至少选择一个字幕轨道');
            return;
        }

        setProcessing(true);
        setStatus('process');
        setCurrentStep(2);
        setProgress(0);
        
        try {
            // Use selected indices
            const selectedIndices = selectedTrackIndices.map(k => Number(k));
            const results = await extractSubtitles(file.path, outputDir, selectedIndices, convertToSrt);
            setProgress(100);
            
            if (results.length === 0) {
                message.warning('未成功提取文件');
                setStatus('error');
            } else {
                setExtractedFiles(results);
                setStatus('finish');
                message.success(`成功提取 ${results.length} 个字幕文件`);
            }
        } catch (error: any) {
            setStatus('error');
            console.error(error);
            message.error('提取失败: ' + error.toString());
        } finally {
            setProcessing(false);
        }
    };

    const handleConvertToTxt = async (filename: string) => {
        try {
            // Construct full path. filename is just the name returned by extractSubtitles?
            // Wait, extractSubtitles returns filename only, not full path in my modification?
            // Looking at Rust code: `extracted.push(file_name);` where file_name is just name.
            // So we need to join with outputDir.
            // But wait, path separators might be tricky.
            // Let's try to assume outputDir + filename.
            
            // Actually, in Rust: `let out_path = Path::new(&output_dir).join(&file_name);`
            // So the filename is relative.
            
            // To be safe, we might need a join helper or just use string concat if we know OS.
            // Since this is Windows/Tauri, backslash is likely.
            
            const separator = outputDir.endsWith('\\') || outputDir.endsWith('/') ? '' : '\\';
            const fullPath = `${outputDir}${separator}${filename}`;
            
            await convertSrtToTxt(fullPath);
            message.success('已转换为 TXT');
        } catch (e: any) {
            message.error('转换失败: ' + e.toString());
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
        setTracks([]);
        setSelectedTrackIndices([]);
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
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <Card title="提取配置" variant="borderless" style={{ boxShadow: token.boxShadowTertiary }}>
                <Form layout="vertical">
                    <Form.Item label="已选文件">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: token.colorFillAlter, borderRadius: 6 }}>
                            <FileTextOutlined style={{ color: token.colorPrimary }} />
                            <Text ellipsis style={{ flex: 1 }}>{file?.path}</Text>
                            <Button type="text" size="small" icon={<SwapOutlined />} onClick={handleOpen}>更换</Button>
                        </div>
                    </Form.Item>
                    
                    <Form.Item label="字幕轨道选择">
                        <Table 
                            dataSource={tracks}
                            rowKey="index"
                            size="small"
                            pagination={false}
                            loading={scanning}
                            rowSelection={{
                                selectedRowKeys: selectedTrackIndices,
                                onChange: (keys) => setSelectedTrackIndices(keys),
                            }}
                            columns={[
                                { title: 'ID', dataIndex: 'index', width: 60 },
                                { title: '语言', dataIndex: 'language', width: 100 },
                                { title: '格式', dataIndex: 'codec', width: 100, render: (t) => <Tag>{t}</Tag> },
                                { title: '标题', dataIndex: 'title', ellipsis: true },
                            ]}
                            scroll={{ y: 240 }}
                            style={{ border: `1px solid ${token.colorBorderSecondary}`, borderRadius: 6 }}
                        />
                    </Form.Item>

                    <Form.Item label="输出设置">
                         <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <Space.Compact style={{ width: '100%' }}>
                                <Button disabled style={{ cursor: 'default', color: token.colorText }}>输出目录</Button>
                                <Input value={outputDir} onChange={e => setOutputDir(e.target.value)} />
                                <Button icon={<FolderOpenOutlined />} onClick={handleSelectOutputDir}>选择</Button>
                            </Space.Compact>
                            <Checkbox 
                                checked={convertToSrt} 
                                onChange={e => setConvertToSrt(e.target.checked)}
                            >
                                强制转换 ASS/SSA 为 SRT 格式 (纯文本)
                            </Checkbox>
                         </div>
                    </Form.Item>

                    <Form.Item style={{ marginTop: 24, textAlign: 'center' }}>
                        <Button 
                            type="primary" 
                            size="large" 
                            onClick={handleExtract} 
                            icon={<DownloadOutlined />} 
                            loading={processing || scanning} 
                            disabled={selectedTrackIndices.length === 0}
                            style={{ minWidth: 120 }}
                        >
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
                    <Paragraph type="secondary">正在处理 {selectedTrackIndices.length} 个字幕轨道</Paragraph>
                    <Progress percent={progress} status="active" />
                </>
             )}
             
             {status === 'finish' && (
                <>
                    <CheckCircleOutlined style={{ fontSize: 64, color: token.colorSuccess }} />
                    <Title level={3} style={{ marginTop: 16 }}>提取完成</Title>
                    <Paragraph>成功提取 {extractedFiles.length} 个字幕文件：</Paragraph>
                    
                    <div style={{ marginBottom: 24, textAlign: 'left', background: token.colorBgContainer, border: `1px solid ${token.colorBorder}`, borderRadius: 8 }}>
                        {extractedFiles.map((item, index) => (
                            <div 
                                key={index} 
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    padding: '8px 16px',
                                    borderBottom: index < extractedFiles.length - 1 ? `1px solid ${token.colorBorderSecondary}` : 'none'
                                }}
                            >
                                <FileTextOutlined style={{ fontSize: 24, color: token.colorTextSecondary, marginRight: 12 }} />
                                <Text ellipsis style={{ flex: 1, maxWidth: 400 }}>{item}</Text>
                                <Tooltip title="转换为纯文本 TXT">
                                    <Button 
                                        type="text" 
                                        size="small" 
                                        icon={<FileSyncOutlined />} 
                                        onClick={() => handleConvertToTxt(item)} 
                                    />
                                </Tooltip>
                            </div>
                        ))}
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