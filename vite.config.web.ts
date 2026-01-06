import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Web-only config (no Electron)
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
})
