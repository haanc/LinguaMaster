#!/bin/bash
# Fluent Learner v2 - Development Startup Script
# Usage: ./dev.sh

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"

echo "🚀 Starting Fluent Learner v2 Development Environment..."

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down..."
    kill $BACKEND_PID 2>/dev/null || true
    kill $FRONTEND_PID 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start Backend
echo "📦 Starting Python Backend..."
cd "$BACKEND_DIR"

# Detect venv path (Windows vs Unix)
if [ -f "venv/Scripts/activate" ]; then
    source venv/Scripts/activate
elif [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
else
    echo "❌ Virtual environment not found. Please run: cd backend && python -m venv venv && pip install -r requirements.txt"
    exit 1
fi

uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "✅ Backend started (PID: $BACKEND_PID)"

# Wait for backend to be ready
echo "⏳ Waiting for backend to start..."
sleep 3

# Start Frontend
echo "🎨 Starting Frontend..."
cd "$PROJECT_ROOT"
npm run dev &
FRONTEND_PID=$!
echo "✅ Frontend started (PID: $FRONTEND_PID)"

echo ""
echo "=========================================="
echo "🎉 Development environment ready!"
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8000"
echo "   API Docs: http://localhost:8000/docs"
echo "=========================================="
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for both processes
wait
