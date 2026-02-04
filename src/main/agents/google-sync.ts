import { google } from 'googleapis'
import { supabase, refreshGoogleTokensIfNeeded } from '../supabase'

async function getGoogleAuth(userId: string) {
  const accessToken = await refreshGoogleTokensIfNeeded(userId)
  if (!accessToken) throw new Error('No Google tokens available')

  const { data: profile } = await supabase
    .from('profiles')
    .select('google_refresh_token')
    .eq('id', userId)
    .single()

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: profile?.google_refresh_token,
  })

  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await supabase.from('profiles').update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token || profile?.google_refresh_token,
        google_token_expiry: new Date(Date.now() + (tokens.expiry_date || 3600000)).toISOString(),
      }).eq('id', userId)
    }
  })

  return oauth2Client
}

export async function syncGoogleCalendar(userId: string): Promise<number> {
  try {
    const auth = await getGoogleAuth(userId)
    const calendar = google.calendar({ version: 'v3', auth })

    const now = new Date()
    const oneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const { data } = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: oneWeek.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    })

    let synced = 0
    for (const event of data.items || []) {
      if (!event.id || !event.start?.dateTime) continue

      await supabase.from('events').upsert({
        id: `google_${event.id}`,
        user_id: userId,
        title: event.summary || 'No title',
        description: event.description || null,
        start_time: event.start.dateTime,
        end_time: event.end?.dateTime || event.start.dateTime,
        attendees: event.attendees?.map(a => a.email).filter(Boolean) as string[] || [],
        location: event.location || null,
        meeting_link: event.hangoutLink || extractMeetingLink(event.description, event.location),
        source: 'google',
      }, { onConflict: 'id' })
      synced++
    }

    console.log(`[Google Sync] Synced ${synced} calendar events`)
    return synced
  } catch (error) {
    console.error('[Google Sync] Calendar sync failed:', error)
    return 0
  }
}

export async function syncGmail(userId: string): Promise<number> {
  try {
    const auth = await getGoogleAuth(userId)
    const gmail = google.gmail({ version: 'v1', auth })

    const { data: list } = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 30,
      q: 'in:inbox',
    })

    let synced = 0
    for (const msg of (list.messages || []).slice(0, 20)) {
      if (!msg.id) continue

      // Check if already synced
      const { data: existing } = await supabase
        .from('emails')
        .select('id')
        .eq('id', msg.id)
        .single()

      if (existing) continue

      const { data: full } = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id,
        format: 'full',
      })

      const headers = full.payload?.headers || []
      const getHeader = (name: string) => headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''

      let body = ''
      if (full.payload?.body?.data) {
        body = Buffer.from(full.payload.body.data, 'base64').toString('utf-8')
      } else if (full.payload?.parts) {
        const textPart = full.payload.parts.find(p => p.mimeType === 'text/plain')
        if (textPart?.body?.data) {
          body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
        }
      }

      await supabase.from('emails').insert({
        id: msg.id,
        user_id: userId,
        thread_id: full.threadId || msg.id,
        subject: getHeader('Subject') || '(No subject)',
        sender: getHeader('From'),
        recipients: getHeader('To').split(',').map((e: string) => e.trim()).filter(Boolean),
        snippet: full.snippet || '',
        body: body.slice(0, 10000),
        received_at: new Date(parseInt(full.internalDate || '0')).toISOString(),
        is_read: !full.labelIds?.includes('UNREAD'),
      })
      synced++
    }

    console.log(`[Google Sync] Synced ${synced} emails`)
    return synced
  } catch (error) {
    console.error('[Google Sync] Gmail sync failed:', error)
    return 0
  }
}

function extractMeetingLink(description?: string | null, location?: string | null): string | null {
  const text = `${description || ''} ${location || ''}`

  // Zoom
  const zoomMatch = text.match(/https:\/\/[\w.-]*zoom\.us\/j\/\d+[^\s]*/i)
  if (zoomMatch) return zoomMatch[0]

  // Microsoft Teams
  const teamsMatch = text.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s]*/i)
  if (teamsMatch) return teamsMatch[0]

  // Webex
  const webexMatch = text.match(/https:\/\/[\w.-]*webex\.com\/[^\s]*/i)
  if (webexMatch) return webexMatch[0]

  return null
}
