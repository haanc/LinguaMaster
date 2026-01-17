import { app, BrowserWindow, protocol, ipcMain, dialog } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import { spawn, ChildProcess } from 'node:child_process'


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

// Register local protocol for videos
function registerLocalProtocol() {
  protocol.handle('local-video', (request) => {
    try {
      let pathPart = request.url.slice('local-video://'.length)
      const filePath = decodeURIComponent(pathPart)

      const stat = fs.statSync(filePath)
      const fileSize = stat.size
      const range = request.headers.get('Range')

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-")
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
        const chunksize = (end - start) + 1

        const file = fs.createReadStream(filePath, { start, end })
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
        const file = fs.createReadStream(filePath)
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
}

function startPythonBackend() {
  // Check multiple indicators for dev mode
  const isDev = VITE_DEV_SERVER_URL != null ||
                process.env.NODE_ENV === 'development' ||
                !app.isPackaged

  if (isDev) {
    console.log('Dev mode detected: Skipping auto-spawn of Python backend. Please ensure backend is running manually.')
    return
  }

  // In production, backend is in resources/backend-dist
  // Uses Python Embeddable (portable, no venv path issues)
  const backendDir = path.join(process.resourcesPath, 'backend-dist')
  const pythonPath = path.join(backendDir, 'python', 'python.exe')
  const scriptPath = path.join(backendDir, 'main.py')

  // Set environment variables for the backend
  const backendEnv = {
    ...process.env,
    // Use app's userData directory for database and models
    LINGUAMASTER_DATA_DIR: app.getPath('userData'),
    WHISPER_MODELS_DIR: path.join(app.getPath('userData'), 'whisper-models'),
    DATABASE_PATH: path.join(app.getPath('userData'), 'learning.db'),
  }

  console.log('Starting Python backend...')
  console.log('  Python:', pythonPath)
  console.log('  Script:', scriptPath)
  console.log('  Data Dir:', backendEnv.LINGUAMASTER_DATA_DIR)

  if (!fs.existsSync(pythonPath)) {
    console.error('Python executable not found:', pythonPath)
    return
  }

  if (!fs.existsSync(scriptPath)) {
    console.error('Backend script not found:', scriptPath)
    return
  }

  pyProcess = spawn(pythonPath, [scriptPath], {
    env: backendEnv,
    cwd: backendDir,
  })

  pyProcess.stdout?.on('data', (data) => {
    console.log(`Python: ${data}`)
  })

  pyProcess.stderr?.on('data', (data) => {
    console.error(`Python Error: ${data}`)
  })

  pyProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`)
  })

  pyProcess.on('error', (err) => {
    console.error('Failed to start Python backend:', err)
  })
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
      webSecurity: false, // Allow cross-origin requests in dev mode
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
  if (pyProcess) {
    console.log('Terminating Python backend...')
    pyProcess.kill()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  registerLocalProtocol()
  handleIpc()
  startPythonBackend()
  createWindow()
})
