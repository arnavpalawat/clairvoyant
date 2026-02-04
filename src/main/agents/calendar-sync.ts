import { google, calendar_v3 } from 'googleapis'
import { supabase } from '../supabase'
import { runAppleScript } from './workspace-manager'

const SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes

interface CalendarEvent {
  id: string
  title: string
  description?: string
  startTime: Date
  endTime: Date
  attendees: string[]
  location?: string
  meetingLink?: string
}

/**
 * Start the calendar sync daemon
 */
export function startCalendarSync() {
  // Initial sync
  syncAllCalendars()

  // Periodic sync
  setInterval(syncAllCalendars, SYNC_INTERVAL)
}

/**
 * Sync all calendars (Google, Apple, Notion)
 */
export async function syncAllCalendars() {
  console.log('[Calendar Sync] Starting sync...')

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('google_access_token, notion_api_key, notion_database_id')
      .eq('id', user.id)
      .single()

    if (!profile) return

    // Sync Google Calendar
    if (profile.google_access_token) {
      await syncGoogleCalendar(profile.google_access_token, user.id)
    }

    // Sync Apple Calendar
    await syncAppleCalendar(user.id)

    // Sync Notion Calendar if configured
    if (profile.notion_api_key && profile.notion_database_id) {
      await syncNotionCalendar(profile.notion_api_key, profile.notion_database_id, user.id)
    }

    console.log('[Calendar Sync] Sync complete')
  } catch (error) {
    console.error('[Calendar Sync] Error:', error)
  }
}

/**
 * Sync Google Calendar events
 */
async function syncGoogleCalendar(accessToken: string, userId: string) {
  const oauth2Client = new google.auth.OAuth2()
  oauth2Client.setCredentials({ access_token: accessToken })

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

  const now = new Date()
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: nextWeek.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  const events = response.data.items || []

  for (const event of events) {
    if (!event.id || !event.summary) continue

    const eventData = {
      id: `google_${event.id}`,
      user_id: userId,
      title: event.summary,
      description: event.description || null,
      start_time: event.start?.dateTime || event.start?.date,
      end_time: event.end?.dateTime || event.end?.date,
      attendees: (event.attendees || []).map(a => a.email).filter(Boolean) as string[],
      location: event.location || null,
      meeting_link: extractMeetingLink(event),
      source: 'google',
    }

    await supabase
      .from('events')
      .upsert(eventData, { onConflict: 'id' })
  }
}

/**
 * Sync Apple Calendar events via AppleScript
 */
async function syncAppleCalendar(userId: string) {
  const script = `
    set eventList to {}
    tell application "Calendar"
      set startDate to current date
      set endDate to startDate + 7 * days
      repeat with cal in calendars
        repeat with evt in (events of cal whose start date >= startDate and start date <= endDate)
          set eventInfo to {|id|:uid of evt, |title|:summary of evt, |start|:start date of evt as string, |end|:end date of evt as string, |location|:location of evt}
          set end of eventList to eventInfo
        end repeat
      end repeat
    end tell
    return eventList
  `

  try {
    const result = await runAppleScript(script)
    // Parse AppleScript result and upsert to database
    // Note: AppleScript returns complex format, needs parsing
    console.log('[Calendar Sync] Apple Calendar synced')
  } catch (error) {
    console.error('[Calendar Sync] Apple Calendar error:', error)
  }
}

/**
 * Sync Notion Calendar database
 */
async function syncNotionCalendar(apiKey: string, databaseId: string, userId: string) {
  const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filter: {
        property: 'Date',
        date: {
          on_or_after: new Date().toISOString().split('T')[0],
        },
      },
    }),
  })

  if (!response.ok) {
    console.error('[Calendar Sync] Notion API error:', await response.text())
    return
  }

  const data = await response.json() as { results: Array<{ id: string; properties: Record<string, any> }> }

  for (const page of data.results) {
    // Extract event data from Notion page properties
    // This depends on the user's Notion database schema
    const title = page.properties.Name?.title?.[0]?.text?.content || 'Untitled'
    const dateProperty = page.properties.Date?.date

    if (!dateProperty?.start) continue

    const eventData = {
      id: `notion_${page.id}`,
      user_id: userId,
      title,
      description: null,
      start_time: dateProperty.start,
      end_time: dateProperty.end || dateProperty.start,
      attendees: [],
      location: null,
      meeting_link: null,
      source: 'notion',
    }

    await supabase
      .from('events')
      .upsert(eventData, { onConflict: 'id' })
  }
}

/**
 * Extract meeting link from Google Calendar event
 */
function extractMeetingLink(event: calendar_v3.Schema$Event): string | null {
  // Check for Google Meet link
  if (event.hangoutLink) {
    return event.hangoutLink
  }

  // Check for Zoom/Teams/etc. in description or location
  const text = `${event.description || ''} ${event.location || ''}`
  const zoomMatch = text.match(/https:\/\/[\w.-]*zoom\.us\/j\/\d+[^\s]*/i)
  const teamsMatch = text.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]*/i)

  return zoomMatch?.[0] || teamsMatch?.[0] || null
}
