# LinguaMaster

<p align="center">
  <img src="public/icon.png" alt="LinguaMaster Logo" width="128" height="128">
</p>

<p align="center">
  <strong>AI 驱动的沉浸式语言学习应用</strong>
</p>

<p align="center">
  将任意视频内容转化为交互式语言课程，支持实时翻译、单词查询和 AI 语言导师
</p>

<p align="center">
  中文 | <a href="./README.md">English</a>
</p>

---

## v0.0.7 更新内容

- **修复：** 应用重启后视频播放 500 错误（孤儿 Python 进程导致端口冲突）
- **修复：** AI 导师无响应（LangGraph 1.0.6 缺失 cache 模块）
- **优化：** Windows 后端进程清理 - 正确终止子进程
- **优化：** 启动时孤儿进程检测和清理

---

## 功能特性

### 核心功能

- **视频导入** - 支持本地视频或通过 URL 直接下载（基于 yt-dlp，支持 YouTube、Bilibili 等）
- **AI 字幕生成** - 使用 OpenAI Whisper / faster-whisper 自动转录并生成时间戳字幕
- **双语字幕** - 一键翻译字幕，支持中、英、日、法、德、西班牙语等多语言
- **交互式词典** - 点击任意单词即时获取定义、发音、翻译和例句
- **AI 语境解释** - 选中句子获取语法分析和文化背景解读
- **AI 语言导师** - 基于视频内容的上下文感知对话练习
- **间隔重复复习** - SM-2 算法驱动的生词本，科学安排复习计划

### 技术亮点

- **多层翻译缓存** - 数据库 → 内存 → AI API 三级缓存，显著降低 API 调用
- **Provider 抽象层** - 灵活切换 Azure OpenAI / OpenAI / Ollama 本地模型
- **类型安全** - Python 模型自动生成 TypeScript 类型定义
- **模块化架构** - 清晰的路由分层和服务解耦
- **便携式打包** - 内置 Python 运行时的 Windows 安装包，开箱即用
- **安全优先设计** - SSRF 防护、CORS 限制、基于所有者的授权检查

---

## 技术栈

### 前端

| 技术 | 用途 |
|------|------|
| [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/) | UI 框架 |
| [Vite](https://vitejs.dev/) | 构建工具 |
| [Electron](https://www.electronjs.org/) | 桌面运行时 |
| [TanStack Query](https://tanstack.com/query) | 状态管理与数据缓存 |
| [Radix UI](https://www.radix-ui.com/) | 无障碍组件库 |
| [i18next](https://www.i18next.com/) | 国际化 |

### 后端

| 技术 | 用途 |
|------|------|
| [FastAPI](https://fastapi.tiangolo.com/) | API 服务器 |
| [SQLModel](https://sqlmodel.tiangolo.com/) | ORM（SQLite） |
| [LangChain](https://www.langchain.com/) | LLM 编排框架 |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | 本地语音转文字 |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | 视频下载 |

### AI 模型支持

- **Azure OpenAI** - GPT-4o / GPT-4 / 推理模型
- **Azure APIM** - API 管理代理支持
- **OpenAI** - GPT-4 Turbo / GPT-4o
- **Ollama** - 本地模型（Llama、Mistral 等）
- **Whisper** - 语音转文字（Azure / OpenAI / 本地 faster-whisper）

---

## 项目结构

```
LinguaMaster/
├── src/                      # React 前端
│   ├── components/           # UI 组件
│   │   ├── SubtitleSidebar   # 交互式字幕面板
│   │   ├── WordPopover       # 单词弹出卡片
│   │   ├── TutorPanel        # AI 导师面板
│   │   ├── LibraryGrid       # 媒体库网格
│   │   ├── NotebookView      # 生词本视图
│   │   └── Settings/         # LLM 配置
│   ├── services/api.ts       # API 客户端
│   ├── i18n/                 # 国际化
│   └── types/generated.ts    # 自动生成的类型
│
├── backend/                  # Python 后端
│   ├── main.py               # FastAPI 入口
│   ├── routes/               # API 路由模块
│   │   ├── media.py          # 媒体 CRUD、转录、翻译
│   │   ├── vocab.py          # 生词本 & SRS 复习
│   │   ├── ai.py             # AI 功能端点
│   │   └── streaming.py      # 视频流代理
│   ├── ai/                   # AI 服务层
│   │   ├── config.py         # 统一配置管理
│   │   ├── providers/        # LLM/Whisper 抽象
│   │   └── chains.py         # LangChain 链
│   └── models.py             # 数据库模型
│
├── electron/                 # Electron 主进程
├── scripts/                  # 构建脚本
│   └── prepare-backend.ps1   # 后端打包（Python Embeddable）
└── docs/                     # 文档
```

---

## 快速开始

### 下载安装

1. 从 [Releases](https://github.com/haanc/LinguaMaster/releases) 下载最新安装包
2. 运行 `LinguaMaster Setup x.x.x.exe`
3. 启动应用，开始学习！

**就这么简单！** 应用会在首次启动时自动下载所需依赖（yt-dlp、FFmpeg）。

> **注意：** 首次启动可能需要 1-2 分钟下载依赖，之后的启动会很快。

---

### 从源码构建

#### 环境要求

- **Node.js** >= 18
- **Python** >= 3.10
- **FFmpeg** - 需添加到系统 PATH
- **yt-dlp** - 需添加到系统 PATH

#### 安装步骤

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
# source venv/bin/activate

pip install -r requirements.txt
cd ..

# 3. 前端设置
npm install
```

### 配置 AI 服务

复制配置模板并填写你的 API 密钥：

```bash
cp backend/.env.example backend/.env
```

**backend/.env** 示例：

```ini
# ===== Azure OpenAI (推荐) =====
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

### 启动应用

**开发模式：**

```bash
# 终端 1: 启动后端
cd backend
.\venv\Scripts\activate  # Windows
python main.py
# 或: uvicorn main:app --port 8000 (不要用 --reload)

# 终端 2: 启动前端
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

## 使用指南

### 1. 导入视频

- 点击 **"+ 添加视频"** 按钮
- 粘贴 YouTube / Bilibili 等视频链接
- 等待下载和 AI 转录完成

### 2. 学习模式

- **点击单词** → 查看定义、发音、翻译
- **点击 🌐** → 开启双语字幕
- **点击 ✨** → AI 分析句子语法和文化背景
- **选中文本** → 右键菜单提供更多选项

### 3. 生词本

- 点击单词卡片中的 **"保存"** 收藏生词
- 在 **Notebook** 标签页查看和复习
- 系统使用 SM-2 算法智能安排复习时间

### 4. 配置 AI 提供商

- 点击侧边栏的 **设置** 图标
- 添加你偏好的 LLM 提供商（Azure APIM、OpenAI、Ollama 等）
- API 密钥仅存储在本地，不会发送到外部服务器

---

## 开发相关

### 生成 TypeScript 类型

当修改 Python 模型后，运行以下命令同步类型：

```bash
npm run gen:types
```

### 可用脚本

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动 Electron 开发模式 |
| `npm run dev:web` | 仅启动 Web 开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run build:prepare` | 打包后端（含 Python Embeddable）|
| `npm run build:full` | 完整构建（后端 + 前端）|
| `npm run gen:types` | 生成 TypeScript 类型 |

---

## 贡献指南

欢迎提交 Pull Request！提交前请确保：

1. 代码通过 ESLint 检查
2. 新功能附带相应测试
3. 更新相关文档

---

## 许可证

[MIT](LICENSE)

---

<p align="center">
  Made with AI by <a href="https://github.com/haanc">@haanc</a>
</p>
