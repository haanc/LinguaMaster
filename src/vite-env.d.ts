/// <reference types="vite/client" />

// App version injected by Vite
declare const __APP_VERSION__: string

// Electron IPC Renderer interface
interface IpcRenderer {
  on(channel: string, listener: (event: any, ...args: any[]) => void): this
  off(channel: string, listener: (...args: any[]) => void): this
  send(channel: string, ...args: any[]): void
  invoke(channel: string, ...args: any[]): Promise<any>
}

declare global {
  interface Window {
    ipcRenderer: IpcRenderer
  }
}

export {}
