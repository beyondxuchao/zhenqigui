import React, { useState, useEffect } from 'react';
import { Button, Form, Input, InputNumber, Slider, App, Space, Card, Row, Col, Modal, Popconfirm, Divider } from 'antd';
import { open, save } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import { SaveOutlined, DeleteOutlined, ThunderboltOutlined, FolderOpenOutlined } from '@ant-design/icons';
import { AudioPreset, getAudioPresets, saveAudioPreset, deleteAudioPreset, processAudioLimiter } from '../../services/api';

interface AudioProcessorProps {
    initialFile?: string;
}

const AudioProcessor: React.FC<AudioProcessorProps> = ({ initialFile }) => {
    const { message } = App.useApp();
    const [inputFile, setInputFile] = useState<string>(initialFile || '');
    const [presets, setPresets] = useState<AudioPreset[]>([]);
    const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    const [processing, setProcessing] = useState(false);

    // Parameters
    const [inputBoost, setInputBoost] = useState<number>(0);
    const [maxAmplitude, setMaxAmplitude] = useState<number>(-0.1);
    const [lookahead, setLookahead] = useState<number>(5);
    const [releaseTime, setReleaseTime] = useState<number>(50);

    // Save Preset Modal
    const [saveModalVisible, setSaveModalVisible] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');

    useEffect(() => {
        if (initialFile) {
            setInputFile(initialFile);
        }
    }, [initialFile]);

    useEffect(() => {
        loadPresets();

        // Listen for file drop
        const unlistenPromise = listen('tauri://drag-drop', (event: any) => {
            const payload = event.payload as { paths: string[] };
            if (payload.paths && payload.paths.length > 0) {
                const path = payload.paths[0];
                if (/\.(mp3|wav|aac|m4a|flac|ogg)$/i.test(path)) {
                    setInputFile(path);
                    message.success('已加载文件: ' + path);
                } else {
                    message.warning('不支持的文件格式，请拖入音频文件');
                }
            }
        });

        return () => {
            unlistenPromise.then(unlisten => unlisten());
        };
    }, []);

    const loadPresets = async () => {
        try {
            const data = await getAudioPresets();
            setPresets(data);
        } catch (error) {
            message.error('加载预设失败: ' + error);
        }
    };

    const handleSelectFile = async () => {
        try {
            const selected = await open({
                multiple: false,
                filters: [{
                    name: 'Audio',
                    extensions: ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg']
                }]
            });
            if (selected) {
                setInputFile(selected as string);
            }
        } catch (err) {
            message.error('选择文件失败');
        }
    };

    const handleApplyPreset = (id: number) => {
        const preset = presets.find(p => p.id === id);
        if (preset) {
            setSelectedPresetId(id);
            setInputBoost(preset.input_boost);
            setMaxAmplitude(preset.max_amplitude);
            setLookahead(preset.lookahead);
            setReleaseTime(preset.release_time);
            message.success(`已应用预设: ${preset.name}`);
        }
    };

    const handleSavePresetClick = () => {
        setNewPresetName('');
        setSaveModalVisible(true);
    };

    const confirmSavePreset = async () => {
        if (!newPresetName.trim()) {
            message.warning('请输入预设名称');
            return;
        }
        try {
            setLoading(true);
            await saveAudioPreset(newPresetName, inputBoost, maxAmplitude, lookahead, releaseTime);
            message.success('预设保存成功');
            setSaveModalVisible(false);
            loadPresets();
        } catch (error) {
            message.error('保存失败: ' + error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePreset = async (id: number) => {
        try {
            await deleteAudioPreset(id);
            message.success('预设删除成功');
            loadPresets();
            if (selectedPresetId === id) {
                setSelectedPresetId(null);
            }
        } catch (error) {
            message.error('删除失败: ' + error);
        }
    };

    const handleProcess = async () => {
        if (!inputFile) {
            message.warning('请先选择输入文件');
            return;
        }

        try {
            const savePath = await save({
                defaultPath: inputFile.replace(/\.[^/.]+$/, '_processed.mp3'),
                filters: [{
                    name: 'Audio',
                    extensions: ['mp3']
                }]
            });

            if (!savePath) return;

            setProcessing(true);
            await processAudioLimiter(inputFile, savePath, inputBoost, maxAmplitude, lookahead, releaseTime);
            message.success('处理完成！');
        } catch (error) {
            message.error('处理失败: ' + error);
        } finally {
            setProcessing(false);
        }
    };

    return (
        <div style={{ padding: 20 }}>
            <Card title="音频输入" style={{ marginBottom: 20 }}>
                <Space style={{ width: '100%' }}>
                    <Input 
                        value={inputFile} 
                        placeholder="请选择或拖入音频文件..." 
                        readOnly 
                        style={{ width: 400 }}
                        prefix={<FolderOpenOutlined />}
                    />
                    <Button type="primary" onClick={handleSelectFile}>选择文件</Button>
                </Space>
            </Card>

            <Row gutter={24}>
                <Col span={16}>
                    <Card title="参数设置">
                        <Form layout="vertical">
                            <Form.Item label="输入增益 (Input Boost, dB)">
                                <Row>
                                    <Col span={18}>
                                        <Slider
                                            min={0}
                                            max={30}
                                            step={0.5}
                                            value={inputBoost}
                                            onChange={setInputBoost}
                                        />
                                    </Col>
                                    <Col span={6}>
                                        <Space.Compact style={{ width: '100%', margin: '0 16px' }}>
                                            <InputNumber
                                                min={0}
                                                max={30}
                                                step={0.5}
                                                style={{ width: 'calc(100% - 30px)' }}
                                                value={inputBoost}
                                                onChange={(val) => setInputBoost(val || 0)}
                                            />
                                            <Input style={{ width: 30, borderLeft: 0, pointerEvents: 'none' }} placeholder="dB" disabled />
                                        </Space.Compact>
                                    </Col>
                                </Row>
                            </Form.Item>

                            <Form.Item label="最大振幅限制 (Max Amplitude, dB)">
                                <Row>
                                    <Col span={18}>
                                        <Slider
                                            min={-20}
                                            max={0}
                                            step={0.1}
                                            value={maxAmplitude}
                                            onChange={setMaxAmplitude}
                                        />
                                    </Col>
                                    <Col span={6}>
                                        <Space.Compact style={{ width: '100%', margin: '0 16px' }}>
                                            <InputNumber
                                                min={-20}
                                                max={0}
                                                step={0.1}
                                                style={{ width: 'calc(100% - 30px)' }}
                                                value={maxAmplitude}
                                                onChange={(val) => setMaxAmplitude(val || -0.1)}
                                            />
                                            <Input style={{ width: 30, borderLeft: 0, pointerEvents: 'none' }} placeholder="dB" disabled />
                                        </Space.Compact>
                                    </Col>
                                </Row>
                            </Form.Item>

                            <Form.Item label="预测时间 (Lookahead, ms)">
                                <Row>
                                    <Col span={18}>
                                        <Slider
                                            min={0.1}
                                            max={20}
                                            step={0.1}
                                            value={lookahead}
                                            onChange={setLookahead}
                                        />
                                    </Col>
                                    <Col span={6}>
                                        <Space.Compact style={{ width: '100%', margin: '0 16px' }}>
                                            <InputNumber
                                                min={0.1}
                                                max={20}
                                                step={0.1}
                                                style={{ width: 'calc(100% - 30px)' }}
                                                value={lookahead}
                                                onChange={(val) => setLookahead(val || 5)}
                                            />
                                            <Input style={{ width: 30, borderLeft: 0, pointerEvents: 'none' }} placeholder="ms" disabled />
                                        </Space.Compact>
                                    </Col>
                                </Row>
                            </Form.Item>

                            <Form.Item label="释放时间 (Release Time, ms)">
                                <Row>
                                    <Col span={18}>
                                        <Slider
                                            min={1}
                                            max={1000}
                                            step={1}
                                            value={releaseTime}
                                            onChange={setReleaseTime}
                                        />
                                    </Col>
                                    <Col span={6}>
                                        <Space.Compact style={{ width: '100%', margin: '0 16px' }}>
                                            <InputNumber
                                                min={1}
                                                max={1000}
                                                step={1}
                                                style={{ width: 'calc(100% - 30px)' }}
                                                value={releaseTime}
                                                onChange={(val) => setReleaseTime(val || 50)}
                                            />
                                            <Input style={{ width: 30, borderLeft: 0, pointerEvents: 'none' }} placeholder="ms" disabled />
                                        </Space.Compact>
                                    </Col>
                                </Row>
                            </Form.Item>

                            <Divider />

                            <Space>
                                <Button 
                                    type="primary" 
                                    icon={<ThunderboltOutlined />} 
                                    onClick={handleProcess}
                                    loading={processing}
                                    size="large"
                                >
                                    开始处理
                                </Button>
                                <Button 
                                    icon={<SaveOutlined />} 
                                    onClick={handleSavePresetClick}
                                >
                                    保存当前参数为预设
                                </Button>
                            </Space>
                        </Form>
                    </Card>
                </Col>
                <Col span={8}>
                    <Card 
                        title="预设列表" 
                        extra={<Button type="link" size="small" onClick={loadPresets}>刷新</Button>}
                    >
                        {presets.length === 0 ? (
                            <div style={{ textAlign: 'center', color: '#999', padding: 20 }}>暂无预设</div>
                        ) : (
                            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                                {presets.map(preset => (
                                    <Card 
                                        key={preset.id} 
                                        size="small" 
                                        style={{ marginBottom: 10, borderColor: selectedPresetId === preset.id ? '#1677ff' : undefined }}
                                        hoverable
                                        onClick={() => handleApplyPreset(preset.id)}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 'bold' }}>{preset.name}</span>
                                            <Popconfirm title="确定删除?" onConfirm={(e) => { e?.stopPropagation(); handleDeletePreset(preset.id); }}>
                                                <Button type="text" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
                                            </Popconfirm>
                                        </div>
                                        <div style={{ fontSize: 12, color: '#666', marginTop: 5 }}>
                                            Boost: {preset.input_boost}dB | Max: {preset.max_amplitude}dB
                                            <br />
                                            Lookahead: {preset.lookahead}ms | Release: {preset.release_time}ms
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </Card>
                </Col>
            </Row>

            <Modal
                title="保存预设"
                open={saveModalVisible}
                onOk={confirmSavePreset}
                onCancel={() => setSaveModalVisible(false)}
                confirmLoading={loading}
            >
                <Input 
                    placeholder="请输入预设名称" 
                    value={newPresetName} 
                    onChange={e => setNewPresetName(e.target.value)} 
                />
            </Modal>
        </div>
    );
};

export default AudioProcessor;
