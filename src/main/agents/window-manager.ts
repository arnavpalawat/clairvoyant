import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export type Position = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'fullscreen'

export async function openApp(name: string): Promise<void> {
  await execAsync(`open -a "${name}"`)
  await new Promise(r => setTimeout(r, 1000))
}

export async function openUrl(url: string): Promise<void> {
  await execAsync(`open "${url}"`)
}

export async function openFile(path: string): Promise<void> {
  await execAsync(`open "${path}"`)
}

async function getScreenDimensions(): Promise<{ width: number; height: number }> {
  try {
    const { stdout } = await execAsync(`system_profiler SPDisplaysDataType | grep -E "Resolution:" | head -1`)
    const match = stdout.match(/(\d+) x (\d+)/)
    return {
      width: parseInt(match?.[1] || '1920'),
      height: parseInt(match?.[2] || '1080')
    }
  } catch {
    return { width: 1920, height: 1080 }
  }
}

export async function positionWindow(app: string, position: Position): Promise<void> {
  const { width: w, height: h } = await getScreenDimensions()
  const menuBar = 25
  const dock = 70
  const usable = h - menuBar - dock

  const positions: Record<Position, [number, number, number, number]> = {
    'left': [0, menuBar, w / 2, usable],
    'right': [w / 2, menuBar, w / 2, usable],
    'top-left': [0, menuBar, w / 2, usable / 2],
    'top-right': [w / 2, menuBar, w / 2, usable / 2],
    'bottom-left': [0, menuBar + usable / 2, w / 2, usable / 2],
    'bottom-right': [w / 2, menuBar + usable / 2, w / 2, usable / 2],
    'fullscreen': [0, menuBar, w, usable],
  }

  const [x, y, width, height] = positions[position]

  const script = `
    tell application "${app}"
      activate
    end tell
    delay 0.3
    tell application "System Events"
      tell process "${app}"
        try
          set frontWindow to window 1
          set position of frontWindow to {${Math.round(x)}, ${Math.round(y)}}
          set size of frontWindow to {${Math.round(width)}, ${Math.round(height)}}
        end try
      end tell
    end tell
  `

  try {
    await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`)
  } catch (error) {
    console.error(`[Window Manager] Failed to position ${app}:`, error)
  }
}

export interface WorkspaceLayout {
  app: string
  position: Position
  url?: string
  file?: string
}

export async function setupWorkspace(layouts: WorkspaceLayout[]): Promise<void> {
  console.log('[Window Manager] Setting up workspace with', layouts.length, 'apps')

  for (const layout of layouts) {
    try {
      await openApp(layout.app)
      if (layout.url) await openUrl(layout.url)
      if (layout.file) await openFile(layout.file)
      await positionWindow(layout.app, layout.position)
    } catch (error) {
      console.error(`[Window Manager] Failed to setup ${layout.app}:`, error)
    }
  }

  console.log('[Window Manager] Workspace setup complete')
}

export async function focusApp(appName: string): Promise<void> {
  const script = `tell application "${appName}" to activate`
  try {
    await execAsync(`osascript -e '${script}'`)
  } catch (error) {
    console.error(`[Window Manager] Failed to focus ${appName}:`, error)
  }
}
