import React, { useEffect, useState } from 'react';
import { Typography, Card, Button, Table, Tag, Space, Breadcrumb, Statistic, Row, Col, Tabs, App, Spin, Tooltip, Input, Modal, Avatar, Progress, theme } from 'antd';
import { 
  EditOutlined, 
  DeleteOutlined, 
  DisconnectOutlined, 
  PlayCircleOutlined, 
  ExclamationCircleOutlined, 
  DragOutlined, 
  FolderOpenOutlined, 
  LinkOutlined, 
  ReloadOutlined, 
  InfoCircleOutlined, 
  CheckCircleOutlined, 
  CheckCircleFilled,
  CalendarOutlined,
  ClockCircleOutlined,
  StarFilled,
  TeamOutlined,
  RightOutlined
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { getMovieDetails, removeMaterialFromMovie, openFileWithPlayer, deleteMovie, updateMovie, getTmdbDetails, getTmdbSeasonDetails, openDirectory, renameFileDirect, refreshMovieMaterials, updateEpisodeStatus } from '../services/api';
import { Movie, Material, Person, Episode } from '../types';
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
  const { 
     token 
   } = theme.useToken();
  const { 
    colorPrimary, 
    colorText, 
    colorTextSecondary, 
    colorTextDisabled, 
    colorFillSecondary,
    colorBorderSecondary,
    colorSuccess,
    colorWarning
  } = token;
  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshingMaterials, setRefreshingMaterials] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renamingFile, setRenamingFile] = useState<Material | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [fileExtension, setFileExtension] = useState('');
  const [isRenamingModalVisible, setIsRenamingModalVisible] = useState(false);
  const [isEpisodesModalVisible, setIsEpisodesModalVisible] = useState(false);
  const [isCastModalVisible, setIsCastModalVisible] = useState(false);
  
  const fetchDetails = async (forceRefresh = false, quiet = false) => {
    if (!id) return;
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else if (!quiet) {
        setLoading(true);
      }

      let data = await getMovieDetails(parseInt(id));
      if (data) {
        // Render immediately with local data
        setMovie(data);
        if (!forceRefresh && !quiet) setLoading(false);

        // Check if we need to fetch missing metadata from TMDB in background
        // If forceRefresh is true, we always fetch from TMDB
        const needsUpdate = forceRefresh || (data.tmdb_id && (
            !data.runtime || 
            !data.genres || data.genres.length === 0 || 
            !data.actors || data.actors.length === 0 ||
            (data.category === 'tv' && (!data.episodes || data.episodes.length === 0))
        ));

        if (needsUpdate && data.tmdb_id) {
          const updateMetadata = async () => {
            try {
               const tmdbData = await getTmdbDetails(data.tmdb_id!, data.category || 'movie');
               
               let updated = false;
               
               if (tmdbData) {
                  // ... (existing cast/genres/runtime logic)
                  if (tmdbData.credits) {
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
                      
                      if (forceRefresh || !data.actors || data.actors.length === 0) {
                          data.actors = cast;
                          data.directors = crew;
                          updated = true;
                      }
                  }

                  if (tmdbData.genres && (forceRefresh || !data.genres || data.genres.length === 0)) {
                      data.genres = tmdbData.genres.map((g: any) => g.name);
                      updated = true;
                  }

                  if (tmdbData.runtime && (forceRefresh || !data.runtime)) {
                      data.runtime = tmdbData.runtime;
                      updated = true;
                  }

                  // NEW: Fetch episodes for TV shows
                  if (data.category === 'tv' && data.season_number !== undefined && data.season_number !== null) {
                      try {
                          const seasonData = await getTmdbSeasonDetails(data.tmdb_id!, data.season_number);
                          if (seasonData && seasonData.episodes) {
                              const episodes: Episode[] = seasonData.episodes.map((e: any) => ({
                                  id: e.id,
                                  episode_number: e.episode_number,
                                  name: e.name,
                                  overview: e.overview,
                                  air_date: e.air_date,
                                  runtime: e.runtime,
                                  still_path: e.still_path ? `https://image.tmdb.org/t/p/w300${e.still_path}` : undefined,
                                  vote_average: e.vote_average
                              }));
                              
                              // Check if we need to update episodes (if empty, force refresh, or missing vote_average)
                              const shouldUpdate = 
                                forceRefresh || 
                                !data.episodes || 
                                data.episodes.length === 0 ||
                                (data.episodes.length > 0 && data.episodes.some(e => e.vote_average === undefined));

                              if (shouldUpdate) {
                                  data.episodes = episodes;
                                  updated = true;
                              }
                          }
                      } catch (err) {
                          console.warn("Failed to fetch season details:", err);
                      }
                  }
               }

               if (updated) {
                   await updateMovie(data);
                   setMovie({...data}); // Update UI with new data
                   if (forceRefresh) message.success('元数据已更新');
               } else if (forceRefresh) {
                   message.info('已经是最新元数据');
               }
             } catch (e) {
               console.warn("Offline or TMDB fetch failed, using cached metadata:", e);
               if (forceRefresh) message.error('刷新失败，请检查网络连接');
            } finally {
              if (forceRefresh) setRefreshing(false);
            }
          };

          if (forceRefresh) {
            await updateMetadata();
          } else {
            updateMetadata(); // Background, don't await
          }
        } else if (forceRefresh) {
           setRefreshing(false);
           message.warning('该影视没有关联 TMDB ID，无法刷新');
        }
      }
    } catch (error) {
      console.error(error);
      message.error('获取详情失败');
      if (forceRefresh) setRefreshing(false);
      else if (!quiet) setLoading(false);
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
          
          // Update local state without full refresh
          const updatedMaterials = movie.materials?.filter(m => m.id !== materialId);
          setMovie({ ...movie, materials: updatedMaterials });
          
          message.success('已移除关联');
      } catch (e) {
          message.error('移除失败');
      }
  };

  const handleToggleEpisodeStatus = async (episode: Episode) => {
      if (!movie) return;
      const newStatus = episode.production_status === 'made' ? 'unmade' : 'made';
      try {
          await updateEpisodeStatus(movie.id, episode.id, newStatus);
          
          // Update local state
          const updatedEpisodes = movie.episodes?.map(e => {
              if (e.id === episode.id) {
                  return { ...e, production_status: newStatus };
              }
              return e;
          });
          setMovie({ ...movie, episodes: updatedEpisodes });
          
          message.success(`剧集状态已更新为: ${newStatus === 'made' ? '已制作' : '未制作'}`);
      } catch (e) {
          message.error('更新剧集状态失败: ' + e);
      }
  };

  const handleRefreshMaterials = async () => {
      if (!id || !movie) return;
      try {
          setRefreshingMaterials(true);
          await refreshMovieMaterials(parseInt(id));
          
          // Only fetch the updated movie data to get new materials list
          // This avoids the full fetchDetails background logic
          const updatedData = await getMovieDetails(parseInt(id));
          if (updatedData) {
              setMovie({
                  ...movie,
                  materials: updatedData.materials
              });
          }
          
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
    { title: '类别', dataIndex: 'category', key: 'category', width: 80, render: (text: string) => text === 'source' ? <Tag color="processing">原片</Tag> : text === 'finished' ? <Tag color="purple">成片</Tag> : '-' },
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
                        <Button type="link" size="small" danger icon={<DisconnectOutlined />} onClick={() => handleRemoveMaterial(record.id)} />
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

  const items = [
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
  ];

  return (
    <div>
      <Breadcrumb style={{ marginBottom: 16 }} items={[
        { 
          title: <span style={{ cursor: 'pointer' }}>影视库</span>, 
          onClick: () => navigate('/') 
        },
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
                        <Button icon={<ReloadOutlined spin={refreshing} />} onClick={() => fetchDetails(true)} loading={refreshing}>刷新元数据</Button>
                        <Button icon={<LinkOutlined />} onClick={() => navigate(`/match/${movie.id}`)}>重新匹配</Button>
                        <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>编辑信息</Button>
                        <Button danger icon={<DeleteOutlined />} onClick={handleDeleteMovie}>删除影视</Button>
                    </Space>
                </div>
                <div style={{ marginBottom: 12 }}>
                    <Space size={24} align="center">
                        {movie.release_date && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <CalendarOutlined style={{ color: colorPrimary }} />
                                <Text>{movie.release_date.split('-')[0]}</Text>
                            </div>
                        )}
                        {movie.category === 'tv' && movie.season_number !== undefined && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Tag color="warning" style={{ margin: 0 }}>第 {movie.season_number} 季</Tag>
                            </div>
                        )}
                        {movie.runtime && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <ClockCircleOutlined style={{ color: colorPrimary }} />
                                <Text>{movie.runtime} 分钟</Text>
                            </div>
                        )}
                        {movie.category === 'tv' && movie.episodes && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div 
                                    onClick={() => setIsEpisodesModalVisible(true)}
                                    style={{ 
                                        display: 'flex', 
                                        alignItems: 'center', 
                                        gap: 6, 
                                        cursor: 'pointer',
                                        padding: '2px 8px',
                                        borderRadius: 4,
                                        background: token.colorFillTertiary,
                                        transition: 'all 0.2s'
                                    }}
                                    className="info-hover-item"
                                >
                                    <InfoCircleOutlined style={{ color: colorPrimary }} />
                                    <Text>{movie.episodes.length} 集</Text>
                                </div>
                                {(() => {
                                    const madeCount = movie.episodes.filter(e => e.production_status === 'made').length;
                                    const percent = Math.round((madeCount / movie.episodes.length) * 100);
                                    return (
                                        <Tooltip title={`已制作: ${madeCount} / ${movie.episodes.length}`}>
                                            <div style={{ width: 100, display: 'flex', alignItems: 'center' }}>
                                                <Progress 
                                                    percent={percent} 
                                                    size="small" 
                                                    strokeColor={percent === 100 ? colorSuccess : colorPrimary}
                                                    showInfo={false}
                                                    style={{ marginBottom: 0 }}
                                                />
                                                <Text type="secondary" style={{ fontSize: 12, marginLeft: 8, whiteSpace: 'nowrap' }}>{percent}%</Text>
                                            </div>
                                        </Tooltip>
                                    );
                                })()}
                            </div>
                        )}
                        {movie.vote_average && (
                            <div style={{ 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: 8, 
                                background: token.colorWarningBg, 
                                padding: '4px 12px', 
                                borderRadius: 16,
                                border: `1px solid ${token.colorWarningBorder}`
                            }}>
                                <StarFilled style={{ color: colorWarning, fontSize: 16 }} />
                                <Text style={{ color: colorWarning, fontWeight: 'bold', fontSize: 16 }}>{movie.vote_average.toFixed(1)}</Text>
                            </div>
                        )}
                    </Space>
                </div>
                <div style={{ marginBottom: 16 }}>
                    <Space size={[0, 8]} wrap>
                        {movie.genres?.map(genre => (
                            <Tag key={genre} color="processing" style={{ borderRadius: 12, padding: '0 12px' }}>{genre}</Tag>
                        ))}
                    </Space>
                </div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>{movie.overview}</Text>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                    <Title level={4} style={{ margin: 0 }}>演职人员</Title>
                    <Button 
                        type="link" 
                        icon={<TeamOutlined />} 
                        onClick={() => setIsCastModalVisible(true)}
                        style={{ display: 'flex', alignItems: 'center' }}
                    >
                        查看全部 <RightOutlined style={{ fontSize: 12 }} />
                    </Button>
                </div>
                {movie.actors && movie.actors.length > 0 && (
                    <div style={{ overflowX: 'auto', display: 'flex', gap: 16, paddingBottom: 8 }}>
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
                                        background: colorFillSecondary,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        transition: 'transform 0.2s',
                                    }}
                                    className="actor-avatar"
                                >
                                    <LocalImage src={person.profile_path} alt={person.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: colorText }}>{person.name}</div>
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
          <Tabs 
              defaultActiveKey="video"
              items={items}
          />
      </Card>

      <Modal
          title={`${movie.title} - 第 ${movie.season_number} 季 剧集列表`}
          open={isEpisodesModalVisible}
          onCancel={() => setIsEpisodesModalVisible(false)}
          footer={null}
          width={800}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
          destroyOnHidden
      >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {movie.episodes && movie.episodes.map((episode) => (
                <div key={episode.id} style={{ display: 'flex', gap: 16, padding: '12px 0', borderBottom: `1px solid ${colorBorderSecondary}` }}>
                     <Avatar 
                          shape="square" 
                          size={100} 
                          src={episode.still_path} 
                          icon={<PlayCircleOutlined />}
                          style={{ borderRadius: 4, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                <Space>
                                    <Text strong>第 {episode.episode_number} 集：{episode.name}</Text>
                                    {episode.vote_average !== undefined && episode.vote_average > 0 && (
                                        <Text style={{ color: colorWarning, fontSize: '12px', fontWeight: 'bold' }}>
                                            ★ {episode.vote_average.toFixed(1)}
                                        </Text>
                                    )}
                                    <Tooltip title={episode.production_status === 'made' ? '标记为未制作' : '标记为已制作'}>
                                        <Button 
                                            type="link" 
                                            size="small" 
                                            icon={episode.production_status === 'made' ? <CheckCircleFilled style={{ color: colorSuccess }} /> : <CheckCircleOutlined />} 
                                            onClick={() => handleToggleEpisodeStatus(episode)}
                                        />
                                    </Tooltip>
                                </Space>
                                {episode.air_date && <Text type="secondary" style={{ fontSize: '12px' }}>{episode.air_date}</Text>}
                          </div>
                          <div>
                                <div style={{ marginBottom: 4 }}>
                                    {episode.runtime && <Tag>{episode.runtime} 分钟</Tag>}
                                </div>
                                <Text type="secondary" style={{ fontSize: '13px', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                    {episode.overview || '暂无剧情简介'}
                                </Text>
                          </div>
                      </div>
                </div>
            ))}
          </div>
      </Modal>

      <Modal
          title={`演职人员 - ${movie.title}`}
          open={isCastModalVisible}
          onCancel={() => setIsCastModalVisible(false)}
          footer={null}
          width={800}
          styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
          destroyOnHidden
      >
          <Row gutter={[16, 16]}>
              {[...(movie.directors || []), ...(movie.actors || [])].map((person: Person) => {
                  const isDirector = movie.directors?.some(d => d.id === person.id);
                  return (
                      <Col key={`${person.id}-${isDirector}`} xs={12} sm={8} md={6} lg={6} xl={4} xxl={4}>
                          <Card
                              hoverable
                              size="small"
                              cover={
                                  <div style={{ height: 180, overflow: 'hidden', background: colorFillSecondary }}>
                                      <LocalImage 
                                          src={person.profile_path} 
                                          alt={person.name} 
                                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                      />
                                  </div>
                              }
                          >
                              <Card.Meta 
                                  title={<div title={person.name} style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{person.name}</div>}
                                  description={isDirector ? <Tag color="warning">导演</Tag> : <Tag>演员</Tag>}
                              />
                          </Card>
                      </Col>
                  );
              })}
          </Row>
      </Modal>

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
              <Button type="default" disabled style={{ color: colorTextDisabled, cursor: 'default', backgroundColor: colorFillSecondary, borderColor: colorBorderSecondary }}>{fileExtension}</Button>
          </Space.Compact>
          <div style={{ marginTop: 8, color: colorTextSecondary, fontSize: '12px' }}>
              原文件名: {renamingFile?.name}
          </div>
      </Modal>
    </div>
  );
};

export default MovieDetails;
