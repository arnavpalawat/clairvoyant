import { Notification } from 'electron'
import { supabase, getSession } from '../supabase'
import { setupWorkspace as setupWindowLayout, WorkspaceLayout, Position } from './window-manager'
import { findRelevantDocumentsForMeeting } from './document-finder'
import { syncGoogleCalendar, syncGmail } from './google-sync'
import { syncAppleCalendar } from './apple-calendar'

const triggeredMeetings = new Set<string>()
const SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes
const CHECK_INTERVAL = 30 * 1000 // 30 seconds

interface CalendarEvent {
  id: string
  title: string
  start_time: string
  end_time: string
  attendees: string[]
  meeting_link: string | null
  location: string | null
}

/**
 * Start the meeting watcher and auto-sync
 */
export function startMeetingWatcher(): void {
  console.log('[Workspace Manager] Starting meeting watcher and auto-sync...')

  // Initial sync after a short delay (let auth settle)
  setTimeout(() => {
    runAutoSync()
  }, 5000)

  // Auto-sync every 5 minutes
  setInterval(() => {
    runAutoSync()
  }, SYNC_INTERVAL)

  // Check for upcoming meetings every 30 seconds
  setInterval(() => {
    checkUpcomingMeetings()
  }, CHECK_INTERVAL)
}

/**
 * Run automatic sync of all calendars and email
 */
async function runAutoSync(): Promise<void> {
  try {
    const session = await getSession()
    if (!session?.user) {
      console.log('[Auto Sync] No session, skipping sync')
      return
    }

    console.log('[Auto Sync] Running automatic sync...')

    // Sync Google Calendar
    try {
      const calendarSynced = await syncGoogleCalendar(session.user.id)
      console.log(`[Auto Sync] Google Calendar: ${calendarSynced} events`)
    } catch (err) {
      console.error('[Auto Sync] Google Calendar failed:', err)
    }

    // Sync Gmail
    try {
      const emailSynced = await syncGmail(session.user.id)
      console.log(`[Auto Sync] Gmail: ${emailSynced} emails`)
    } catch (err) {
      console.error('[Auto Sync] Gmail failed:', err)
    }

    // Sync Apple Calendar
    try {
      const appleSynced = await syncAppleCalendar(session.user.id)
      console.log(`[Auto Sync] Apple Calendar: ${appleSynced} events`)
    } catch (err) {
      console.error('[Auto Sync] Apple Calendar failed:', err)
    }

    console.log('[Auto Sync] Complete')
  } catch (error) {
    console.error('[Auto Sync] Failed:', error)
  }
}

/**
 * Check for meetings starting in the next 5 minutes
 */
async function checkUpcomingMeetings(): Promise<void> {
  try {
    const session = await getSession()
    if (!session?.user) return

    const now = new Date()
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000)
    const sixMinutesFromNow = new Date(now.getTime() + 6 * 60 * 1000)

    const { data: events, error } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('start_time', fiveMinutesFromNow.toISOString())
      .lt('start_time', sixMinutesFromNow.toISOString())

    if (error) {
      console.error('[Meeting Watcher] Query error:', error.message)
      return
    }

    for (const event of (events || []) as CalendarEvent[]) {
      if (triggeredMeetings.has(event.id)) continue
      triggeredMeetings.add(event.id)

      console.log(`[Meeting Watcher] Preparing workspace for: ${event.title}`)
      await prepareForMeeting(event)
    }
  } catch (error) {
    console.error('[Meeting Watcher] Error:', error)
  }
}

/**
 * Prepare workspace for an upcoming meeting
 */
async function prepareForMeeting(event: CalendarEvent): Promise<void> {
  // Show notification
  new Notification({
    title: 'Preparing workspace',
    body: `Setting up for: ${event.title}`,
  }).show()

  // Find relevant documents
  const docs = await findRelevantDocumentsForMeeting(event.title, event.attendees || [])
  console.log(`[Meeting Watcher] Found ${docs.length} relevant documents`)

  // Build workspace layout
  const layouts: WorkspaceLayout[] = []

  // Add video conference app based on meeting link
  if (event.meeting_link) {
    if (event.meeting_link.includes('zoom')) {
      layouts.push({ app: 'zoom.us', position: 'left' as Position })
    } else if (event.meeting_link.includes('meet.google')) {
      layouts.push({ app: 'Google Chrome', position: 'left' as Position, url: event.meeting_link })
    } else if (event.meeting_link.includes('teams')) {
      layouts.push({ app: 'Microsoft Teams', position: 'left' as Position })
    } else {
      // Generic meeting link - open in browser
      layouts.push({ app: 'Safari', position: 'left' as Position, url: event.meeting_link })
    }
  }

  // Add Slack or Notes for communication
  layouts.push({ app: 'Slack', position: 'top-right' as Position })

  // Add relevant document if found
  if (docs.length > 0) {
    layouts.push({ app: 'Preview', position: 'bottom-right' as Position, file: docs[0].path })
  }

  // Setup the workspace
  if (layouts.length > 0) {
    try {
      await setupWindowLayout(layouts)
    } catch (error) {
      console.error('[Meeting Watcher] Workspace setup failed:', error)
    }
  }
}

/**
 * Run AppleScript
 */
export async function runAppleScript(script: string): Promise<string> {
  const { exec } = await import('child_process')
  const { promisify } = await import('util')
  const execAsync = promisify(exec)
  const { stdout } = await execAsync(`osascript -e '${script.replace(/'/g, "'\"'\"'")}'`)
  return stdout.trim()
}
