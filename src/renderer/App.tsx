import React, { useEffect, useState } from 'react'
import Settings from './Settings'

interface User {
  id: string
  email?: string
}

interface FeedItem {
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

interface CalendarEvent {
  id: string
  title: string
  start_time: string
  end_time: string
  brief: string | null
  attendees: string[]
  meeting_link: string | null
}

// Subtle Background with Gradient Auras
function GradientBackground() {
  return (
    <div className="cosmic-bg">
      <div className="aura-orb aura-orb-1" />
      <div className="aura-orb aura-orb-2" />
      <div className="aura-orb aura-orb-3" />
      <div className="noise-overlay" />
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [generatingBrief, setGeneratingBrief] = useState<string | null>(null)

  useEffect(() => {
    window.electronAPI.getSession().then((session) => {
      if (session?.user) {
        setUser(session.user)
      }
      setLoading(false)
    })

    window.electronAPI.onAuthSuccess((data) => {
      setUser(data.user)
    })

    window.electronAPI.onAuthError((error) => {
      console.error('[Auth] Error:', error)
    })
  }, [])

  useEffect(() => {
    if (user) {
      checkApiKey()
      loadFeed()
      loadUpcomingEvents()
    }
  }, [user])

  async function checkApiKey() {
    if (!user?.id) return
    const result = await window.electronAPI.getProfile(user.id)
    setHasApiKey(!!result.data?.anthropic_api_key)
    if (!result.data?.anthropic_api_key) setShowSettings(true)
  }

  async function handleSignIn() {
    const result = await window.electronAPI.signInWithGoogle()
    if (result.error) {
      console.error('[Auth] Sign in failed:', result.error)
    }
  }

  async function handleSignOut() {
    await window.electronAPI.signOut()
    setUser(null)
  }

  async function loadFeed() {
    const result = await window.electronAPI.getFeed()
    setFeed(result.data || [])
  }

  async function loadUpcomingEvents() {
    const result = await window.electronAPI.getUpcomingEvents()
    setUpcomingEvents(result.data || [])
  }

  async function generateBrief(eventId: string) {
    if (!hasApiKey) {
      setShowSettings(true)
      return
    }

    setGeneratingBrief(eventId)
    try {
      const result = await window.electronAPI.invokeFunction('generate-brief', { eventId })
      if (result.data?.brief) {
        setUpcomingEvents(events =>
          events.map(e => e.id === eventId ? { ...e, brief: result.data.brief } : e)
        )
      }
    } catch (err) {
      console.error('[Brief] Generation error:', err)
    }
    setGeneratingBrief(null)
  }

  async function dismissItem(id: string) {
    await window.electronAPI.dismissFeedItem(id)
    setFeed(feed.filter(item => item.id !== id))
  }

  async function handleSync() {
    setSyncing(true)
    try {
      await window.electronAPI.syncAll()
      await Promise.all([loadFeed(), loadUpcomingEvents()])
    } catch (err) {
      console.error('[Sync] Failed:', err)
    }
    setSyncing(false)
  }

  function formatTime(dateString: string) {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  function formatRelativeTime(dateString: string) {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)

    if (diffMins < 0) return 'Started'
    if (diffMins < 60) return `in ${diffMins}m`
    if (diffHours < 24) return `in ${diffHours}h`
    return formatTime(dateString)
  }

  function getTypeBadge(type: string) {
    switch (type) {
      case 'meeting_brief': return { label: 'Brief', class: 'badge-violet' }
      case 'email_draft': return { label: 'Draft', class: 'badge-amber' }
      case 'calendar_event': return { label: 'Event', class: 'badge-emerald' }
      case 'email_important': return { label: 'Priority', class: 'badge-rose' }
      default: return { label: 'Item', class: 'badge-cream' }
    }
  }

  // Loading State
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center relative overflow-hidden">
        <GradientBackground />

        {/* Shooting Stars / Comets */}
        <div className="comets-container">
          <div className="comet comet-1" />
          <div className="comet comet-2" />
          <div className="comet comet-3" />
          <div className="comet comet-4" />
          <div className="comet comet-5" />
        </div>

        <div className="relative z-10 text-center">
          {/* Animated Logo */}
          <div className="loading-logo relative">
            <div
              className="absolute inset-0 rounded-full mx-auto"
              style={{
                width: '80px',
                height: '80px',
                background: 'radial-gradient(circle, rgba(245, 158, 11, 0.4) 0%, transparent 70%)',
                filter: 'blur(20px)',
              }}
            />
            <img
              src="./logo.png"
              alt="Clairvoyant"
              className="w-20 h-20 mx-auto loading-icon object-contain relative"
            />
          </div>

          {/* Loading Text */}
          <div className="mt-6 loading-text">
            <h2 className="font-display text-xl" style={{ color: 'var(--cream)' }}>
              Clairvoyant
            </h2>
            <div className="flex items-center justify-center gap-1 mt-2">
              <span className="loading-dot" style={{ animationDelay: '0ms' }} />
              <span className="loading-dot" style={{ animationDelay: '150ms' }} />
              <span className="loading-dot" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Sign In State
  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center relative overflow-hidden">
        <GradientBackground />

        <div className="relative z-10 text-center px-8 animate-fade-in">
          {/* Logo */}
          <div className="relative mx-auto mb-8 w-16 h-16">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(245, 158, 11, 0.3) 0%, transparent 70%)',
                filter: 'blur(15px)',
              }}
            />
            <img
              src="./logo.png"
              alt="Clairvoyant"
              className="h-16 object-contain relative"
            />
          </div>

          {/* Title */}
          <h1 className="font-display text-4xl mb-3" style={{ color: 'var(--cream)' }}>
            Clairvoyant
          </h1>

          <p className="font-body text-sm mb-10" style={{ color: 'var(--cream-dark)' }}>
            Your AI assistant that sees what's coming
          </p>

          {/* Sign in button */}
          <button onClick={handleSignIn} className="btn btn-primary">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          <p className="mt-8 text-xs" style={{ color: 'var(--cream-dark)' }}>
            Syncs with Calendar & Gmail
          </p>
        </div>

        <div className="ambient-bottom" />
      </div>
    )
  }

  if (showSettings && user) {
    return <Settings userId={user.id} onClose={() => { setShowSettings(false); checkApiKey() }} />
  }

  // Main Dashboard
  return (
    <div className="h-screen overflow-hidden relative">
      <GradientBackground />

      <div className="relative z-10 h-full overflow-auto">
        {/* Header */}
        <div className="drag-region sticky top-0 z-20 px-4 py-3 glass">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <img
                src="./logo.png"
                alt="Clairvoyant"
                className="h-7 object-contain"
              />
              <h1 className="font-display text-lg" style={{ color: 'var(--cream)' }}>
                Clairvoyant
              </h1>
            </div>
            <div className="flex gap-1 no-drag">
              <button
                onClick={() => window.electronAPI.toggleOverlay()}
                className="btn-ghost p-2 rounded-lg"
                title="Toggle Vision Overlay"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--violet)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </button>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="btn-ghost p-2 rounded-lg"
                title="Sync"
              >
                <svg
                  className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  style={{ color: syncing ? 'var(--amber)' : 'var(--cream-muted)' }}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="btn-ghost p-2 rounded-lg"
                title="Settings"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--cream-muted)' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <button
                onClick={handleSignOut}
                className="btn-ghost text-xs px-2 py-1.5 rounded-lg"
                style={{ color: 'var(--cream-dark)' }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>

        {/* API Key Warning */}
        {!hasApiKey && (
          <div
            className="mx-4 mt-3 p-3 rounded-xl animate-fade-in"
            style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}
          >
            <p className="font-body text-sm" style={{ color: 'var(--amber)' }}>
              Add your Anthropic API key in{' '}
              <button onClick={() => setShowSettings(true)} className="underline font-medium">
                Settings
              </button>{' '}
              to enable AI features
            </p>
          </div>
        )}

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <div className="px-4 pt-4">
            <h2 className="font-display text-sm mb-3" style={{ color: 'var(--cream-muted)' }}>
              Upcoming
            </h2>
            <div className="space-y-2">
              {upcomingEvents.map((event, index) => (
                <div
                  key={event.id}
                  className={`card animate-fade-in stagger-${Math.min(index + 1, 5)}`}
                >
                  <div
                    className="p-4 cursor-pointer"
                    onClick={() => setExpanded(expanded === event.id ? null : event.id)}
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="badge badge-emerald">
                            {formatRelativeTime(event.start_time)}
                          </span>
                          {event.meeting_link && (
                            <span className="badge badge-violet" style={{ padding: '4px 8px' }}>
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <h3 className="font-body font-medium mt-2 truncate" style={{ color: 'var(--cream)' }}>
                          {event.title}
                        </h3>
                        <p className="font-body text-xs mt-0.5" style={{ color: 'var(--cream-dark)' }}>
                          {formatTime(event.start_time)} - {formatTime(event.end_time)}
                          {event.attendees?.length > 0 && ` · ${event.attendees.length} attendee${event.attendees.length > 1 ? 's' : ''}`}
                        </p>
                      </div>
                      <svg
                        className="w-4 h-4 flex-shrink-0 transition-transform"
                        style={{
                          color: 'var(--cream-dark)',
                          transform: expanded === event.id ? 'rotate(180deg)' : 'rotate(0deg)'
                        }}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {expanded === event.id && (
                    <div className="px-4 pb-4 pt-0" style={{ borderTop: '1px solid var(--border)' }}>
                      {event.brief ? (
                        <div className="mt-3">
                          <p className="font-body text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--amber)' }}>
                            Meeting Brief
                          </p>
                          <div className="font-body text-sm whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--cream-muted)' }}>
                            {event.brief}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              generateBrief(event.id)
                            }}
                            disabled={generatingBrief === event.id || !hasApiKey}
                            className="btn btn-primary w-full"
                            style={{
                              opacity: (generatingBrief === event.id || !hasApiKey) ? 0.6 : 1,
                              cursor: (generatingBrief === event.id || !hasApiKey) ? 'not-allowed' : 'pointer',
                            }}
                          >
                            {generatingBrief === event.id ? (
                              <span className="flex items-center gap-2">
                                <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                                Generating...
                              </span>
                            ) : (
                              <span className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                </svg>
                                Generate Brief
                              </span>
                            )}
                          </button>
                          {!hasApiKey && (
                            <p className="font-body text-xs mt-2 text-center" style={{ color: 'var(--cream-dark)' }}>
                              Add API key in Settings
                            </p>
                          )}
                        </div>
                      )}
                      {event.meeting_link && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            window.open(event.meeting_link!, '_blank')
                          }}
                          className="btn btn-secondary w-full mt-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Join Meeting
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Feed */}
        <div className="p-4 space-y-3">
          {feed.length === 0 && upcomingEvents.length === 0 ? (
            <div className="text-center py-16 animate-fade-in">
              <div
                className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
                style={{ background: 'var(--void-card)', border: '1px solid var(--border)' }}
              >
                <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="var(--cream-dark)" strokeWidth="1.5">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="font-body text-sm" style={{ color: 'var(--cream-muted)' }}>
                All caught up
              </p>
              <p className="font-body text-xs mt-1" style={{ color: 'var(--cream-dark)' }}>
                New items will appear as they arrive
              </p>
            </div>
          ) : feed.length === 0 ? null : (
            <>
              {upcomingEvents.length > 0 && (
                <h2 className="font-display text-sm mb-3" style={{ color: 'var(--cream-muted)' }}>
                  Activity
                </h2>
              )}
              {feed.map((item, index) => {
                const badge = getTypeBadge(item.type)
                return (
                  <div
                    key={item.id}
                    className={`card animate-fade-in stagger-${Math.min(index + 1, 5)}`}
                  >
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <span className={`badge ${badge.class}`}>
                            {badge.label}
                          </span>
                          <h3 className="font-body font-medium mt-2 truncate" style={{ color: 'var(--cream)' }}>
                            {item.title}
                          </h3>
                          {item.subtitle && (
                            <p className="font-body text-sm mt-0.5 truncate" style={{ color: 'var(--cream-dark)' }}>
                              {item.subtitle}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            dismissItem(item.id)
                          }}
                          className="btn-ghost p-1.5 rounded-lg flex-shrink-0"
                          title="Dismiss"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--cream-dark)' }}>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {expanded === item.id && item.content && (
                      <div className="px-4 pb-4 pt-0" style={{ borderTop: '1px solid var(--border)' }}>
                        <div className="font-body text-sm mt-3 whitespace-pre-wrap leading-relaxed" style={{ color: 'var(--cream-muted)' }}>
                          {item.content}
                        </div>
                        {item.type === 'email_draft' && (
                          <div className="flex gap-2 mt-4">
                            <button className="btn btn-primary flex-1">Review & Send</button>
                            <button className="btn btn-secondary px-4">Edit</button>
                          </div>
                        )}
                        {item.type === 'calendar_event' && (
                          <div className="flex gap-2 mt-4">
                            <button className="btn btn-primary flex-1">Add to Calendar</button>
                            <button className="btn btn-secondary px-4">Ignore</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>

      <div className="ambient-bottom" />
    </div>
  )
}
