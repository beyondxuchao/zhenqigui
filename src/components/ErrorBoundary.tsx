import { Component, ErrorInfo, ReactNode } from 'react';
import { Button, Result, Typography } from 'antd';

const { Paragraph, Text } = Typography;

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <Result
            status="error"
            title="出错了"
            subTitle="应用程序遇到错误，请尝试刷新页面。"
            extra={[
              <Button type="primary" key="console" onClick={() => window.location.reload()}>
                刷新页面
              </Button>
            ]}
          >
            <div className="desc">
              <Paragraph>
                <Text
                  strong
                  style={{
                    fontSize: 16,
                  }}
                >
                  错误详情:
                </Text>
              </Paragraph>
              <Paragraph>
                <Text type="danger">{this.state.error?.toString()}</Text>
              </Paragraph>
              {this.state.errorInfo && (
                <Paragraph>
                   <pre style={{ maxHeight: 200, overflow: 'auto', background: '#f5f5f5', padding: 10 }}>
                     {this.state.errorInfo.componentStack}
                   </pre>
                </Paragraph>
              )}
            </div>
          </Result>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
