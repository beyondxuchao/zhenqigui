import React, { useState, useEffect } from 'react';
import { Typography, Card, Button, Table, Tag, Space, Badge, Input, Modal, Progress, message, Empty } from 'antd';
import { SearchOutlined, RocketOutlined, CheckCircleOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getMovies, scanDirectories, addMaterialToMovie, getConfig } from '../services/api';
import { Movie, MatchedFile, Material } from '../types';
import MatchDetail from '../components/matchdetail';
import { formatFileSize } from '../utils/format';

const { Text } = Typography;

const MaterialMatch: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  // Batch Match State
  const [batchModalVisible, setBatchModalVisible] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchResults, setBatchResults] = useState<{ movie: Movie; matches: MatchedFile[] }[]>([]);
  const [folderConfig, setFolderConfig] = useState<{
    default: string[];
    source: string[];
    finished: string[];
  }>({ default: [], source: [], finished: [] });

  useEffect(() => {
    if (!id) {
      loadMovies();
      getConfig().then(config => {
        setFolderConfig({
            default: config.default_monitor_folders || [],
            source: config.monitor_folders_source || [],
            finished: config.monitor_folders_finished || []
        });
      });
    }
  }, [id]);

  const loadMovies = async () => {
    setLoading(true);
    try {
      const data = await getMovies();
      // Sort by ID desc
      data.sort((a, b) => b.id - a.id);
      setMovies(data);
    } catch (error) {
      message.error('加载影视列表失败');
    } finally {
      setLoading(false);
    }
  };

  if (id) {
    return <MatchDetail movieId={Number(id)} onBack={() => navigate('/match')} />;
  }

  const handleBatchMatch = async () => {
    const hasFolders = folderConfig.default.length > 0 || folderConfig.source.length > 0 || folderConfig.finished.length > 0;
    if (!hasFolders) {
        message.warning('请先配置监控文件夹（在设置或单个匹配页面）');
        return;
    }
    
    setBatchProcessing(true);
    setBatchProgress(0);
    setBatchResults([]);
    
    const results: { movie: Movie; matches: MatchedFile[] }[] = [];
    const total = movies.length;
    
    for (let i = 0; i < total; i++) {
        const movie = movies[i];
        const titles = [movie.title, movie.original_title].filter(t => t && t.trim().length > 0) as string[];
        try {
            // Use 80% threshold default
            const [defaultRes, sourceRes, finishedRes] = await Promise.all([
                folderConfig.default.length > 0 ? scanDirectories(folderConfig.default, titles, 80) : Promise.resolve([]),
                folderConfig.source.length > 0 ? scanDirectories(folderConfig.source, titles, 80) : Promise.resolve([]),
                folderConfig.finished.length > 0 ? scanDirectories(folderConfig.finished, titles, 80) : Promise.resolve([])
            ]);

            const allMatches: MatchedFile[] = [
                ...defaultRes.map(m => ({ ...m, category: undefined })),
                ...sourceRes.map(m => ({ ...m, category: 'source' })),
                ...finishedRes.map(m => ({ ...m, category: 'finished' }))
            ];

            if (allMatches.length > 0) {
                // Filter out already associated files? 
                // Currently scanDirectories returns all matches. 
                // We should probably check if path is already in movie.materials.
                const newMatches = allMatches.filter(m => !movie.materials?.some(mat => mat.path === m.path));
                
                // Deduplicate by path (in case same folder is in multiple lists)
                const uniqueMatches = Array.from(new Map(newMatches.map(item => [item.path, item])).values());

                if (uniqueMatches.length > 0) {
                    results.push({ movie, matches: uniqueMatches });
                }
            }
        } catch (e) {
            console.error(`Failed to scan for ${movie.title}`, e);
        }
        setBatchProgress(Math.round(((i + 1) / total) * 100));
    }
    
    setBatchResults(results);
    setBatchProcessing(false);
    if (results.length === 0) {
        message.info('未找到新的匹配素材');
    } else {
        message.success(`扫描完成，${results.length} 部影片发现新素材`);
    }
  };

  const handleBatchApply = async (movie: Movie, matches: MatchedFile[]) => {
      for (const file of matches) {
          try {
             const material: Material = {
                 id: file.key || Date.now().toString() + Math.random(),
                 name: file.name,
                 path: file.path,
                 size: file.size,
                 file_type: file.file_type,
                 category: file.category,
                 add_time: new Date().toISOString()
             };
             await addMaterialToMovie(movie.id, material);
          } catch (e) {
              console.error(e);
          }
      }
      message.success(`已关联 ${movie.title} 的 ${matches.length} 个素材`);
      // Update local state to remove from results
      setBatchResults(prev => prev.filter(r => r.movie.id !== movie.id));
      loadMovies(); // Refresh list to update counts
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      render: (text: string, record: Movie) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{text}</div>
          <div style={{ fontSize: 12, color: '#999' }}>{record.original_title}</div>
        </div>
      ),
    },
    {
      title: '已关联素材',
      key: 'materials',
      render: (_: any, record: Movie) => {
        const count = record.materials?.length || 0;
        return (
            <Badge count={count} showZero color={count > 0 ? 'green' : 'gray'} />
        );
      }
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Movie) => (
        <Button type="link" icon={<LinkOutlined />} onClick={() => navigate(`/match/${record.id}`)}>
          匹配
        </Button>
      ),
    },
  ];

  const filteredMovies = movies.filter(m => 
      m.title.toLowerCase().includes(searchText.toLowerCase()) || 
      (m.original_title && m.original_title.toLowerCase().includes(searchText.toLowerCase()))
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16 }}>
        <Space>
            <Input 
                placeholder="搜索影片" 
                prefix={<SearchOutlined />} 
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                style={{ width: 200 }}
            />
            <Button type="primary" icon={<RocketOutlined />} onClick={() => setBatchModalVisible(true)}>
                批量匹配
            </Button>
        </Space>
      </div>

      <Table 
        columns={columns} 
        dataSource={filteredMovies} 
        rowKey="id" 
        loading={loading}
        pagination={{ pageSize: 10 }}
        expandable={{
            expandedRowRender: (record) => (
                <div style={{ margin: 0 }}>
                    {record.materials && record.materials.length > 0 ? (
                        <Table 
                            dataSource={record.materials} 
                            rowKey="id" 
                            pagination={false}
                            size="small"
                            showHeader={false}
                            columns={[
                                { title: '文件名', dataIndex: 'name', key: 'name' },
                                { title: '类别', dataIndex: 'category', key: 'category', width: 80, render: (text: string) => text === 'source' ? <Tag color="blue">原片</Tag> : text === 'finished' ? <Tag color="purple">成片</Tag> : '-' },
                                { title: '路径', dataIndex: 'path', key: 'path', render: (text) => <Text type="secondary" style={{ fontSize: 12 }}>{text}</Text> },
                                { title: '大小', dataIndex: 'size', key: 'size', width: 100, render: (text) => <Text type="secondary" style={{ fontSize: 12 }}>{formatFileSize(text)}</Text> },
                                { title: '类型', dataIndex: 'file_type', key: 'file_type', width: 80, render: (text) => <Tag>{text}</Tag> }
                            ]} 
                        />
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无关联素材" />
                    )}
                </div>
            ),
            rowExpandable: () => true,
        }}
      />

      <Modal
        title="批量匹配"
        open={batchModalVisible}
        onCancel={() => !batchProcessing && setBatchModalVisible(false)}
        width={800}
        footer={null}
        destroyOnHidden
      >
        {!batchProcessing && batchResults.length === 0 && batchProgress === 0 && (
            <div style={{ textAlign: 'center', padding: 40 }}>
                <RocketOutlined style={{ fontSize: 48, color: '#1677ff', marginBottom: 16 }} />
                <p>将扫描所有监控文件夹，为库中所有影片寻找匹配素材。</p>
                <p style={{ color: '#999' }}>
                    监控文件夹: 通用({folderConfig.default.length}) / 原片({folderConfig.source.length}) / 成片({folderConfig.finished.length})
                </p>
                <Button type="primary" size="large" onClick={handleBatchMatch} disabled={!folderConfig.default.length && !folderConfig.source.length && !folderConfig.finished.length}>
                    开始扫描
                </Button>
            </div>
        )}

        {batchProcessing && (
            <div style={{ textAlign: 'center', padding: 40 }}>
                <Progress type="circle" percent={batchProgress} />
                <p style={{ marginTop: 16 }}>正在扫描中，请稍候...</p>
            </div>
        )}

        {!batchProcessing && batchResults.length > 0 && (
            <div>
                <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
                    <Text strong>扫描结果 ({batchResults.length} 部影片发现新素材)</Text>
                    {/* <Button type="primary">全部关联</Button> */}
                </div>
                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                    {batchResults.map(res => (
                        <Card key={res.movie.id} size="small" style={{ marginBottom: 8 }} title={res.movie.title} extra={
                            <Button type="link" size="small" onClick={() => handleBatchApply(res.movie, res.matches)}>
                                关联全部 ({res.matches.length})
                            </Button>
                        }>
                            {res.matches.map(m => (
                                <Tag key={m.path} color={m.similarity > 90 ? 'green' : 'orange'}>
                                    {m.name} ({m.similarity}%)
                                </Tag>
                            ))}
                        </Card>
                    ))}
                </div>
            </div>
        )}
        
        {!batchProcessing && batchResults.length === 0 && batchProgress === 100 && (
             <div style={{ textAlign: 'center', padding: 40 }}>
                <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
                <p>扫描完成，未发现新的匹配素材。</p>
                <Button onClick={() => setBatchModalVisible(false)}>关闭</Button>
            </div>
        )}
      </Modal>
    </div>
  );
};

export default MaterialMatch;
