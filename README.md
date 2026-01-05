# Fluent Learner v2

Fluent Learner v2 is an advanced, AI-powered language learning application built with Electron, React, and Python. It leverages modern AI (OpenAI/Azure OpenAI) to transform generic media content into interactive language learning lessons, providing real-time translations, context explanations, and an AI tutor.

## 🚀 Features

- **Media Integration**: Import videos or download content directly (via `yt-dlp`) to build your local library.
- **AI Subtitles**: Automatic transcription and timestamping using OpenAI Whisper (or Azure Whisper).
- **Interactive Dictionary**: Click on any word in the subtitles to get instant definitions, context-aware usage examples, and translations.
- **AI Context Explainer**: Get cultural and grammatical explanations for complex phrases or sentences.
- **AI Tutor**: Chat with a context-aware AI tutor that helps you practice conversational skills based on the content you are watching.
- **Local Library**: Manage your learning materials and progress locally with a SQLite database.
- **Cross-Platform**: Built on Electron for a native desktop experience on Windows (and potentially Mac/Linux).

## 🛠 Tech Stack

### Frontend
- **Framework**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Desktop Runtime**: [Electron](https://www.electronjs.org/)
- **Styling**: Vanilla CSS / [Tailwind utilities](https://github.com/dcastil/tailwind-merge) + [Radix UI](https://www.radix-ui.com/)
- **State Management**: [TanStack Query](https://tanstack.com/query/latest)
- **Icons**: [Lucide React](https://lucide.dev/)

### Backend
- **Server**: [FastAPI](https://fastapi.tiangolo.com/)
- **Database**: [SQLModel](https://sqlmodel.tiangolo.com/) (SQLite)
- **AI & LLM Orchestration**: [LangChain](https://www.langchain.com/) & [LangGraph](https://langchain-ai.github.io/langgraph/)
- **Media Processing**: [yt-dlp](https://github.com/yt-dlp/yt-dlp)
- **AI Models**: OpenAI GPT-4 / Azure OpenAI Service

## 📦 Prerequisites

Ensure you have the following installed:
- **Node.js** (v18 or higher)
- **Python** (v3.10 or higher)
- **FFmpeg** (Required for media processing) - Ensure it's added to your system PATH.

## ⚙️ Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/haanc/Fluent-Learner-v2.git
   cd Fluent-Learner-v2
   ```

2. **Backend Setup**
   ```bash
   cd backend
   # Create a virtual environment
   python -m venv venv
   
   # Activate virtual environment
   # Windows:
   .\venv\Scripts\activate
   # Mac/Linux:
   # source venv/bin/activate
   
   # Install dependencies
   pip install -r requirements.txt
   ```

3. **Frontend Setup**
   ```bash
   # Return to root directory
   cd ..
   
   # Install Node dependencies
   npm install
   ```

## 🔐 Configuration

Create a `.env` file in the `backend/` directory. You can copy the example if available or use the template below.

**`backend/.env`**
```ini
# OpenAI Configuration (Choose standard OpenAI OR Azure)
# Option 1: Standard OpenAI
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL_NAME=gpt-4-turbo

# Option 2: Azure OpenAI
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_KEY=your-azure-key
AZURE_OPENAI_API_VERSION=2024-02-01
AZURE_OPENAI_DEPLOYMENT_CHAT=gpt-4o
AZURE_OPENAI_DEPLOYMENT_WHISPER=whisper

# Database
DATABASE_URL=sqlite:///learning.db
```

## ▶️ Running the Application

You need to run both the backend server and the Electron app.

1. **Start the Backend**
   Open a terminal, activate your Python venv, and run:
   ```bash
   cd backend
   uvicorn main:app --reload --port 8000
   ```

2. **Start the Frontend (Electron)**
   Open a second terminal in the project root and run:
   ```bash
   npm run dev
   ```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

[MIT](LICENSE)
