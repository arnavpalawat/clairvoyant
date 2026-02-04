// Load environment variables first, before any other imports
import { config } from 'dotenv'
import path from 'path'

// Load .env from project root (in CommonJS, __dirname is available globally)
config({ path: path.join(__dirname, '../../.env') })

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron'
import { startMeetingWatcher } from './agents/workspace-manager'
import { handleAuthCallback, getSession, signOut, supabase } from './supabase'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: false,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    const indexPath = path.join(__dirname, '../renderer/index.html')
    console.log('[Clairvoyant] Loading renderer from:', indexPath)
    mainWindow.loadFile(indexPath)
  }

  // Log renderer errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
    console.error('[Clairvoyant] Failed to load:', errorCode, errorDesc)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Clairvoyant] Renderer loaded successfully')
  })

  mainWindow.on('blur', () => {
    if (process.env.NODE_ENV !== 'development') {
      mainWindow?.hide()
    }
  })
}

function createTray() {
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png')
  const icon = nativeImage.createFromPath(iconPath)

  tray = new Tray(icon.resize({ width: 18, height: 18 }))
  tray.setToolTip('Clairvoyant')

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      const bounds = tray!.getBounds()
      mainWindow?.setPosition(bounds.x - 180, bounds.y + bounds.height + 5)
      mainWindow?.show()
    }
  })

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Clairvoyant', click: () => mainWindow?.show() },
    { label: 'Sync Now', click: () => ipcMain.emit('sync-all') },
    { type: 'separator' },
    { label: 'Preferences...', accelerator: 'Cmd+,' },
    { type: 'separator' },
    { label: 'Quit', accelerator: 'Cmd+Q', click: () => app.quit() },
  ])

  tray.setContextMenu(contextMenu)
}

app.whenReady().then(() => {
  console.log('[Clairvoyant] App ready, initializing...')

  // Register deep link protocol
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('clairvoyant', process.execPath, [path.resolve(process.argv[1])])
    }
  } else {
    app.setAsDefaultProtocolClient('clairvoyant')
  }

  createWindow()
  console.log('[Clairvoyant] Window created')

  createTray()
  console.log('[Clairvoyant] Tray created - look for icon in menubar!')

  startMeetingWatcher()

  // Show window initially so user can see it
  setTimeout(() => {
    if (tray && mainWindow) {
      const bounds = tray.getBounds()
      mainWindow.setPosition(bounds.x - 180, bounds.y + bounds.height + 5)
      mainWindow.show()
      console.log('[Clairvoyant] Window shown')
    }
  }, 1000)

  app.dock?.hide() // Menubar app only
})

// Handle OAuth callback deep link
app.on('open-url', async (event, url) => {
  event.preventDefault()
  console.log('[Clairvoyant] Received deep link:', url)

  if (url.startsWith('clairvoyant://auth/callback')) {
    // Process the auth callback in main process
    const session = await handleAuthCallback(url)

    // Notify renderer of auth result
    if (session) {
      mainWindow?.webContents.send('auth-success', {
        user: session.user,
        email: session.user?.email,
      })
    } else {
      mainWindow?.webContents.send('auth-error', 'Failed to authenticate')
    }

    // Show and focus the window
    mainWindow?.show()
    mainWindow?.focus()
  }
})

app.on('window-all-closed', (e: Event) => {
  e.preventDefault()
})

// IPC handlers
ipcMain.handle('get-platform', () => process.platform)

// Auth IPC handlers
ipcMain.handle('auth:get-session', async () => {
  const session = await getSession()
  return session ? {
    user: session.user,
    accessToken: session.access_token,
  } : null
})

ipcMain.handle('auth:sign-in-google', async () => {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'clairvoyant://auth/callback',
      scopes: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
      ].join(' '),
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    console.error('[Auth] Sign in error:', error.message)
    return { error: error.message }
  }

  // Open the OAuth URL in default browser
  if (data.url) {
    shell.openExternal(data.url)
    return { success: true }
  }

  return { error: 'No OAuth URL returned' }
})

ipcMain.handle('auth:sign-out', async () => {
  await signOut()
  return { success: true }
})
