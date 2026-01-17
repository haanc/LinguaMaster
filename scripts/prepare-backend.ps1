# Prepare Backend for Packaging
# This script creates a portable Python environment using Python Embeddable
# The embeddable version is fully self-contained and works on any Windows machine

param(
    [switch]$Clean,
    [switch]$IncludeWhisperModel,
    [string]$WhisperModel = "base",  # tiny, base, small, medium, large-v3
    [string]$PythonVersion = "3.12.4"
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
$EmbeddableDir = Join-Path $PackagedBackendDir "python"

Write-Host "=== LinguaMaster Backend Packager ===" -ForegroundColor Cyan
Write-Host "Project Root: $ProjectRoot"
Write-Host "Backend Dir: $BackendDir"
Write-Host "Output Dir: $PackagedBackendDir"
Write-Host "Python Version: $PythonVersion"

# Clean if requested
if ($Clean -and (Test-Path $PackagedBackendDir)) {
    Write-Host "Cleaning previous build..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $PackagedBackendDir
}

# Create output directory
New-Item -ItemType Directory -Force -Path $PackagedBackendDir | Out-Null

# Step 1: Download Python Embeddable
Write-Host "`n[1/5] Downloading Python Embeddable $PythonVersion..." -ForegroundColor Green

$PythonZipUrl = "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
$PythonZipPath = Join-Path $env:TEMP "python-embed.zip"

if (-not (Test-Path $EmbeddableDir)) {
    Write-Host "  Downloading from: $PythonZipUrl"
    Invoke-WebRequest -Uri $PythonZipUrl -OutFile $PythonZipPath -UseBasicParsing

    Write-Host "  Extracting..."
    New-Item -ItemType Directory -Force -Path $EmbeddableDir | Out-Null
    Expand-Archive -Path $PythonZipPath -DestinationPath $EmbeddableDir -Force
    Remove-Item $PythonZipPath -Force

    # Enable site-packages by modifying python312._pth
    $PthFile = Get-ChildItem $EmbeddableDir -Filter "python*._pth" | Select-Object -First 1
    if ($PthFile) {
        $PthContent = Get-Content $PthFile.FullName
        # Uncomment import site
        $PthContent = $PthContent -replace "^#import site", "import site"
        # Add Lib\site-packages
        $PthContent += "Lib\site-packages"
        # Add parent directory (backend-dist) to allow importing local modules
        $PthContent += ".."
        Set-Content -Path $PthFile.FullName -Value $PthContent
        Write-Host "  Enabled site-packages in $($PthFile.Name)"
        Write-Host "  Added parent directory (..) to Python path"
    }

    Write-Host "  Downloaded Python Embeddable"
} else {
    Write-Host "  Python Embeddable already exists, skipping download"
}

# Step 2: Install pip in embeddable Python
Write-Host "`n[2/5] Installing pip..." -ForegroundColor Green

$PythonExe = Join-Path $EmbeddableDir "python.exe"
$PipPath = Join-Path $EmbeddableDir "Scripts\pip.exe"
$SitePackagesDir = Join-Path $EmbeddableDir "Lib\site-packages"

if (-not (Test-Path $PipPath)) {
    # Download get-pip.py
    $GetPipUrl = "https://bootstrap.pypa.io/get-pip.py"
    $GetPipPath = Join-Path $env:TEMP "get-pip.py"

    Write-Host "  Downloading get-pip.py..."
    Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipPath -UseBasicParsing

    Write-Host "  Installing pip..."
    & $PythonExe $GetPipPath --no-warn-script-location
    Remove-Item $GetPipPath -Force

    Write-Host "  Pip installed"
} else {
    Write-Host "  Pip already installed, skipping"
}

# Step 3: Install dependencies
Write-Host "`n[3/5] Installing Python dependencies..." -ForegroundColor Green

$RequirementsPath = Join-Path $BackendDir "requirements.txt"
if (Test-Path $RequirementsPath) {
    Write-Host "  Installing from requirements.txt (this may take several minutes)..."
    & $PythonExe -m pip install -r $RequirementsPath --no-warn-script-location --quiet
    Write-Host "  Dependencies installed"
} else {
    Write-Host "  WARNING: requirements.txt not found at $RequirementsPath" -ForegroundColor Yellow
}

# Step 4: Copy Python source files
Write-Host "`n[4/5] Copying Python source files..." -ForegroundColor Green

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

# Step 5: Create launcher script and config
Write-Host "`n[5/5] Creating configuration and launcher..." -ForegroundColor Green

# Create .env.example
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

# Create a simple batch launcher for debugging
$LauncherBat = @"
@echo off
cd /d "%~dp0"
python\python.exe main.py
pause
"@

$LauncherBat | Out-File -FilePath (Join-Path $PackagedBackendDir "start-backend.bat") -Encoding ascii
Write-Host "  Created: start-backend.bat (for debugging)"

# Optional: Pre-download Whisper model
if ($IncludeWhisperModel) {
    Write-Host "`n[Bonus] Pre-downloading Whisper model: $WhisperModel..." -ForegroundColor Green

    $ModelsDir = Join-Path $PackagedBackendDir "whisper-models"
    New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null

    $DownloadScript = @"
from faster_whisper import WhisperModel
import sys
model = WhisperModel('$WhisperModel', device='cpu', download_root=r'$ModelsDir')
print(f'Model downloaded successfully')
"@

    $TempScript = Join-Path $env:TEMP "download_whisper.py"
    $DownloadScript | Out-File -FilePath $TempScript -Encoding utf8

    & $PythonExe $TempScript
    Remove-Item $TempScript -Force

    Write-Host "  Downloaded: $WhisperModel model"
}

# Clean up __pycache__ in site-packages
Write-Host "`nCleaning up cache files..." -ForegroundColor Yellow
Get-ChildItem $EmbeddableDir -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $EmbeddableDir -Recurse -Filter "*.pyc" | Remove-Item -Force -ErrorAction SilentlyContinue

# Calculate size
$Size = (Get-ChildItem $PackagedBackendDir -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB

Write-Host "`n=== Backend Packaging Complete ===" -ForegroundColor Cyan
Write-Host "Output: $PackagedBackendDir"
Write-Host "Size: $([math]::Round($Size, 2)) MB"
Write-Host ""
Write-Host "Structure:" -ForegroundColor Yellow
Write-Host "  backend-dist/"
Write-Host "    python/           <- Portable Python $PythonVersion"
Write-Host "    ai/               <- AI modules"
Write-Host "    routes/           <- API routes"
Write-Host "    main.py           <- Entry point"
Write-Host "    start-backend.bat <- Debug launcher"
Write-Host ""
Write-Host "Files excluded from package:" -ForegroundColor Yellow
Write-Host "  - .env (environment variables)"
Write-Host "  - *.db (database files)"
Write-Host "  - __pycache__/ (Python cache)"
Write-Host "  - *.pyc (compiled Python)"
