import React, { useEffect } from 'react';
import { Modal, Form, Input, DatePicker, Rate, Select, App } from 'antd';
import dayjs from 'dayjs';
import { Movie } from '../types';
import { updateMovie } from '../services/api';

interface MovieEditModalProps {
  visible: boolean;
  movie: Movie | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const MovieEditModal: React.FC<MovieEditModalProps> = ({ visible, movie, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const { message } = App.useApp();

  useEffect(() => {
    if (visible && movie) {
      form.setFieldsValue({
        ...movie,
        release_date: movie.release_date ? dayjs(movie.release_date) : null,
      });
    }
  }, [visible, movie, form]);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      if (!movie) return;

      const updatedMovie: Movie = {
        ...movie,
        ...values,
        release_date: values.release_date ? values.release_date.format('YYYY-MM-DD') : undefined,
      };

      await updateMovie(updatedMovie);
      message.success('更新成功');
      onSuccess();
    } catch (error) {
      console.error(error);
      message.error('更新失败');
    }
  };

  return (
    <Modal
      title="编辑影视信息"
      open={visible}
      onOk={handleOk}
      onCancel={onCancel}
      forceRender
    >
      <Form form={form} layout="vertical">
        <Form.Item name="title" label="标题" rules={[{ required: true, message: '请输入标题' }]}>
          <Input />
        </Form.Item>
        <Form.Item name="category" label="类型">
            <Select>
                <Select.Option value="movie">电影</Select.Option>
                <Select.Option value="tv">剧集</Select.Option>
            </Select>
        </Form.Item>
        <Form.Item name="production_status" label="制作状态">
            <Select allowClear>
                <Select.Option value="made">已制作</Select.Option>
                <Select.Option value="unmade">未制作</Select.Option>
                <Select.Option value="pending">待制作</Select.Option>
            </Select>
        </Form.Item>
        <Form.Item name="original_title" label="原标题">
          <Input />
        </Form.Item>
        <Form.Item name="poster_path" label="海报链接/路径">
          <Input />
        </Form.Item>
        <Form.Item name="release_date" label="上映日期">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="vote_average" label="评分">
          <Rate allowHalf count={10} />
        </Form.Item>
        <Form.Item name="overview" label="简介">
          <Input.TextArea rows={4} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default MovieEditModal;
