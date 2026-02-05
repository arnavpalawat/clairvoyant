import { contextBridge, ipcRenderer } from 'electron'

interface Recommendation {
  id: string
  type: 'context' | 'action' | 'reminder' | 'insight'
  title: string
  description: string
  confidence: number
  priority: number
  actions?: { id: string; label: string; primary?: boolean }[]
  source: 'vision' | 'calendar' | 'email' | 'manual'
  expiresAt?: string
  createdAt: string
}

contextBridge.exposeInMainWorld('overlayAPI', {
  // Overlay controls
  hide: () => ipcRenderer.invoke('overlay:hide'),
  minimize: () => ipcRenderer.invoke('overlay:minimize'),
  expand: () => ipcRenderer.invoke('overlay:expand'),
  setOpacity: (opacity: number) => ipcRenderer.invoke('overlay:set-opacity', opacity),

  // Recommendation actions
  dismissRecommendation: (id: string) => ipcRenderer.invoke('recommendations:dismiss', id),
  takeAction: (id: string, actionId: string) => ipcRenderer.invoke('recommendations:action', id, actionId),

  // Vision controls
  pauseVision: () => ipcRenderer.invoke('vision:pause'),
  resumeVision: () => ipcRenderer.invoke('vision:resume'),

  // Event listeners
  onRecommendationsUpdate: (callback: (recommendations: Recommendation[]) => void) => {
    ipcRenderer.on('overlay:recommendations', (_, recommendations) => callback(recommendations))
  },

  onCaptureStatus: (callback: (isCapturing: boolean) => void) => {
    ipcRenderer.on('overlay:capture-status', (_, isCapturing) => callback(isCapturing))
  },

  onMinimizedChange: (callback: (isMinimized: boolean) => void) => {
    ipcRenderer.on('overlay:minimized', (_, isMinimized) => callback(isMinimized))
  },
})

// Type declarations for overlay window
declare global {
  interface Window {
    overlayAPI: {
      hide: () => Promise<{ success: boolean }>
      minimize: () => Promise<{ success: boolean }>
      expand: () => Promise<{ success: boolean }>
      setOpacity: (opacity: number) => Promise<{ success: boolean }>
      dismissRecommendation: (id: string) => Promise<{ success: boolean }>
      takeAction: (id: string, actionId: string) => Promise<{ success: boolean }>
      pauseVision: () => Promise<{ success: boolean }>
      resumeVision: () => Promise<{ success: boolean }>
      onRecommendationsUpdate: (callback: (recommendations: Recommendation[]) => void) => void
      onCaptureStatus: (callback: (isCapturing: boolean) => void) => void
      onMinimizedChange: (callback: (isMinimized: boolean) => void) => void
    }
  }
}
