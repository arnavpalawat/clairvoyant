// Type declarations for Electron API exposed via preload
interface ElectronAPI {
  // Platform
  getPlatform: () => Promise<string>

  // Auth
  getSession: () => Promise<{ user: { id: string; email?: string }; accessToken: string } | null>
  signInWithGoogle: () => Promise<{ success?: boolean; error?: string }>
  signOut: () => Promise<{ success: boolean }>

  // Auth events
  onAuthSuccess: (callback: (data: { user: { id: string; email?: string }; email: string }) => void) => void
  onAuthError: (callback: (error: string) => void) => void

  // Sync
  syncAll: () => void

  // Native features
  runAppleScript: (script: string) => Promise<string>
  findDocuments: (query: string) => Promise<string[]>
  setupWorkspace: (config: unknown) => Promise<void>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
