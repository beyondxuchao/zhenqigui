import React from 'react';
import { Row, Col, Card, Button, theme } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface ResultListProps {
  results: any[];
  loading: boolean;
  onAdd: (item: any) => void;
}

const ResultList: React.FC<ResultListProps> = ({ results, loading, onAdd }) => {
  const { token } = theme.useToken();

  const getPosterUrl = (item: any) => {
    if (!item.poster_path) return 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22450%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20300%20450%22%20preserveAspectRatio%3D%22none%22%3E%3Crect%20width%3D%22300%22%20height%3D%22450%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20fill%3D%22%23aaa%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';
    if (item.poster_path.startsWith('http')) return item.poster_path;
    return `https://image.tmdb.org/t/p/w300${item.poster_path}`;
  };

  if (results.length === 0 && !loading) {
    return (
      <div style={{ width: '100%', textAlign: 'center', marginTop: 40, color: token.colorTextDisabled }}>
        请输入关键词搜索添加
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0 4px' }}>
      <Row gutter={[16, 16]}>
        {results.map((item: any) => (
          <Col xs={24} sm={12} md={12} lg={12} xl={8} xxl={8} key={item.id}>
            <Card
              hoverable
              styles={{ body: { padding: 0 } }}
              style={{ 
                overflow: 'hidden', 
                borderRadius: 10, 
                border: `1px solid ${token.colorBorderSecondary}`,
                transition: 'all 0.3s cubic-bezier(0.645, 0.045, 0.355, 1)'
              }}
            >
              <div style={{ display: 'flex', height: 170, position: 'relative' }}>
                <div style={{ width: 114, flexShrink: 0, position: 'relative' }}>
                  {item.media_type && (
                    <div style={{ 
                      position: 'absolute', 
                      top: 10, 
                      right: 10, 
                      padding: '2px 8px', 
                      borderRadius: 4, 
                      backgroundColor: item.media_type === 'movie' ? token.colorPrimary : token.colorSuccess, 
                      color: 'white',
                      fontSize: 12,
                      fontWeight: 'bold',
                      zIndex: 2,
                      boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                      {item.media_type === 'movie' ? '电影' : '剧集'}
                    </div>
                  )}
                  <img 
                    alt={item.title || item.name} 
                    src={getPosterUrl(item)} 
                    referrerPolicy="no-referrer"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22450%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20300%20450%22%20preserveAspectRatio%3D%22none%22%3E%3Crect%20width%3D%22300%22%20height%3D%22450%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%2220%22%20fill%3D%22%23aaa%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fsvg%3E';
                    }}
                  />
                </div>
                <div style={{ flex: 1, padding: '12px 14px', position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <div style={{ 
                    fontSize: 15, 
                    fontWeight: 600, 
                    marginBottom: 4, 
                    lineHeight: '1.4em', 
                    color: token.colorText,
                    maxHeight: '4.2em', 
                    overflow: 'hidden', 
                    textOverflow: 'ellipsis', 
                    display: '-webkit-box', 
                    WebkitLineClamp: 3, 
                    WebkitBoxOrient: 'vertical' 
                  }} title={item.title || item.name}>
                    {item.title || item.name}
                  </div>
                  <div style={{ fontSize: 12, color: token.colorTextDescription, marginBottom: 4 }}>
                    {item.release_date || item.first_air_date || '未知年份'}
                  </div>
                  {(item.original_title || item.original_name) && (item.original_title || item.original_name) !== (item.title || item.name) && (
                    <div style={{ 
                      fontSize: 12, 
                      color: token.colorTextDisabled, 
                      fontStyle: 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      maxWidth: '100%',
                      marginBottom: 36 // Reserve space for button
                    }}>
                      {item.original_title || item.original_name}
                    </div>
                  )}
                </div>
                <div style={{ position: 'absolute', bottom: 12, right: 14, zIndex: 5 }}>
                  <Button 
                    type="primary" 
                    size="small" 
                    icon={<PlusOutlined />}
                    onClick={() => onAdd(item)}
                    style={{ 
                      fontSize: '12px', 
                      borderRadius: '6px',
                      height: '28px',
                      padding: '0 10px'
                    }}
                  >
                    添加
                  </Button>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
};

export default ResultList;
