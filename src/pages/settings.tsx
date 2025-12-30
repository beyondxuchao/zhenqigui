import React, { useEffect, useState, useRef } from 'react';
import { Tabs, Form, Input, Slider, Radio, Button, Alert, message, Space, Switch, Descriptions, Divider, List, Card, Tag, Popconfirm, Modal, type TabsProps } from 'antd';
import { 
    SaveOutlined, 
    UploadOutlined, 
    ClearOutlined, 
    ApiOutlined, 
    FolderOpenOutlined, 
    DeleteOutlined, 
    FolderAddOutlined, 
    PlayCircleOutlined,
    GlobalOutlined,
    DatabaseOutlined,
    CheckCircleOutlined,
    SyncOutlined
} from '@ant-design/icons';
import { getConfig, saveConfig, testTmdbConnection, getAppInfo, clearData, backupDatabase, restoreDatabase, clearCache, detectLocalPlayers, setDataDirectory } from '../services/api';
import { AppConfig, DetectedPlayer, AppInfo } from '../types';
import { open, save } from '@tauri-apps/plugin-dialog';
import { useApp } from '../context/appcontext';

const Settings: React.FC = () => {
  const [form] = Form.useForm();
  const [testing, setTesting] = useState(false);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const { setTheme, setPrimaryColor } = useApp();
  const [monitorFolders, setMonitorFolders] = useState<string[]>([]);
  const [monitorFoldersSource, setMonitorFoldersSource] = useState<string[]>([]);
  const [monitorFoldersFinished, setMonitorFoldersFinished] = useState<string[]>([]);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [configLoaded, setConfigLoaded] = useState(false);
  const [baseConfig, setBaseConfig] = useState<AppConfig | null>(null);
  const saveTimeoutRef = useRef<any>(null);

  // Auto-detect players state
  const [detectedPlayers, setDetectedPlayers] = useState<DetectedPlayer[]>([]);
  const [playerModalVisible, setPlayerModalVisible] = useState(false);
  const [detectingPlayers, setDetectingPlayers] = useState(false);

  useEffect(() => {
    loadConfig();
    getAppInfo().then(setAppInfo).catch(console.error);
    
    return () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const handleSetDataDirectory = async () => {
    try {
        const selected = await open({
            directory: true,
            multiple: false,
            title: '选择数据存储目录'
        });
        
        if (selected && typeof selected === 'string') {
            await setDataDirectory(selected);
            message.success('数据目录已更改，请重启应用生效');
            getAppInfo().then(setAppInfo).catch(console.error);
        }
    } catch (error) {
        message.error('更改目录失败: ' + error);
    }
  };

  const loadConfig = async () => {
    try {
      const config = await getConfig();
      setBaseConfig(config);
      const uiValues = {
        ...config,
        match_threshold: config.match_threshold ? config.match_threshold * 100 : 80,
        theme: config.theme || 'light',
        primary_color: config.primary_color || '#1677ff',
        save_images_locally: config.save_images_locally ?? false,
        image_save_path: config.image_save_path || ''
      };
      setMonitorFolders(config.default_monitor_folders || []);
      setMonitorFoldersSource(config.monitor_folders_source || []);
      setMonitorFoldersFinished(config.monitor_folders_finished || []);
      form.setFieldsValue(uiValues);
      setConfigLoaded(true);
    } catch (error) {
      console.error(error);
      message.error('加载设置失败');
    }
  };

  const performSave = async (values: any) => {
    try {
      setSaveStatus('saving');
      const config: AppConfig = {
        ...baseConfig,
        ...values,
        match_threshold: values.match_threshold ? values.match_threshold / 100 : (baseConfig?.match_threshold || 0.8),
        image_save_path: values.image_save_path !== undefined ? (values.image_save_path || null) : (baseConfig?.image_save_path || null),
        default_monitor_folders: monitorFolders,
        monitor_folders_source: monitorFoldersSource,
        monitor_folders_finished: monitorFoldersFinished
      };
      
      // Update baseConfig to reflect latest saved state
      setBaseConfig(config);
      
      await saveConfig(config);
      setSaveStatus('saved');
    } catch (error) {
      console.error(error);
      setSaveStatus('error');
      message.error('自动保存失败');
    }
  };

  const handleValuesChange = (changedValues: any, allValues: any) => {
      // Theme changes apply immediately
      if (changedValues.theme) {
          setTheme(changedValues.theme);
      }
      if (changedValues.primary_color) {
          setPrimaryColor(changedValues.primary_color);
      }

      // Debounce save
      if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
      }

      setSaveStatus('saving');
      saveTimeoutRef.current = setTimeout(() => {
          performSave(allValues);
      }, 1000);
  };

  // Trigger save manually when non-form state changes (like monitorFolders)
  useEffect(() => {
      if (configLoaded) { // Only save if config has been loaded
         // We need to merge current form values with the new monitorFolders
         const currentValues = form.getFieldsValue();
         // Debounce this too
         if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
         saveTimeoutRef.current = setTimeout(() => {
             performSave(currentValues);
         }, 1000);
      }
  }, [monitorFolders, monitorFoldersSource, monitorFoldersFinished]);

  const handleTestConnection = async () => {
      try {
          const values = await form.validateFields(['tmdb_api_key', 'proxy']);
          const apiKey = values.tmdb_api_key;
          const proxy = values.proxy;
          
          if (!apiKey) {
              message.warning('请先输入 TMDB API Key');
              return;
          }

          let formattedProxy = proxy;
          if (formattedProxy && !formattedProxy.match(/^[a-zA-Z]+:\/\//)) {
              formattedProxy = `http://${formattedProxy}`;
              form.setFieldsValue({ proxy: formattedProxy });
              handleValuesChange({ proxy: formattedProxy }, form.getFieldsValue());
          }

          setTesting(true);
          await testTmdbConnection(apiKey, formattedProxy);
          message.success('连接成功！API Key 有效');
      } catch (error: any) {
          console.error(error);
          const errorMsg = typeof error === 'string' ? error : error?.message || '连接失败，请检查网络或代理设置';
          message.error(errorMsg);
      } finally {
          setTesting(false);
      }
  };

  const handleSelectImageSavePath = async () => {
      try {
          const selected = await open({
              directory: true,
              multiple: false,
              title: '选择图片保存路径'
          });
          
          if (selected && typeof selected === 'string') {
              form.setFieldsValue({ image_save_path: selected });
              // Explicitly merge the new value to ensure performSave gets the updated path
              const currentValues = form.getFieldsValue();
              handleValuesChange({ image_save_path: selected }, { ...currentValues, image_save_path: selected });
          }
      } catch (error) {
          message.error('无法打开文件夹选择框');
      }
  };

  const handleSelectPlayer = async () => {
    try {
      const selected = await open({
        multiple: false,
        title: '选择播放器执行文件',
        filters: [{
            name: 'Executable',
            extensions: ['exe', 'app', 'sh']
        }]
      });
      
      if (selected && typeof selected === 'string') {
        form.setFieldsValue({ local_player_path: selected });
        // Explicitly merge the new value
        const currentValues = form.getFieldsValue();
        handleValuesChange({ local_player_path: selected }, { ...currentValues, local_player_path: selected });
        message.success('已选择播放器');
      }
    } catch (error) {
      message.error('选择播放器失败');
    }
  };

  const handleAutoDetectPlayers = async () => {
      try {
          setDetectingPlayers(true);
          const players = await detectLocalPlayers();
          if (players.length === 0) {
              message.info('未检测到常见的本地播放器');
          } else {
              setDetectedPlayers(players);
              setPlayerModalVisible(true);
          }
      } catch (error) {
          console.error(error);
          message.error('检测播放器失败');
      } finally {
          setDetectingPlayers(false);
      }
  };

  const confirmSelectPlayer = (path: string) => {
      form.setFieldsValue({ local_player_path: path });
      handleValuesChange({ local_player_path: path }, form.getFieldsValue());
      setPlayerModalVisible(false);
      message.success('已选择播放器');
  };

  const handleAddMonitorFolder = async () => {
      try {
          const selected = await open({
              directory: true,
              multiple: false,
              title: '选择通用监控文件夹'
          });
          
          if (selected && typeof selected === 'string') {
              if (monitorFolders.includes(selected)) {
                  message.warning('文件夹已存在');
                  return;
              }
              setMonitorFolders(prev => [...prev, selected]);
          }
      } catch (error) {
          message.error('无法打开文件夹选择框');
      }
  };

  const handleRemoveMonitorFolder = (folder: string) => {
      setMonitorFolders(prev => prev.filter(f => f !== folder));
  };

  const handleAddMonitorFolderSource = async () => {
      try {
          const selected = await open({
              directory: true,
              multiple: false,
              title: '选择原片监控文件夹'
          });
          
          if (selected && typeof selected === 'string') {
              if (monitorFoldersSource.includes(selected)) {
                  message.warning('文件夹已存在');
                  return;
              }
              setMonitorFoldersSource(prev => [...prev, selected]);
          }
      } catch (error) {
          message.error('无法打开文件夹选择框');
      }
  };

  const handleRemoveMonitorFolderSource = (folder: string) => {
      setMonitorFoldersSource(prev => prev.filter(f => f !== folder));
  };

  const handleAddMonitorFolderFinished = async () => {
      try {
          const selected = await open({
              directory: true,
              multiple: false,
              title: '选择成片监控文件夹'
          });
          
          if (selected && typeof selected === 'string') {
              if (monitorFoldersFinished.includes(selected)) {
                  message.warning('文件夹已存在');
                  return;
              }
              setMonitorFoldersFinished(prev => [...prev, selected]);
          }
      } catch (error) {
          message.error('无法打开文件夹选择框');
      }
  };

  const handleRemoveMonitorFolderFinished = (folder: string) => {
      setMonitorFoldersFinished(prev => prev.filter(f => f !== folder));
  };

  const handleClearData = async () => {
      try {
          await clearData();
          message.success('数据已清空');
          // Optionally reload config or reset state if needed
      } catch (error) {
          console.error(error);
          message.error('清空数据失败');
      }
  };

  const handleBackupDatabase = async () => {
      try {
          const path = await save({
              filters: [{
                  name: 'SQLite Database',
                  extensions: ['db']
              }],
              defaultPath: 'shuxge_backup.db',
              title: '备份数据库'
          });
          
          if (path) {
              await backupDatabase(path);
              message.success('备份成功');
          }
      } catch (error) {
          console.error(error);
          message.error('备份失败');
      }
  };

  const handleRestoreDatabase = async () => {
      try {
          const selected = await open({
              multiple: false,
              filters: [{
                  name: 'SQLite Database',
                  extensions: ['db']
              }],
              title: '选择备份文件'
          });
          
          if (selected && typeof selected === 'string') {
               await restoreDatabase(selected);
               message.success('恢复成功，即将刷新页面');
               setTimeout(() => {
                   window.location.reload();
               }, 1000);
          }
      } catch (error) {
          console.error(error);
          message.error('恢复失败');
      }
  };

  const handleClearCache = async () => {
      try {
          await clearCache();
          message.success('缓存已清理');
      } catch (error) {
          console.error(error);
          message.error('清理失败');
      }
  };

  const SaveStatusIndicator = () => {
      if (saveStatus === 'saved') {
          return <Tag icon={<CheckCircleOutlined />} color="success">已保存</Tag>;
      } else if (saveStatus === 'saving') {
          return <Tag icon={<SyncOutlined spin />} color="processing">保存中...</Tag>;
      } else {
          return <Tag icon={<DeleteOutlined />} color="error">保存失败</Tag>;
      }
  };

  return (
    <div style={{ width: '100%', maxWidth: 1000, margin: '0 auto', paddingBottom: 40 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 16 }}>
        <SaveStatusIndicator />
      </div>
      
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        preserve={false}
      >
        <Tabs 
            style={{ width: '100%' }}
            defaultActiveKey="general"  
            tabPlacement={'left' as TabsProps['tabPlacement']}
            items={[
            {
                label: <span><GlobalOutlined /> 常规设置</span>,
                key: 'general',
                children: (
                    <div style={{ paddingLeft: 16 }}>
                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                        <Card title="界面外观" size="small" variant="borderless">
                            <Form.Item label="主题模式" name="theme" style={{ marginBottom: 16 }}>
                                <Radio.Group buttonStyle="solid">
                                    <Radio.Button value="light">浅色模式</Radio.Button>
                                    <Radio.Button value="dark">深色模式</Radio.Button>
                                    <Radio.Button value="system">跟随系统</Radio.Button>
                                </Radio.Group>
                            </Form.Item>
                            
                            <Form.Item label="主题色" name="primary_color">
                                <Radio.Group>
                                    {[
                                        { color: '#1677ff', name: '科技蓝' },
                                        { color: '#f5222d', name: '薄暮红' },
                                        { color: '#fa541c', name: '火山橘' },
                                        { color: '#faad14', name: '日暮黄' },
                                        { color: '#52c41a', name: '极光绿' },
                                        { color: '#13c2c2', name: '明青' },
                                        { color: '#722ed1', name: '酱紫' },
                                        { color: '#eb2f96', name: '法式红' },
                                    ].map(c => (
                                        <Radio.Button 
                                            key={c.color} 
                                            value={c.color}
                                            style={{ 
                                                padding: 0, 
                                                width: 32, 
                                                height: 32, 
                                                borderRadius: '50%', 
                                                border: 'none',
                                                background: c.color,
                                                marginRight: 8,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                overflow: 'hidden'
                                            }}
                                            title={c.name}
                                        >
                                            {/* We can add a checkmark if selected, but Radio.Button usually handles active state style. 
                                                However, with custom background, the active style might be hidden. 
                                                Let's use a simple div inside or trust AntD Radio. 
                                                Actually, Radio value binding is easier.
                                            */}
                                           {form.getFieldValue('primary_color') === c.color && <CheckCircleOutlined style={{ color: 'white', fontSize: 16 }} />}
                                        </Radio.Button>
                                    ))}
                                </Radio.Group>
                            </Form.Item>
                        </Card>

                        {/* Future expansion: Language, Startup options */}
                        <Card title="关于应用" size="small" variant="borderless">
                            <Descriptions column={1} size="small">
                                <Descriptions.Item label="当前版本">v0.1.0</Descriptions.Item>
                                <Descriptions.Item label="构建环境">Tauri v2 + React 19</Descriptions.Item>
                            </Descriptions>
                        </Card>
                    </Space>
                    </div>
                )
            },
            {
                label: <span><PlayCircleOutlined /> 播放与工具</span>,
                key: 'player',
                children: (
                    <div style={{ paddingLeft: 16 }}>
                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                        <Card title="FFmpeg 设置" size="small" variant="borderless">
                             <Alert 
                                message="FFmpeg 是处理音视频的核心组件" 
                                description="如果您未安装 FFmpeg，或者应用内置的 FFmpeg 无法正常工作，请在此指定您本地安装的 FFmpeg 可执行文件路径（例如 ffmpeg.exe）。" 
                                type="info" 
                                showIcon 
                                style={{ marginBottom: 16 }} 
                             />
                             <Form.Item label="FFmpeg 路径" tooltip="请选择 ffmpeg 可执行文件">
                                <Space.Compact style={{ width: '100%' }}>
                                    <Form.Item
                                        name="ffmpeg_path"
                                        noStyle
                                    >
                                        <Input 
                                            placeholder="未设置 (将使用内置版本)" 
                                        />
                                    </Form.Item>
                                    <Button type="default" icon={<FolderOpenOutlined />} onClick={async () => {
                                        try {
                                            const selected = await open({
                                                multiple: false,
                                                title: '选择 FFmpeg 可执行文件',
                                                filters: [{
                                                    name: 'Executable',
                                                    extensions: ['exe', 'app', '', 'sh']
                                                }]
                                            });
                                            if (selected) {
                                                form.setFieldsValue({ ffmpeg_path: selected as string });
                                                handleValuesChange({ ffmpeg_path: selected }, form.getFieldsValue());
                                                message.success('已选择 FFmpeg');
                                            }
                                        } catch (e) {
                                            message.error('选择文件失败');
                                        }
                                    }}>浏览...</Button>
                                </Space.Compact>
                             </Form.Item>
                        </Card>

                        <Card title="本地播放器" size="small">
                            <Alert title="设置后，在素材匹配和详情页点击“播放”将直接调用该播放器。" type="info" showIcon style={{ marginBottom: 16 }} />
                            <Form.Item label="播放器路径" tooltip="请选择 .exe 可执行文件">
                                <Space.Compact style={{ width: '100%' }}>
                                    <Form.Item
                                        name="local_player_path"
                                        noStyle
                                    >
                                        <Input 
                                            placeholder="未设置 (将使用系统默认方式打开)" 
                                        />
                                    </Form.Item>
                                    <Button type="default" icon={<FolderOpenOutlined />} onClick={handleSelectPlayer}>浏览...</Button>
                                    <Button icon={<SyncOutlined spin={detectingPlayers} />} loading={detectingPlayers} onClick={handleAutoDetectPlayers}>自动检测</Button>
                                </Space.Compact>
                            </Form.Item>
                        </Card>
                    </Space>
                    </div>
                )
            },
            {
                label: <span><ApiOutlined /> 刮削与网络</span>,
                key: 'scraper',
                children: (
                    <div style={{ paddingLeft: 16 }}>
                    <Space direction="vertical" style={{ width: '100%' }} size="large">
                        <Card title="TMDB 设置" size="small">
                            <Form.Item label="API Key" name="tmdb_api_key" extra="用于拉取影视元数据，请前往 TMDB 官网申请">
                                <Input.Password placeholder="请输入 API Key" />
                            </Form.Item>

                            <Form.Item label="网络代理 (Proxy)" extra="如果无法连接 TMDB，请配置 HTTP 代理 (例如: http://127.0.0.1:7890)">
                                <Space style={{ width: '100%' }}>
                                    <Form.Item
                                        name="proxy"
                                        noStyle
                                    >
                                        <Input placeholder="http://127.0.0.1:7890" style={{ flex: 1 }} />
                                    </Form.Item>
                                    <Button icon={<ApiOutlined />} loading={testing} onClick={handleTestConnection}>
                                        测试连接
                                    </Button>
                                </Space>
                            </Form.Item>
                        </Card>

                        <Card title="匹配规则" size="small" variant="borderless">
                            <Form.Item label="模糊匹配阈值" name="match_threshold" tooltip="匹配本地文件时，文件名相似度高于此值才会被列出">
                                <div style={{ width: '50%' }}>
                                    <Slider min={0} max={100} marks={{0: '宽松', 80: '标准', 100: '严格'}} />
                                </div>
                            </Form.Item>
                            
                            <Form.Item label="原片监控文件夹 (Source)" extra="用于存放原始拍摄素材或未剪辑的视频文件">
                                <List
                                    size="small"
                                    bordered
                                    dataSource={monitorFoldersSource}
                                    renderItem={(item: string) => (
                                        <List.Item
                                            actions={[
                                                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemoveMonitorFolderSource(item)} />
                                            ]}
                                        >
                                            <FolderOpenOutlined style={{ marginRight: 8, color: '#faad14' }} />
                                            <span style={{ wordBreak: 'break-all' }}>{item}</span>
                                        </List.Item>
                                    )}
                                    footer={
                                        <Button type="dashed" onClick={handleAddMonitorFolderSource} block icon={<FolderAddOutlined />}>
                                            添加原片文件夹
                                        </Button>
                                    }
                                />
                            </Form.Item>

                            <Form.Item label="成片监控文件夹 (Finished)" extra="用于存放已经剪辑完成、导出的成品视频文件">
                                <List
                                    size="small"
                                    bordered
                                    dataSource={monitorFoldersFinished}
                                    renderItem={(item: string) => (
                                        <List.Item
                                            actions={[
                                                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemoveMonitorFolderFinished(item)} />
                                            ]}
                                        >
                                            <FolderOpenOutlined style={{ marginRight: 8, color: '#52c41a' }} />
                                            <span style={{ wordBreak: 'break-all' }}>{item}</span>
                                        </List.Item>
                                    )}
                                    footer={
                                        <Button type="dashed" onClick={handleAddMonitorFolderFinished} block icon={<FolderAddOutlined />}>
                                            添加成片文件夹
                                        </Button>
                                    }
                                />
                            </Form.Item>
                            
                            <Form.Item label="通用监控文件夹" extra="这些文件夹将自动在“素材匹配”页面加载，无需每次重复选择">
                                <List
                                    size="small"
                                    bordered
                                    dataSource={monitorFolders}
                                    renderItem={(item: string) => (
                                        <List.Item
                                            actions={[
                                                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemoveMonitorFolder(item)} />
                                            ]}
                                        >
                                            <FolderOpenOutlined style={{ marginRight: 8, color: '#1890ff' }} />
                                            <span style={{ wordBreak: 'break-all' }}>{item}</span>
                                        </List.Item>
                                    )}
                                    footer={
                                        <Button type="dashed" onClick={handleAddMonitorFolder} block icon={<FolderAddOutlined />}>
                                            添加监控文件夹
                                        </Button>
                                    }
                                />
                            </Form.Item>
                        </Card>
                    </Space>
                    </div>
                )
            },
            {
                label: <span><DatabaseOutlined /> 存储与数据</span>,
                key: 'storage',
                children: (
                      <div style={{ paddingLeft: 16 }}>
                      <Space direction="vertical" style={{ width: '100%' }} size="large">
                        <Card title="图片存储" size="small">
                            <Form.Item name="save_images_locally" valuePropName="checked" style={{ marginBottom: 12 }}>
                                <Switch checkedChildren="保存图片到本地" unCheckedChildren="使用在线图片链接" />
                            </Form.Item>
                            
                            <Form.Item 
                                noStyle 
                                shouldUpdate={(prev, curr) => prev.save_images_locally !== curr.save_images_locally}
                            >
                                {({ getFieldValue }) => 
                                    getFieldValue('save_images_locally') ? (
                                        <Form.Item 
                                            label="自定义图片保存路径" 
                                            extra="留空则使用默认路径"
                                        >
                                            <Space.Compact style={{ width: '100%' }}>
                                                <Form.Item
                                                    name="image_save_path"
                                                    noStyle
                                                >
                                                    <Input 
                                                        placeholder={appInfo?.default_image_path} 
                                                    />
                                                </Form.Item>
                                                <Button type="default" icon={<FolderOpenOutlined />} onClick={handleSelectImageSavePath}>浏览...</Button>
                                            </Space.Compact>
                                        </Form.Item>
                                    ) : null
                                }
                            </Form.Item>
                        </Card>

                        <Card title="数据维护" size="small">
                            <Form.Item label="数据存储位置" style={{ marginBottom: 16 }}>
                                <Space.Compact style={{ width: '100%' }}>
                                    <Input value={appInfo?.db_path ? appInfo.db_path.replace(/[\\/]shuxge\.db$/, '') : ''} readOnly />
                                    <Button onClick={handleSetDataDirectory}>更改...</Button>
                                </Space.Compact>
                                <div style={{ marginTop: 8 }}>
                                     <Alert type="warning" showIcon message="更改目录后，现有数据将迁移至新位置。应用需要重启才能生效。" />
                                </div>
                            </Form.Item>
                            <Divider />
                            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                                <Button icon={<SaveOutlined />} onClick={handleBackupDatabase}>备份数据库</Button>
                                <Button icon={<UploadOutlined />} onClick={handleRestoreDatabase}>恢复数据库</Button>
                            </div>
                            <Divider />
                            <Alert 
                                title="清理缓存" 
                                description="清理缓存将删除所有下载的临时文件，不会删除数据库记录。" 
                                type="warning" 
                                showIcon 
                                action={
                                    <Button size="small" danger icon={<ClearOutlined />} onClick={handleClearCache}>
                                        立即清理
                                    </Button>
                                }
                                style={{ marginBottom: 16 }}
                            />

                            <Alert 
                                title="清空所有数据" 
                                description="这将永久删除所有影视记录。设置选项将被保留。" 
                                type="error" 
                                showIcon 
                                action={
                                    <Popconfirm
                                        title="确定要清空所有数据吗？"
                                        description="此操作不可恢复！"
                                        onConfirm={handleClearData}
                                        okText="确定"
                                        cancelText="取消"
                                    >
                                        <Button size="small" danger type="primary" icon={<DeleteOutlined />}>
                                            清空数据
                                        </Button>
                                    </Popconfirm>
                                }
                            />
                        </Card>
                     </Space>
                     </div>
                )
            }
            ]}
        />
      </Form>
      
      <Modal
          title="检测到的播放器"
          open={playerModalVisible}
          onCancel={() => setPlayerModalVisible(false)}
          footer={null}
      >
          <List
              dataSource={detectedPlayers}
              renderItem={(item) => (
                  <List.Item
                      actions={[<Button type="primary" size="small" onClick={() => confirmSelectPlayer(item.path)}>选择</Button>]}
                  >
                      <List.Item.Meta
                          title={item.name}
                          description={item.path}
                      />
                  </List.Item>
              )}
          />
      </Modal>
    </div>
  );
};

export default Settings;
