import React from 'react';
import { Button, Table, Input, Tag, message, theme } from 'antd';
import { FolderOpenOutlined, ReloadOutlined, CloudDownloadOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { open } from '@tauri-apps/plugin-dialog';
import { scanForMovies, searchTmdbMovies } from '../../services/api';

interface FolderScanProps {
  scannedFiles: any[];
  scanResults: any[];
  scanning: boolean;
  setScannedFiles: (files: any[]) => void;
  setScanResults: (results: any[]) => void;
  setScanning: (scanning: boolean) => void;
  onAdd: (movie: any) => Promise<void>;
}

const FolderScan: React.FC<FolderScanProps> = ({
  scannedFiles,
  scanResults,
  scanning,
  setScannedFiles,
  setScanResults,
  setScanning,
  onAdd
}) => {
  const { token } = theme.useToken();
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
      if (item.status === 'matched') continue;

      try {
        const data = await searchTmdbMovies(item.file.search_query);
        const matches = data.filter((m: any) => m.media_type === 'movie' || m.media_type === 'tv');
        if (matches && matches.length > 0) {
          newResults[i].match = matches[0];
          newResults[i].status = 'matched';
        } else {
          newResults[i].status = 'failed';
        }
      } catch (e) {
        console.error(`Failed to match ${item.file.name}`, e);
        newResults[i].status = 'failed';
      }
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
        const movieToAdd = {
          ...item.match,
          local_video_path: item.file.path
        };
        await onAdd(movieToAdd);
        successCount++;
      } catch (e) {
        console.error(`Failed to import ${item.file.name}`, e);
      }
    }
    message.success(`成功导入 ${successCount} 部影视`);
  };

  const handleManualSearch = async (index: number, query: string) => {
    try {
      const data = await searchTmdbMovies(query, 1);
      const matches = data.filter((m: any) => m.media_type === 'movie' || m.media_type === 'tv');
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        <Button icon={<FolderOpenOutlined />} onClick={handleSelectFolder} loading={scanning}>
          选择文件夹扫描
        </Button>
        <Button 
          type="primary" 
          icon={<ReloadOutlined />} 
          onClick={handleBatchMatch} 
          disabled={scannedFiles.length === 0} 
          loading={scanning}
        >
          开始自动匹配
        </Button>
        <Button 
          type="primary" 
          icon={<CloudDownloadOutlined />} 
          onClick={handleImportMatched} 
          disabled={scanResults.filter(r => r.status === 'matched').length === 0}
        >
          导入匹配项
        </Button>
        <span style={{ lineHeight: '32px', color: token.colorTextSecondary, marginLeft: 8 }}>
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
                  <div style={{ fontWeight: 'bold', color: token.colorText }}>{file.name}</div>
                  <div style={{ fontSize: 12, color: token.colorTextDescription }}>{file.path}</div>
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
                  <img 
                    src={getPosterUrl(match)} 
                    referrerPolicy="no-referrer"
                    style={{ width: 40, height: 60, objectFit: 'cover', borderRadius: 4 }} 
                  />
                  <div>
                    <div style={{ fontWeight: 'bold', color: token.colorText }}>{match.title || match.name}</div>
                    <div style={{ fontSize: 12, color: token.colorTextDescription }}>{match.release_date || match.first_air_date}</div>
                  </div>
                </div>
              ) : <span style={{ color: token.colorTextDisabled }}>等待匹配</span>
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
};

export default FolderScan;
