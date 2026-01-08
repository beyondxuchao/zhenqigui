# Changelog

## [1.0.4] - 2026-01-08

### Optimized
- **交互体验**: 优化了人声分离 (Stem Separator) 工具的操作流程，新增处理状态指示与按钮防抖，防止重复操作导致的错误。
- **性能优化**: 优化了 Whisper 字幕生成工具的组件加载逻辑，减少资源占用，提升运行稳定性。
- **界面细节**: 统一了工具箱内各功能模块的 UI 风格，修复了部分组件在暗色模式下的显示异常。

## [1.0.3] - 2026-01-08

## [1.0.2] - 2026-01-01

### Added
- **Subtitle Converter**: 新增字幕格式转换工具，支持 ASS/SSA/SRT/VTT 互转，以及批量转换为 TXT 纯文本。

### Refactored
- **Backend Modularity**: 重构 Rust 后端代码，将 `commands/mod.rs` 拆分为 `media`, `files`, `movie`, `common`, `app`, `registry`, `tmdb` 等独立模块，提升代码可维护性。

### Fixed
- **UI/UX**: 修复字幕转换工具在暗色模式下的显示问题及拖拽区域错位。
- **Deprecations**: 替换废弃的 Ant Design 组件 (`List`, `Input.addonBefore`)。

## [1.0.1] - 2025-12-31

### Optimized
- **Add Movie Speed**: 优化了添加影视的响应速度。现在点击添加后立即完成，海报和演职员图片下载在后台静默执行，不再阻塞界面。

### Fixed
- **Build Issues**: 修复了打包时的 TypeScript 编译错误 (`tools.tsx`)。
- **Database Stability**: 修复了数据库连接的线程安全问题 (`Arc<Mutex>`) 和生命周期错误 (`E0521`, `E0716`)，提高了应用稳定性。

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
