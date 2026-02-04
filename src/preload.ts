import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Platform
  getPlatform: () => ipcRenderer.invoke('get-platform'),

  // Auth
  getSession: () => ipcRenderer.invoke('auth:get-session'),
  signInWithGoogle: () => ipcRenderer.invoke('auth:sign-in-google'),
  signOut: () => ipcRenderer.invoke('auth:sign-out'),

  // Auth event listeners
  onAuthSuccess: (callback: (data: { user: any; email: string }) => void) => {
    ipcRenderer.on('auth-success', (_, data) => callback(data))
  },
  onAuthError: (callback: (error: string) => void) => {
    ipcRenderer.on('auth-error', (_, error) => callback(error))
  },

  // Sync
  syncAll: () => ipcRenderer.send('sync-all'),

  // Native features
  runAppleScript: (script: string) => ipcRenderer.invoke('run-applescript', script),
  findDocuments: (query: string) => ipcRenderer.invoke('find-documents', query),
  setupWorkspace: (config: any) => ipcRenderer.invoke('setup-workspace', config),
})

// Type declaration for renderer
declare global {
  interface Window {
    electronAPI: {
      // Platform
      getPlatform: () => Promise<string>

      // Auth
      getSession: () => Promise<{ user: any; accessToken: string } | null>
      signInWithGoogle: () => Promise<{ success?: boolean; error?: string }>
      signOut: () => Promise<{ success: boolean }>

      // Auth events
      onAuthSuccess: (callback: (data: { user: any; email: string }) => void) => void
      onAuthError: (callback: (error: string) => void) => void

      // Sync
      syncAll: () => void

      // Native features
      runAppleScript: (script: string) => Promise<string>
      findDocuments: (query: string) => Promise<string[]>
      setupWorkspace: (config: any) => Promise<void>
    }
  }
}
