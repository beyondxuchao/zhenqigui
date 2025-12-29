# 珍奇柜 (Zhenqigui)

珍奇柜 (Zhenqigui) 是一款专为影视剪辑从业者设计的轻量级本地素材管理工具。它通过 TMDB 获取影视元数据，并自动扫描和匹配本地文件夹中的关联素材（如配音、文案、封面等），实现影视素材的统一归类与高效检索。

## ✨ 核心功能

- **本地化管理**: 仅记录文件路径，不修改或移动原始文件，保障素材安全。
- **TMDB 集成**: 支持通过 TMDB 搜索并拉取标准化的影视信息（海报、简介、评分等）。
- **智能匹配**: 根据影视名称自动扫描指定目录，匹配相关的 MP3（配音）、DOC/DOCX（文案）、图片（封面）等素材。
- **分类管理**: 自动识别“成片”、“素材”等目录类别。
- **轻量高效**: 基于 Tauri 构建，跨平台（Windows），启动快，资源占用低。

## 🛠️ 技术栈

- **Frontend**: React 18, TypeScript, Vite, Ant Design
- **Backend**: Rust, Tauri 2.0
- **Database**: SQLite (Rusqlite)
- **Other**: FFmpeg (用于媒体处理)

## 🚀 开发指南

### 环境要求

- Node.js (建议 v18+)
- Rust (最新稳定版)
- VS Code (推荐编辑器)

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run tauri dev
```

### 打包构建

```bash
npm run tauri build
```

## 📂 目录结构

- `src/`: 前端 React 代码
  - `pages/`: 页面组件
  - `components/`: 通用组件
  - `services/`: API 服务调用
- `src-tauri/`: 后端 Rust 代码
  - `src/commands/`: Tauri 命令实现
  - `src/models/`: 数据模型

## 📄 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。
