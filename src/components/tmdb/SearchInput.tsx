import React from 'react';
import { Form, Input, Button } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

interface SearchInputProps {
  onSearch: (values: { keyword: string; year?: string }) => void;
  loading: boolean;
}

const SearchInput: React.FC<SearchInputProps> = ({ onSearch, loading }) => {
  return (
    <div style={{ marginBottom: 16 }}>
      <Form layout="inline" onFinish={onSearch} style={{ width: '100%', display: 'flex' }}>
        <Form.Item name="keyword" style={{ flex: 1, marginRight: 8 }}>
          <Input 
              size="large" 
              prefix={<SearchOutlined />} 
              placeholder="输入影视名称搜索..." 
          />
        </Form.Item>
        <Form.Item style={{ marginRight: 8 }}>
          <Button type="primary" htmlType="submit" size="large" loading={loading} style={{ width: 80 }}>
            搜索
          </Button>
        </Form.Item>
      </Form>
    </div>
  );
};

export default SearchInput;
