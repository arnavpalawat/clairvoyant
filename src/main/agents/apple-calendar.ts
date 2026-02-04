import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { supabase } from '../supabase'

const execFileAsync = promisify(execFile)

interface AppleCalendarEvent {
  uid: string
  title: string
  startDate: string
  endDate: string
  location: string | null
}

export async function getAppleCalendarEvents(start: Date, end: Date): Promise<AppleCalendarEvent[]> {
  const script = `
const app = Application("Calendar")
const events = []
const startDate = new Date("${start.toISOString()}")
const endDate = new Date("${end.toISOString()}")

app.calendars().forEach(cal => {
  try {
    const calEvents = cal.events()
    calEvents.forEach(e => {
      try {
        const eStart = e.startDate()
        const eEnd = e.endDate()
        if (eStart >= startDate && eStart <= endDate) {
          events.push({
            uid: e.uid(),
            title: e.summary(),
            startDate: eStart.toISOString(),
            endDate: eEnd.toISOString(),
            location: e.location() || null
          })
        }
      } catch(err) {}
    })
  } catch(err) {}
})
JSON.stringify(events)
`

  const tmpFile = join(tmpdir(), `clairvoyant-cal-${Date.now()}.js`)

  try {
    await writeFile(tmpFile, script, 'utf-8')
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', tmpFile])
    const result = stdout.trim()
    await unlink(tmpFile).catch(() => {})
    if (!result) return []
    return JSON.parse(result)
  } catch (error) {
    await unlink(tmpFile).catch(() => {})
    console.error('[Apple Calendar] Failed to read events:', error)
    return []
  }
}

export async function createAppleCalendarEvent(event: {
  title: string
  startDate: Date
  endDate: Date
  location?: string
}): Promise<string | null> {
  const locationLine = event.location
    ? `location: "${event.location.replace(/"/g, '\\"')}",`
    : ''

  const script = `
const app = Application("Calendar")
const cal = app.calendars()[0]
const e = app.Event({
  summary: "${event.title.replace(/"/g, '\\"')}",
  startDate: new Date("${event.startDate.toISOString()}"),
  endDate: new Date("${event.endDate.toISOString()}"),
  ${locationLine}
})
cal.events.push(e)
e.uid()
`

  const tmpFile = join(tmpdir(), `clairvoyant-cal-create-${Date.now()}.js`)

  try {
    await writeFile(tmpFile, script, 'utf-8')
    const { stdout } = await execFileAsync('osascript', ['-l', 'JavaScript', tmpFile])
    await unlink(tmpFile).catch(() => {})
    return stdout.trim()
  } catch (error) {
    await unlink(tmpFile).catch(() => {})
    console.error('[Apple Calendar] Failed to create event:', error)
    return null
  }
}

export async function syncAppleCalendar(userId: string): Promise<number> {
  try {
    const now = new Date()
    const oneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const events = await getAppleCalendarEvents(now, oneWeek)

    let synced = 0
    for (const event of events) {
      await supabase.from('events').upsert({
        id: `apple_${event.uid}`,
        user_id: userId,
        title: event.title,
        description: null,
        start_time: event.startDate,
        end_time: event.endDate,
        attendees: [],
        location: event.location,
        meeting_link: null,
        source: 'apple',
      }, { onConflict: 'id' })
      synced++
    }

    console.log(`[Apple Calendar] Synced ${synced} events`)
    return synced
  } catch (error) {
    console.error('[Apple Calendar] Sync failed:', error)
    return 0
  }
}
