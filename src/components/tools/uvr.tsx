import React, { useState, useEffect, useRef } from 'react';
import { Card, Button, App, Flex, Typography, Space, Alert, Form, Select, Row, Col, Input, Steps, Badge, theme } from 'antd';
import { InboxOutlined, SettingOutlined, ThunderboltOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';

const { Text, Title, Paragraph } = Typography;

const UVRTool: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  
  // State
  const [currentStep, setCurrentStep] = useState(0);
  const [file, setFile] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [outputDir, setOutputDir] = useState<string>('');
  
  // Settings
  const [model, setModel] = useState<string>('UVR-MDX-NET-Inst_HQ_3.onnx');
  const [outputFormat, setOutputFormat] = useState<string>('mp3');
  
  // Env State
  const [envStatus, setEnvStatus] = useState<{
    python: boolean;
    audio_separator: boolean;
    gpu: boolean;
  }>({ python: false, audio_separator: false, gpu: false });
  const [isInstalling, setIsInstalling] = useState(false);

  // Constants
  const models = [
    { label: 'UVR-MDX-NET-Inst_HQ_3 (最佳伴奏)', value: 'UVR-MDX-NET-Inst_HQ_3.onnx' },
    { label: 'Kim_Vocal_2 (最佳人声)', value: 'Kim_Vocal_2.onnx' },
    { label: 'UVR_MDXNET_KARA_2 (卡拉OK)', value: 'UVR_MDXNET_KARA_2.onnx' },
    { label: 'UVR-DeEcho-DeReverb (去混响)', value: 'UVR-DeEcho-DeReverb.pth' },
    { label: 'htdemucs_ft (Demucs v4)', value: 'htdemucs_ft.yaml' },
  ];

  useEffect(() => {
    checkEnvironment();
    
    const unlistenLog = listen<string>('uvr-log', (event) => {
      setLogs((prev) => {
        const newLogs = [...prev, event.payload];
        if (newLogs.length > 100) return newLogs.slice(-100);
        return newLogs;
      });
    });

    return () => {
      unlistenLog.then((f) => f());
    };
  }, []);

  const checkEnvironment = async () => {
    try {
      const status = await invoke<{
          python: boolean;
          audio_separator: boolean;
          gpu: boolean;
      }>('check_uvr_env');
      setEnvStatus(status);
    } catch (e) {
      console.error(e);
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await invoke('install_uvr', { useGpu: envStatus.gpu }); // Try GPU if available, or force CPU? User choice might be better.
      message.success('安装完成');
      checkEnvironment();
    } catch (e: any) {
      message.error('安装失败: ' + e);
    } finally {
      setIsInstalling(false);
    }
  };

  const selectFile = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Audio',
          extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg']
        }]
      });
      if (selected && typeof selected === 'string') {
        setFile(selected);
        // Default output dir to source dir
        const parentDir = selected.substring(0, selected.lastIndexOf(selected.includes('\\') ? '\\' : '/'));
        setOutputDir(parentDir);
        setCurrentStep(1);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const startProcessing = async () => {
    if (!file || !outputDir) return;
    
    setIsProcessing(true);
    setLogs([]);
    try {
      await invoke('run_uvr', {
        inputPath: file,
        outputDir: outputDir,
        modelName: model,
        outputFormat: outputFormat
      });
      message.success('处理完成！');
      setCurrentStep(2);
    } catch (e: any) {
      message.error('处理失败: ' + e);
    } finally {
      setIsProcessing(false);
    }
  };

  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  // Render Helpers
  const renderEnvCheck = () => (
    <Card title="环境检查" size="small" style={{ marginBottom: 20 }}>
       <Flex vertical gap="small">
          <Flex align="center" gap="small">
             <Text style={{ width: 100 }}>Python 环境:</Text>
             {envStatus.python ? <CheckCircleOutlined style={{ color: token.colorSuccess }} /> : <CloseCircleOutlined style={{ color: token.colorError }} />}
             {!envStatus.python && <Text type="secondary">(请先安装 Python 3.9+ 并添加到 PATH)</Text>}
          </Flex>
          <Flex align="center" gap="small">
             <Text style={{ width: 100 }}>UVR 核心库:</Text>
             {envStatus.audio_separator ? <CheckCircleOutlined style={{ color: token.colorSuccess }} /> : <CloseCircleOutlined style={{ color: token.colorError }} />}
             {!envStatus.audio_separator && envStatus.python && (
                <Button type="primary" size="small" loading={isInstalling} onClick={handleInstall}>
                   一键安装 ({envStatus.gpu ? 'GPU版' : 'CPU版'})
                </Button>
             )}
          </Flex>
          <Flex align="center" gap="small">
             <Text style={{ width: 100 }}>GPU 加速:</Text>
             {envStatus.gpu ? <Badge status="success" text="可用 (NVIDIA)" /> : <Badge status="warning" text="未检测到 (将使用 CPU)" />}
          </Flex>
       </Flex>
    </Card>
  );

  return (
    <div style={{ padding: 20, maxWidth: 1000, margin: '0 auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Flex justify="space-between" align="center">
          <div>
            <Title level={2} style={{ margin: 0 }}>UVR5 音频分离 (Beta)</Title>
            <Text type="secondary">基于 Ultimate Vocal Remover 5 的顶级分离模型</Text>
          </div>
          <Space>
             <Button onClick={() => setLogs([])}>清空日志</Button>
             <Button icon={<SettingOutlined />} onClick={checkEnvironment}>刷新环境</Button>
          </Space>
        </Flex>

        {renderEnvCheck()}

        <Steps
          current={currentStep}
          items={[
            { title: '选择文件', icon: <InboxOutlined /> },
            { title: '配置参数', icon: <SettingOutlined /> },
            { title: '开始处理', icon: <ThunderboltOutlined /> },
          ]}
        />

        {currentStep === 0 && (
           <Card style={{ textAlign: 'center', padding: 40, border: `2px dashed ${token.colorBorder}`, cursor: 'pointer' }} onClick={selectFile}>
              <Paragraph>
                 <InboxOutlined style={{ fontSize: 60, color: token.colorPrimary }} />
              </Paragraph>
              <Title level={4}>点击选择音频文件</Title>
              <Text type="secondary">支持 MP3, WAV, FLAC, M4A, OGG</Text>
           </Card>
        )}

        {currentStep === 1 && (
           <Card>
              <Form layout="vertical">
                 <Form.Item label="当前文件">
                    <Input value={file} disabled addonAfter={<Button size="small" onClick={() => setCurrentStep(0)}>重选</Button>} />
                 </Form.Item>
                 
                 <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item label="选择模型 (首次使用会自动下载)">
                           <Select value={model} onChange={setModel} options={models} />
                           <Text type="secondary" style={{ fontSize: 12 }}>
                              提示: MDX-Net 模型通常效果最好，但需要较大内存。
                           </Text>
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item label="输出格式">
                           <Select value={outputFormat} onChange={setOutputFormat}>
                              <Select.Option value="mp3">MP3</Select.Option>
                              <Select.Option value="wav">WAV</Select.Option>
                              <Select.Option value="flac">FLAC</Select.Option>
                           </Select>
                        </Form.Item>
                    </Col>
                 </Row>

                 <Button type="primary" size="large" block onClick={startProcessing} loading={isProcessing} disabled={!envStatus.audio_separator}>
                    {isProcessing ? '处理中...' : '开始分离'}
                 </Button>
                 
                 {!envStatus.audio_separator && (
                    <Alert type="error" message="请先安装 UVR 核心库" showIcon style={{ marginTop: 10 }} />
                 )}
              </Form>
           </Card>
        )}

        {/* Logs Area (Always visible if there are logs or processing) */}
        {(isProcessing || logs.length > 0) && (
           <Card title="处理日志" size="small">
              <div ref={logRef} style={{ 
                  height: 300, 
                  overflowY: 'auto', 
                  backgroundColor: token.colorFillTertiary, 
                  color: token.colorSuccess, 
                  padding: 10, 
                  fontFamily: 'monospace',
                  borderRadius: 4
              }}>
                 {logs.map((log, index) => (
                    <div key={index}>{log}</div>
                 ))}
                 {logs.length === 0 && <div style={{ color: token.colorTextDescription }}>等待开始...</div>}
              </div>
           </Card>
        )}
        
        {currentStep === 2 && !isProcessing && (
           <div style={{ textAlign: 'center' }}>
              <CheckCircleOutlined style={{ fontSize: 60, color: token.colorSuccess }} />
              <Title level={3}>分离完成!</Title>
              <Paragraph>文件已保存至: {outputDir}</Paragraph>
              <Button onClick={() => setCurrentStep(0)}>处理下一个</Button>
           </div>
        )}

      </Space>
    </div>
  );
};

export default UVRTool;
