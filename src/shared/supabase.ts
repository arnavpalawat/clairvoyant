import { createClient } from '@supabase/supabase-js'

// Renderer process uses Vite env vars (VITE_ prefix)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function signInWithGoogle() {
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

  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

export async function updateProfile(userId: string, updates: any) {
  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)

  if (error) throw error
}

// Edge Function Helpers
export async function generateBrief(eventId: string) {
  const { data, error } = await supabase.functions.invoke('generate-brief', {
    body: { eventId }
  })
  if (error) throw error
  return data
}

export async function draftEmailResponse(emailId: string) {
  const { data, error } = await supabase.functions.invoke('draft-email', {
    body: { emailId }
  })
  if (error) throw error
  return data
}

export async function scoreEmailImportance() {
  const { data, error } = await supabase.functions.invoke('score-importance', {
    body: {}
  })
  if (error) throw error
  return data
}

export async function extractEventFromEmail(emailId: string) {
  const { data, error } = await supabase.functions.invoke('extract-event', {
    body: { emailId }
  })
  if (error) throw error
  return data
}

// Types
export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  google_access_token: string | null
  google_refresh_token: string | null
  google_token_expiry: string | null
  anthropic_api_key: string | null
  notion_api_key: string | null
  notion_database_id: string | null
  preferences: {
    briefTiming: number
    dailyBriefTime: string
    workspaceEnabled: boolean
  }
  created_at: string
  updated_at: string
}

export interface CalendarEvent {
  id: string
  user_id: string
  title: string
  description: string | null
  start_time: string
  end_time: string
  attendees: string[]
  location: string | null
  meeting_link: string | null
  brief: string | null
  brief_generated_at: string | null
  source: 'google' | 'apple' | 'notion'
  created_at: string
  updated_at: string
}

export interface Email {
  id: string
  user_id: string
  thread_id: string
  subject: string
  sender: string
  recipients: string[]
  snippet: string | null
  body: string | null
  received_at: string
  is_read: boolean
  importance_score: number | null
  needs_response: boolean
  draft_content: string | null
  created_at: string
  updated_at: string
}

export interface FeedItem {
  id: string
  user_id: string
  type: 'meeting_brief' | 'email_draft' | 'calendar_event' | 'email_important'
  title: string
  subtitle: string | null
  content: string | null
  priority: number
  related_id: string | null
  dismissed: boolean
  action_taken: string | null
  created_at: string
  expires_at: string | null
}
