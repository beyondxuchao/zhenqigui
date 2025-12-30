# Changelog

## [1.0.0] - 2025-12-30

### Added
- **NTFS USN Journal Integration**: 实现极速文件扫描，大幅提升素材匹配效率。
- **Audio Processor**: 新增音频处理工具，支持强力限制 (Forced Limiter)、增益调整、预设保存与加载。
- **Drag & Drop**: 工具箱支持文件拖拽直接加载，包括音频处理、视频转码、字幕提取等。
- **Smart Categorization**: 增强对“成片”、“Finished”等目录的自动识别。
- **UI Improvements**: 全面适配 Ant Design 6.x，优化暗色模式体验。
- **Production Build**: 完成生产环境打包配置。

### Fixed
- 修复了 MovieDetails 页面取消关联图标样式。
- 修复了统计页面和设置页面的 Ant Design 弃用警告。
- 修复了部分运行时错误 (Context API, 404 等)。
- 移除了自动检测功能以优化性能和用户控制。
