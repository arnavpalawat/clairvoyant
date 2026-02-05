import { BrowserWindow, screen, app } from 'electron'
import path from 'path'
import { EventEmitter } from 'events'

export interface Recommendation {
  id: string
  type: 'context' | 'action' | 'reminder' | 'insight'
  title: string
  description: string
  confidence: number
  priority: number
  actions?: { id: string; label: string; primary?: boolean }[]
  source: 'vision' | 'calendar' | 'email' | 'manual'
  expiresAt?: Date
  createdAt: Date
}

class OverlayWindowManager extends EventEmitter {
  private overlayWindow: BrowserWindow | null = null
  private isMinimized = false
  private opacity = 0.9

  create(): BrowserWindow {
    if (this.overlayWindow) {
      return this.overlayWindow
    }

    const { width: screenWidth } = screen.getPrimaryDisplay().workAreaSize

    this.overlayWindow = new BrowserWindow({
      width: 320,
      height: 420,
      x: screenWidth - 340,
      y: 40,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, '../preload-overlay.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })

    // Keep overlay visible on all workspaces
    this.overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    // Load overlay renderer
    if (!app.isPackaged) {
      this.overlayWindow.loadURL('http://localhost:5173/overlay/index.html')
    } else {
      this.overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay/index.html'))
    }

    this.overlayWindow.on('closed', () => {
      this.overlayWindow = null
    })

    console.log('[Overlay] Window created')
    return this.overlayWindow
  }

  show(): void {
    if (!this.overlayWindow) {
      this.create()
    }
    this.overlayWindow?.show()
    console.log('[Overlay] Window shown')
  }

  hide(): void {
    this.overlayWindow?.hide()
    console.log('[Overlay] Window hidden')
  }

  toggle(): void {
    if (this.overlayWindow?.isVisible()) {
      this.hide()
    } else {
      this.show()
    }
  }

  minimize(): void {
    this.isMinimized = true
    this.overlayWindow?.webContents.send('overlay:minimized', true)
    // Resize to minimized size
    this.overlayWindow?.setSize(60, 60)
    console.log('[Overlay] Minimized')
  }

  expand(): void {
    this.isMinimized = false
    this.overlayWindow?.webContents.send('overlay:minimized', false)
    // Restore full size
    this.overlayWindow?.setSize(320, 420)
    console.log('[Overlay] Expanded')
  }

  toggleMinimize(): void {
    if (this.isMinimized) {
      this.expand()
    } else {
      this.minimize()
    }
  }

  setOpacity(opacity: number): void {
    this.opacity = Math.max(0.3, Math.min(1, opacity))
    this.overlayWindow?.setOpacity(this.opacity)
  }

  sendRecommendations(recommendations: Recommendation[]): void {
    this.overlayWindow?.webContents.send('overlay:recommendations', recommendations)
  }

  sendCaptureStatus(isCapturing: boolean): void {
    this.overlayWindow?.webContents.send('overlay:capture-status', isCapturing)
  }

  getWindow(): BrowserWindow | null {
    return this.overlayWindow
  }

  isVisible(): boolean {
    return this.overlayWindow?.isVisible() ?? false
  }

  destroy(): void {
    this.overlayWindow?.destroy()
    this.overlayWindow = null
  }
}

export const overlayManager = new OverlayWindowManager()
