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

  // Profile (routed through main process for auth)
  getProfile: (userId: string) => ipcRenderer.invoke('profile:get', userId),
  updateProfile: (userId: string, updates: Record<string, any>) =>
    ipcRenderer.invoke('profile:update', userId, updates),

  // Feed (routed through main process for auth)
  getFeed: () => ipcRenderer.invoke('feed:get'),
  dismissFeedItem: (itemId: string) => ipcRenderer.invoke('feed:dismiss', itemId),

  // Sync
  syncAll: () => ipcRenderer.invoke('sync:all'),
  syncGoogleCalendar: () => ipcRenderer.invoke('sync:google-calendar'),
  syncGmail: () => ipcRenderer.invoke('sync:gmail'),
  syncAppleCalendar: () => ipcRenderer.invoke('sync:apple-calendar'),

  // Native features
  runAppleScript: (script: string) => ipcRenderer.invoke('run-applescript', script),
  findDocuments: (query: string) => ipcRenderer.invoke('find-documents', query),
  setupWorkspace: (config: any) => ipcRenderer.invoke('setup-workspace', config),

  // Edge functions
  invokeFunction: (functionName: string, body: Record<string, unknown>) =>
    ipcRenderer.invoke('functions:invoke', functionName, body),

  // Events
  getUpcomingEvents: () => ipcRenderer.invoke('events:upcoming'),
  updateEvent: (eventId: string, updates: Record<string, unknown>) =>
    ipcRenderer.invoke('events:update', eventId, updates),

  // Vision
  checkVisionPermission: () => ipcRenderer.invoke('vision:check-permission'),
  requestVisionPermission: () => ipcRenderer.invoke('vision:request-permission'),
  startVision: () => ipcRenderer.invoke('vision:start'),
  stopVision: () => ipcRenderer.invoke('vision:stop'),
  getVisionStatus: () => ipcRenderer.invoke('vision:status'),
  captureNow: () => ipcRenderer.invoke('vision:capture-now'),
  updateVisionSettings: (settings: Record<string, unknown>) =>
    ipcRenderer.invoke('vision:update-settings', settings),

  // Overlay
  showOverlay: () => ipcRenderer.invoke('overlay:show'),
  hideOverlay: () => ipcRenderer.invoke('overlay:hide'),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  minimizeOverlay: () => ipcRenderer.invoke('overlay:minimize'),
  expandOverlay: () => ipcRenderer.invoke('overlay:expand'),
  setOverlayOpacity: (opacity: number) => ipcRenderer.invoke('overlay:set-opacity', opacity),

  // Recommendations
  getRecommendations: () => ipcRenderer.invoke('recommendations:get'),
  dismissRecommendation: (id: string) => ipcRenderer.invoke('recommendations:dismiss', id),
  takeRecommendationAction: (id: string, actionId: string) =>
    ipcRenderer.invoke('recommendations:action', id, actionId),
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

      // Profile
      getProfile: (userId: string) => Promise<{ data?: any; error?: string }>
      updateProfile: (userId: string, updates: Record<string, any>) => Promise<{ success?: boolean; error?: string }>

      // Feed
      getFeed: () => Promise<{ data: any[]; error?: string }>
      dismissFeedItem: (itemId: string) => Promise<{ success?: boolean; error?: string }>

      // Sync
      syncAll: () => Promise<{ results: Record<string, { synced?: number; error?: string }>; error?: string }>
      syncGoogleCalendar: () => Promise<{ synced: number; error?: string }>
      syncGmail: () => Promise<{ synced: number; error?: string }>
      syncAppleCalendar: () => Promise<{ synced: number; error?: string }>

      // Native features
      runAppleScript: (script: string) => Promise<string>
      findDocuments: (query: string) => Promise<string[]>
      setupWorkspace: (config: any) => Promise<void>

      // Edge functions
      invokeFunction: (functionName: string, body: Record<string, unknown>) => Promise<{ data?: any; error?: string }>

      // Events
      getUpcomingEvents: () => Promise<{ data: any[]; error?: string }>
      updateEvent: (eventId: string, updates: Record<string, unknown>) => Promise<{ success?: boolean; error?: string }>

      // Vision
      checkVisionPermission: () => Promise<{ granted: boolean }>
      requestVisionPermission: () => Promise<{ success: boolean }>
      startVision: () => Promise<{ success: boolean }>
      stopVision: () => Promise<{ success: boolean }>
      getVisionStatus: () => Promise<{ running: boolean; paused: boolean; lastCapture: Date | null }>
      captureNow: () => Promise<{ analysis: any }>
      updateVisionSettings: (settings: Record<string, unknown>) => Promise<{ success?: boolean; error?: string }>

      // Overlay
      showOverlay: () => Promise<{ success: boolean }>
      hideOverlay: () => Promise<{ success: boolean }>
      toggleOverlay: () => Promise<{ success: boolean }>
      minimizeOverlay: () => Promise<{ success: boolean }>
      expandOverlay: () => Promise<{ success: boolean }>
      setOverlayOpacity: (opacity: number) => Promise<{ success: boolean }>

      // Recommendations
      getRecommendations: () => Promise<{ recommendations: any[] }>
      dismissRecommendation: (id: string) => Promise<{ success: boolean }>
      takeRecommendationAction: (id: string, actionId: string) => Promise<{ success: boolean }>
    }
  }
}
