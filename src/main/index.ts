// Load environment variables first, before any other imports
import { config } from 'dotenv'
import path from 'path'

// Load .env from project root (in CommonJS, __dirname is available globally)
config({ path: path.join(__dirname, '../../.env') })

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron'
import { startMeetingWatcher } from './agents/workspace-manager'
import { handleAuthCallback, getSession, signOut, supabase } from './supabase'
import { syncGoogleCalendar, syncGmail } from './agents/google-sync'
import { syncAppleCalendar } from './agents/apple-calendar'

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

// Profile IPC handlers (route through main process which has the session)
ipcMain.handle('profile:get', async (_, userId: string) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (error) {
      console.error('[Profile] Get error:', error.message)
      return { error: error.message }
    }
    return { data }
  } catch (err) {
    console.error('[Profile] Get failed:', err)
    return { error: 'Failed to get profile' }
  }
})

ipcMain.handle('profile:update', async (_, userId: string, updates: Record<string, any>) => {
  try {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)

    if (error) {
      console.error('[Profile] Update error:', error.message)
      return { error: error.message }
    }
    return { success: true }
  } catch (err) {
    console.error('[Profile] Update failed:', err)
    return { error: 'Failed to update profile' }
  }
})

// Feed items IPC handlers
ipcMain.handle('feed:get', async () => {
  try {
    const session = await getSession()
    if (!session?.user) {
      return { error: 'Not authenticated', data: [] }
    }

    const { data, error } = await supabase
      .from('feed_items')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('dismissed', false)
      .order('priority', { ascending: false })
      .limit(20)

    if (error) {
      console.error('[Feed] Get error:', error.message)
      return { error: error.message, data: [] }
    }
    return { data: data || [] }
  } catch (err) {
    console.error('[Feed] Get failed:', err)
    return { error: 'Failed to get feed', data: [] }
  }
})

ipcMain.handle('feed:dismiss', async (_, itemId: string) => {
  try {
    const session = await getSession()
    if (!session?.user) {
      return { error: 'Not authenticated' }
    }

    const { error } = await supabase
      .from('feed_items')
      .update({ dismissed: true })
      .eq('id', itemId)
      .eq('user_id', session.user.id)

    if (error) {
      console.error('[Feed] Dismiss error:', error.message)
      return { error: error.message }
    }
    return { success: true }
  } catch (err) {
    console.error('[Feed] Dismiss failed:', err)
    return { error: 'Failed to dismiss item' }
  }
})

// Sync IPC handlers
ipcMain.handle('sync:google-calendar', async () => {
  try {
    const session = await getSession()
    if (!session?.user) {
      return { error: 'Not authenticated', synced: 0 }
    }

    console.log('[Sync] Starting Google Calendar sync...')
    const synced = await syncGoogleCalendar(session.user.id)
    console.log(`[Sync] Google Calendar sync complete: ${synced} events`)
    return { synced }
  } catch (err) {
    console.error('[Sync] Google Calendar failed:', err)
    return { error: String(err), synced: 0 }
  }
})

ipcMain.handle('sync:gmail', async () => {
  try {
    const session = await getSession()
    if (!session?.user) {
      return { error: 'Not authenticated', synced: 0 }
    }

    console.log('[Sync] Starting Gmail sync...')
    const synced = await syncGmail(session.user.id)
    console.log(`[Sync] Gmail sync complete: ${synced} emails`)
    return { synced }
  } catch (err) {
    console.error('[Sync] Gmail failed:', err)
    return { error: String(err), synced: 0 }
  }
})

ipcMain.handle('sync:apple-calendar', async () => {
  try {
    const session = await getSession()
    if (!session?.user) {
      return { error: 'Not authenticated', synced: 0 }
    }

    console.log('[Sync] Starting Apple Calendar sync...')
    const synced = await syncAppleCalendar(session.user.id)
    console.log(`[Sync] Apple Calendar sync complete: ${synced} events`)
    return { synced }
  } catch (err) {
    console.error('[Sync] Apple Calendar failed:', err)
    return { error: String(err), synced: 0 }
  }
})

ipcMain.handle('sync:all', async () => {
  try {
    const session = await getSession()
    if (!session?.user) {
      return { error: 'Not authenticated', results: {} }
    }

    console.log('[Sync] Starting full sync...')
    const results: Record<string, { synced?: number; error?: string }> = {}

    // Google Calendar
    try {
      results.googleCalendar = { synced: await syncGoogleCalendar(session.user.id) }
    } catch (err) {
      results.googleCalendar = { error: String(err), synced: 0 }
    }

    // Gmail
    try {
      results.gmail = { synced: await syncGmail(session.user.id) }
    } catch (err) {
      results.gmail = { error: String(err), synced: 0 }
    }

    // Apple Calendar
    try {
      results.appleCalendar = { synced: await syncAppleCalendar(session.user.id) }
    } catch (err) {
      results.appleCalendar = { error: String(err), synced: 0 }
    }

    console.log('[Sync] Full sync complete:', results)
    return { results }
  } catch (err) {
    console.error('[Sync] Full sync failed:', err)
    return { error: String(err), results: {} }
  }
})

// Edge function invocation handler
ipcMain.handle('functions:invoke', async (_, functionName: string, body: Record<string, unknown>) => {
  try {
    const session = await getSession()
    if (!session) {
      return { error: 'Not authenticated' }
    }

    console.log(`[Functions] Invoking ${functionName}...`)
    const { data, error } = await supabase.functions.invoke(functionName, { body })

    if (error) {
      console.error(`[Functions] ${functionName} error:`, error.message)
      return { error: error.message }
    }

    console.log(`[Functions] ${functionName} complete`)
    return { data }
  } catch (err) {
    console.error(`[Functions] ${functionName} failed:`, err)
    return { error: String(err) }
  }
})

// Get upcoming events for feed generation
ipcMain.handle('events:upcoming', async () => {
  try {
    const session = await getSession()
    if (!session?.user) {
      return { error: 'Not authenticated', data: [] }
    }

    const now = new Date()
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)

    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('start_time', now.toISOString())
      .lte('start_time', tomorrow.toISOString())
      .order('start_time', { ascending: true })
      .limit(10)

    if (error) {
      console.error('[Events] Upcoming error:', error.message)
      return { error: error.message, data: [] }
    }

    return { data: data || [] }
  } catch (err) {
    console.error('[Events] Upcoming failed:', err)
    return { error: 'Failed to get upcoming events', data: [] }
  }
})

// Update event with brief
ipcMain.handle('events:update', async (_, eventId: string, updates: Record<string, unknown>) => {
  try {
    const session = await getSession()
    if (!session?.user) {
      return { error: 'Not authenticated' }
    }

    const { error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', eventId)
      .eq('user_id', session.user.id)

    if (error) {
      console.error('[Events] Update error:', error.message)
      return { error: error.message }
    }

    return { success: true }
  } catch (err) {
    console.error('[Events] Update failed:', err)
    return { error: 'Failed to update event' }
  }
})
