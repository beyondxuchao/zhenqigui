import React, { useState, useEffect } from 'react';
import { Typography, Table, Button, message, Badge, Space, Input, Card, Radio, Checkbox } from 'antd';
import { FileSyncOutlined, FolderOpenOutlined, InboxOutlined, DeleteOutlined } from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { listVideoFiles, renameFileDirect } from '../../services/api';

const { Text } = Typography;

interface RenameItem {
    key: string;
    originalPath: string;
    originalName: string;
    newName: string;
    status: 'pending' | 'success' | 'error';
    errorMsg?: string;
    _nameBody?: string;
    _ext?: string;
}

interface FileRenamerProps {
    initialFile?: string;
}

const FileRenamer: React.FC<FileRenamerProps> = ({ initialFile }) => {
    const [files, setFiles] = useState<RenameItem[]>([]);
    const [loading, setLoading] = useState(false);
    
    // Batch Operation State
    const [mode, setMode] = useState<'replace' | 'remove' | 'prefix' | 'suffix' | 'direct'>('replace');
    const [findText, setFindText] = useState('');
    const [replaceText, setReplaceText] = useState('');
    const [prefixText, setPrefixText] = useState('');
    const [suffixText, setSuffixText] = useState('');
    const [directText, setDirectText] = useState('');
    const [useRegex, setUseRegex] = useState(false);

    useEffect(() => {
        if (initialFile) {
            processDroppedPaths([initialFile]);
        }

        const unlisten = listen('tauri://drag-drop', (event) => {
            const payload = event.payload as { paths: string[] };
            if (payload.paths && payload.paths.length > 0) {
                // Check if we are mounted and visible? 
                // Since this component will now be in a Modal, we need to be careful.
                // If the modal is open, this component is mounted.
                // But tauri://drag-drop is global.
                // We should probably rely on this component being mounted only when modal is open.
                processDroppedPaths(payload.paths);
            }
        });
        
        return () => {
            unlisten.then(f => f());
        };
    }, []);

    // Apply rules whenever inputs change
    useEffect(() => {
        applyRules();
    }, [files.length, mode, findText, replaceText, prefixText, suffixText, directText, useRegex]);

    const processDroppedPaths = async (paths: string[]) => {
        setLoading(true);
        try {
            let allNewFiles: string[] = [];
            for (const p of paths) {
                // Check if it's a directory or file
                // For simplicity, we assume listVideoFiles handles both or we just try it.
                // Actually listVideoFiles (in rust) scans a directory. 
                // If we pass a file path to it, it might fail or return nothing.
                // But the previous implementation assumed it works for folders.
                // Let's assume the backend handles it or we improve it later.
                // Wait, previous implementation:
                /*
                for (const p of paths) {
                    const f = await listVideoFiles(p);
                    allNewFiles = [...allNewFiles, ...f];
                }
                */
                // listVideoFiles scans recursively.
                // If user drags a file, listVideoFiles might return empty if it expects a dir.
                // But let's keep original logic for now.
                const f = await listVideoFiles(p);
                allNewFiles = [...allNewFiles, ...f];
            }
            const uniqueNew = [...new Set(allNewFiles)];
            
            setFiles(prev => {
                const existingKeys = new Set(prev.map(f => f.key));
                const newItems: RenameItem[] = uniqueNew
                    .filter(p => !existingKeys.has(p))
                    .map(p => {
                        const parts = p.split(/[/\\]/);
                        const name = parts[parts.length - 1];
                        return {
                            key: p,
                            originalPath: p,
                            originalName: name,
                            newName: name, // Initialize with original name
                            status: 'pending'
                        };
                    });
                return [...prev, ...newItems];
            });
        } catch (error) {
            console.error(error);
            // If listVideoFiles fails (e.g. it's a file, not folder), we might want to just add the file itself if it matches extension.
            // For now, suppress error or show simple msg.
            message.error('处理文件失败，请确保拖入的是文件夹');
        } finally {
            setLoading(false);
        }
    };

    const handleSelectFolder = async () => {
        try {
            const selected = await open({
                directory: true,
                multiple: false,
                title: '选择文件夹'
            });

            if (selected && typeof selected === 'string') {
                loadFiles(selected);
            }
        } catch (error) {
            console.error(error);
            message.error('打开文件夹失败');
        }
    };

    const loadFiles = async (path: string) => {
        setLoading(true);
        try {
            const videoPaths = await listVideoFiles(path);
            const items: RenameItem[] = videoPaths.map(p => {
                const parts = p.split(/[/\\]/);
                const name = parts[parts.length - 1];
                return {
                    key: p,
                    originalPath: p,
                    originalName: name,
                    newName: name,
                    status: 'pending'
                };
            });
            setFiles(items);
        } catch (error) {
            message.error('读取文件列表失败');
        } finally {
            setLoading(false);
        }
    };

    const applyRules = () => {
        const proposedNames = files.map(item => {
            if (item.status === 'success') return { ...item, newName: item.originalName };

            let newName = item.originalName;
            const extIndex = newName.lastIndexOf('.');
            let nameBody = extIndex > -1 ? newName.substring(0, extIndex) : newName;
            const ext = extIndex > -1 ? newName.substring(extIndex) : '';

            try {
                if (mode === 'replace') {
                    if (findText) {
                        if (useRegex) {
                            try {
                                const re = new RegExp(findText, 'g');
                                nameBody = nameBody.replace(re, replaceText);
                            } catch (e) {
                                // Invalid regex, ignore
                            }
                        } else {
                            nameBody = nameBody.split(findText).join(replaceText);
                        }
                    }
                } else if (mode === 'remove') {
                    if (findText) {
                        if (useRegex) {
                            try {
                                const re = new RegExp(findText, 'g');
                                nameBody = nameBody.replace(re, '');
                            } catch (e) {
                                // Invalid regex
                            }
                        } else {
                            nameBody = nameBody.split(findText).join('');
                        }
                    }
                } else if (mode === 'prefix') {
                    nameBody = prefixText + nameBody;
                } else if (mode === 'suffix') {
                    nameBody = nameBody + suffixText;
                } else if (mode === 'direct') {
                    if (directText) {
                        nameBody = directText;
                    }
                }
            } catch (err) {
                console.error("Rule application error", err);
            }

            return {
                ...item,
                newName: nameBody + ext,
                _nameBody: nameBody,
                _ext: ext
            };
        });

        if (mode === 'direct' && directText) {
            const usedNames = new Set<string>();
            
            const resolved = proposedNames.map(item => {
                if (item.status === 'success') return item;
                
                let finalName = item.newName;
                let counter = 1;
                
                while (usedNames.has(finalName)) {
                    finalName = `${item._nameBody} (${counter})${item._ext}`;
                    counter++;
                }
                
                usedNames.add(finalName);
                return { ...item, newName: finalName };
            });
            
            setFiles(resolved);
        } else {
            setFiles(proposedNames);
        }
    };

    const executeRenameAll = async () => {
        const pendingFiles = files.filter(f => f.status === 'pending' && f.newName !== f.originalName);
        if (pendingFiles.length === 0) {
            message.info('没有需要重命名的文件');
            return;
        }

        setLoading(true);
        let successCount = 0;
        
        for (const file of pendingFiles) {
            try {
                const newPath = await renameFileDirect(file.originalPath, file.newName);
                
                setFiles(prev => prev.map(f => {
                    if (f.key === file.key) {
                        return { 
                            ...f, 
                            status: 'success', 
                            originalPath: newPath, 
                            originalName: file.newName 
                        };
                    }
                    return f;
                }));
                successCount++;
            } catch (e: any) {
                setFiles(prev => prev.map(f => {
                    if (f.key === file.key) {
                        return { ...f, status: 'error', errorMsg: e.toString() };
                    }
                    return f;
                }));
            }
        }
        
        setLoading(false);
        if (successCount > 0) {
            message.success(`成功重命名 ${successCount} 个文件`);
        }
    };
    
    const removeFile = (key: string) => {
        setFiles(prev => prev.filter(f => f.key !== key));
    };

    const columns = [
        {
            title: '原始文件名',
            dataIndex: 'originalName',
            key: 'originalName',
            ellipsis: true,
        },
        {
            title: '新文件名 (预览)',
            key: 'newName',
            render: (_: any, record: RenameItem) => (
                 <Input 
                    value={record.newName}
                    onChange={(e) => {
                        const val = e.target.value;
                        setFiles(prev => prev.map(p => p.key === record.key ? { ...p, newName: val } : p));
                    }}
                    status={record.status === 'error' ? 'error' : ''}
                 />
            )
        },
        {
            title: '状态',
            key: 'status',
            width: 100,
            render: (_: any, record: RenameItem) => {
                if (record.status === 'success') return <Badge status="success" text="成功" />;
                if (record.status === 'error') return <Badge status="error" text="失败" />;
                if (record.newName !== record.originalName) return <Badge status="processing" text="待处理" />;
                return <Badge status="default" text="无变化" />;
            }
        },
        {
            title: '操作',
            key: 'action',
            width: 80,
            render: (_: any, record: RenameItem) => (
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => removeFile(record.key)} />
            )
        }
    ];

    return (
        <div style={{ height: 'calc(80vh - 100px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ marginBottom: 16 }}>
                 <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
                    <Button type="primary" icon={<FolderOpenOutlined />} onClick={handleSelectFolder}>导入文件夹</Button>
                    <Text type="secondary"><InboxOutlined style={{ marginRight: 4 }} />支持拖拽文件夹</Text>
                    <div style={{ flex: 1 }} />
                    <Button type="primary" danger onClick={() => setFiles([])} disabled={files.length === 0}>清空列表</Button>
                </div>
                
                <Card size="small" title="批量操作规则">
                    <Space direction="vertical" style={{ width: '100%' }}>
                        <Radio.Group value={mode} onChange={e => setMode(e.target.value)}>
                            <Radio.Button value="replace">查找替换</Radio.Button>
                            <Radio.Button value="remove">删除字符</Radio.Button>
                            <Radio.Button value="prefix">添加前缀</Radio.Button>
                            <Radio.Button value="suffix">添加后缀</Radio.Button>
                            <Radio.Button value="direct">直接更名</Radio.Button>
                        </Radio.Group>
                        
                        <div style={{ marginTop: 8 }}>
                            {mode === 'replace' && (
                                <Space>
                                    <Input placeholder="查找内容" value={findText} onChange={e => setFindText(e.target.value)} style={{ width: 200 }} />
                                    <Input placeholder="替换为" value={replaceText} onChange={e => setReplaceText(e.target.value)} style={{ width: 200 }} />
                                    <Checkbox checked={useRegex} onChange={e => setUseRegex(e.target.checked)}>正则</Checkbox>
                                </Space>
                            )}
                            {mode === 'remove' && (
                                <Space>
                                    <Input placeholder="要删除的内容" value={findText} onChange={e => setFindText(e.target.value)} style={{ width: 200 }} />
                                    <Checkbox checked={useRegex} onChange={e => setUseRegex(e.target.checked)}>正则</Checkbox>
                                </Space>
                            )}
                            {mode === 'prefix' && (
                                <Space>
                                    <Input placeholder="前缀内容" value={prefixText} onChange={e => setPrefixText(e.target.value)} style={{ width: 300 }} />
                                </Space>
                            )}
                            {mode === 'suffix' && (
                                <Space>
                                    <Input placeholder="后缀内容" value={suffixText} onChange={e => setSuffixText(e.target.value)} style={{ width: 300 }} />
                                </Space>
                            )}
                            {mode === 'direct' && (
                                <Space>
                                    <Input placeholder="新文件名 (不含后缀)" value={directText} onChange={e => setDirectText(e.target.value)} style={{ width: 300 }} />
                                    <Text type="secondary">如有重复会自动添加序号</Text>
                                </Space>
                            )}
                        </div>
                    </Space>
                </Card>
                
                <div style={{ marginTop: 8, paddingLeft: 4 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        💡 推荐命名格式：中文名 (年份).后缀
                    </Text>
                </div>
            </div>

            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Table 
                    dataSource={files} 
                    columns={columns} 
                    rowKey="key" 
                    loading={loading}
                    pagination={false}
                    size="small"
                    scroll={{ y: 300 }}
                />
            </div>
            
            <div style={{ marginTop: 16, textAlign: 'right' }}>
                <Button type="primary" size="large" icon={<FileSyncOutlined />} onClick={executeRenameAll} disabled={files.length === 0}>
                    执行批量重命名
                </Button>
            </div>
        </div>
    );
};

export default FileRenamer;