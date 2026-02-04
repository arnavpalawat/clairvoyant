import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface WindowLayout {
  app: string
  position: 'left' | 'right' | 'fullscreen'
}

/**
 * Arrange windows for meeting preparation
 */
export async function arrangeWindowsForMeeting(layouts: WindowLayout[]): Promise<void> {
  // Get screen dimensions
  const screenInfo = await getScreenDimensions()

  for (const layout of layouts) {
    await positionWindow(layout.app, layout.position, screenInfo)
  }
}

/**
 * Get screen dimensions
 */
async function getScreenDimensions(): Promise<{ width: number; height: number }> {
  const script = `
    tell application "Finder"
      set screenBounds to bounds of window of desktop
      return (item 3 of screenBounds) & "," & (item 4 of screenBounds)
    end tell
  `

  try {
    const { stdout } = await execAsync(`osascript -e '${script}'`)
    const [width, height] = stdout.trim().split(',').map(Number)
    return { width: width || 1920, height: height || 1080 }
  } catch {
    return { width: 1920, height: 1080 }
  }
}

/**
 * Position a window
 */
async function positionWindow(
  appName: string,
  position: 'left' | 'right' | 'fullscreen',
  screen: { width: number; height: number }
): Promise<void> {
  let x = 0
  let y = 0
  let width = screen.width
  let height = screen.height

  if (position === 'left') {
    width = Math.floor(screen.width / 2)
  } else if (position === 'right') {
    x = Math.floor(screen.width / 2)
    width = Math.floor(screen.width / 2)
  }

  const script = `
    tell application "${appName}"
      activate
    end tell
    delay 0.2
    tell application "System Events"
      tell process "${appName}"
        try
          set frontWindow to window 1
          set position of frontWindow to {${x}, ${y}}
          set size of frontWindow to {${width}, ${height}}
        end try
      end tell
    end tell
  `

  try {
    await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`)
  } catch (error) {
    console.error(`Failed to position ${appName}:`, error)
  }
}

/**
 * Focus an application
 */
export async function focusApp(appName: string): Promise<void> {
  const script = `
    tell application "${appName}"
      activate
    end tell
  `

  try {
    await execAsync(`osascript -e '${script}'`)
  } catch (error) {
    console.error(`Failed to focus ${appName}:`, error)
  }
}

/**
 * Open a URL in the default browser
 */
export async function openUrl(url: string): Promise<void> {
  await execAsync(`open "${url}"`)
}

/**
 * Create a split-screen layout with two apps
 */
export async function createSplitScreen(leftApp: string, rightApp: string): Promise<void> {
  await arrangeWindowsForMeeting([
    { app: leftApp, position: 'left' },
    { app: rightApp, position: 'right' },
  ])
}

/**
 * Reset windows to their normal state
 */
export async function resetWindows(): Promise<void> {
  // This is a no-op for now - users can manually resize windows
  console.log('Window reset requested')
}
