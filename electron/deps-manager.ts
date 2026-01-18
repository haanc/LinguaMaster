/**
 * Dependency Manager
 *
 * Checks for and auto-downloads required external dependencies:
 * - FFmpeg: Required for audio extraction and transcription
 * - yt-dlp: Required for video download and streaming
 *
 * Dependencies are downloaded to the app's userData directory.
 */

import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import https from 'node:https'
import { execSync, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'

// Dependency configuration
interface DependencyConfig {
  name: string
  executable: string
  downloadUrl: string
  isArchive: boolean
  extractPath?: string // Path pattern inside archive to the executable
}

const DEPS_DIR_NAME = 'deps'

// Get the deps directory path
export function getDepsDir(): string {
  return path.join(app.getPath('userData'), DEPS_DIR_NAME)
}

// Get path to a specific dependency executable
export function getDepPath(execName: string): string {
  return path.join(getDepsDir(), execName)
}

// Check if a dependency is available (either in deps dir or system PATH)
function isDependencyAvailable(execName: string): boolean {
  // Check in deps directory first
  const depsPath = getDepPath(execName)
  if (fs.existsSync(depsPath)) {
    return true
  }

  // Check in system PATH
  try {
    if (process.platform === 'win32') {
      execSync(`where ${execName}`, { stdio: 'ignore' })
    } else {
      execSync(`which ${execName}`, { stdio: 'ignore' })
    }
    return true
  } catch {
    return false
  }
}

// Get dependency configurations
function getDependencyConfigs(): DependencyConfig[] {
  const configs: DependencyConfig[] = []

  if (process.platform === 'win32') {
    configs.push({
      name: 'yt-dlp',
      executable: 'yt-dlp.exe',
      downloadUrl: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe',
      isArchive: false,
    })

    configs.push({
      name: 'FFmpeg',
      executable: 'ffmpeg.exe',
      // Use a smaller FFmpeg build (essentials only)
      downloadUrl: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
      isArchive: true,
      extractPath: 'bin/ffmpeg.exe',
    })
  }

  return configs
}

// Download a file with progress callback
async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: (percent: number, downloaded: number, total: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath)

    const request = https.get(url, { timeout: 60000 }, (response) => {
      // Handle redirects (301, 302, 303, 307, 308)
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          file.close()
          if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
          // Handle relative URLs
          const finalUrl = redirectUrl.startsWith('http') ? redirectUrl : new URL(redirectUrl, url).href
          downloadFile(finalUrl, destPath, onProgress).then(resolve).catch(reject)
          return
        }
      }

      if (response.statusCode !== 200) {
        file.close()
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
        reject(new Error(`Download failed with status ${response.statusCode}`))
        return
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10)
      let downloadedSize = 0

      response.on('data', (chunk) => {
        downloadedSize += chunk.length
        if (onProgress && totalSize > 0) {
          onProgress(Math.round((downloadedSize / totalSize) * 100), downloadedSize, totalSize)
        }
      })

      response.pipe(file)

      file.on('finish', () => {
        file.close()
        resolve()
      })
    })

    request.on('error', (err) => {
      file.close()
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
      reject(err)
    })

    request.on('timeout', () => {
      request.destroy()
      file.close()
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath)
      reject(new Error('Download timed out'))
    })
  })
}

// Extract zip file using PowerShell (Windows built-in)
async function extractZipWithPowerShell(zipPath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path "${zipPath}" -DestinationPath "${destDir}" -Force`
    ])

    let stderr = ''
    ps.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    ps.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Extraction failed: ${stderr}`))
      }
    })

    ps.on('error', reject)
  })
}

// Find file matching pattern in directory (recursive)
function findFileByPattern(dir: string, pattern: string): string | null {
  // pattern like "bin/ffmpeg.exe" - we need to find **/bin/ffmpeg.exe
  const targetFile = path.basename(pattern)
  const targetDir = path.dirname(pattern)

  function searchDir(currentDir: string): string | null {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)

        if (entry.isFile() && entry.name === targetFile) {
          // Check if parent directory matches
          const parentDir = path.basename(path.dirname(fullPath))
          if (targetDir === '.' || parentDir === path.basename(targetDir)) {
            return fullPath
          }
        }

        if (entry.isDirectory()) {
          const found = searchDir(fullPath)
          if (found) return found
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
    return null
  }

  return searchDir(dir)
}

