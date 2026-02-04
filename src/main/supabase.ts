import { createClient, Session } from '@supabase/supabase-js'
import Store from 'electron-store'

// Encrypted storage for sensitive data
const store = new Store({
  encryptionKey: process.env.STORE_ENCRYPTION_KEY,
  name: 'clairvoyant-auth',
})

const supabaseUrl = process.env.SUPABASE_URL || ''
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || ''

// Create Supabase client with custom storage for session persistence
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: {
      getItem: (key: string) => {
        const value = store.get(key)
        return value ? String(value) : null
      },
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    },
    autoRefreshToken: true,
    persistSession: true,
  },
})

/**
 * Handle OAuth callback from deep link
 * Parses the callback URL and sets the session
 */
export async function handleAuthCallback(url: string): Promise<Session | null> {
  try {
    // Parse hash params from callback URL
    // URL format: clairvoyant://auth/callback#access_token=...&refresh_token=...
    const hashIndex = url.indexOf('#')
    if (hashIndex === -1) {
      console.error('[Auth] No hash params in callback URL')
      return null
    }

    const hashParams = url.substring(hashIndex + 1)
    const params = new URLSearchParams(hashParams)

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const providerToken = params.get('provider_token')
    const providerRefreshToken = params.get('provider_refresh_token')

    if (!accessToken || !refreshToken) {
      console.error('[Auth] Missing tokens in callback')
      return null
    }

    // Set the session in Supabase
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    if (error) {
      console.error('[Auth] Failed to set session:', error.message)
      throw error
    }

    // Store Google OAuth tokens in user's profile for API access
    if (providerToken && data.session?.user) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          google_access_token: providerToken,
          google_refresh_token: providerRefreshToken || null,
          google_token_expiry: new Date(Date.now() + 3600 * 1000).toISOString(), // ~1 hour
        })
        .eq('id', data.session.user.id)

      if (updateError) {
        console.error('[Auth] Failed to store Google tokens:', updateError.message)
      } else {
        console.log('[Auth] Google tokens stored successfully')
      }
    }

    console.log('[Auth] Session established for:', data.session?.user?.email)
    return data.session
  } catch (error) {
    console.error('[Auth] Callback handling failed:', error)
    return null
  }
}

/**
 * Get current session
 */
export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

/**
 * Sign out and clear stored session
 */
export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
  store.clear()
}

/**
 * Get user profile
 */
export async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

/**
 * Refresh Google tokens if expired
 */
export async function refreshGoogleTokensIfNeeded(userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .eq('id', userId)
    .single()

  if (!profile?.google_access_token) {
    return null
  }

  // Check if token is expired (with 5 min buffer)
  const expiry = profile.google_token_expiry ? new Date(profile.google_token_expiry) : new Date(0)
  const now = new Date()
  const buffer = 5 * 60 * 1000 // 5 minutes

  if (expiry.getTime() - buffer > now.getTime()) {
    // Token still valid
    return profile.google_access_token
  }

  // Token expired, need to refresh
  if (!profile.google_refresh_token) {
    console.error('[Auth] No refresh token available')
    return null
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: profile.google_refresh_token,
        grant_type: 'refresh_token',
      }),
    })

    const tokens = await response.json() as { access_token?: string; expires_in?: number }

    if (tokens.access_token) {
      await supabase
        .from('profiles')
        .update({
          google_access_token: tokens.access_token,
          google_token_expiry: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
        })
        .eq('id', userId)

      return tokens.access_token
    }
  } catch (error) {
    console.error('[Auth] Failed to refresh Google token:', error)
  }

  return null
}
