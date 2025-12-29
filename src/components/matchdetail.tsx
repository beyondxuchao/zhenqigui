import React, { useState, useEffect } from 'react';
import { Typography, Card, Button, InputNumber, Slider, Table, Tag, Space, Empty, Breadcrumb, Row, Col, message, Tooltip, Modal, Input } from 'antd';
import { ReloadOutlined, LinkOutlined, FolderAddOutlined, PlayCircleOutlined, DragOutlined, FolderOpenOutlined, EditOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { getMovieDetails, scanDirectories, addMaterialToMovie, getConfig, openFileWithPlayer, updateMovie, openDirectory, renameFileDirect } from '../services/api';
import { Movie, MatchedFile, Material } from '../types';
import { openPath } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import LocalImage from './localimage';
import { formatFileSize } from '../utils/format';

const { Text } = Typography;

interface MatchDetailProps {
    movieId?: number;
    onBack?: () => void;
}

const MatchDetail: React.FC<MatchDetailProps> = ({ movieId, onBack }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const targetId = movieId || (id ? Number(id) : undefined);

  const [matchThreshold, setMatchThreshold] = useState(80);
  const [matching, setMatching] = useState(false);
  const [movie, setMovie] = useState<Movie | null>(null);
  const [folderConfig, setFolderConfig] = useState<{
    default: string[];
    source: string[];
    finished: string[];
    temp: string[]; // For folders added in this session
  }>({ default: [], source: [], finished: [], temp: [] });

  const [results, setResults] = useState<MatchedFile[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [renamingFile, setRenamingFile] = useState<MatchedFile | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [fileExtension, setFileExtension] = useState('');
  const [isRenamingModalVisible, setIsRenamingModalVisible] = useState(false);

  const fetchMovie = () => {
      if (targetId) {
        getMovieDetails(targetId).then(data => {
            if (data) {
              setMovie(data);
            } else {
              message.error('影视不存在');
              if (onBack) onBack();
              else navigate('/match');
            }
        }).catch(() => {
            message.error('加载影视详情失败');
        });
      }
  };

  useEffect(() => {
    // Load monitor folders from config
    getConfig().then(config => {
        setFolderConfig(prev => ({
            ...prev,
            default: config.default_monitor_folders || [],
            source: config.monitor_folders_source || [],
            finished: config.monitor_folders_finished || []
        }));
    }).catch((_e) => { /* console.error */ });

    fetchMovie();
  }, [targetId, navigate, onBack]);

  if (!targetId) {
    return null;
  }

  const handleMatch = async () => {
    if (!movie) return;
    const hasFolders = folderConfig.default.length > 0 || folderConfig.source.length > 0 || folderConfig.finished.length > 0 || folderConfig.temp.length > 0;
    
    if (!hasFolders) {
        message.warning('请先添加监控文件夹');
        return;
    }

    // Save temp folders to movie
    if (folderConfig.temp.length > 0) {
        // Merge with existing
        const existing = movie.matched_folders || [];
        const toAdd = folderConfig.temp.filter(f => !existing.includes(f));
        if (toAdd.length > 0) {
            const updatedMovie = {
                ...movie,
                matched_folders: [...existing, ...toAdd]
            };
            // Async update without waiting
            updateMovie(updatedMovie).then(() => {
                setMovie(updatedMovie);
            }).catch(e => console.error("Failed to save matched folders", e));
        }
    }
    
    // console.log('Starting match process...');
    // console.log('Folder Config:', folderConfig);
    // console.log('Movie:', movie);

    setMatching(true);
    try {
        const titles = [movie.title, movie.original_title].filter(t => t && t.trim().length > 0) as string[];
        // console.log('Search titles:', titles);
        
        // Merge default and temp folders for the default scan
        const defaultFolders = [...folderConfig.default, ...folderConfig.temp];
        
        // console.log('Scanning default folders:', defaultFolders);
        // console.log('Scanning source folders:', folderConfig.source);
        // console.log('Scanning finished folders:', folderConfig.finished);

        const [defaultRes, sourceRes, finishedRes] = await Promise.all([
            defaultFolders.length > 0 ? scanDirectories(defaultFolders, titles, matchThreshold) : Promise.resolve([]),
            folderConfig.source.length > 0 ? scanDirectories(folderConfig.source, titles, matchThreshold) : Promise.resolve([]),
            folderConfig.finished.length > 0 ? scanDirectories(folderConfig.finished, titles, matchThreshold) : Promise.resolve([])
        ]);

        // console.log('Scan results - Default:', defaultRes);
        // console.log('Scan results - Source:', sourceRes);
        // console.log('Scan results - Finished:', finishedRes);

        const allMatches: MatchedFile[] = [
            ...defaultRes.map(m => ({ ...m, category: undefined })),
            ...sourceRes.map(m => ({ ...m, category: 'source' })),
            ...finishedRes.map(m => ({ ...m, category: 'finished' }))
        ];
        
        // Deduplicate by path
        const uniqueMatches = Array.from(new Map(allMatches.map(item => [item.path, item])).values());
        
        setResults(uniqueMatches);
        if (uniqueMatches.length === 0) {
            message.info('未找到匹配素材');
        } else {
            message.success(`找到 ${uniqueMatches.length} 个匹配素材`);
        }
    } catch (e) {
        // console.error(e);
        message.error('匹配失败: ' + e);
    } finally {
        setMatching(false);
    }
  };

  const handleAddFolder = async () => {
      try {
          const selected = await open({
              directory: true,
              multiple: false,
              title: '选择临时监控文件夹'
          });
          
          if (selected && typeof selected === 'string') {
              // Check if it exists in any list
              if (folderConfig.default.includes(selected) || 
                  folderConfig.source.includes(selected) || 
                  folderConfig.finished.includes(selected) || 
                  folderConfig.temp.includes(selected)) {
                  message.warning('文件夹已存在');
                  return;
              }
              setFolderConfig(prev => ({ ...prev, temp: [...prev.temp, selected] }));
          }
      } catch (error) {
          // console.error('Failed to open dialog:', error);
          message.error('无法打开文件夹选择框');
      }
  };



  const handleAssociate = async (file: MatchedFile) => {
      if (!movie) return;
      try {
          const material: Material = {
              id: file.key || Date.now().toString(),
              name: file.name,
              path: file.path,
              size: file.size,
              file_type: file.file_type,
              category: file.category,
              add_time: new Date().toISOString(),
              modified_time: file.modified_time
          };
          await addMaterialToMovie(movie.id, material);
          message.success('已关联: ' + file.name);
          fetchMovie();
      } catch (e) {
          message.error('关联失败');
      }
  };

  const handleRenameClick = (file: MatchedFile) => {
      setRenamingFile(file);
      
      const path = file.path;
      const lastDotIndex = path.lastIndexOf('.');
      const lastSepIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
      
      let ext = '';
      let nameWithoutExt = file.name;

      if (lastDotIndex > lastSepIndex) {
          ext = path.substring(lastDotIndex);
          if (file.name.toLowerCase().endsWith(ext.toLowerCase())) {
              nameWithoutExt = file.name.substring(0, file.name.length - ext.length);
          }
      }

      setNewFileName(nameWithoutExt);
      setFileExtension(ext);
      setIsRenamingModalVisible(true);
  };

  const handleRenameSubmit = async () => {
      if (!renamingFile || !newFileName || !newFileName.trim()) return;

      const finalName = newFileName.trim() + fileExtension;

      if (finalName === renamingFile.name) {
          setIsRenamingModalVisible(false);
          return;
      }

      try {
          await renameFileDirect(renamingFile.path, finalName);
          message.success(`重命名成功: ${finalName}`);
          setIsRenamingModalVisible(false);
          
          // Calculate new path
          const oldPath = renamingFile.path;
          const separator = oldPath.includes('\\') ? '\\' : '/';
          const parts = oldPath.split(separator);
          parts.pop();
          parts.push(finalName);
          const newPath = parts.join(separator);

          // Update results list with new name and path
          setResults(prev => prev.map(r => {
              if (r.key === renamingFile.key) {
                  return { ...r, name: finalName, path: newPath };
              }
              return r;
          }));

          // Check if associated and update movie
          if (movie && movie.materials) {
              const associatedMaterial = movie.materials.find(m => m.path === oldPath);
              if (associatedMaterial) {
                  const updatedMaterials = movie.materials.map(m => {
                      if (m.path === oldPath) {
                          return { ...m, name: finalName, path: newPath };
                      }
                      return m;
                  });
                  // We need to pass the FULL movie object to updateMovie, 
                  // but updateMovie in api.ts might expect the object structure.
                  // Let's assume updateMovie handles it.
                  // Wait, updateMovie in api.ts calls invoke('update_movie', { movie }).
                  // The Rust command expects 'movie: Movie'.
                  const updatedMovie = { ...movie, materials: updatedMaterials };
                  await updateMovie(updatedMovie);
                  fetchMovie(); // Refresh movie state to sync everything
              }
          }
      } catch (e) {
          message.error('重命名失败: ' + e);
      }
  };

  const columns: any = [
    { 
        title: '文件名', 
        dataIndex: 'name', 
        key: 'name', 
        ellipsis: true,
        sorter: (a: MatchedFile, b: MatchedFile) => a.name.localeCompare(b.name)
    },
    { title: '路径', dataIndex: 'path', key: 'path', ellipsis: true },
    { 
        title: '大小', 
        dataIndex: 'size', 
        key: 'size', 
        width: 100, 
        render: (t: string) => formatFileSize(t),
        sorter: (a: MatchedFile, b: MatchedFile) => parseInt(a.size) - parseInt(b.size)
    },
    {
        title: '修改时间',
        dataIndex: 'modified_time',
        key: 'modified_time',
        width: 150,
        render: (t: string) => t ? new Date(t).toLocaleString() : '-',
        sorter: (a: MatchedFile, b: MatchedFile) => {
            if (!a.modified_time) return -1;
            if (!b.modified_time) return 1;
            return new Date(a.modified_time).getTime() - new Date(b.modified_time).getTime();
        }
    },
    { 
        title: '相似度', 
        dataIndex: 'similarity', 
        key: 'similarity', 
        width: 100,
        render: (val: number) => <Tag color={val > 90 ? 'green' : 'orange'}>{val}%</Tag>,
        sorter: (a: MatchedFile, b: MatchedFile) => a.similarity - b.similarity
    },
    {
        title: '操作',
        key: 'action',
        width: 180,
        render: (_: any, record: MatchedFile) => {
            const isAssociated = movie?.materials?.some(m => m.path === record.path);
            return (
            <div style={{ whiteSpace: 'nowrap' }}>
            <Space size={4}>
                <Tooltip title={isAssociated ? '已关联' : '关联'}>
                    <Button 
                        type="link" 
                        size="small" 
                        icon={<LinkOutlined />} 
                        disabled={isAssociated}
                        onClick={() => handleAssociate(record)}
                    />
                </Tooltip>
                <Tooltip title="重命名">
                    <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleRenameClick(record)} />
                </Tooltip>
                {(record.file_type === 'video' || record.file_type === 'audio') && (
                    <Tooltip title="播放">
                        <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={async () => {
                            try {
                                await openFileWithPlayer(record.path);
                            } catch (e) {
                                // If not configured, fallback to default opener
                                await openPath(record.path);
                            }
                        }} />
                    </Tooltip>
                )}
                {(record.file_type === 'video' || record.file_type === 'audio') && (
                    <Tooltip title="拖拽">
                        <Button 
                            type="link" 
                            size="small" 
                            icon={<DragOutlined />} 
                            onMouseDown={(e) => {
                                e.preventDefault();
                                invoke('drag_file', { path: record.path });
                            }}
                            style={{ cursor: 'grab' }}
                        />
                    </Tooltip>
                )}
                <Tooltip title="打开目录">
                    <Button 
                        type="link" 
                        size="small" 
                        icon={<FolderOpenOutlined />} 
                        onClick={async () => {
                            try {
                                await openDirectory(record.path);
                            } catch (e) {
                                message.error('打开目录失败');
                            }
                        }}
                    />
                </Tooltip>
            </Space>
            </div>
        )},
    },
  ];

  if (!movie) return null;

  return (
    <div>
      <Breadcrumb style={{ marginBottom: 16 }} items={[
        { title: '匹配列表', onClick: () => onBack ? onBack() : navigate('/match'), className: 'cursor-pointer' },
        { title: movie.title },
        { title: '匹配详情' }
      ]} />

      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
            <Card cover={<LocalImage alt={movie.title} src={movie.poster_path} />}>
                <Card.Meta title={movie.title} description="正在匹配素材..." />
            </Card>
        </Col>
        <Col span={18}>
            <Card title="匹配设置" extra={
                <Space>
                    <Button type="primary" icon={<ReloadOutlined />} loading={matching} onClick={handleMatch}>一键匹配</Button>
                </Space>
            }>
                <div style={{ marginBottom: 24 }}>
                    <Text strong>监控文件夹：</Text>
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {folderConfig.source.length > 0 && (
                             <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Text type="secondary" style={{ width: 60 }}>原片库:</Text>
                                {folderConfig.source.map(f => <Tag key={f} color="blue">{f}</Tag>)}
                             </div>
                        )}
                        {folderConfig.finished.length > 0 && (
                             <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Text type="secondary" style={{ width: 60 }}>成片库:</Text>
                                {folderConfig.finished.map(f => <Tag key={f} color="purple">{f}</Tag>)}
                             </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                             <Text type="secondary" style={{ width: 60 }}>通用/临时:</Text>
                             {folderConfig.default.map(f => <Tag key={f}>{f}</Tag>)}
                             {folderConfig.temp.map(f => <Tag key={f} closable onClose={() => setFolderConfig(prev => ({...prev, temp: prev.temp.filter(x => x !== f)}))}>{f}</Tag>)}
                             <Tag style={{ borderStyle: 'dashed', cursor: 'pointer', background: 'transparent' }} icon={<FolderAddOutlined />} onClick={handleAddFolder}>
                                添加
                            </Tag>
                        </div>
                    </div>
                </div>
                
                <div style={{ marginBottom: 24 }}>
                     <Text strong>相似度阈值：</Text>
                     <Row gutter={16} align="middle">
                        <Col span={12}>
                            <Slider min={0} max={100} value={matchThreshold} onChange={setMatchThreshold} />
                        </Col>
                        <Col span={4}>
                            <InputNumber min={0} max={100} value={matchThreshold} onChange={(val) => setMatchThreshold(val || 0)} />
                        </Col>
                     </Row>
                </div>
            </Card>

            <Card title="匹配结果" style={{ marginTop: 16 }}>
                <Table 
                    columns={columns} 
                    dataSource={results} 
                    rowKey="path"
                    pagination={false}
                    size="small"
                    locale={{ emptyText: <Empty description="暂无匹配结果，请点击“一键匹配”" /> }}
                    rowSelection={{
                        selectedRowKeys,
                        onChange: (keys) => setSelectedRowKeys(keys),
                    }}
                    onRow={(record) => ({
                        onDoubleClick: async () => {
                            if (record.file_type === 'video' || record.file_type === 'audio') {
                                try {
                                    await openFileWithPlayer(record.path);
                                } catch (e) {
                                    await openPath(record.path);
                                }
                            } else {
                                try {
                                    await openDirectory(record.path);
                                } catch (e) {
                                    message.error('打开目录失败');
                                }
                            }
                        }
                    })}
                />
                <Modal
                    title="重命名 (自动保留后缀)"
                    open={isRenamingModalVisible}
                    onOk={handleRenameSubmit}
                    onCancel={() => setIsRenamingModalVisible(false)}
                    destroyOnHidden
                >
                    <Input 
                        value={newFileName} 
                        onChange={e => setNewFileName(e.target.value)} 
                        placeholder="请输入新文件名"
                        addonAfter={fileExtension}
                    />
                    <div style={{ marginTop: 8, color: '#999', fontSize: '12px' }}>
                        原文件名: {renamingFile?.name}
                    </div>
                </Modal>
            </Card>
        </Col>
      </Row>
    </div>
  );
};

export default MatchDetail;
