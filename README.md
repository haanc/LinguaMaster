# LinguaMaster

<p align="center">
  <img src="public/icon.png" alt="LinguaMaster Logo" width="128" height="128">
</p>

<p align="center">
  <strong>AI-Powered Immersive Language Learning</strong>
</p>

<p align="center">
  Transform any video content into interactive language lessons with real-time translation, vocabulary lookup, and AI tutoring.
</p>

<p align="center">
  <a href="#english">English</a> |
  <a href="#中文">中文</a> |
  <a href="#日本語">日本語</a>
</p>

---

<a name="english"></a>

## 🌍 English

### Features

#### Core Functionality

- **Video Import** - Support local videos or download via URL (powered by yt-dlp, supports YouTube, Bilibili, etc.)
- **AI Subtitle Generation** - Automatic transcription with timestamps using OpenAI Whisper / faster-whisper
- **Bilingual Subtitles** - One-click translation supporting Chinese, English, Japanese, French, German, Spanish, and more
- **Interactive Dictionary** - Click any word for instant definitions, pronunciation, translations, and example sentences
- **AI Context Explanation** - Select sentences for grammar analysis and cultural background
- **AI Language Tutor** - Context-aware conversation practice based on video content
- **Spaced Repetition Review** - SM-2 algorithm-powered vocabulary notebook with scientific review scheduling
- **Draggable UI Elements** - Repositionable learning panel and subtitles with glassmorphism effects

#### Technical Highlights

- **Multi-layer Translation Cache** - Database → Memory → AI API three-tier caching for reduced API calls
- **Provider Abstraction Layer** - Flexibly switch between Azure OpenAI / OpenAI / Ollama / local models
- **Type Safety** - Python models auto-generate TypeScript type definitions
- **Modular Architecture** - Clean route layering and service decoupling
- **Portable Packaging** - Self-contained Windows installer with embedded Python runtime
- **Security-First Design** - SSRF protection, CORS restrictions, owner-based authorization

---

### Installation

#### Option 1: Download Installer (Recommended)

