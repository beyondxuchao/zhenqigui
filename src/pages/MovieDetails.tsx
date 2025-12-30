import React, { useEffect, useState } from 'react';
import { Typography, Card, Button, Table, Tag, Space, Breadcrumb, Statistic, Row, Col, Tabs, App, Spin, Tooltip, Input, Modal } from 'antd';
import { EditOutlined, DeleteOutlined, CloseOutlined, PlayCircleOutlined, ExclamationCircleOutlined, DragOutlined, FolderOpenOutlined, LinkOutlined, ReloadOutlined } from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { getMovieDetails, removeMaterialFromMovie, openFileWithPlayer, deleteMovie, updateMovie, getTmdbDetails, openDirectory, renameFileDirect, refreshMovieMaterials } from '../services/api';
import { Movie, Material, Person } from '../types';
import { openPath } from '@tauri-apps/plugin-opener';
import { invoke } from '@tauri-apps/api/core';
import LocalImage from '../components/localimage';
import MovieEditModal from '../components/movieeditmodal';
import { formatFileSize } from '../utils/format';

const { Title, Text } = Typography;

const MovieDetails: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { message, modal } = App.useApp();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingMaterials, setRefreshingMaterials] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renamingFile, setRenamingFile] = useState<Material | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [fileExtension, setFileExtension] = useState('');
  const [isRenamingModalVisible, setIsRenamingModalVisible] = useState(false);
  
  const fetchDetails = async () => {
    if (!id) return;
    try {
      let data = await getMovieDetails(parseInt(id));
      if (data) {
        // Render immediately with local data
        setMovie(data);
        setLoading(false);

        // Check if we need to fetch cast/crew from TMDB in background
        if (data.tmdb_id && (!data.actors || data.actors.length === 0)) {
          try {
             const tmdbData = await getTmdbDetails(data.tmdb_id, data.category || 'movie');
             
             let updated = false;
             
             if (tmdbData) {
                // Update Cast & Crew
                if (tmdbData.credits && (!data.actors || data.actors.length === 0)) {
                    const cast: Person[] = tmdbData.credits.cast.slice(0, 10).map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        original_name: p.original_name,
                        profile_path: p.profile_path ? `https://image.tmdb.org/t/p/h632${p.profile_path}` : undefined
                    }));
                    const crew: Person[] = tmdbData.credits.crew
                        .filter((p: any) => p.job === 'Director')
                        .map((p: any) => ({
                            id: p.id,
                            name: p.name,
                            original_name: p.original_name,
                            profile_path: p.profile_path ? `https://image.tmdb.org/t/p/h632${p.profile_path}` : undefined
                        }));
                    
                    data.actors = cast;
                    data.directors = crew;
                    updated = true;
                }

                // Update Genres
                if (tmdbData.genres && (!data.genres || data.genres.length === 0)) {
                    data.genres = tmdbData.genres.map((g: any) => g.name);
                    updated = true;
                }
             }

             if (updated) {
                 await updateMovie(data);
                 setMovie({...data}); // Update UI with new data
             }
           } catch (e) {
             console.error("Failed to fetch TMDB credits", e);
             // Don't fail the whole load if TMDB fails
          }
        }
      }
    } catch (error) {
      console.error(error);
      message.error('获取详情失败');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const handleOpenDirectory = async (path: string) => {
      try {
          await openDirectory(path);
      } catch (e) {
          message.error('打开目录失败');
      }
  };

  const handleRemoveMaterial = async (materialId: string) => {
      if (!movie) return;
      try {
          await removeMaterialFromMovie(movie.id, materialId);
          message.success('已移除关联');
          fetchDetails(); // Refresh
      } catch (e) {
          message.error('移除失败');
      }
  };

  const handleRefreshMaterials = async () => {
      if (!id) return;
      try {
          setRefreshingMaterials(true);
          await refreshMovieMaterials(parseInt(id));
          await fetchDetails();
          message.success('素材已刷新');
      } catch (e) {
          message.error('刷新素材失败');
      } finally {
          setRefreshingMaterials(false);
      }
  };

  const handleDeleteMovie = () => {
    if (!movie) return;
    modal.confirm({
        title: '确认删除',
        icon: <ExclamationCircleOutlined />,
        content: '确定要删除这部影视吗？此操作不可恢复。',
        okText: '删除',
        okType: 'danger',
        cancelText: '取消',
        onOk: async () => {
            try {
                await deleteMovie(movie.id);
                message.success('删除成功');
                navigate('/');
            } catch (error) {
                message.error('删除失败');
            }
        },
    });
  };

  const handleRenameClick = (file: Material) => {
      setRenamingFile(file);
      
      // Force extract extension from PATH to be safe, as name might be display-only or user-modified?
      // Actually name should be correct, but path is definitive.
      const path = file.path;
      const lastDotIndex = path.lastIndexOf('.');
      const lastSepIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
      
      let ext = '';
      let nameWithoutExt = file.name;

      if (lastDotIndex > lastSepIndex) {
          ext = path.substring(lastDotIndex);
          // Update nameWithoutExt based on the extension found in path
          if (file.name.toLowerCase().endsWith(ext.toLowerCase())) {
              nameWithoutExt = file.name.substring(0, file.name.length - ext.length);
          } else {
             // If file.name doesn't end with that extension (weird?), we assume file.name is the base name?
             // Or maybe file.name doesn't have extension at all?
             // Let's just trust file.name is the name part if it doesn't match extension.
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
          // Update local state or refetch
          
          if (movie) {
              const oldPath = renamingFile.path;
              const separator = oldPath.includes('\\') ? '\\' : '/';
              const parts = oldPath.split(separator);
              parts.pop();
              parts.push(finalName);
              const newPath = parts.join(separator);
              
              const updatedMaterials = movie.materials?.map(m => {
                  if (m.id === renamingFile.id) {
                      return { ...m, name: finalName, path: newPath };
                  }
                  return m;
              });
              
              const updatedMovie = { ...movie, materials: updatedMaterials };
              await updateMovie(updatedMovie);
              setMovie(updatedMovie);
          }
      } catch (e) {
          message.error('重命名失败: ' + e);
      }
  };

  const materials = movie?.materials || [];

  const columns: any = [
    { 
        title: '文件名', 
        dataIndex: 'name', 
        key: 'name', 
        ellipsis: true,
        sorter: (a: Material, b: Material) => a.name.localeCompare(b.name)
    },
    { title: '类别', dataIndex: 'category', key: 'category', width: 80, render: (text: string) => text === 'source' ? <Tag color="blue">原片</Tag> : text === 'finished' ? <Tag color="purple">成片</Tag> : '-' },
    { title: '类型', dataIndex: 'file_type', key: 'file_type', width: 100, render: (t: string) => <Tag>{t}</Tag> },
    { title: '路径', dataIndex: 'path', key: 'path', ellipsis: true },
    { 
        title: '大小', 
        dataIndex: 'size', 
        key: 'size', 
        width: 120, 
        render: (t: string) => formatFileSize(t),
        sorter: (a: Material, b: Material) => parseInt(a.size) - parseInt(b.size)
    },
    {
        title: '操作',
        key: 'action',
        width: 180,
        render: (_: any, record: Material) => (
            <div style={{ whiteSpace: 'nowrap' }}>
                <Space size={4}>
                    <Tooltip title="重命名">
                        <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleRenameClick(record)} />
                    </Tooltip>
                    {(record.file_type === 'video' || record.file_type === 'audio') && (
                        <>
                            <Tooltip title="播放">
                                <Button type="link" size="small" icon={<PlayCircleOutlined />} onClick={async () => {
                                    try {
                                        await openFileWithPlayer(record.path);
                                    } catch (e) {
                                        await openPath(record.path);
                                    }
                                }} />
                            </Tooltip>
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
                        </>
                    )}
                    <Tooltip title="打开目录">
                        <Button type="link" size="small" icon={<FolderOpenOutlined />} onClick={() => handleOpenDirectory(record.path)} />
                    </Tooltip>
                    <Tooltip title="解除关联">
                        <Button type="link" size="small" danger icon={<CloseOutlined />} onClick={() => handleRemoveMaterial(record.id)} />
                    </Tooltip>
                </Space>
            </div>
        ),
    },
  ];

  const onRow = (record: Material) => ({
      onDoubleClick: async () => {
          if (record.file_type === 'video' || record.file_type === 'audio') {
              try {
                  await openFileWithPlayer(record.path);
              } catch (e) {
                  await openPath(record.path);
              }
          } else {
              handleOpenDirectory(record.path);
          }
      }
  });

  if (loading) return <Spin size="large" style={{ display: 'flex', justifyContent: 'center', marginTop: 100 }} />;
  if (!movie) return <div style={{ textAlign: 'center', marginTop: 100 }}>未找到该影视</div>;

  return (
    <div>
      <Breadcrumb style={{ marginBottom: 16 }} items={[
        { title: '影视库', onClick: () => navigate('/'), className: 'cursor-pointer' },
        { title: movie.title }
      ]} />

      <Card style={{ marginBottom: 24 }}>
        <Row gutter={24}>
            <Col span={4}>
                <LocalImage alt={movie.title} src={movie.poster_path} style={{ width: '100%', borderRadius: 8 }} />
            </Col>
            <Col span={20}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Title level={3}>{movie.title} <Text type="secondary" style={{ fontSize: 18 }}>{movie.original_title}</Text></Title>
                    <Space>
                        <Button icon={<LinkOutlined />} onClick={() => navigate(`/match/${movie.id}`)}>重新匹配</Button>
                        <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>编辑信息</Button>
                        <Button danger icon={<DeleteOutlined />} onClick={handleDeleteMovie}>删除影视</Button>
                    </Space>
                </div>
                <Text type="secondary">{movie.overview}</Text>
                
                {movie.actors && movie.actors.length > 0 && (
                    <div style={{ marginTop: 24, overflowX: 'auto', display: 'flex', gap: 16, paddingBottom: 8 }}>
                        {movie.actors.map((person, index) => (
                            <div 
                                key={`${person.id}-${index}`} 
                                style={{ flex: '0 0 auto', width: 80, textAlign: 'center', cursor: 'pointer' }}
                                onClick={() => navigate(`/?actorId=${person.id}&actorName=${encodeURIComponent(person.name)}`)}
                            >
                                <div 
                                    style={{ 
                                        width: 80, 
                                        height: 80, 
                                        borderRadius: '50%', 
                                        overflow: 'hidden', 
                                        marginBottom: 8,
                                        background: '#f0f0f0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'transform 0.2s',
                                    }}
                                    className="actor-avatar"
                                >
                                    <LocalImage src={person.profile_path} alt={person.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</div>
                            </div>
                        ))}
                    </div>
                )}

                <Row gutter={16} style={{ marginTop: 24 }}>
                    <Col span={4}><Statistic title="视频素材" value={materials.filter((m: Material) => m.file_type === 'video').length} /></Col>
                    <Col span={4}><Statistic title="图片素材" value={materials.filter((m: Material) => m.file_type === 'image').length} /></Col>
                    <Col span={4}><Statistic title="文档素材" value={materials.filter((m: Material) => m.file_type === 'doc').length} /></Col>
                    <Col span={4}><Statistic title="音频素材" value={materials.filter((m: Material) => m.file_type === 'audio').length} /></Col>
                </Row>
            </Col>
        </Row>
      </Card>

      <Card title="关联素材" extra={<Button type="link" icon={<ReloadOutlined />} loading={refreshingMaterials} onClick={handleRefreshMaterials}>刷新素材</Button>} style={{ marginTop: 24 }}>
        <Spin spinning={refreshingMaterials}>
            <Tabs 
                defaultActiveKey="video"
            items={[
                {
                    key: 'video',
                    label: '视频',
                    children: <Table dataSource={materials.filter((m: Material) => m.file_type === 'video')} columns={columns} rowKey="path" onRow={onRow} />
                },
                {
                    key: 'audio',
                    label: '音频',
                    children: <Table dataSource={materials.filter((m: Material) => m.file_type === 'audio')} columns={columns} rowKey="path" onRow={onRow} />
                },
                {
                    key: 'image',
                    label: '图片',
                    children: <Table dataSource={materials.filter((m: Material) => m.file_type === 'image')} columns={columns} rowKey="path" onRow={onRow} />
                },
                {
                    key: 'doc',
                    label: '文档',
                    children: <Table dataSource={materials.filter((m: Material) => m.file_type === 'doc')} columns={columns} rowKey="path" onRow={onRow} />
                },
                {
                    key: 'other',
                    label: '其他',
                    children: <Table dataSource={materials.filter((m: Material) => !['video', 'audio', 'image', 'doc'].includes(m.file_type))} columns={columns} rowKey="path" onRow={onRow} />
                }
            ]}
        />
        </Spin>
      </Card>

      <MovieEditModal
        visible={editing}
        movie={movie}
        onCancel={() => setEditing(false)}
        onSuccess={() => {
            setEditing(false);
            fetchDetails();
        }}
      />
      
      <Modal
          title="重命名 (自动保留后缀)"
          open={isRenamingModalVisible}
          onOk={handleRenameSubmit}
          onCancel={() => setIsRenamingModalVisible(false)}
          destroyOnHidden
      >
          <Space.Compact style={{ width: '100%' }}>
              <Input 
                  value={newFileName} 
                  onChange={(e) => setNewFileName(e.target.value)} 
                  placeholder="请输入新文件名"
              />
              <Button type="default" disabled style={{ color: 'rgba(0, 0, 0, 0.45)', cursor: 'default', backgroundColor: '#fafafa', borderColor: '#d9d9d9' }}>{fileExtension}</Button>
          </Space.Compact>
          <div style={{ marginTop: 8, color: '#999', fontSize: '12px' }}>
              原文件名: {renamingFile?.name}
          </div>
      </Modal>
    </div>
  );
};

export default MovieDetails;
