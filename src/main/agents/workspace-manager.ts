import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface WorkspaceConfig {
  meetingLink?: string
  apps?: string[]
  documents?: string[]
  splitScreen?: boolean
}

// Watch for upcoming meetings and trigger workspace setup
export function startMeetingWatcher() {
  // Check every minute for meetings starting in 5 minutes
  setInterval(async () => {
    // This will be connected to Supabase to check for upcoming meetings
    // For now, it's a placeholder
    console.log('[Workspace Manager] Checking for upcoming meetings...')
  }, 60000)
}

export async function setupWorkspace(config: WorkspaceConfig) {
  const tasks: Promise<void>[] = []

  // Open meeting link
  if (config.meetingLink) {
    tasks.push(openMeetingLink(config.meetingLink))
  }

  // Open apps
  if (config.apps && config.apps.length > 0) {
    tasks.push(openApps(config.apps))
  }

  // Open documents
  if (config.documents && config.documents.length > 0) {
    tasks.push(openDocuments(config.documents))
  }

  await Promise.all(tasks)

  // Arrange windows if split screen requested
  if (config.splitScreen) {
    await arrangeWindows()
  }
}

async function openMeetingLink(link: string): Promise<void> {
  const script = `open "${link}"`
  await execAsync(script)
}

async function openApps(apps: string[]): Promise<void> {
  for (const app of apps) {
    const script = `
      tell application "${app}"
        activate
      end tell
    `
    try {
      await runAppleScript(script)
    } catch (error) {
      console.error(`Failed to open app: ${app}`, error)
    }
  }
}

async function openDocuments(documents: string[]): Promise<void> {
  for (const doc of documents) {
    const script = `open "${doc}"`
    try {
      await execAsync(script)
    } catch (error) {
      console.error(`Failed to open document: ${doc}`, error)
    }
  }
}

async function arrangeWindows(): Promise<void> {
  // Use AppleScript to arrange windows in split screen
  const script = `
    tell application "System Events"
      -- Get screen dimensions
      set screenBounds to bounds of window 1 of application process "Finder"
      set screenWidth to item 3 of screenBounds
      set screenHeight to item 4 of screenBounds

      -- Get list of visible windows
      set visibleApps to every application process whose visible is true

      -- Arrange first two windows side by side
      set appCount to 0
      repeat with proc in visibleApps
        if appCount < 2 then
          try
            set frontWindow to window 1 of proc
            if appCount = 0 then
              -- Left half
              set position of frontWindow to {0, 0}
              set size of frontWindow to {screenWidth / 2, screenHeight}
            else
              -- Right half
              set position of frontWindow to {screenWidth / 2, 0}
              set size of frontWindow to {screenWidth / 2, screenHeight}
            end if
            set appCount to appCount + 1
          end try
        end if
      end repeat
    end tell
  `

  try {
    await runAppleScript(script)
  } catch (error) {
    console.error('Failed to arrange windows:', error)
  }
}

export async function runAppleScript(script: string): Promise<string> {
  const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`)
  return stdout.trim()
}
