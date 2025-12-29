import React, { useEffect, useState, useMemo } from 'react';
import { Card, Row, Col, Statistic, Table, Progress, Typography, Spin, message } from 'antd';
import { 
  VideoCameraOutlined, 
  FileOutlined, 
  SoundOutlined, 
  PictureOutlined,
  HddOutlined,
  CheckCircleOutlined
} from '@ant-design/icons';
import { Movie, Material } from '../types';
import { invoke } from '@tauri-apps/api/core';

const { Title, Text } = Typography;

// Define types locally if not found
interface MovieData extends Movie {
    // Extend if necessary
}

const Statistics: React.FC = () => {
  const [movies, setMovies] = useState<MovieData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const data = await invoke<MovieData[]>('get_movies');
      setMovies(data);
    } catch (error) {
      console.error('Failed to fetch movies:', error);
      message.error('加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    let totalSize = 0;
    let madeCount = 0;
    let unmadeCount = 0;
    let pendingCount = 0;
    
    let videoCount = 0;
    let audioCount = 0;
    let imageCount = 0;
    let docCount = 0;

    const genreMap = new Map<string, number>();

    movies.forEach(m => {
        // Status
        if (m.production_status === 'made') madeCount++;
        else if (m.production_status === 'unmade') unmadeCount++;
        else pendingCount++;

        // Genres
        m.genres?.forEach(g => {
            genreMap.set(g, (genreMap.get(g) || 0) + 1);
        });

        // Materials
        m.materials?.forEach((mat: Material) => {
            // Size
            const size = parseInt(mat.size);
            if (!isNaN(size)) {
                totalSize += size;
            }

            // Type
            switch(mat.file_type) {
                case 'video': videoCount++; break;
                case 'audio': audioCount++; break;
                case 'image': imageCount++; break;
                case 'doc': docCount++; break;
            }
        });
    });

    const topGenres = Array.from(genreMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

    return {
        totalMovies: movies.length,
        totalSize,
        madeCount,
        unmadeCount,
        pendingCount,
        videoCount,
        audioCount,
        imageCount,
        docCount,
        topGenres
    };
  }, [movies]);

  const formatSize = (bytes: number) => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
      return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><Spin size="large" /></div>;
  }

  return (
    <div style={{ padding: '0 24px 24px 24px', overflowY: 'auto', height: '100%' }}>
      <Title level={2} style={{ marginBottom: 24 }}>统计概览</Title>
      
      {/* Top Summary Cards */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false}>
            <Statistic 
              title="影视总数" 
              value={stats.totalMovies} 
              prefix={<VideoCameraOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card bordered={false}>
            <Statistic 
              title="占用空间" 
              value={formatSize(stats.totalSize)} 
              prefix={<HddOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
            <Card bordered={false}>
            <Statistic 
              title="素材总数" 
              value={stats.videoCount + stats.audioCount + stats.imageCount + stats.docCount} 
              prefix={<FileOutlined />} 
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
            <Card bordered={false}>
            <Statistic 
                title="已制作" 
                value={stats.madeCount} 
                suffix={`/ ${stats.totalMovies}`}
                prefix={<CheckCircleOutlined />} 
                valueStyle={{ color: '#3f8600' }}
            />
            </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
        {/* Production Status Distribution */}
        <Col xs={24} md={12}>
            <Card title="制作状态分布" bordered={false}>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text>已制作 ({stats.madeCount})</Text>
                        <Text>{Math.round(stats.madeCount / stats.totalMovies * 100) || 0}%</Text>
                    </div>
                    <Progress percent={Math.round(stats.madeCount / stats.totalMovies * 100)} strokeColor="#52c41a" showInfo={false} />
                </div>
                <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text>未制作 ({stats.unmadeCount})</Text>
                        <Text>{Math.round(stats.unmadeCount / stats.totalMovies * 100) || 0}%</Text>
                    </div>
                    <Progress percent={Math.round(stats.unmadeCount / stats.totalMovies * 100)} strokeColor="#faad14" showInfo={false} />
                </div>
                 {stats.pendingCount > 0 && (
                    <div style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <Text>待定 ({stats.pendingCount})</Text>
                            <Text>{Math.round(stats.pendingCount / stats.totalMovies * 100) || 0}%</Text>
                        </div>
                        <Progress percent={Math.round(stats.pendingCount / stats.totalMovies * 100)} strokeColor="#d9d9d9" showInfo={false} />
                    </div>
                )}
            </Card>
        </Col>

        {/* Material Types Distribution */}
        <Col xs={24} md={12}>
            <Card title="素材类型分布" bordered={false}>
                <Row gutter={[16, 16]}>
                    <Col span={12}>
                        <Statistic title="视频" value={stats.videoCount} prefix={<VideoCameraOutlined />} />
                    </Col>
                    <Col span={12}>
                        <Statistic title="音频" value={stats.audioCount} prefix={<SoundOutlined />} />
                    </Col>
                    <Col span={12}>
                        <Statistic title="图片" value={stats.imageCount} prefix={<PictureOutlined />} />
                    </Col>
                    <Col span={12}>
                        <Statistic title="文档" value={stats.docCount} prefix={<FileOutlined />} />
                    </Col>
                </Row>
            </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
          {/* Top Genres */}
          <Col xs={24}>
              <Card title="热门分类 Top 10" bordered={false}>
                  <Table 
                    dataSource={stats.topGenres} 
                    columns={[
                        { title: '分类名称', dataIndex: 'name', key: 'name' },
                        { title: '数量', dataIndex: 'count', key: 'count', sorter: (a, b) => a.count - b.count },
                        { 
                            title: '占比', 
                            key: 'percent', 
                            render: (_, record) => (
                                <Progress percent={Math.round(record.count / stats.totalMovies * 100)} size="small" />
                            )
                        }
                    ]}
                    rowKey="name"
                    pagination={false}
                    size="small"
                  />
              </Card>
          </Col>
      </Row>
    </div>
  );
};

export default Statistics;
