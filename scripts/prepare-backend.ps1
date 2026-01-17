# Prepare Backend for Packaging
# This script creates a portable Python environment with all dependencies

param(
    [switch]$Clean,
    [switch]$IncludeWhisperModel,
    [string]$WhisperModel = "base"  # tiny, base, small, medium, large-v3
)

$ErrorActionPreference = "Stop"

# Get project root (parent of scripts directory)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

if (-not $ProjectRoot -or -not (Test-Path $ProjectRoot)) {
    $ProjectRoot = "C:\Users\hancao\.gemini\antigravity\scratch\language-learner\fluent-learner-v2"
}

$BackendDir = Join-Path $ProjectRoot "backend"
$PackagedBackendDir = Join-Path $ProjectRoot "backend-dist"
$VenvDir = Join-Path $BackendDir "venv"

Write-Host "=== LinguaMaster Backend Packager ===" -ForegroundColor Cyan
Write-Host "Project Root: $ProjectRoot"
Write-Host "Backend Dir: $BackendDir"
Write-Host "Output Dir: $PackagedBackendDir"

# Clean if requested
if ($Clean -and (Test-Path $PackagedBackendDir)) {
    Write-Host "Cleaning previous build..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $PackagedBackendDir
}

# Create output directory
New-Item -ItemType Directory -Force -Path $PackagedBackendDir | Out-Null

# Step 1: Copy Python source files (excluding sensitive data)
Write-Host "`n[1/4] Copying Python source files..." -ForegroundColor Green

$SourceFiles = @(
    "main.py",
    "models.py",
    "database.py",
    "ai_service.py",
    "audio_service.py",
    "media_service.py",
    "translation_cache.py",
    "chunked_transcription.py",
    "requirements.txt"
)

foreach ($file in $SourceFiles) {
    $src = Join-Path $BackendDir $file
    if (Test-Path $src) {
        Copy-Item $src $PackagedBackendDir -Force
        Write-Host "  Copied: $file"
    }
}

# Copy directories
$SourceDirs = @("ai", "routes", "scripts")
foreach ($dir in $SourceDirs) {
    $srcDir = Join-Path $BackendDir $dir
    if (Test-Path $srcDir) {
        $destDir = Join-Path $PackagedBackendDir $dir
        Copy-Item $srcDir $destDir -Recurse -Force

        # Remove __pycache__ from copied directories
        Get-ChildItem $destDir -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

        Write-Host "  Copied directory: $dir"
    }
}

# Step 2: Copy Python virtual environment
Write-Host "`n[2/4] Copying Python virtual environment..." -ForegroundColor Green

$VenvDest = Join-Path $PackagedBackendDir "venv"
if (Test-Path $VenvDir) {
    # Copy only necessary parts of venv
    New-Item -ItemType Directory -Force -Path $VenvDest | Out-Null

    # Copy Scripts (python.exe, pip, etc.)
    $ScriptsSrc = Join-Path $VenvDir "Scripts"
    $ScriptsDest = Join-Path $VenvDest "Scripts"
    Copy-Item $ScriptsSrc $ScriptsDest -Recurse -Force
    Write-Host "  Copied: venv/Scripts"

    # Copy Lib/site-packages (all installed packages)
    $LibSrc = Join-Path $VenvDir "Lib"
    $LibDest = Join-Path $VenvDest "Lib"
    Copy-Item $LibSrc $LibDest -Recurse -Force
    Write-Host "  Copied: venv/Lib (this may take a while...)"

    # Copy pyvenv.cfg
    $PyvenvCfg = Join-Path $VenvDir "pyvenv.cfg"
    if (Test-Path $PyvenvCfg) {
        Copy-Item $PyvenvCfg $VenvDest -Force
    }

    # Clean up __pycache__ in site-packages
    Get-ChildItem $LibDest -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    # Remove .pyc files
    Get-ChildItem $LibDest -Recurse -Filter "*.pyc" | Remove-Item -Force -ErrorAction SilentlyContinue

    Write-Host "  Cleaned cache files"
} else {
    Write-Host "  WARNING: Virtual environment not found at $VenvDir" -ForegroundColor Yellow
    Write-Host "  Please run: cd backend && python -m venv venv && venv\Scripts\pip install -r requirements.txt"
}

# Step 3: Create .env.example (empty template)
Write-Host "`n[3/4] Creating configuration template..." -ForegroundColor Green

$EnvExample = @"
# LinguaMaster Backend Configuration
# Copy this file to .env and fill in your values

# Azure OpenAI (optional - for cloud transcription/AI)
# AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
# AZURE_OPENAI_API_KEY=your-api-key
# AZURE_OPENAI_DEPLOYMENT_CHAT=gpt-4
# AZURE_OPENAI_DEPLOYMENT_WHISPER=whisper

# Local Whisper Settings (default: uses local faster-whisper)
LOCAL_WHISPER_MODEL=base
LOCAL_WHISPER_DEVICE=auto
LOCAL_WHISPER_COMPUTE_TYPE=auto

# Database (auto-created in user data directory)
# DATABASE_URL will be set automatically
"@

$EnvExample | Out-File -FilePath (Join-Path $PackagedBackendDir ".env.example") -Encoding utf8
Write-Host "  Created: .env.example"

# Step 4: Pre-download Whisper model (optional)
if ($IncludeWhisperModel) {
    Write-Host "`n[4/4] Pre-downloading Whisper model: $WhisperModel..." -ForegroundColor Green

    $ModelsDir = Join-Path $PackagedBackendDir "whisper-models"
    New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null

    # Use the venv's Python to download the model
    $PythonExe = Join-Path $VenvDir "Scripts\python.exe"

    $DownloadScript = @"
from faster_whisper import WhisperModel
import sys
model = WhisperModel('$WhisperModel', device='cpu', download_root='$($ModelsDir -replace '\\', '/')')
print(f'Model {sys.argv[1] if len(sys.argv) > 1 else "$WhisperModel"} downloaded successfully')
"@

    $TempScript = Join-Path $env:TEMP "download_whisper.py"
    $DownloadScript | Out-File -FilePath $TempScript -Encoding utf8

    & $PythonExe $TempScript $WhisperModel

    Write-Host "  Downloaded: $WhisperModel model"
} else {
    Write-Host "`n[4/4] Skipping Whisper model pre-download (will download on first use)" -ForegroundColor Yellow
}

# Calculate size
$Size = (Get-ChildItem $PackagedBackendDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host "`n=== Backend Packaging Complete ===" -ForegroundColor Cyan
Write-Host "Output: $PackagedBackendDir"
Write-Host "Size: $([math]::Round($Size, 2)) MB"
Write-Host ""
Write-Host "Files excluded from package:" -ForegroundColor Yellow
Write-Host "  - .env (environment variables)"
Write-Host "  - *.db (database files)"
Write-Host "  - __pycache__/ (Python cache)"
Write-Host "  - *.pyc (compiled Python)"
