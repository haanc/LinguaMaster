import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import { UserProvider } from './contexts/UserContext'
import './index.css'

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <UserProvider>
        <App />
      </UserProvider>
    </QueryClientProvider>
  </React.StrictMode>,
)

// Use contextBridge
// if (window.ipcRenderer) {
//   window.ipcRenderer.on('main-process-message', (_event, message) => {
//     console.log(message)
//   })
// }
