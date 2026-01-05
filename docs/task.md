# 项目任务清单 (Project Task List)

## 🚀 阶段一：沉浸式交互 (播放器)
- [x] **技术验证 (Tech Spike)**: Electron 视频播放器 <!-- id: 0 -->
    - [x] 初始化 Electron + Vite + React 项目结构 <!-- id: 1 -->
    - [x] 使用 HTML5 Video 实现基础本地视频播放 <!-- id: 2 -->
    - [x] 验证 Overlay 交互 (点击视频上的文字) <!-- id: 3 -->
- [x] **数据层 (Data Layer)** <!-- id: 4 -->
    - [x] 使用 SQLModel 初始化 SQLite 数据库 <!-- id: 5 -->
    - [x] 实现基于 UUID 的 Schema (MediaSource, SubtitleSegment) <!-- id: 6 -->
- [x] **功能实现：URL 导入流程** <!-- id: 11 -->
    - [x] 在 UI 中添加 YouTube/Bilibili URL 输入框 <!-- id: 12 -->
    - [x] Python 后端：集成 `yt-dlp` 用于提取视频元数据和 URL <!-- id: 13 -->
    - [x] 播放器 UI：处理流媒体视频源 <!-- id: 15 -->
- [x] **数据与 AI 层** <!-- id: 4a -->
    - [x] 媒体库视图 UI (交互式字幕和词组查询) <!-- id: 14 -->
    - [x] AI 上下文解释器 UI (导师面板) <!-- id: 26 -->
    - [x] AI 导师对话 UI (多轮对话) <!-- id: 27 -->
    - [x] Python 后端：音频提取与字幕生成 (Whisper) <!-- id: 21 -->
- [x] **AI 架构升级** (LangChain/LangGraph) <!-- id: 22 -->
    - [x] 安装依赖并创建模块结构 <!-- id: 23 -->
    - [x] 实现字典 Agent 和上下文解释器 <!-- id: 24 -->
    - [x] 实现导师图 (Tutor Graph) <!-- id: 25 -->
- [ ] **用户系统 (Auth)** <!-- id: 7 -->
    - [x] 设置 Supabase 项目 <!-- id: 8 -->
    - [x] 实现 邮箱/密码 登录 <!-- id: 9 -->
    - [ ] 实现 微信扫码登录 (通过 Supabase Edge Functions) <!-- id: 10 -->
- [ ] **打包 (Packaging)** <!-- id: 16 -->
    - [ ] 配置 Windows 平台的 Electron Builder <!-- id: 17 -->
- [x] **Bug 修复** <!-- id: 28 -->
    - [x] 视频流播放格式错误修复 (HLS.js 集成) <!-- id: 29 -->
    - [x] 后台转录任务中断恢复机制 (retranscribe 端点) <!-- id: 30 -->

## 📅 阶段二：知识资产
- [x] 智能生词本 UI (Smart Vocab Notebook UI) <!-- id: 18 -->
- [x] SRS 算法实现 (SM-2 间隔重复) <!-- id: 19 -->
- [x] 闪卡复习 UI (卡片翻转、难度评分、复习队列) <!-- id: 31 -->
- [ ] 学前复习提醒 (开始新视频前提示复习到期单词) <!-- id: 32 -->
- [ ] 学习数据统计 (已学单词数、听力时长、学习热力图) <!-- id: 33 -->

## 📅 阶段三：离线与本地化
- [ ] 集成本地 Faster-Whisper (GPU 加速本地转录) <!-- id: 20 -->
- [ ] 本地 LLM 集成 (Ollama: Llama3/Qwen/Mistral) <!-- id: 34 -->
- [ ] 跟读模式 (麦克风输入 + 实时发音反馈) <!-- id: 35 -->
