import React from 'react';
import { Modal, Row, Col, Card, theme } from 'antd';
import { TmdbSeason } from '../../types';

interface SeasonSelectorProps {
  visible: boolean;
  tvShow: any;
  seasons: TmdbSeason[];
  loading: boolean;
  onCancel: () => void;
  onSelect: (season: TmdbSeason) => void;
}

const SeasonSelector: React.FC<SeasonSelectorProps> = ({ 
  visible, 
  tvShow, 
  seasons, 
  loading, 
  onCancel, 
  onSelect 
}) => {
  const { token } = theme.useToken();

  return (
    <Modal
      title={`选择季度 - ${tvShow?.name || tvShow?.title}`}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={850}
      styles={{ body: { maxHeight: '70vh', overflowY: 'auto', padding: '12px 24px' } }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px' }}>正在加载季度信息...</div>
      ) : (
        <Row gutter={[20, 20]}>
          {seasons.map((season) => (
            <Col span={12} key={season.id}>
              <Card 
                hoverable 
                size="default"
                onClick={() => onSelect(season)}
                styles={{ body: { padding: 12 } }}
              >
                <div style={{ display: 'flex', gap: 16 }}>
                  <img 
                    src={season.poster_path ? `https://image.tmdb.org/t/p/w185${season.poster_path}` : 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22185%22%20height%3D%22278%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20185%20278%22%20preserveAspectRatio%3D%22none%22%3E%3Crect%20width%3D%22185%22%20height%3D%22278%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%2214%22%20fill%3D%22%23aaa%22%3ENo%20Poster%3C%2Ftext%3E%3C%2Fsvg%3E'} 
                    alt={season.name}
                    style={{ width: 90, height: 135, objectFit: 'cover', borderRadius: 6, boxShadow: token.boxShadowSecondary }} 
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22185%22%20height%3D%22278%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20185%20278%22%20preserveAspectRatio%3D%22none%22%3E%3Crect%20width%3D%22185%22%20height%3D%22278%22%20fill%3D%22%23eee%22%2F%3E%3Ctext%20x%3D%2250%25%22%20y%3D%2250%25%22%20dominant-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20font-family%3D%22sans-serif%22%20font-size%3D%2214%22%20fill%3D%22%23aaa%22%3ENo%20Poster%3C%2Ftext%3E%3C%2Fsvg%3E';
                    }}
                  />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 8, color: token.colorText }}>{season.name}</div>
                    <div style={{ fontSize: 14, color: token.colorTextDescription, marginBottom: 4 }}>共 {season.episode_count} 集</div>
                    <div style={{ fontSize: 14, color: token.colorTextDisabled }}>首播日期: {season.air_date || '未知'}</div>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </Modal>
  );
};

export default SeasonSelector;
