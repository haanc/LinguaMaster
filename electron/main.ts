import { app, BrowserWindow, protocol, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { spawn, ChildProcess } from 'node:child_process'
import {
  checkDependencies,
  getMissingDependencies,
  downloadMissingDependencies,
  getDepsDir,
  DownloadProgress,
} from './deps-manager'


const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

// Disable Chromium's autofill and password manager features
app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,PasswordManagerOnboarding')
app.commandLine.appendSwitch('disable-component-update')

let win: BrowserWindow | null
let pyProcess: ChildProcess | null = null
let backendStatus: 'not_started' | 'starting' | 'ready' | 'error' = 'not_started'
let backendError: string | null = null

// Register local protocol for videos
function registerLocalProtocol() {
  protocol.handle('local-video', (request) => {
    try {
      let pathPart = request.url.slice('local-video://'.length)
      const filePath = decodeURIComponent(pathPart)

      // Security: Validate file path to prevent path traversal attacks
      const normalizedPath = path.normalize(filePath)
      const allowedExtensions = ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.mp3', '.wav', '.ogg']
      const ext = path.extname(normalizedPath).toLowerCase()

      if (!allowedExtensions.includes(ext)) {
        console.error('Local Video: Invalid file extension:', ext)
        return new Response('Forbidden', { status: 403 })
      }

      // Ensure the file exists and is a file (not a directory)
      if (!fs.existsSync(normalizedPath)) {
        return new Response('Not Found', { status: 404 })
      }

      const stat = fs.statSync(normalizedPath)
      if (!stat.isFile()) {
        return new Response('Not Found', { status: 404 })
      }

      const fileSize = stat.size
      const range = request.headers.get('Range')

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-")
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunksize = (end - start) + 1

        const file = fs.createReadStream(normalizedPath, { start, end })
        // @ts-ignore
        const stream = Readable.toWeb(file)

        return new Response(stream as any, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Content-Length': chunksize.toString(),
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes'
          }
        })
      } else {
        const file = fs.createReadStream(normalizedPath)
        // @ts-ignore
        const stream = Readable.toWeb(file)
        return new Response(stream as any, {
          status: 200,
          headers: {
            'Content-Length': fileSize.toString(),
            'Content-Type': 'video/mp4',
            'Accept-Ranges': 'bytes'
          }
        })
      }
    } catch (e) {
      console.error('Local Video Error:', e)
      return new Response('Not Found', { status: 404 })
    }
  })
}

function handleIpc() {
  ipcMain.handle('open-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Movies', extensions: ['mkv', 'avi', 'mp4', 'webm'] },
        { name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (canceled) return null
    return filePaths[0]
  })

  // Window control handlers for custom titlebar
  ipcMain.handle('window-minimize', () => {
    win?.minimize()
  })
  ipcMain.handle('window-maximize', () => {
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })
  ipcMain.handle('window-close', () => {
    win?.close()
  })

  // Dependency management handlers
  ipcMain.handle('check-dependencies', () => {
    return checkDependencies()
  })

  ipcMain.handle('get-missing-dependencies', () => {
    return getMissingDependencies()
  })

  ipcMain.handle('download-dependencies', async () => {
    try {
      await downloadMissingDependencies((progress: DownloadProgress) => {
        // Send progress to renderer
        win?.webContents.send('dependency-download-progress', progress)
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  // Backend status handler
  ipcMain.handle('get-backend-status', () => {
    return { status: backendStatus, error: backendError }
  })
}

function sendBackendStatus() {
  if (win) {
    win.webContents.send('backend-status-change', { status: backendStatus, error: backendError })
  }
}

async function waitForBackendReady(maxWaitMs: number = 60000): Promise<boolean> {
  const startTime = Date.now()
  const checkInterval = 500 // Check every 500ms

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch('http://localhost:8000/health', {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      })
      if (response.ok) {
        return true
      }
    } catch {
      // Backend not ready yet, continue waiting
    }
    await new Promise(resolve => setTimeout(resolve, checkInterval))
  }
  return false
}

async function killExistingBackend(): Promise<void> {
  if (process.platform !== 'win32') return

  console.log('Checking for orphaned backend processes...')
  try {
    // Find and kill any Python processes running our backend
    const { execSync } = require('child_process')
    const output = execSync(
      'wmic process where "CommandLine like \'%backend-dist%main.py%\'" get ProcessId 2>nul',
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    )
    const pids = output.split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => /^\d+$/.test(line))

    for (const pid of pids) {
      console.log('Killing orphaned backend process:', pid)
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' })
      } catch {
        // Ignore errors - process may have already exited
      }
    }
  } catch {
    // wmic command failed, ignore
  }
}

