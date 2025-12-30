import React, { useState } from 'react';
import { Modal, Input, Button, Card, Select, Form, Row, Col, Tabs, Table, Tag, App } from 'antd';
import { SearchOutlined, FolderOpenOutlined, CloudDownloadOutlined, CheckCircleOutlined, CloseCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { searchTmdbMovies, fetchDoubanSubject, scanForMovies } from '../services/api';
import { TmdbMovie, Movie } from '../types';

const { Option } = Select;

interface TmdbSearchModalProps {
  visible: boolean;
  onCancel: () => void;
  onAdd: (movie: any) => void;
}

const TmdbSearchModal: React.FC<TmdbSearchModalProps> = ({ visible, onCancel, onAdd }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<(TmdbMovie | Movie)[]>([]);
  const [activeTab, setActiveTab] = useState('tmdb');
  
  // Folder Scan State
  const [scannedFiles, setScannedFiles] = useState<any[]>([]);
  const [scanResults, setScanResults] = useState<any[]>([]); // { file: ScannedFile, match: TmdbMovie | null, status: 'pending' | 'matched' | 'failed' }
  const [scanning, setScanning] = useState(false);

  const handleSearch = async (values: any) => {
    if (!values.keyword) {
      message.warning('请输入关键词');
      return;
    }
    setLoading(true);
    try {
      if (activeTab === 'tmdb') {
        const data = await searchTmdbMovies(values.keyword, 1);
        // Client-side filtering
        let filtered = data;
        
        // Filter by media type if selected
        if (values.type) {
             filtered = filtered.filter((m: any) => m.media_type === values.type);
        }

        if (values.year) {
          filtered = filtered.filter((m: any) => (m.release_date || m.first_air_date)?.startsWith(values.year));
        }
        setResults(filtered);
      } else {
        // Douban search
        let id = values.keyword;
        // Try to extract ID from URL
        const urlMatch = id.match(/subject\/(\d+)/);
        if (urlMatch) {
            id = urlMatch[1];
        }
        
        const movie = await fetchDoubanSubject(id, values.type === 'tv');
        setResults([movie]);
      }
    } catch (error: any) {
      console.error(error);
      const errorMsg = typeof error === 'string' ? error : error?.message || '搜索失败，请检查网络或配置';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFolder = async () => {
    try {
        const selected = await open({
            directory: true,
            multiple: false,
        });

        if (selected) {
            setScanning(true);
            const files = await scanForMovies([selected as string]);
            setScannedFiles(files);
            
            // Initialize scan results
            const initialResults = files.map(f => ({
                file: f,
                match: null,
                status: 'pending'
            }));
            setScanResults(initialResults);
            setScanning(false);
        }
    } catch (err) {
        console.error(err);
        message.error('扫描文件夹失败');
        setScanning(false);
    }
  };

  const handleBatchMatch = async () => {
      setScanning(true);
      const newResults = [...scanResults];
      
      for (let i = 0; i < newResults.length; i++) {
          const item = newResults[i];
          if (item.status === 'matched') continue; // Skip already matched

          try {
              const matches = await searchTmdbMovies(item.file.search_query);
              if (matches && matches.length > 0) {
                  // Prefer exact match if possible, otherwise first result
                  newResults[i].match = matches[0];
                  newResults[i].status = 'matched';
              } else {
                  newResults[i].status = 'failed';
              }
          } catch (e) {
              console.error(`Failed to match ${item.file.name}`, e);
              newResults[i].status = 'failed';
          }
          // Update UI periodically
          setScanResults([...newResults]);
      }
      setScanning(false);
  };

  const handleImportMatched = async () => {
      const matchedItems = scanResults.filter(r => r.status === 'matched' && r.match);
      if (matchedItems.length === 0) {
          message.warning('没有匹配成功的项目');
          return;
      }

      let successCount = 0;
      for (const item of matchedItems) {
          try {
              // Construct movie object same as manual add
              const tmdbItem = item.match;
              // We need to pass the local file path to onAdd/addMovie
              // But currently onAdd expects a TmdbMovie object.
              // Let's attach the local path to it
              const movieToAdd = {
                  ...tmdbItem,
                  local_video_path: item.file.path // Custom field we'll handle in Home.tsx
              };
              await onAdd(movieToAdd);
              successCount++;
          } catch (e) {
              console.error(`Failed to import ${item.file.name}`, e);
          }
      }
      message.success(`成功导入 ${successCount} 部影视`);
      // Optional: Clear or update list
  };

  const handleManualSearch = async (index: number, query: string) => {
      try {
          const matches = await searchTmdbMovies(query, 1);
          const newResults = [...scanResults];
          if (matches && matches.length > 0) {
              newResults[index].match = matches[0];
              newResults[index].status = 'matched';
          } else {
              message.warning('未找到匹配结果');
          }
          setScanResults(newResults);
      } catch (e) {
          message.error('搜索失败');
      }
  };

  const getPosterUrl = (item: any) => {
      if (!item.poster_path) return 'https://via.placeholder.com/300x450';
      if (item.poster_path.startsWith('http')) return item.poster_path;
      return `https://image.tmdb.org/t/p/w300${item.poster_path}`;
  };

  const renderFolderScan = () => (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
              <Button icon={<FolderOpenOutlined />} onClick={handleSelectFolder} loading={scanning}>
                  选择文件夹扫描
              </Button>
              <Button type="primary" icon={<ReloadOutlined />} onClick={handleBatchMatch} disabled={scannedFiles.length === 0} loading={scanning}>
                  开始自动匹配
              </Button>
              <Button type="primary" icon={<CloudDownloadOutlined />} onClick={handleImportMatched} disabled={scanResults.filter(r => r.status === 'matched').length === 0}>
                  导入匹配项
              </Button>
              <span style={{ lineHeight: '32px', color: '#666', marginLeft: 8 }}>
                  共找到 {scannedFiles.length} 个视频文件
              </span>
          </div>
          
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Table
                dataSource={scanResults}
                rowKey={(record) => record.file.path}
                pagination={false}
                size="small"
                columns={[
                    {
                        title: '文件名 / 搜索词',
                        dataIndex: 'file',
                        key: 'file',
                        render: (file, _, index) => (
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{file.name}</div>
                                <div style={{ fontSize: 12, color: '#999' }}>{file.path}</div>
                                <Input.Search 
                                    size="small" 
                                    defaultValue={file.search_query}
                                    onSearch={(value) => handleManualSearch(index, value)}
                                    style={{ marginTop: 4, maxWidth: 300 }}
                                    placeholder="修改搜索词重试"
                                />
                            </div>
                        )
                    },
                    {
                        title: '匹配结果',
                        dataIndex: 'match',
                        key: 'match',
                        render: (match) => match ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <img src={getPosterUrl(match)} style={{ width: 40, height: 60, objectFit: 'cover', borderRadius: 4 }} />
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{match.title || match.name}</div>
                                    <div style={{ fontSize: 12, color: '#999' }}>{match.release_date || match.first_air_date}</div>
                                </div>
                            </div>
                        ) : <span style={{ color: '#ccc' }}>等待匹配</span>
                    },
                    {
                        title: '状态',
                        dataIndex: 'status',
                        key: 'status',
                        width: 80,
                        render: (status) => {
                            if (status === 'matched') return <Tag color="success" icon={<CheckCircleOutlined />}>成功</Tag>;
                            if (status === 'failed') return <Tag color="error" icon={<CloseCircleOutlined />}>失败</Tag>;
                            return <Tag color="default">待定</Tag>;
                        }
                    }
                ]}
            />
          </div>
      </div>
  );

  return (
    <Modal
      title="新增影视"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={1000}
      styles={{ body: { height: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' } }}
      destroyOnHidden={true}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
            setActiveTab(key);
            if (key !== 'folder') setResults([]);
        }}
        items={[
            { label: 'TMDB 搜索', key: 'tmdb' },
            { label: '豆瓣添加', key: 'douban' },
            { label: '文件夹导入', key: 'folder' },
        ]}
        style={{ marginBottom: 16 }}
      />
      
      {activeTab === 'folder' ? renderFolderScan() : (
      <>
      <div style={{ marginBottom: 16 }}>
        <Form layout="inline" onFinish={handleSearch} style={{ width: '100%', display: 'flex' }}>
          <Form.Item name="keyword" style={{ flex: 1, marginRight: 8 }}>
            <Input 
                size="large" 
                prefix={<SearchOutlined />} 
                placeholder={activeTab === 'tmdb' ? "输入影视名称搜索..." : "输入豆瓣ID或链接..."} 
            />
          </Form.Item>
          <Form.Item style={{ marginRight: 8 }}>
            <Button type="primary" htmlType="submit" size="large" loading={loading} style={{ width: 80 }}>
              {activeTab === 'tmdb' ? '搜索' : '获取'}
            </Button>
          </Form.Item>
           {(activeTab === 'tmdb' || activeTab === 'douban') && (
               <Form.Item name="type" initialValue="movie">
                <Select size="large" style={{ width: 100 }}>
                    <Option value="movie">电影</Option>
                    <Option value="tv">剧集</Option>
                </Select>
              </Form.Item>
           )}
        </Form>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 4px' }}>
          <Row gutter={[16, 16]}>
            {results.map((item: any) => (
              <Col xs={24} sm={12} md={12} lg={12} xl={8} xxl={8} key={item.id}>
                <Card
                  hoverable
                  styles={{ body: { padding: 0 } }}
                  style={{ overflow: 'hidden', borderRadius: 8, border: '1px solid #f0f0f0' }}
                >
                    <div style={{ display: 'flex', height: 160 }}>
                        <div style={{ width: 106, flexShrink: 0 }}>
                            <img 
                                        alt={item.title || item.name} 
                                        src={getPosterUrl(item)} 
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                        referrerPolicy="no-referrer"
                                    />
                        </div>
                        <div style={{ flex: 1, padding: 12, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                            <div>
                                <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4, lineHeight: '1.2em', maxHeight: '2.4em', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }} title={item.title || item.name}>
                                    {item.title || item.name}
                                </div>
                                <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>
                                    {item.release_date || item.first_air_date || '未知年份'}
                                </div>
                                <div style={{ fontSize: 12, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.original_title || item.original_name}>
                                    原名: {item.original_title || item.original_name}
                                </div>
                            </div>
                            <Button type="primary" size="small" block onClick={() => onAdd(item)}>
                                添加到本地
                            </Button>
                        </div>
                    </div>
                </Card>
              </Col>
            ))}
            {results.length === 0 && !loading && (
                <div style={{ width: '100%', textAlign: 'center', marginTop: 40, color: '#999' }}>
                    {activeTab === 'tmdb' ? '请输入关键词搜索添加' : '请输入豆瓣ID或链接获取'}
                </div>
            )}
          </Row>
      </div>
      </>
      )}
    </Modal>
  );
};

export default TmdbSearchModal;
