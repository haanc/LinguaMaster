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
  <a href="./README.zh-CN.md">中文</a> | English
</p>

---

## Features

### Core Functionality

- **Video Import** - Support local videos or download via URL (powered by yt-dlp, supports YouTube, Bilibili, etc.)
- **AI Subtitle Generation** - Automatic transcription with timestamps using OpenAI Whisper / faster-whisper
- **Bilingual Subtitles** - One-click translation supporting Chinese, English, Japanese, French, German, Spanish, and more
- **Interactive Dictionary** - Click any word for instant definitions, pronunciation, translations, and example sentences
- **AI Context Explanation** - Select sentences for grammar analysis and cultural background
- **AI Language Tutor** - Context-aware conversation practice based on video content
- **Spaced Repetition Review** - SM-2 algorithm-powered vocabulary notebook with scientific review scheduling

### Technical Highlights

- **Multi-layer Translation Cache** - Database → Memory → AI API three-tier caching for reduced API calls
- **Provider Abstraction Layer** - Flexibly switch between Azure OpenAI / OpenAI / Ollama / local models
- **Type Safety** - Python models auto-generate TypeScript type definitions
- **Modular Architecture** - Clean route layering and service decoupling
- **Portable Packaging** - Self-contained Windows installer with embedded Python runtime
- **Security-First Design** - SSRF protection, CORS restrictions, owner-based authorization

---

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/) | UI Framework |
| [Vite](https://vitejs.dev/) | Build Tool |
| [Electron](https://www.electronjs.org/) | Desktop Runtime |
| [TanStack Query](https://tanstack.com/query) | State Management & Data Caching |
| [Radix UI](https://www.radix-ui.com/) | Accessible Component Library |
| [i18next](https://www.i18next.com/) | Internationalization |

### Backend

| Technology | Purpose |
|------------|---------|
| [FastAPI](https://fastapi.tiangolo.com/) | API Server |
| [SQLModel](https://sqlmodel.tiangolo.com/) | ORM (SQLite) |
| [LangChain](https://www.langchain.com/) | LLM Orchestration |
| [faster-whisper](https://github.com/SYSTRAN/faster-whisper) | Local Speech-to-Text |
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Video Download |

### AI Model Support

- **Azure OpenAI** - GPT-4o / GPT-4 / Reasoning models
- **Azure APIM** - API Management proxy support
- **OpenAI** - GPT-4 Turbo / GPT-4o
- **Ollama** - Local models (Llama, Mistral, etc.)
- **Whisper** - Speech-to-text (Azure / OpenAI / Local faster-whisper)

---

## Project Structure

```
LinguaMaster/
├── src/                      # React Frontend
│   ├── components/           # UI Components
│   │   ├── SubtitleSidebar   # Interactive subtitle panel
│   │   ├── WordPopover       # Word popup card
│   │   ├── TutorPanel        # AI tutor panel
│   │   ├── LibraryGrid       # Media library grid
│   │   ├── NotebookView      # Vocabulary notebook
│   │   └── Settings/         # LLM configuration
│   ├── services/api.ts       # API client
│   ├── i18n/                 # Internationalization
│   └── types/generated.ts    # Auto-generated types
│
├── backend/                  # Python Backend
│   ├── main.py               # FastAPI entry point
│   ├── routes/               # API route modules
│   │   ├── media.py          # Media CRUD, transcription, translation
│   │   ├── vocab.py          # Vocabulary & SRS review
│   │   ├── ai.py             # AI feature endpoints
│   │   └── streaming.py      # Video stream proxy
│   ├── ai/                   # AI service layer
│   │   ├── config.py         # Unified configuration
│   │   ├── providers/        # LLM/Whisper abstraction
│   │   └── chains.py         # LangChain chains
│   └── models.py             # Database models
│
├── electron/                 # Electron main process
├── scripts/                  # Build scripts
│   └── prepare-backend.ps1   # Backend packaging (Python Embeddable)
└── docs/                     # Documentation
```

---

## Quick Start

### Download Release

Download the latest installer from [Releases](https://github.com/haanc/LinguaMaster/releases).

**Important:** You need to install FFmpeg for audio extraction and transcription:

**Windows (recommended - using winget):**
```powershell
winget install FFmpeg
```

**Or download manually:** [FFmpeg Downloads](https://ffmpeg.org/download.html) - add to system PATH.

### Build from Source

#### Requirements

- **Node.js** >= 18
- **Python** >= 3.10
- **FFmpeg** - Must be in system PATH

#### Installation

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
# source venv/bin/activate

pip install -r requirements.txt
cd ..

# 3. Frontend setup
npm install
```

### Configure AI Services

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

### Run the App

**Development mode:**

```bash
# Terminal 1: Start backend
cd backend
.\venv\Scripts\activate  # Windows
uvicorn main:app --reload --port 8000

# Terminal 2: Start frontend
npm run dev
```

**Build installer:**

```bash
# Prepare backend (downloads Python Embeddable)
npm run build:prepare

# Build Electron app
npm run build
```

The installer will be created in the `release/` directory.

---

## Usage Guide

### 1. Import Videos

- Click the **"+ Add Video"** button
- Paste a YouTube / Bilibili video URL
- Wait for download and AI transcription to complete

### 2. Learning Mode

- **Click a word** → View definition, pronunciation, translation
- **Click 🌐** → Enable bilingual subtitles
- **Click ✨** → AI analysis of grammar and cultural context
- **Select text** → Right-click menu for more options

### 3. Vocabulary Notebook

- Click **"Save"** on word cards to add to vocabulary
- View and review in the **Notebook** tab
- SM-2 algorithm intelligently schedules review times

### 4. Configure AI Provider

- Click the **Settings** icon in the sidebar
- Add your preferred LLM provider (Azure APIM, OpenAI, Ollama, etc.)
- API keys are stored locally and never sent to external servers

---

## Development

### Generate TypeScript Types

After modifying Python models, sync types:

```bash
npm run gen:types
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Electron dev mode |
| `npm run dev:web` | Start web dev server only |
| `npm run build` | Build production version |
| `npm run build:prepare` | Package backend with Python Embeddable |
| `npm run build:full` | Full build (backend + frontend) |
| `npm run gen:types` | Generate TypeScript types |

---

## Contributing

Pull requests are welcome! Before submitting, please ensure:

1. Code passes ESLint checks
2. New features include appropriate tests
3. Documentation is updated

---

## License

[MIT](LICENSE)

---

<p align="center">
  Made with AI by <a href="https://github.com/haanc">@haanc</a>
</p>