1. Download the latest installer from [Releases](https://github.com/haanc/LinguaMaster/releases)
2. Run `LinguaMaster Setup x.x.x.exe`
3. Launch the app and start learning!

**That's it!** The app automatically downloads required dependencies (yt-dlp, FFmpeg) on first launch.

> **Note:** First startup may take 1-2 minutes while dependencies are downloaded. Subsequent launches are much faster.

#### Option 2: Run from Source (Command Line)

##### Requirements

- **Node.js** >= 18
- **Python** >= 3.10
- **FFmpeg** - Required for audio processing
- **yt-dlp** - Required for video downloads

##### Installation Steps

```bash
# 1. Clone repository
git clone https://github.com/haanc/LinguaMaster.git
cd LinguaMaster

# 2. Backend setup
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cd ..

# 3. Frontend setup
npm install
```

##### Configure AI Services

Copy the configuration template and add your API keys:

```bash
cp backend/.env.example backend/.env
```

**backend/.env** example:

```ini
# ===== Azure OpenAI (Recommended) =====
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_API_VERSION=2024-02-01
AZURE_OPENAI_DEPLOYMENT_CHAT=gpt-4o
AZURE_OPENAI_DEPLOYMENT_WHISPER=whisper

# ===== Or use OpenAI =====
# OPENAI_API_KEY=sk-your-key
# OPENAI_MODEL_NAME=gpt-4-turbo

# ===== Or use Ollama (local) =====
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL_NAME=llama3

# ===== Local Whisper (default) =====
LOCAL_WHISPER_MODEL=base
LOCAL_WHISPER_DEVICE=auto
```

##### Run the Application

**Development mode:**

```bash
# Terminal 1: Start backend
cd backend
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
python main.py

# Terminal 2: Start frontend (in project root)
npm run dev
```

> **Important:** Do NOT use `uvicorn main:app --reload` as it conflicts with BackgroundTasks used for video downloading.

**Build installer:**

```bash
# Prepare backend (downloads Python Embeddable)
npm run build:prepare

# Build Electron app
npm run build
```

The installer will be created in the `release/` directory.

---

### Usage Guide

1. **Import Videos** - Click "+ Add Video" and paste a YouTube/Bilibili URL
2. **Learning Mode** - Click words for definitions, enable bilingual subtitles with 🌐
3. **AI Features** - Use ✨ for grammar analysis, chat with AI tutor
4. **Vocabulary** - Save words to notebook, review with SM-2 scheduling
5. **Settings** - Configure your preferred AI provider (Azure, OpenAI, Ollama)

---

### Tech Stack

| Layer | Technologies |
|-------|-------------|
| Frontend | React, TypeScript, Vite, Electron, TanStack Query, Radix UI, i18next |
| Backend | FastAPI, SQLModel (SQLite), LangChain, faster-whisper, yt-dlp |
| AI Models | Azure OpenAI, OpenAI, Ollama, Whisper (local/cloud) |

---

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Electron dev mode |
| `npm run dev:web` | Start web dev server only |
| `npm run build` | Build production version |
| `npm run build:prepare` | Package backend with Python Embeddable |
| `npm run build:full` | Full build (backend + frontend) |
| `npm run gen:types` | Generate TypeScript types from Python models |

---

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Backend fails to start | Check if port 8000 is in use. Kill orphan Python processes. |
| Video import fails | Ensure FFmpeg and yt-dlp are installed (auto-downloaded in installer version). |
| API key errors | Verify your `.env` configuration. Keys are case-sensitive. |

---

### License

[MIT](LICENSE)

---

<a name="中文"></a>

## 🇨🇳 中文

### 功能特性

#### 核心功能

- **视频导入** - 支持本地视频或通过 URL 直接下载（基于 yt-dlp，支持 YouTube、Bilibili 等）
- **AI 字幕生成** - 使用 OpenAI Whisper / faster-whisper 自动转录并生成时间戳字幕
- **双语字幕** - 一键翻译字幕，支持中、英、日、法、德、西班牙语等多语言
- **交互式词典** - 点击任意单词即时获取定义、发音、翻译和例句
- **AI 语境解释** - 选中句子获取语法分析和文化背景解读
- **AI 语言导师** - 基于视频内容的上下文感知对话练习
- **间隔重复复习** - SM-2 算法驱动的生词本，科学安排复习计划
- **可拖拽界面元素** - 可重新定位的学习面板和字幕，支持磨砂玻璃效果

#### 技术亮点

- **多层翻译缓存** - 数据库 → 内存 → AI API 三级缓存，显著降低 API 调用
- **Provider 抽象层** - 灵活切换 Azure OpenAI / OpenAI / Ollama 本地模型
- **类型安全** - Python 模型自动生成 TypeScript 类型定义
- **模块化架构** - 清晰的路由分层和服务解耦
- **便携式打包** - 内置 Python 运行时的 Windows 安装包，开箱即用
- **安全优先设计** - SSRF 防护、CORS 限制、基于所有者的授权检查

---

### 安装方式

#### 方式一：下载安装包（推荐）

1. 从 [Releases](https://github.com/haanc/LinguaMaster/releases) 下载最新安装包
2. 运行 `LinguaMaster Setup x.x.x.exe`
3. 启动应用，开始学习！

**就这么简单！** 应用会在首次启动时自动下载所需依赖（yt-dlp、FFmpeg）。

> **注意：** 首次启动可能需要 1-2 分钟下载依赖，之后的启动会很快。

#### 方式二：从源码运行（命令行）

##### 环境要求

- **Node.js** >= 18
- **Python** >= 3.10
- **FFmpeg** - 音频处理必需
- **yt-dlp** - 视频下载必需

##### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/haanc/LinguaMaster.git
cd LinguaMaster

# 2. 后端设置
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cd ..

# 3. 前端设置
npm install
```

##### 配置 AI 服务

复制配置模板并填写你的 API 密钥：

```bash
cp backend/.env.example backend/.env
```

**backend/.env** 示例：

```ini
# ===== Azure OpenAI（推荐）=====
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-api-key
AZURE_OPENAI_API_VERSION=2024-02-01
AZURE_OPENAI_DEPLOYMENT_CHAT=gpt-4o
AZURE_OPENAI_DEPLOYMENT_WHISPER=whisper

# ===== 或使用 OpenAI =====
# OPENAI_API_KEY=sk-your-key
# OPENAI_MODEL_NAME=gpt-4-turbo

# ===== 或使用 Ollama 本地模型 =====
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL_NAME=llama3

# ===== 本地 Whisper（默认）=====
LOCAL_WHISPER_MODEL=base
LOCAL_WHISPER_DEVICE=auto
```

##### 运行应用

**开发模式：**

```bash
# 终端 1: 启动后端
cd backend
.\venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
python main.py

# 终端 2: 启动前端（在项目根目录）
npm run dev
```

> **重要：** 请勿使用 `uvicorn main:app --reload`，reload 模式与视频下载的 BackgroundTasks 冲突。

**构建安装包：**

```bash
# 准备后端（下载 Python Embeddable）
npm run build:prepare

# 构建 Electron 应用
npm run build
```

安装包将生成在 `release/` 目录。

---

### 使用指南

1. **导入视频** - 点击 "+ 添加视频"，粘贴 YouTube/Bilibili 链接
2. **学习模式** - 点击单词查看定义，点击 🌐 开启双语字幕
3. **AI 功能** - 使用 ✨ 进行语法分析，与 AI 导师对话
4. **生词本** - 保存单词到笔记本，使用 SM-2 算法复习
5. **设置** - 配置你偏好的 AI 提供商（Azure、OpenAI、Ollama）

---

### 技术栈

| 层级 | 技术 |
|------|-----|
| 前端 | React, TypeScript, Vite, Electron, TanStack Query, Radix UI, i18next |
| 后端 | FastAPI, SQLModel (SQLite), LangChain, faster-whisper, yt-dlp |
| AI 模型 | Azure OpenAI, OpenAI, Ollama, Whisper（本地/云端）|

---

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Electron 开发模式 |
| `npm run dev:web` | 仅启动 Web 开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run build:prepare` | 打包后端（含 Python Embeddable）|
| `npm run build:full` | 完整构建（后端 + 前端）|
| `npm run gen:types` | 从 Python 模型生成 TypeScript 类型 |

---

### 常见问题

| 问题 | 解决方案 |
|------|---------|
| 后端启动失败 | 检查端口 8000 是否被占用，终止孤儿 Python 进程。|
| 视频导入失败 | 确保 FFmpeg 和 yt-dlp 已安装（安装包版本会自动下载）。|
| API 密钥错误 | 检查 `.env` 配置，密钥区分大小写。|

---

### 许可证

[MIT](LICENSE)

---

<a name="日本語"></a>

## 🇯🇵 日本語

### 機能

#### コア機能

- **動画インポート** - ローカル動画またはURL経由でダウンロード（yt-dlp対応、YouTube、Bilibiliなど）
- **AI字幕生成** - OpenAI Whisper / faster-whisperによる自動文字起こしとタイムスタンプ付き字幕
- **バイリンガル字幕** - ワンクリックで翻訳、中国語、英語、日本語、フランス語、ドイツ語、スペイン語など対応
- **インタラクティブ辞書** - 単語をクリックして定義、発音、翻訳、例文を即座に取得
- **AIコンテキスト解説** - 文を選択して文法分析と文化的背景を取得
- **AI言語チューター** - 動画コンテンツに基づいたコンテキスト対応会話練習
- **間隔反復復習** - SM-2アルゴリズムによる科学的な復習スケジューリング
- **ドラッグ可能なUI要素** - 学習パネルと字幕を自由に配置、グラスモーフィズム効果付き

---

### インストール

#### オプション1：インストーラーをダウンロード（推奨）

1. [Releases](https://github.com/haanc/LinguaMaster/releases)から最新のインストーラーをダウンロード
2. `LinguaMaster Setup x.x.x.exe`を実行
3. アプリを起動して学習開始！

**これだけです！** 初回起動時に必要な依存関係（yt-dlp、FFmpeg）は自動でダウンロードされます。

#### オプション2：ソースからビルド（コマンドライン）

##### 要件

- **Node.js** >= 18
- **Python** >= 3.10
- **FFmpeg** - オーディオ処理に必要
- **yt-dlp** - 動画ダウンロードに必要

##### インストール手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/haanc/LinguaMaster.git
cd LinguaMaster

# 2. バックエンドセットアップ
cd backend
python -m venv venv

# Windows:
.\venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
cd ..

# 3. フロントエンドセットアップ
npm install
```

##### アプリケーションの実行

**開発モード：**

```bash
# ターミナル1: バックエンド起動
cd backend
.\venv\Scripts\activate  # Windows
python main.py

# ターミナル2: フロントエンド起動（プロジェクトルートで）
npm run dev
```

---

### 使用ガイド

1. **動画をインポート** - 「+ 動画を追加」をクリックし、YouTube/BilibiliのURLを貼り付け
2. **学習モード** - 単語をクリックして定義を表示、🌐でバイリンガル字幕を有効化
3. **AI機能** - ✨で文法分析、AIチューターとチャット
4. **単語帳** - 単語をノートブックに保存、SM-2スケジューリングで復習
5. **設定** - お好みのAIプロバイダーを設定（Azure、OpenAI、Ollama）

---

### ライセンス

[MIT](LICENSE)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/haanc">@haanc</a>
</p>
