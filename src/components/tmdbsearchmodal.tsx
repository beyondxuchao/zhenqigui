import React, { useState } from 'react';
import { Modal, Tabs, App } from 'antd';
import { getTmdbDetails, searchTmdbMovies } from '../services/api';
import { TmdbMovie, Movie, TmdbSeason } from '../types';

// Sub-components
import SearchInput from './tmdb/SearchInput';
import ResultList from './tmdb/ResultList';
import SeasonSelector from './tmdb/SeasonSelector';
import FolderScan from './tmdb/FolderScan';

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
  
  // Season Selection State
  const [seasonModalVisible, setSeasonModalVisible] = useState(false);
  const [currentTvShow, setCurrentTvShow] = useState<any>(null);
  const [seasons, setSeasons] = useState<TmdbSeason[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(false);

  // Folder Scan State
  const [scannedFiles, setScannedFiles] = useState<any[]>([]);
  const [scanResults, setScanResults] = useState<any[]>([]); 
  const [scanning, setScanning] = useState(false);

  const handleAddClick = async (item: any) => {
    if (item.media_type === 'tv') {
      setCurrentTvShow(item);
      setSeasonModalVisible(true);
      setSeasonsLoading(true);
      try {
        const details = await getTmdbDetails(item.id, 'tv');
        if (details && details.seasons) {
          setSeasons(details.seasons);
        }
      } catch (error) {
        console.error('Fetch seasons failed:', error);
        message.error('获取剧集季度信息失败');
      } finally {
        setSeasonsLoading(false);
      }
    } else {
      onAdd(item);
    }
  };

  const handleSeasonSelect = (season: TmdbSeason) => {
    if (!currentTvShow) return;
    
    const baseName = currentTvShow.name || currentTvShow.title;
    const seasonSuffix = season.season_number === 0 ? '特别篇' : `第${season.season_number}季`;
    
    const itemWithSeason = {
      ...currentTvShow,
      season_number: season.season_number,
      name: `${baseName}${seasonSuffix}`,
      poster_path: season.poster_path || currentTvShow.poster_path,
      first_air_date: season.air_date || currentTvShow.first_air_date,
      overview: season.overview || currentTvShow.overview
    };
    
    onAdd(itemWithSeason);
    setSeasonModalVisible(false);
  };

  const handleSearch = async (values: any) => {
    if (!values.keyword) {
      message.warning('请输入关键词');
      return;
    }
    setLoading(true);
    try {
      const data = await searchTmdbMovies(values.keyword, 1);
      let filtered = data.filter((m: any) => m.media_type === 'movie' || m.media_type === 'tv');
      
      if (values.year) {
        filtered = filtered.filter((m: any) => (m.release_date || m.first_air_date)?.startsWith(values.year));
      }
      setResults(filtered);
    } catch (error: any) {
      console.error(error);
      const errorMsg = typeof error === 'string' ? error : error?.message || '搜索失败，请检查网络或配置';
      message.error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const onAddWithPromise = async (movie: any) => {
    return onAdd(movie);
  };

  return (
    <Modal
      title="新增影视"
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={1000}
      styles={{ body: { height: '70vh', display: 'flex', flexDirection: 'column', padding: 0 } }}
      destroyOnHidden={true}
    >
      <div style={{ padding: '16px 24px 0 24px' }}>
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
              setActiveTab(key);
              if (key !== 'folder') setResults([]);
          }}
          items={[
              { 
                label: 'TMDB 搜索', 
                key: 'tmdb',
              },
              { 
                label: '文件夹导入', 
                key: 'folder',
              },
          ]}
          style={{ marginBottom: 0 }}
          className="tmdb-modal-tabs"
        />
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: '0 24px 24px 24px' }}>
        {activeTab === 'tmdb' ? (
          <>
            <SearchInput onSearch={handleSearch} loading={loading} />
            <ResultList results={results} loading={loading} onAdd={handleAddClick} />
          </>
        ) : (
          <FolderScan 
            scannedFiles={scannedFiles}
            scanResults={scanResults}
            scanning={scanning}
            setScannedFiles={setScannedFiles}
            setScanResults={setScanResults}
            setScanning={setScanning}
            onAdd={onAddWithPromise}
          />
        )}
      </div>

      <SeasonSelector 
        visible={seasonModalVisible}
        tvShow={currentTvShow}
        seasons={seasons}
        loading={seasonsLoading}
        onCancel={() => setSeasonModalVisible(false)}
        onSelect={handleSeasonSelect}
      />
    </Modal>
  );
};

export default TmdbSearchModal;