export interface DependencyStatus {
  name: string
  available: boolean
  path?: string
}

export interface DownloadProgress {
  dependency: string
  status: 'checking' | 'downloading' | 'extracting' | 'done' | 'error'
  percent?: number
  message?: string
}

// Check all dependencies
export function checkDependencies(): DependencyStatus[] {
  const configs = getDependencyConfigs()
  const results: DependencyStatus[] = []

  for (const config of configs) {
    const available = isDependencyAvailable(config.executable)
    results.push({
      name: config.name,
      available,
      path: available ? getDepPath(config.executable) : undefined,
    })
  }

  return results
}

// Get missing dependencies
export function getMissingDependencies(): string[] {
  return checkDependencies()
    .filter(d => !d.available)
    .map(d => d.name)
}

// Download missing dependencies
export async function downloadMissingDependencies(
  onProgress?: (progress: DownloadProgress) => void
): Promise<void> {
  const configs = getDependencyConfigs()
  const depsDir = getDepsDir()

  // Ensure deps directory exists
  if (!fs.existsSync(depsDir)) {
    fs.mkdirSync(depsDir, { recursive: true })
  }

  for (const config of configs) {
    if (isDependencyAvailable(config.executable)) {
      onProgress?.({ dependency: config.name, status: 'done', message: 'Already available' })
      continue
    }

    try {
      onProgress?.({ dependency: config.name, status: 'downloading', percent: 0 })

      const destPath = config.isArchive
        ? path.join(depsDir, `${config.name}-temp.zip`)
        : getDepPath(config.executable)

      // Download
      await downloadFile(config.downloadUrl, destPath, (percent, downloaded, total) => {
        const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1)
        onProgress?.({
          dependency: config.name,
          status: 'downloading',
          percent,
          message: `${mb(downloaded)} / ${mb(total)} MB`,
        })
      })

      // Extract if needed
      if (config.isArchive && config.extractPath) {
        onProgress?.({ dependency: config.name, status: 'extracting' })

        const tempExtractDir = path.join(depsDir, `${config.name}-extract`)
        if (fs.existsSync(tempExtractDir)) {
          fs.rmSync(tempExtractDir, { recursive: true })
        }
        fs.mkdirSync(tempExtractDir, { recursive: true })

        await extractZipWithPowerShell(destPath, tempExtractDir)

        // Find the executable in extracted files
        const execPath = findFileByPattern(tempExtractDir, config.extractPath)
        if (execPath) {
          // Copy to deps directory
          const finalPath = getDepPath(config.executable)
          fs.copyFileSync(execPath, finalPath)
          console.log(`Extracted ${config.executable} to ${finalPath}`)

          // Also copy ffprobe if we're extracting FFmpeg
          if (config.name === 'FFmpeg') {
            const ffprobePath = findFileByPattern(tempExtractDir, 'bin/ffprobe.exe')
            if (ffprobePath) {
              fs.copyFileSync(ffprobePath, getDepPath('ffprobe.exe'))
              console.log('Extracted ffprobe.exe')
            }
          }
        } else {
          throw new Error(`Could not find ${config.extractPath} in archive`)
        }

        // Cleanup temp files
        fs.rmSync(tempExtractDir, { recursive: true })
        fs.unlinkSync(destPath)
      }

      onProgress?.({ dependency: config.name, status: 'done' })
    } catch (error) {
      onProgress?.({
        dependency: config.name,
        status: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }
}

// Get environment PATH that includes deps directory
export function getEnhancedPath(): string {
  const depsDir = getDepsDir()
  const currentPath = process.env.PATH || ''

  if (currentPath.includes(depsDir)) {
    return currentPath
  }

  return `${depsDir}${path.delimiter}${currentPath}`
}

// Get environment variables with deps in PATH
export function getEnhancedEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: getEnhancedPath(),
  }
}
