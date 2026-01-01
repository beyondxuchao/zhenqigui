import React, { useState, useEffect } from 'react';
import { Upload, Button, Select, App, Typography, Space, Tooltip, theme, Pagination } from 'antd';
import { InboxOutlined, DeleteOutlined, FileTextOutlined, SyncOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { convertSubtitleFile } from '../../services/api';

const { Dragger } = Upload;
const { Text, Title } = Typography;
const { Option } = Select;

interface FileItem {
    uid: string;
    path: string;
    name: string;
    status: 'pending' | 'processing' | 'success' | 'error';
    resultPath?: string;
    error?: string;
}

const SubtitleConverter: React.FC<{ initialFile?: string }> = ({ initialFile }) => {
    const { token } = theme.useToken();
    const { message } = App.useApp();
    const [files, setFiles] = useState<FileItem[]>([]);
    const [targetFormat, setTargetFormat] = useState<string>('srt');
    const [processing, setProcessing] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 5;

    useEffect(() => {
        if (initialFile) {
            addFile(initialFile);
        }
    }, [initialFile]);

    const addFile = (path: string) => {
        // Check extension
        const ext = path.split('.').pop()?.toLowerCase();
        // Allow common subtitle formats
        if (['srt', 'ass', 'ssa', 'vtt', 'sub', 'sup', 'txt'].includes(ext || '')) {
             setFiles(prev => {
                if (prev.find(f => f.path === path)) return prev;
                return [...prev, {
                    uid: path,
                    path,
                    name: path.split(/[\\/]/).pop() || path,
                    status: 'pending'
                }];
            });
        } else {
            message.warning('可能不支持的文件格式: ' + ext);
            // Allow adding anyway, ffmpeg might handle it
            setFiles(prev => {
                if (prev.find(f => f.path === path)) return prev;
                return [...prev, {
                    uid: path,
                    path,
                    name: path.split(/[\\/]/).pop() || path,
                    status: 'pending'
                }];
            });
        }
    };

    const customRequest = (options: any) => {
        const file = options.file as any;
        // In Tauri environment, file object usually has path property
        if (file.path) {
            addFile(file.path);
        } else {
             message.error('无法获取文件路径');
        }
    };

    const handleConvert = async () => {
        if (files.length === 0) return;
        setProcessing(true);

        const newFiles = [...files];
        
        for (let i = 0; i < newFiles.length; i++) {
            if (newFiles[i].status === 'success') continue;
            
            newFiles[i].status = 'processing';
            setFiles([...newFiles]); // Force update UI
            
            try {
                const result = await convertSubtitleFile(newFiles[i].path, targetFormat);
                newFiles[i].status = 'success';
                newFiles[i].resultPath = result;
            } catch (e: any) {
                newFiles[i].status = 'error';
                newFiles[i].error = e.toString();
            }
            setFiles([...newFiles]); // Force update UI
        }
        
        setProcessing(false);
        message.success('队列处理完成');
    };
    
    const removeFile = (uid: string) => {
        setFiles(prev => prev.filter(f => f.uid !== uid));
    };

    return (
        <div style={{ padding: 24 }}>
            <div style={{ marginBottom: 24, textAlign: 'center' }}>
                <Title level={4}>字幕格式转换工具</Title>
                <Text type="secondary">支持 ASS, SSA, SRT, VTT 等格式互转，及转换为纯文本 TXT</Text>
            </div>

            <Dragger
                customRequest={customRequest}
                showUploadList={false}
                multiple
                style={{ 
                    marginBottom: 24, 
                    background: token.colorFillAlter, 
                    border: `1px dashed ${token.colorBorder}`, 
                    borderRadius: 8 
                }}
            >
                <div style={{ padding: '20px 0' }}>
                    <p className="ant-upload-drag-icon">
                        <InboxOutlined style={{ color: token.colorPrimary }} />
                    </p>
                    <p className="ant-upload-text" style={{ color: token.colorText }}>点击或拖拽字幕文件到此区域</p>
                    <p className="ant-upload-hint" style={{ color: token.colorTextSecondary }}>支持批量添加</p>
                </div>
            </Dragger>

            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                    <span>目标格式:</span>
                    <Select 
                        value={targetFormat} 
                        onChange={setTargetFormat} 
                        style={{ width: 140 }}
                        disabled={processing}
                    >
                        <Option value="srt">SRT (标准)</Option>
                        <Option value="ass">ASS (特效)</Option>
                        <Option value="ssa">SSA</Option>
                        <Option value="vtt">VTT (Web)</Option>
                        <Option value="txt">TXT (纯文本)</Option>
                    </Select>
                </Space>
                
                <Space>
                    <Button onClick={() => setFiles([])} disabled={processing || files.length === 0}>
                        清空列表
                    </Button>
                    <Button 
                        type="primary" 
                        icon={processing ? <SyncOutlined spin /> : <SyncOutlined />}
                        onClick={handleConvert}
                        loading={processing}
                        disabled={files.length === 0}
                    >
                        {processing ? '转换中...' : '开始转换'}
                    </Button>
                </Space>
            </div>

            <div style={{ border: `1px solid ${token.colorBorder}`, borderRadius: 8, overflow: 'hidden' }}>
                {files.length > 0 ? (
                    files.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((item, index) => (
                        <div 
                            key={item.uid} 
                            style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                padding: '12px 16px',
                                borderBottom: index < pageSize - 1 && (currentPage - 1) * pageSize + index < files.length - 1 ? `1px solid ${token.colorBorderSecondary}` : 'none',
                                background: token.colorBgContainer
                            }}
                        >
                            <FileTextOutlined style={{ fontSize: 24, color: token.colorTextSecondary, marginRight: 16 }} />
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                <Text ellipsis style={{ maxWidth: 300, display: 'block' }}>{item.name}</Text>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <Text type="secondary" ellipsis style={{ fontSize: 12, maxWidth: 400 }}>{item.path}</Text>
                                    {item.resultPath && (
                                        <Text type="success" ellipsis style={{ fontSize: 12, maxWidth: 400 }}>
                                            → {item.resultPath.split(/[\\/]/).pop()}
                                        </Text>
                                    )}
                                    {item.error && (
                                        <Text type="danger" ellipsis style={{ fontSize: 12, maxWidth: 400 }}>
                                            {item.error}
                                        </Text>
                                    )}
                                </div>
                            </div>
                            <Space>
                                {item.status === 'pending' && <Button type="text" icon={<DeleteOutlined />} onClick={() => removeFile(item.uid)} />}
                                {item.status === 'processing' && <SyncOutlined spin style={{ color: token.colorPrimary }} />}
                                {item.status === 'success' && <Tooltip title={`输出: ${item.resultPath}`}><CheckCircleOutlined style={{ color: token.colorSuccess, fontSize: 18 }} /></Tooltip>}
                                {item.status === 'error' && <Tooltip title={item.error}><CloseCircleOutlined style={{ color: token.colorError, fontSize: 18 }} /></Tooltip>}
                            </Space>
                        </div>
                    ))
                ) : (
                    <div style={{ padding: '24px', textAlign: 'center', color: token.colorTextSecondary }}>暂无文件</div>
                )}
            </div>
            {files.length > pageSize && (
                <div style={{ marginTop: 16, textAlign: 'right' }}>
                    <Pagination 
                        current={currentPage} 
                        pageSize={pageSize} 
                        total={files.length} 
                        onChange={setCurrentPage}
                        size="small"
                    />
                </div>
            )}
        </div>
    );
};

export default SubtitleConverter;