async function startPythonBackend() {
  // Check multiple indicators for dev mode
  const isDev = VITE_DEV_SERVER_URL != null ||
                process.env.NODE_ENV === 'development' ||
                !app.isPackaged

  if (isDev) {
    console.log('Dev mode detected: Skipping auto-spawn of Python backend. Please ensure backend is running manually.')
    // In dev mode, check if backend is already running
    backendStatus = 'starting'
    sendBackendStatus()
    const ready = await waitForBackendReady(5000)
    if (ready) {
      backendStatus = 'ready'
      console.log('Dev mode: Backend is already running')
    } else {
      backendStatus = 'error'
      backendError = 'Backend not running. Please start it manually with: cd backend && uvicorn main:app --reload'
      console.log('Dev mode: Backend not detected, please start manually')
    }
    sendBackendStatus()
    return
  }

  // Production mode: Clean up any orphaned backend processes first
  await killExistingBackend()

  // Brief wait for port to be released
  await new Promise(resolve => setTimeout(resolve, 500))

  backendStatus = 'starting'
  backendError = null
  sendBackendStatus()

  // In production, backend is in resources/backend-dist
  // Uses Python Embeddable (portable, no venv path issues)
  const backendDir = path.join(process.resourcesPath, 'backend-dist')
  const pythonPath = path.join(backendDir, 'python', 'python.exe')
  const scriptPath = path.join(backendDir, 'main.py')

  console.log('Starting Python backend...')
  console.log('  Python:', pythonPath)
  console.log('  Script:', scriptPath)
  console.log('  Backend Dir:', backendDir)

  if (!fs.existsSync(pythonPath)) {
    console.error('FATAL: Python executable not found:', pythonPath)
    console.error('Available files in backend-dist:', fs.existsSync(backendDir) ? fs.readdirSync(backendDir) : 'DIR NOT FOUND')
    backendStatus = 'error'
    backendError = 'Python executable not found'
    sendBackendStatus()
    return
  }

  if (!fs.existsSync(scriptPath)) {
    console.error('FATAL: Backend script not found:', scriptPath)
    backendStatus = 'error'
    backendError = 'Backend script not found'
    sendBackendStatus()
    return
  }

  // Set environment variables for the backend
  // Include deps directory (FFmpeg, yt-dlp) in PATH if available
  let enhancedPath = process.env.PATH || ''
  try {
    const depsDir = getDepsDir()
    if (fs.existsSync(depsDir) && !enhancedPath.includes(depsDir)) {
      enhancedPath = `${depsDir}${path.delimiter}${enhancedPath}`
      console.log('  Deps Dir:', depsDir)
    }
  } catch (e) {
    console.warn('Could not get deps dir:', e)
  }

  const backendEnv = {
    ...process.env,
    PATH: enhancedPath,
    // Use app's userData directory for database and models
    LINGUAMASTER_DATA_DIR: app.getPath('userData'),
    WHISPER_MODELS_DIR: path.join(app.getPath('userData'), 'whisper-models'),
    DATABASE_PATH: path.join(app.getPath('userData'), 'learning.db'),
  }

  console.log('  Data Dir:', backendEnv.LINGUAMASTER_DATA_DIR)

  try {
    // Use shell: true on Windows to properly handle paths with spaces
    // The paths are wrapped in quotes to prevent shell interpretation issues
    pyProcess = spawn(`"${pythonPath}"`, [`"${scriptPath}"`], {
      env: backendEnv,
      cwd: backendDir,
      shell: true,
      windowsHide: true,
    })

    pyProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      console.log(`Python stdout: ${output}`)
      // Detect when uvicorn is ready
      if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
        backendStatus = 'ready'
        sendBackendStatus()
      }
    })

    pyProcess.stderr?.on('data', (data) => {
      const output = data.toString()
      console.error(`Python stderr: ${output}`)
      // uvicorn logs to stderr, so also check for ready signal here
      if (output.includes('Uvicorn running') || output.includes('Application startup complete')) {
        backendStatus = 'ready'
        sendBackendStatus()
      }
    })

    pyProcess.on('close', (code) => {
      console.log(`Python process exited with code ${code}`)
      if (code !== 0 && code !== null) {
        console.error('Backend crashed! Exit code:', code)
        backendStatus = 'error'
        backendError = `Backend process exited with code ${code}`
        sendBackendStatus()
      }
    })

    pyProcess.on('error', (err) => {
      console.error('Failed to start Python backend:', err)
      backendStatus = 'error'
      backendError = `Failed to start backend: ${err.message}`
      sendBackendStatus()
    })

    console.log('Python backend spawn initiated, PID:', pyProcess.pid)

    // Also check via HTTP health endpoint as a backup
    waitForBackendReady(60000).then(ready => {
      if (ready && backendStatus === 'starting') {
        backendStatus = 'ready'
        sendBackendStatus()
      } else if (!ready && backendStatus === 'starting') {
        backendStatus = 'error'
        backendError = 'Backend failed to respond within 60 seconds'
        sendBackendStatus()
      }
    })
  } catch (err) {
    console.error('Exception spawning Python backend:', err)
    backendStatus = 'error'
    backendError = `Exception starting backend: ${err instanceof Error ? err.message : 'Unknown error'}`
    sendBackendStatus()
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'LinguaMaster',
    icon: path.join(process.env.VITE_PUBLIC, 'icon.ico'),
    autoHideMenuBar: true, // Hide the menu bar
    frame: false, // Remove native window frame for custom titlebar
    titleBarStyle: 'hidden', // Fallback for macOS
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      webSecurity: true, // Enable security - backend CORS handles cross-origin
      spellcheck: false, // Disable spellcheck
    },
  })

  // Disable Chromium's autofill features
  win.webContents.session.setSpellCheckerEnabled(false)

  // Open DevTools manually with F12 or Ctrl+Shift+I
  // if (!app.isPackaged) {
  //   win.webContents.openDevTools()
  // }

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  // In dev mode, load from Vite dev server
  // vite-plugin-electron sets VITE_DEV_SERVER_URL automatically
  console.log('VITE_DEV_SERVER_URL:', VITE_DEV_SERVER_URL)
  console.log('app.isPackaged:', app.isPackaged)

  if (VITE_DEV_SERVER_URL) {
    console.log('Loading from VITE_DEV_SERVER_URL:', VITE_DEV_SERVER_URL)
    win.loadURL(VITE_DEV_SERVER_URL)
  } else if (!app.isPackaged) {
    // Fallback: load directly from localhost:5173
    const devUrl = 'http://localhost:5173'
    console.log('Fallback: Loading from', devUrl)
    win.loadURL(devUrl)
  } else {
    console.log('Production: Loading from dist')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('will-quit', () => {
  if (pyProcess && pyProcess.pid) {
    console.log('Terminating Python backend (PID:', pyProcess.pid, ')...')
    // On Windows, kill() may not work with shell: true
    // Use taskkill to forcefully terminate the process tree
    if (process.platform === 'win32') {
      try {
        require('child_process').execSync(`taskkill /PID ${pyProcess.pid} /T /F`, { stdio: 'ignore' })
        console.log('Python backend terminated via taskkill')
      } catch (e) {
        console.warn('taskkill failed, trying kill():', e)
        pyProcess.kill('SIGKILL')
      }
    } else {
      pyProcess.kill('SIGKILL')
    }
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(async () => {
  registerLocalProtocol()
  handleIpc()
  await startPythonBackend()
  createWindow()
})
