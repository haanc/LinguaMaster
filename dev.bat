@echo off
REM Fluent Learner v2 - Development Startup Script (Windows)
REM Usage: dev.bat

echo 🚀 Starting Fluent Learner v2 Development Environment...

REM Start Backend in new window
echo 📦 Starting Python Backend...
start "Backend" cmd /k "cd /d %~dp0backend && call venv\Scripts\activate && uvicorn main:app --reload --port 8000"

REM Wait for backend
echo ⏳ Waiting for backend to start...
timeout /t 3 /nobreak > nul

REM Start Frontend in new window
echo 🎨 Starting Frontend...
start "Frontend" cmd /k "cd /d %~dp0 && npm run dev"

echo.
echo ==========================================
echo 🎉 Development environment ready!
echo    Frontend: http://localhost:5173
echo    Backend:  http://localhost:8000
echo    API Docs: http://localhost:8000/docs
echo ==========================================
echo Close the terminal windows to stop services
echo.
