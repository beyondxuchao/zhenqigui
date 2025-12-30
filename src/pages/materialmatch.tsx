import React, { useState, useEffect } from 'react';
import { Typography, Button, Table, Tag, Space, Badge, Input, Empty, App } from 'antd';
import { SearchOutlined, LinkOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getMovies } from '../services/api';
import { Movie } from '../types';
import MatchDetail from '../components/matchdetail';
import { formatFileSize } from '../utils/format';

const { Text } = Typography;

const MaterialMatch: React.FC = () => {
  const { message } = App.useApp();
  const { id } = useParams();
  const navigate = useNavigate();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');

  useEffect(() => {
    if (!id) {
      loadMovies();
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
    </div>
  );
};

export default MaterialMatch;
