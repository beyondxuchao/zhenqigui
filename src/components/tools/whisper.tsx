import React, { useState, useEffect } from 'react';
import { Card, Button, App, Flex, Progress, Typography, Space, Alert, Form, Select, Row, Col, Input, Steps } from 'antd';
import { FileOutlined, ThunderboltOutlined, FolderOpenOutlined, TranslationOutlined, AudioOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

const { Text, Title } = Typography;

interface WhisperEnv {
  python: boolean;
  ffmpeg: boolean;
  whisper: boolean;
  gpu: boolean;
  model_path: string;
}

const WhisperTool: React.FC = () => {
  const { message } = App.useApp();
  
  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState<{path: string, name: string} | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<'pending' | 'processing' | 'success' | 'error'>('pending');
  const [progress, setProgress] = useState(0); // This will be fake or based on log parsing if possible
  const [logs, setLogs] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState<string>('');
  
  // Settings
  const [model, setModel] = useState<string>('base');
  const [language, setLanguage] = useState<string>('auto');
  const [outputFormat, setOutputFormat] = useState<string>('srt');
  
  // Environment
  const [envStatus, setEnvStatus] = useState<WhisperEnv>({ 
      python: false, ffmpeg: false, whisper: false, gpu: false, model_path: '' 
  });
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    checkEnvironment();
    // Periodic check
    const interval = setInterval(checkEnvironment, 5000);

    const unlistenLog = listen<string>('whisper-log', (event) => {
      setLogs((prev) => [...prev, event.payload]);
    });

    const unlistenProgress = listen<number>('whisper-progress', (event) => {
        setProgress(event.payload);
    });

    return () => {
      clearInterval(interval);
      unlistenLog.then((f) => f());
      unlistenProgress.then((f) => f());
    };
  }, []);

  const checkEnvironment = async () => {
    try {
      const status = await invoke<WhisperEnv>('check_whisper_environment');
      setEnvStatus(status);
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
    setLogs(['正在开始安装 OpenAI Whisper...']);
    try {
      await invoke('install_whisper');
      message.success('Whisper 安装成功');
      checkEnvironment();
    } catch (err) {
      console.error('Installation failed:', err);
      message.error('安装失败: ' + err);
    } finally {
      setIsInstalling(false);
    }
  };

  const handleFileSelect = async () => {
    try {
        const selected = await open({
            multiple: false,
            filters: [{
                name: 'Media Files',
                extensions: ['mp3', 'wav', 'mp4', 'mkv', 'mov', 'flac', 'm4a']
            }]
        });
        
        if (selected) {
            const path = typeof selected === 'string' ? selected : selected[0];
            const name = path.split(/[/\\]/).pop() || path;
            setFile({ path, name });
            
            // Default output dir to source dir
            let parentDir = path.substring(0, path.lastIndexOf(name));
            if (parentDir.length > 3 && (parentDir.endsWith('/') || parentDir.endsWith('\\'))) {
                parentDir = parentDir.substring(0, parentDir.length - 1);
            }
            setOutputDir(parentDir);
            
            setLogs([]);
            setProgress(0);
            setProcessStatus('pending');
        }
    } catch (err) {
        message.error('打开文件失败');
    }
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

  const handleProcess = async () => {
    if (!file || !outputDir) return;
    
    setIsProcessing(true);
    setProcessStatus('processing');
    setCurrentStep(1);
    setLogs([]);
    setProgress(0);
    
    try {
      const resultPath = await invoke<string>('run_whisper', {
        inputPath: file.path,
        outputDir: outputDir,
        model: model,
        language: language === 'auto' ? null : language,
        outputFormat: outputFormat
      });
      
      message.success('字幕生成完成！');
      setProgress(100);
      setProcessStatus('success');
      setLogs(prev => [...prev, `输出文件: ${resultPath}`]);
    } catch (error) {
      console.error('Whisper failed:', error);
      message.error('处理失败: ' + error);
      setProcessStatus('error');
      // Do NOT reset step to 0, so user can see logs
    } finally {
      setIsProcessing(false);
    }
  };

  // --- UI Parts ---

  const renderConfigStep = () => (
    <Flex vertical gap="large" style={{ width: '100%' }}>
         {/* Environment Check */}
         {(!envStatus.whisper || !envStatus.python || !envStatus.ffmpeg) && (
            <Alert
                title="环境缺失"
                description={
                    <Flex vertical gap="small">
                        <Text>使用此功能需要 Python 环境、FFmpeg 和 OpenAI Whisper 库。</Text>
                        <Space wrap>
                            {!envStatus.python && (
                                <Button size="small" type="primary" href="https://www.python.org/downloads/" target="_blank">
                                    下载 Python
                                </Button>
                            )}
                            {!envStatus.ffmpeg && (
                                <Button size="small" type="primary" href="https://ffmpeg.org/download.html" target="_blank">
                                    下载 FFmpeg
                                </Button>
                            )}
                            {envStatus.python && !envStatus.whisper && (
                                <Button size="small" type="primary" onClick={handleInstallPlugin} loading={isInstalling}>
                                    一键安装 Whisper
                                </Button>
                            )}
                            <Text type="secondary">
                                Python {envStatus.python ? '✅' : '❌'} | 
                                FFmpeg {envStatus.ffmpeg ? '✅' : '❌'} | 
                                Whisper {envStatus.whisper ? '✅' : '❌'}
                            </Text>
                        </Space>
                        {!envStatus.ffmpeg && <Text type="warning" style={{ fontSize: 12 }}>注意: 安装 FFmpeg 后需要将其 bin 目录添加到系统环境变量 Path 中并重启应用。</Text>}
                    </Flex>
                }
                type="warning"
                showIcon
                closable
            />
         )}

         {/* File Selection */}
         <Card title="1. 选择文件" size="small" variant="borderless" styles={{ body: { background: 'var(--ant-color-bg-layout)', borderRadius: 8 } }}>
            <Flex vertical style={{ width: '100%' }}>
                <Space.Compact style={{ width: '100%' }}>
                    <Input value={file?.path} placeholder="请选择视频或音频文件..." readOnly prefix={<FileOutlined />} />
                    <Button type="primary" onClick={handleFileSelect}>浏览</Button>
                </Space.Compact>
            </Flex>
         </Card>

         {/* Configuration */}
         <Card title="2. 参数设置" size="small" variant="borderless" styles={{ body: { background: 'var(--ant-color-bg-layout)', borderRadius: 8 } }}>
             <Form layout="vertical">
                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item label="AI 模型大小" tooltip="模型越大越准，但也越慢">
                            <Select value={model} onChange={setModel}>
                                <Select.Option value="tiny">Tiny (极快/精度低)</Select.Option>
                                <Select.Option value="base">Base (快/一般)</Select.Option>
                                <Select.Option value="small">Small (平衡)</Select.Option>
                                <Select.Option value="medium">Medium (慢/高精度)</Select.Option>
                                <Select.Option value="large">Large (极慢/最高精度)</Select.Option>
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="源语言" tooltip="Auto 为自动检测">
                            <Select value={language} onChange={setLanguage}>
                                <Select.Option value="auto">自动检测 (Auto)</Select.Option>
                                <Select.Option value="en">英语 (English)</Select.Option>
                                <Select.Option value="zh">中文 (Chinese)</Select.Option>
                                <Select.Option value="ja">日语 (Japanese)</Select.Option>
                                <Select.Option value="ko">韩语 (Korean)</Select.Option>
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="输出格式">
                            <Select value={outputFormat} onChange={setOutputFormat}>
                                <Select.Option value="srt">SRT 字幕 (.srt)</Select.Option>
                                <Select.Option value="vtt">VTT 字幕 (.vtt)</Select.Option>
                                <Select.Option value="txt">纯文本 (.txt)</Select.Option>
                                <Select.Option value="all">全部生成</Select.Option>
                            </Select>
                        </Form.Item>
                    </Col>
                     <Col span={12}>
                        <Form.Item label="输出目录">
                             <Space.Compact style={{ width: '100%' }}>
                                <Input value={outputDir} readOnly prefix={<FolderOpenOutlined />} />
                                <Button onClick={handleSelectOutputDir}>更改</Button>
                            </Space.Compact>
                        </Form.Item>
                    </Col>
                </Row>
                 <Alert 
                    title={envStatus.gpu ? "GPU 加速可用 (CUDA)" : "未检测到 GPU，将使用 CPU 模式 (较慢)"} 
                    type={envStatus.gpu ? "success" : "info"} 
                    showIcon 
                    style={{ padding: '8px 12px' }} 
                />
                <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>模型缓存路径: {envStatus.model_path}</Text>
                </div>
             </Form>
         </Card>

         <Button 
            type="primary" 
            size="large" 
            block 
            icon={<ThunderboltOutlined />} 
            onClick={handleProcess}
            disabled={!file || !envStatus.whisper || !envStatus.python || !envStatus.ffmpeg}
            loading={isProcessing}
            style={{ height: 48, fontSize: 16 }}
         >
             {isProcessing ? '正在生成...' : '开始生成字幕'}
         </Button>
    </Flex>
  );

  const renderProcessingStep = () => (
      <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <Progress 
            type="circle" 
            percent={progress === 0 && logs.length > 0 ? 50 : progress} 
            status={processStatus === 'error' ? 'exception' : (processStatus === 'success' ? 'success' : 'active')} 
          />
          <div style={{ marginTop: 24, marginBottom: 24 }}>
              <Title level={4}>
                {processStatus === 'processing' && '正在识别字幕...'}
                {processStatus === 'success' && '处理完成'}
                {processStatus === 'error' && '处理失败'}
              </Title>
              <Text type="secondary">
                {processStatus === 'processing' && 'Whisper 模型正在“听”您的音频，这可能需要一些时间...'}
                {processStatus === 'success' && '字幕文件已生成到输出目录'}
                {processStatus === 'error' && '请查看下方日志以诊断问题'}
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
              height: 300,
              overflowY: 'auto',
              border: '1px solid #333'
          }}>
              {logs.map((log, i) => <div key={i}>{log}</div>)}
              {logs.length === 0 && <div style={{ color: '#666' }}>等待任务开始...</div>}
          </div>
          
          {!isProcessing && (
              <Button type="primary" onClick={() => setCurrentStep(0)} style={{ marginTop: 24 }}>
                  {processStatus === 'error' ? '返回重试' : '返回继续'}
              </Button>
          )}
      </div>
  );

  return (
    <Card style={{ maxWidth: 800, margin: '0 auto' }}>
        <Steps 
            current={currentStep} 
            items={[
                { title: '配置', icon: <AudioOutlined /> },
                { title: '生成', icon: <TranslationOutlined /> },
            ]}
            style={{ marginBottom: 30 }}
        />
        {currentStep === 0 && renderConfigStep()}
        {currentStep === 1 && renderProcessingStep()}
    </Card>
  );
};

export default WhisperTool;
