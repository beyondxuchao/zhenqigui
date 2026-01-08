import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, App, Flex, Progress, Typography, Space, Alert, Collapse, Form, Select, Slider, Row, Col, Input, Steps, Badge, Checkbox, Divider, Tooltip } from 'antd';
import { InboxOutlined, SoundOutlined, DownloadOutlined, FileOutlined, SettingOutlined, FolderOpenOutlined, PlayCircleOutlined, PauseCircleOutlined, ArrowLeftOutlined, ThunderboltOutlined, WarningOutlined, AudioOutlined } from '@ant-design/icons';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';

const { Text, Title } = Typography;

interface SeparatedStems {
  base_dir: string;
  files: string[];
}

interface AudioTrack {
    name: string;
    path: string;
    volume: number; // 0-100
    muted: boolean;
    solo: boolean;
    selected: boolean;
    url: string;
}

const StemSeparator: React.FC = () => {
  const { message } = App.useApp();
  
  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<'pending' | 'processing' | 'success' | 'error'>('pending');
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  
  // Editor State
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);

  // Advanced settings
  const [model, setModel] = useState<string>('htdemucs');
  const [shifts, setShifts] = useState<number>(1);
  const [twoStems] = useState<boolean>(false);

  const [envStatus, setEnvStatus] = useState<{
    python: boolean;
    ffmpeg: boolean;
    demucs: boolean;
    gpu: boolean;
    model_path?: string;
    checked: boolean;
  }>({ python: false, ffmpeg: false, demucs: false, gpu: false, checked: false });

  const pluginStatus = !envStatus.checked 
    ? 'checking' 
    : (envStatus.python && envStatus.demucs && envStatus.ffmpeg ? 'installed' : 'missing');

  useEffect(() => {
    checkEnvironment();
    // Re-check when settings might have changed (e.g. user set path)
    const interval = setInterval(checkEnvironment, 5000);

    const unlistenProgress = listen<number>('stem-separation-progress', (event) => {
      setProgress(event.payload);
    });

    const unlistenLog = listen<string>('stem-separation-log', (event) => {
      setLogs((prev) => [...prev, event.payload]);
    });

    const unlistenDrop = listen('tauri://drag-drop', (event) => {
        const payload = event.payload as { paths: string[] };
        if (payload.paths && payload.paths.length > 0) {
            handleFileSelect(payload.paths[0]);
        }
    });

    return () => {
      clearInterval(interval);
      unlistenProgress.then((f) => f());
      unlistenLog.then((f) => f());
      unlistenDrop.then((f) => f());
    };
  }, []);

  // --- Logic Handlers ---

  const checkEnvironment = async () => {
    try {
      const status = await invoke<{
          python: boolean;
          ffmpeg: boolean;
          demucs: boolean;
          gpu: boolean;
          model_path: string;
      }>('check_ai_environment');
      setEnvStatus({ ...status, checked: true });
    } catch (err) {
      console.error('Failed to check environment:', err);
      message.error('环境检测失败');
    }
  };
  
  const handleInstallPlugin = async () => {
    if (!envStatus.python) {
        message.warning('请先安装 Python 3.8+ 并确保添加到 PATH');
        return;
    }
    
    setIsInstalling(true);
    setLogs(['正在开始安装 Demucs...']);
    try {
      await invoke('install_demucs');
      message.success('Demucs 安装成功');
      checkEnvironment();
    } catch (err) {
      console.error('Installation failed:', err);
      message.error('安装失败: ' + err);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleFileSelect = (path: string) => {
      const name = path.split(/[/\\]/).pop() || path;
      setFile({ path, name, size: 0 }); 
      
      let parentDir = path.substring(0, path.lastIndexOf(name));
      if (parentDir.length > 3 && (parentDir.endsWith('/') || parentDir.endsWith('\\'))) {
          parentDir = parentDir.substring(0, parentDir.length - 1);
      }
      setOutputDir(parentDir);

      setProgress(0);
      setLogs([]);
      setProcessStatus('pending');
      message.success(`已选择文件: ${name}`);
  };

  const handleSelectOutputDir = async () => {
      try {
          const selected = await open({
              directory: true,
              multiple: false,
              title: '选择输出文件夹',
              defaultPath: outputDir || undefined
          });
          
          if (selected && typeof selected === 'string') {
              setOutputDir(selected);
          }
      } catch (err) {
          message.error('无法打开文件夹选择框');
      }
  };

  const handleOpenFileDialog = async () => {
      try {
          const selected = await open({
              multiple: false,
              filters: [{
                  name: 'Audio/Video',
                  extensions: ['mp3', 'wav', 'flac', 'mp4', 'mkv', 'mov', 'avi']
              }]
          });
          
          if (selected) {
              const path = typeof selected === 'string' ? selected : selected[0];
              handleFileSelect(path);
          }
      } catch (err) {
          console.error('Failed to open file dialog:', err);
          message.error('打开文件选择框失败');
      }
  };

  const handleProcess = async () => {
    if (!file) {
      message.warning('请先选择音频或视频文件');
      return;
    }

    if (!file.path) {
        message.error('无法获取文件路径');
        return;
    }

    let currentOutputDir = outputDir;
    if (!currentOutputDir) {
        const selected = await open({
            directory: true,
            multiple: false,
            title: '选择输出文件夹'
        });
        
        if (!selected) return;
        currentOutputDir = selected as string;
        setOutputDir(currentOutputDir);
    }

    setCurrentStep(1); // Move to processing step
    startSeparation(file.path, currentOutputDir);
  };

  const startSeparation = async (inputPath: string, outDir: string) => {
    setIsProcessing(true);
    setProcessStatus('processing');
    setProgress(0);
    setLogs([]);
    
    try {
      const result = await invoke<SeparatedStems>('run_stem_separation', {
        inputPath: inputPath,
        outputDir: outDir,
        model: model,
        shifts: shifts,
        twoStems: twoStems ? 'vocals' : null
      });
      message.success('分离完成！');
      setProgress(100);
      setProcessStatus('success');
      
      // Initialize editor
      const newTracks: AudioTrack[] = result.files.map(file => {
          const name = file.split(/[/\\]/).pop()?.split('.')[0] || 'unknown';
          return {
              name,
              path: file,
              volume: 100,
              muted: false,
              solo: false,
              selected: true,
              url: convertFileSrc(file)
          };
      });
      
      // Sort tracks
      const order = ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'];
      newTracks.sort((a, b) => {
          const ia = order.indexOf(a.name);
          const ib = order.indexOf(b.name);
          if (ia === -1 && ib === -1) return a.name.localeCompare(b.name);
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
      });

      setTracks(newTracks);
      setCurrentStep(2); // Move to editor step
      setIsPlaying(false);

    } catch (error) {
      console.error('Separation failed:', error);
      message.error('处理失败: ' + error);
      setProcessStatus('error');
      // Do NOT reset step to 0, so user can see logs
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Audio Control Logic ---

  const handleTogglePlay = () => {
      const playing = !isPlaying;
      setIsPlaying(playing);
      
      const currentTime = audioRefs.current[0]?.currentTime || 0;
      
      audioRefs.current.forEach(audio => {
          if (audio) {
              if (playing) {
                  audio.currentTime = currentTime;
                  audio.play().catch(e => console.error(e));
              } else {
                  audio.pause();
              }
          }
      });
  };
  
  const handleTrackChange = (index: number, changes: Partial<AudioTrack>) => {
      const newTracks = [...tracks];
      const oldTrack = newTracks[index];
      
      // Handle Solo Logic Exclusive
      if (changes.solo !== undefined) {
          if (changes.solo) {
              // Un-solo others
              newTracks.forEach((t, i) => {
                  if (i !== index) t.solo = false;
              });
          }
      }

      newTracks[index] = { ...oldTrack, ...changes };
      setTracks(newTracks);
      
      updateAudioStates(newTracks);
  };

  const updateAudioStates = (currentTracks: AudioTrack[]) => {
      const hasSolo = currentTracks.some(t => t.solo);
      
      currentTracks.forEach((track, idx) => {
          const audio = audioRefs.current[idx];
          if (!audio) return;

          let effectiveVolume = track.volume / 100;
          
          if (track.muted) {
              effectiveVolume = 0;
          } else if (hasSolo) {
              effectiveVolume = track.solo ? track.volume / 100 : 0;
          }

          audio.volume = effectiveVolume;
      });
  };

  const handleMergeExport = async () => {
      const selectedTracks = tracks.filter(t => t.selected);
      if (selectedTracks.length === 0) {
          message.warning('请至少选择一个轨道进行导出');
          return;
      }
      
      try {
          const savePath = await save({
              filters: [{ name: 'Audio', extensions: ['wav', 'mp3'] }],
              defaultPath: 'merged_output.wav'
          });
          
          if (!savePath) return;
          
          const hasSolo = tracks.some(t => t.solo);

          const trackConfigs = selectedTracks.map(t => {
              let vol = t.volume / 100;
              if (t.muted) vol = 0;
              if (hasSolo && !t.solo) vol = 0;
              
              return {
                  path: t.path,
                  volume: vol
              };
          });
          
          await invoke('merge_audio_stems', {
              tracks: trackConfigs,
              outputPath: savePath
          });
          
          message.success('合并导出成功！');
      } catch (err) {
          console.error('Export failed:', err);
          message.error('导出失败: ' + err);
      }
  };

  // --- UI Components ---

  const renderUploadStep = () => (
      <Flex vertical gap="large" style={{ width: '100%' }}>
          {/* Environment Warning Banner */}
          {pluginStatus === 'missing' && (
              <Alert
                  title="AI 组件缺失"
                  description={
                      <Flex vertical>
                          <Text>使用人声分离功能需要 Python 环境、FFmpeg 和 Demucs 库。</Text>
                          <Space wrap>
                              {!envStatus.python && (
                                  <Button size="small" type="primary" href="https://www.python.org/downloads/" target="_blank">
                                      去下载 Python
                                  </Button>
                              )}
                              {!envStatus.ffmpeg && (
                                  <Button size="small" type="primary" href="https://ffmpeg.org/download.html" target="_blank">
                                      去下载 FFmpeg
                                  </Button>
                              )}
                              {envStatus.python && !envStatus.demucs && (
                                  <Button size="small" type="primary" onClick={handleInstallPlugin} loading={isInstalling}>
                                      一键安装 Demucs
                                  </Button>
                              )}
                              <Text type="secondary" style={{ fontSize: 12 }}>
                                  检测状态: Python {envStatus.python ? '✅' : '❌'} | FFmpeg {envStatus.ffmpeg ? '✅' : '❌'} | Demucs {envStatus.demucs ? '✅' : '❌'}
                              </Text>
                          </Space>
                          {!envStatus.ffmpeg && <Text type="warning" style={{ fontSize: 12 }}>注意: 安装 FFmpeg 后需要将其 bin 目录添加到系统环境变量 Path 中并重启应用。</Text>}
                      </Flex>
                  }
                  type="warning"
                  showIcon
                  closable
                  icon={<WarningOutlined />}
              />
          )}

          {/* Upload Area */}
          <div 
              onClick={handleOpenFileDialog}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => { 
                  e.preventDefault(); 
                  setIsDragOver(false);
                  // Drop logic handled by tauri global listener, but good for visual feedback
              }}
              style={{ 
                  padding: '40px 20px', 
                  background: isDragOver ? 'rgba(22, 119, 255, 0.05)' : 'var(--ant-color-bg-container)', 
                  border: `2px dashed ${isDragOver ? '#1677ff' : '#d9d9d9'}`, 
                  borderRadius: 12,
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.3s'
              }}
          >
              <p style={{ fontSize: 48, color: isDragOver ? '#1677ff' : '#bfbfbf', marginBottom: 16 }}>
                  {file ? <FileOutlined /> : <InboxOutlined />}
              </p>
              {file ? (
                  <div>
                      <Title level={4} style={{ marginBottom: 4 }}>{file.name}</Title>
                      <Text type="secondary">点击更换文件</Text>
                  </div>
              ) : (
                  <div>
                      <Title level={4} style={{ marginBottom: 4 }}>点击或拖拽音频文件</Title>
                      <Text type="secondary">支持 MP3, WAV, MP4, MKV 等格式</Text>
                  </div>
              )}
          </div>

          {/* Configuration */}
          <Card size="small" title="参数设置" variant="borderless" style={{ background: 'var(--ant-color-bg-layout)' }}>
             <Form layout="vertical">
                <Row gutter={16}>
                    <Col span={24}>
                        <Form.Item label="输出目录">
                             <Space.Compact style={{ width: '100%' }}>
                                <Input value={outputDir} readOnly prefix={<FolderOpenOutlined style={{ color: '#bfbfbf' }}/>} />
                                <Button onClick={handleSelectOutputDir}>更改</Button>
                            </Space.Compact>
                        </Form.Item>
                    </Col>
                </Row>
                
                <Collapse ghost items={[{
                    key: 'advanced',
                    label: <Text type="secondary"><SettingOutlined /> 高级选项 (模型、质量)</Text>,
                    children: (
                        <Row gutter={16}>
                            <Col span={12}>
                                <Form.Item label="AI 模型" tooltip="仅 htdemucs_6s 支持分离吉他和钢琴">
                                    <Select value={model} onChange={setModel}>
                                        <Select.Option value="htdemucs">htdemucs (4轨: 标准速度)</Select.Option>
                                        <Select.Option value="htdemucs_6s">htdemucs_6s (6轨: 含吉他/钢琴)</Select.Option>
                                        <Select.Option value="htdemucs_ft">htdemucs_ft (4轨: 精细微调)</Select.Option>
                                        <Select.Option value="mdx_extra_q">mdx_extra_q (4轨: 高质量慢速)</Select.Option>
                                    </Select>
                                </Form.Item>
                            </Col>
                            <Col span={12}>
                                <Form.Item label="处理次数 (Shifts)" tooltip="增加次数可提高质量但会变慢">
                                    <Slider min={1} max={5} value={shifts} onChange={setShifts} />
                                </Form.Item>
                            </Col>
                            <Col span={24}>
                                 <Alert title={envStatus.gpu ? "GPU 加速已启用 (CUDA)" : "未检测到 GPU，将使用 CPU 模式 (较慢)"} type={envStatus.gpu ? "success" : "info"} showIcon style={{ padding: '4px 12px' }} />
                            </Col>
                        </Row>
                    )
                }]} />
             </Form>
          </Card>

          <Button 
            type="primary" 
            size="large" 
            block 
            icon={<ThunderboltOutlined />} 
            onClick={handleProcess}
            disabled={!file || pluginStatus !== 'installed' || isProcessing}
            loading={isProcessing}
            style={{ height: 48, fontSize: 16 }}
          >
              开始分离
          </Button>
      </Flex>
  );

  const renderProcessingStep = () => (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Progress 
            type="circle" 
            percent={progress} 
            size={160} 
            strokeColor={processStatus === 'error' ? '#ff4d4f' : { '0%': '#108ee9', '100%': '#87d068' }}
            status={processStatus === 'error' ? 'exception' : (processStatus === 'success' ? 'success' : 'active')} 
          />
          <div style={{ marginTop: 24, marginBottom: 24 }}>
              <Title level={4}>
                  {processStatus === 'processing' && '正在进行 AI 分离...'}
                  {processStatus === 'success' && '处理完成'}
                  {processStatus === 'error' && '处理失败'}
              </Title>
              <Text type="secondary">
                  {processStatus === 'error' ? '请查看下方日志以诊断问题' : '这可能需要几分钟，取决于文件长度和硬件配置'}
              </Text>
          </div>
          
          <div style={{ 
              background: '#1e1e1e', 
              color: '#d4d4d4', 
              padding: 16, 
              borderRadius: 8, 
              textAlign: 'left', 
              fontFamily: 'Consolas, Monaco, monospace', 
              fontSize: 12,
              height: 200,
              overflowY: 'auto',
              border: '1px solid #333'
          }}>
              {logs.map((log, i) => <div key={i}>{log}</div>)}
              {logs.length === 0 && <div style={{ color: '#666' }}>等待任务开始...</div>}
          </div>

          {processStatus === 'error' && (
              <Button type="primary" onClick={() => setCurrentStep(0)} style={{ marginTop: 24 }}>
                  返回重试
              </Button>
          )}
      </div>
  );

  const renderEditorStep = () => (
      <div>
          {/* Toolbar */}
          <Card variant="borderless" styles={{ body: { padding: '16px 24px', background: 'var(--ant-color-bg-layout)', borderRadius: 8 } }}>
              <Row align="middle" justify="space-between">
                  <Col>
                      <Space size="large">
                          <Button 
                            type="primary" 
                            shape="circle" 
                            size="large"
                            icon={isPlaying ? <PauseCircleOutlined /> : <PlayCircleOutlined />} 
                            onClick={handleTogglePlay}
                            style={{ width: 56, height: 56, fontSize: 24 }}
                          />
                          <div>
                              <Title level={5} style={{ margin: 0 }}>{file?.name || 'Audio Project'}</Title>
                              <Text type="secondary">{tracks.length} 轨道 • {model}</Text>
                          </div>
                      </Space>
                  </Col>
                  <Col>
                      <Space>
                        <Button onClick={() => setCurrentStep(0)} icon={<ArrowLeftOutlined />}>返回首页</Button>
                        <Button type="primary" icon={<DownloadOutlined />} onClick={handleMergeExport}>导出混音</Button>
                      </Space>
                  </Col>
              </Row>
          </Card>

          <Divider style={{ margin: '16px 0' }} />

          {/* Tracks Mixer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {tracks.map((track, index) => (
                  <div key={track.name}>
                      <Card styles={{ body: { padding: '12px 24px' } }} hoverable>
                          <Row align="middle" gutter={24}>
                              {/* Track Info */}
                              <Col span={4}>
                                  <Space>
                                    <Checkbox 
                                        checked={track.selected} 
                                        onChange={(e: any) => handleTrackChange(index, { selected: e.target.checked })}
                                    />
                                    <Badge color={track.muted ? 'grey' : 'green'} status="processing" />
                                    <Text strong style={{ textTransform: 'capitalize', fontSize: 16 }}>{track.name}</Text>
                                  </Space>
                              </Col>

                              {/* Controls */}
                              <Col span={14}>
                                  <Row gutter={16} align="middle">
                                      <Col span={18}>
                                          <Slider 
                                            value={track.volume} 
                                            min={0} max={100}
                                            disabled={track.muted || (tracks.some(t => t.solo) && !track.solo)}
                                            onChange={v => handleTrackChange(index, { volume: v })}
                                            trackStyle={{ background: '#1890ff' }}
                                          />
                                      </Col>
                                      <Col span={6}>
                                          <Text type="secondary">{track.volume}%</Text>
                                      </Col>
                                  </Row>
                              </Col>

                              {/* Mute/Solo Buttons */}
                              <Col span={6} style={{ textAlign: 'right' }}>
                                  <Space>
                                      <Tooltip title="独奏 (Solo)">
                                          <Button 
                                            type={track.solo ? 'primary' : 'default'} 
                                            danger={track.solo}
                                            shape="circle"
                                            icon={<Text strong style={{ color: track.solo ? '#fff' : 'inherit' }}>S</Text>}
                                            onClick={() => handleTrackChange(index, { solo: !track.solo })}
                                          />
                                      </Tooltip>
                                      <Tooltip title="静音 (Mute)">
                                          <Button 
                                            type={track.muted ? 'primary' : 'default'} 
                                            ghost={track.muted} // Filled when active? Antd type logic is weird, let's just use type default/primary
                                            style={{ borderColor: track.muted ? '#ff4d4f' : undefined, color: track.muted ? '#ff4d4f' : undefined, background: track.muted ? '#fff1f0' : undefined }}
                                            shape="circle"
                                            icon={<SoundOutlined />} 
                                            onClick={() => handleTrackChange(index, { muted: !track.muted })}
                                          />
                                      </Tooltip>
                                  </Space>
                              </Col>
                          </Row>
                          
                          {/* Hidden Audio Element */}
                          <audio 
                            ref={(el: HTMLAudioElement | null) => { audioRefs.current[index] = el; }} 
                            src={track.url} 
                            loop 
                          />
                      </Card>
                  </div>
              ))}
          </div>
      </div>
  );

  return (
    <Card 
        style={{ maxWidth: 1000, margin: '0 auto', minHeight: 600 }}
    >
      <Steps 
        current={currentStep} 
        items={[
            { title: '选择文件', icon: <FileOutlined /> },
            { title: 'AI 处理', icon: <ThunderboltOutlined /> },
            { title: '混音导出', icon: <AudioOutlined /> },
        ]}
        style={{ marginBottom: 40, maxWidth: 800, margin: '0 auto 40px auto' }}
      />

      <div style={{ minHeight: 400 }}>
          {currentStep === 0 && renderUploadStep()}
          {currentStep === 1 && renderProcessingStep()}
          {currentStep === 2 && renderEditorStep()}
      </div>
    </Card>
  );
};

export default StemSeparator;
