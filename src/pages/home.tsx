import React, { useState, useEffect, useMemo, CSSProperties } from 'react';
import { Empty, Button, Card, Tag, Rate, Tooltip, Select, Space, message, Modal, Badge, Skeleton } from 'antd';
import { PlusOutlined, EditOutlined, FolderOpenOutlined, DeleteOutlined, ExclamationCircleOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FixedSizeGrid as Grid } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import TmdbSearchModal from '../components/tmdbsearchmodal';
import MovieEditModal from '../components/movieeditmodal';
import LocalImage from '../components/localimage';
import { getMovies, deleteMovie, addMovie, updateMovieStatus, autoMatchMovie } from '../services/api';
import { Movie } from '../types';
import { useApp } from '../context/appcontext';

const { Meta } = Card;
const { Option } = Select;

interface MovieCellData {
    movies: Movie[];
    columnCount: number;
    navigate: (path: string) => void;
    handleToggleStatus: (movie: Movie) => void;
    setEditingMovie: (movie: Movie) => void;
    handleDelete: (id: number) => void;
}

interface MovieCellProps {
    columnIndex: number;
    rowIndex: number;
    style: CSSProperties;
    data: MovieCellData;
}

const MovieCell: React.FC<MovieCellProps> = ({ columnIndex, rowIndex, style, data }) => {
    const { movies, columnCount, navigate, handleToggleStatus, setEditingMovie, handleDelete } = data;
    const index = rowIndex * columnCount + columnIndex;
    
    if (index >= movies.length) {
        return <div style={style} />;
    }

    const item = movies[index];
    
    return (
        <div style={style}>
            <div style={{ 
                position: 'absolute',
                top: 6,
                left: 6,
                right: 6,
                bottom: 6
            }}>
            <Badge.Ribbon 
                text="已制作" 
                color="green" 
                style={{ display: item.production_status === 'made' ? 'block' : 'none' }}
            >
            <Card
                hoverable
                cover={<LocalImage alt={item.title} src={item.poster_path} style={{ width: '100%', aspectRatio: '2/3', objectFit: 'cover' }} />}
                actions={[
                    <Tooltip title={item.production_status === 'made' ? "标记为未制作" : "标记为已制作"}>
                        <Button 
                            type="text" 
                            size="small" 
                            icon={item.production_status === 'made' ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CheckCircleOutlined />} 
                            onClick={(e) => { e.stopPropagation(); handleToggleStatus(item); }} 
                        />
                    </Tooltip>,
                    <Tooltip title="编辑"><Button type="text" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); setEditingMovie(item); }} /></Tooltip>,
                    <Tooltip title="匹配素材"><Button type="text" size="small" icon={<FolderOpenOutlined />} onClick={(e) => { e.stopPropagation(); navigate(`/match/${item.id}`); }} /></Tooltip>,
                    <Tooltip title="删除"><Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }} /></Tooltip>
                ]}
                styles={{ body: { padding: 8 } }}
                onClick={() => navigate(`/details/${item.id}`)}
            >
            <Meta
                title={<div title={item.title} style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</div>}
                description={
                <div style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Tag color="blue" style={{ margin: 0, fontSize: 10, lineHeight: '18px', padding: '0 4px' }}>{item.release_date?.split('-')[0] || '未知'}</Tag>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <Rate disabled defaultValue={(item.vote_average || 0) / 2} style={{ fontSize: 10, marginRight: 4 }} count={1} />
                            <span style={{ fontSize: 10, color: '#fadb14' }}>{item.vote_average?.toFixed(1) || '0.0'}</span>
                        </div>
                    </div>
                </div>
                }
            />
            </Card>
            </Badge.Ribbon>
            </div>
        </div>
    );
};

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const actorNameParam = searchParams.get('actorName');
  const genreParam = searchParams.get('genre');
  
  const { searchQuery } = useApp();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalVisible, setIsAddModalVisible] = useState(false);
  const [editingMovie, setEditingMovie] = useState<Movie | null>(null);
  const [sortOrder, setSortOrder] = useState('latest');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
      if (genreParam) {
          setGenreFilter(genreParam);
      } else {
          setGenreFilter(null);
      }
  }, [genreParam]);


  const loadMovies = async () => {
    setLoading(true);
    try {
      const data = await getMovies();
      setMovies(data);
    } catch (error) {
      console.error('Failed to load movies:', error);
      // message.error('加载影视库失败'); // Avoid initial error flash if backend not ready
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMovies();
  }, []);

  const allGenres = useMemo(() => {
      const genres = new Set<string>();
      movies.forEach(m => {
          if (m.genres) {
              m.genres.forEach(g => genres.add(g));
          }
      });
      return Array.from(genres).sort();
  }, [movies]);

  const filteredMovies = useMemo(() => {
    let result = [...movies];
    
    // Filter by Category
    if (categoryFilter !== 'all') {
        result = result.filter(m => m.category === categoryFilter);
    }

    // Filter by Status
    if (statusFilter !== 'all') {
        if (statusFilter === 'made') {
            result = result.filter(m => m.production_status === 'made');
        } else if (statusFilter === 'unmade') {
            result = result.filter(m => !m.production_status || m.production_status === 'unmade' || m.production_status === 'pending');
        }
    }

    // Filter by Genre
    if (genreFilter) {
        result = result.filter(m => m.genres?.includes(genreFilter));
    }

    // Filter by Actor
    if (actorNameParam) {
        result = result.filter(m => 
            m.actors?.some(a => a.name === actorNameParam)
        );
    }

    // Filter by search query
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter(m => 
        m.title.toLowerCase().includes(lowerQuery) || 
        (m.original_title && m.original_title.toLowerCase().includes(lowerQuery)) ||
        (m.overview && m.overview.toLowerCase().includes(lowerQuery))
      );
    }

    // Sort
    if (sortOrder === 'latest') {
        // Assume higher ID is later, or sort by add_time if available and consistent
        result.sort((a, b) => b.id - a.id);
    } else if (sortOrder === 'rating_desc') {
        result.sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0));
    }

    return result;
  }, [movies, searchQuery, sortOrder, categoryFilter, genreFilter, actorNameParam, statusFilter]);

  const handleAddMovie = async (item: any) => {
    try {
      let newMovie: any;
      
      // Check if it's a pre-formatted Movie object (e.g. from Douban, id is 0)
      if (item.id === 0) {
          newMovie = { ...item };
          // Ensure add_time is set
          if (!newMovie.add_time) {
              newMovie.add_time = new Date().toISOString().split('T')[0];
          }
      } else {
          // It's a TmdbMovie object
          newMovie = {
            tmdb_id: item.id,
            title: item.title || item.name || '未知标题',
            original_title: item.original_title || item.original_name,
            overview: item.overview,
            poster_path: item.poster_path ? (item.poster_path.startsWith('http') ? item.poster_path : `https://image.tmdb.org/t/p/w500${item.poster_path}`) : undefined,
            release_date: item.release_date || item.first_air_date,
            vote_average: item.vote_average,
            category: item.media_type || 'movie',
            add_time: new Date().toISOString().split('T')[0],
            id: 0,
            local_video_path: item.local_video_path // Handle local path from folder scan
          };
      }

      const addedMovie = await addMovie(newMovie);
      message.success('已添加到本地影视库，正在后台匹配素材...');
      setIsAddModalVisible(false);
      loadMovies();
      
      // Trigger auto-match in background
      if (addedMovie && addedMovie.id) {
          try {
              await autoMatchMovie(addedMovie.id);
              console.log('Auto match completed for', addedMovie.title);
              // Optionally reload movies to show matched count if UI supports it
              loadMovies(); 
          } catch (e) {
              console.error('Auto match failed:', e);
          }
      }
    } catch (error) {
      console.error(error);
      message.error(typeof error === 'string' ? error : '添加失败');
    }
  };

  const handleDelete = (id: number) => {
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: '确定要删除这部影视吗？此操作不可恢复。',
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
            try {
              await deleteMovie(id);
              
              // Update local state to avoid flash
              setMovies(prevMovies => prevMovies.filter(m => m.id !== id));
              
              message.success('删除成功');
            } catch (error) {
              message.error('删除失败');
            }
          },
    });
  };

  const clearActorFilter = () => {
    setSearchParams({});
  };

  const handleGenreChange = (value: string) => {
      if (value === 'all') {
          setSearchParams({});
          setGenreFilter(null);
      } else {
          setSearchParams({ genre: value });
      }
  };

  const handleToggleStatus = async (movie: Movie) => {
      try {
          const newStatus = movie.production_status === 'made' ? 'unmade' : 'made';
          // Use the dedicated status update API to avoid side effects (like image re-downloading)
          await updateMovieStatus(movie.id, newStatus);
          
          const updatedMovie = { ...movie, production_status: newStatus };
          
          // Update local state to avoid reloading list and causing flash
          setMovies(prevMovies => prevMovies.map(m => m.id === movie.id ? updatedMovie : m));
          
          message.success(newStatus === 'made' ? '已标记为制作完成' : '已标记为未制作');
      } catch (error) {
          console.error(error);
          message.error('状态更新失败');
      }
  };

  const getColumnCount = (width: number) => {
    // Adjust column count to make cards smaller (target width ~140px)
    const minColumnWidth = 140;
    const cols = Math.floor(width / minColumnWidth);
    return Math.max(2, cols);
  };


  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
            {actorNameParam && (
                <Tag 
                    closable 
                    onClose={clearActorFilter} 
                    color="blue" 
                    style={{ fontSize: 14, padding: '4px 10px' }}
                >
                    演员: {actorNameParam}
                </Tag>
            )}
            {genreFilter && (
                <Tag 
                    closable 
                    onClose={() => handleGenreChange('all')} 
                    color="green" 
                    style={{ fontSize: 14, padding: '4px 10px' }}
                >
                    类型: {genreFilter}
                </Tag>
            )}
        </Space>
        <Space>
            <Select 
                placeholder="按类型筛选" 
                style={{ width: 120 }} 
                allowClear 
                onChange={handleGenreChange}
                value={genreFilter || undefined}
            >
                <Option value="all">全部类型</Option>
                {allGenres.map(g => (
                    <Option key={g} value={g}>{g}</Option>
                ))}
            </Select>
            <Select defaultValue="all" style={{ width: 100 }} onChange={setCategoryFilter}>
                <Option value="all">全部类型</Option>
                <Option value="movie">电影</Option>
                <Option value="tv">剧集</Option>
            </Select>
            <Select defaultValue="all" style={{ width: 100 }} onChange={setStatusFilter}>
                <Option value="all">全部状态</Option>
                <Option value="made">已制作</Option>
                <Option value="unmade">未制作</Option>
            </Select>
            <Select defaultValue="latest" style={{ width: 120 }} onChange={setSortOrder}>
                <Option value="latest">最新添加</Option>
                <Option value="rating_desc">评分最高</Option>
            </Select>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsAddModalVisible(true)}>
            新增影视
            </Button>
        </Space>
      </div>
      
      <div style={{ flex: 1, minHeight: 0 }}>
        <AutoSizer>
          {({ width, height }) => {
            if (!width || !height) return null;

            if (loading) {
              const availableWidth = width - 18;
              const columnCount = getColumnCount(availableWidth);
              const skeletonCount = columnCount * 3;
              
              return (
                <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: `repeat(${columnCount}, 1fr)`, 
                    paddingRight: 18, 
                    boxSizing: 'border-box',
                    width,
                    height,
                    overflow: 'hidden'
                }}>
                    {Array.from({ length: skeletonCount }).map((_, index) => (
                        <div key={index} style={{ padding: 6 }}>
                            <Card styles={{ body: { padding: 8 } }}>
                                <div style={{ width: '100%', aspectRatio: '2/3', marginBottom: 8, overflow: 'hidden', borderRadius: 4 }}>
                                    <Skeleton.Button active block style={{ width: '100%', height: '100%' }} shape="square" />
                                </div>
                                <Skeleton active paragraph={{ rows: 1, width: '60%' }} title={{ width: '90%' }} />
                            </Card>
                        </div>
                    ))}
                </div>
              );
            }

            if (filteredMovies.length === 0) {
              return (
                <div style={{ width, height, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <Empty
                        description={searchQuery ? <span>未找到匹配的影视</span> : <span>暂无影视数据，请先添加</span>}
                    >
                        {!searchQuery && <Button type="primary" onClick={() => setIsAddModalVisible(true)}>立即添加</Button>}
                    </Empty>
                </div>
              );
            }

            const scrollbarWidth = 18; // Reserve space for scrollbar to avoid overlap
            const availableWidth = width - scrollbarWidth;
            const columnCount = getColumnCount(availableWidth);
            const columnWidth = availableWidth / columnCount;
            const rowCount = Math.ceil(filteredMovies.length / columnCount);
            // Calculate row height based on aspect ratio + metadata height (reduced for compactness)
            let rowHeight = ((columnWidth - 12) * 1.5) + 130; 
            
            // Safety check
            if (Number.isNaN(rowHeight) || rowHeight <= 0) {
                rowHeight = 450;
            }

            const itemData = {
                movies: filteredMovies,
                columnCount,
                navigate,
                handleToggleStatus,
                setEditingMovie,
                handleDelete
            };

            return (
              <Grid
                columnCount={columnCount}
                columnWidth={columnWidth}
                height={height}
                rowCount={rowCount}
                rowHeight={rowHeight}
                width={width}
                itemData={itemData}
              >
                {MovieCell}
              </Grid>
            );
          }}
        </AutoSizer>
      </div>
      
      <TmdbSearchModal 
        visible={isAddModalVisible} 
        onCancel={() => setIsAddModalVisible(false)}
        onAdd={handleAddMovie}
      />

      <MovieEditModal
        visible={!!editingMovie}
        movie={editingMovie}
        onCancel={() => setEditingMovie(null)}
        onSuccess={() => {
            setEditingMovie(null);
            loadMovies();
        }}
      />
    </div>
  );
};

export default Home;
