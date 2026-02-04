import React, { useEffect, useState } from 'react'
import { supabase } from '../shared/supabase'
import Settings from './Settings'
import type { FeedItem } from '../shared/supabase'

interface User {
  id: string
  email?: string
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Check for existing session via main process
    window.electronAPI.getSession().then((session) => {
      if (session?.user) {
        setUser(session.user)
      }
      setLoading(false)
    })

    // Listen for auth events from main process
    window.electronAPI.onAuthSuccess((data) => {
      console.log('[Auth] Success:', data.email)
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
    }
  }, [user])

  async function checkApiKey() {
    if (!user?.id) return

    const { data } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user.id)
      .single()

    setHasApiKey(!!data?.anthropic_api_key)
    if (!data?.anthropic_api_key) setShowSettings(true)
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
    const { data } = await supabase
      .from('feed_items')
      .select('*')
      .eq('dismissed', false)
      .order('priority', { ascending: false })
      .limit(20)

    setFeed(data || [])
  }

  async function dismissItem(id: string) {
    await supabase
      .from('feed_items')
      .update({ dismissed: true })
      .eq('id', id)

    setFeed(feed.filter(item => item.id !== id))
  }

  async function generateBrief(eventId: string) {
    try {
      const { data, error } = await supabase.functions.invoke('generate-brief', {
        body: { eventId }
      })

      if (error) {
        console.error('[Brief] Error:', error)
        return null
      }

      // Reload feed to show the new brief
      await loadFeed()
      return data?.brief
    } catch (err) {
      console.error('[Brief] Failed:', err)
      return null
    }
  }

  function getTypeIcon(type: string) {
    switch (type) {
      case 'meeting_brief': return '📋'
      case 'email_draft': return '✉️'
      case 'calendar_event': return '📅'
      case 'email_important': return '⚡'
      default: return '📌'
    }
  }

  function getTypeColor(type: string) {
    switch (type) {
      case 'meeting_brief': return 'bg-blue-100 text-blue-700'
      case 'email_draft': return 'bg-purple-100 text-purple-700'
      case 'calendar_event': return 'bg-green-100 text-green-700'
      case 'email_important': return 'bg-orange-100 text-orange-700'
      default: return 'bg-gray-100 text-gray-700'
    }
  }

  if (loading) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="h-screen bg-gradient-to-b from-blue-50 to-white flex flex-col items-center justify-center p-6">
        <div className="text-4xl mb-2">🔮</div>
        <h1 className="text-2xl font-bold mb-2 text-gray-900">Clairvoyant</h1>
        <p className="text-sm text-gray-500 mb-6 text-center">
          The AI assistant that knows what you need
        </p>
        <button
          onClick={handleSignIn}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google
        </button>
      </div>
    )
  }

  if (showSettings && user) {
    return <Settings userId={user.id} onClose={() => { setShowSettings(false); checkApiKey() }} />
  }

  return (
    <div className="h-screen bg-gray-50 overflow-auto">
      {/* Header - draggable region */}
      <div className="drag-region sticky top-0 bg-gray-50/80 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔮</span>
            <h1 className="font-semibold text-gray-900">Clairvoyant</h1>
          </div>
          <div className="flex gap-2 no-drag">
            <button
              onClick={() => setShowSettings(true)}
              className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
              title="Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={handleSignOut}
              className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1 hover:bg-gray-200 rounded-md transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>

      {/* API Key Warning */}
      {!hasApiKey && (
        <div className="mx-4 mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            ⚠️ Add your Anthropic API key in{' '}
            <button onClick={() => setShowSettings(true)} className="underline font-medium">
              Settings
            </button>{' '}
            to enable AI features
          </p>
        </div>
      )}

      {/* Feed */}
      <div className="p-4 space-y-3">
        {feed.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">✨</div>
            <p className="text-gray-500 text-sm">All caught up!</p>
            <p className="text-gray-400 text-xs mt-1">
              New items will appear here as they arrive
            </p>
          </div>
        ) : (
          feed.map(item => (
            <div
              key={item.id}
              className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
            >
              <div
                className="p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpanded(expanded === item.id ? null : item.id)}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${getTypeColor(item.type)}`}>
                      {getTypeIcon(item.type)}
                      {item.type.replace('_', ' ')}
                    </span>
                    <h3 className="font-medium mt-1.5 text-gray-900">{item.title}</h3>
                    {item.subtitle && (
                      <p className="text-sm text-gray-500 mt-0.5">{item.subtitle}</p>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      dismissItem(item.id)
                    }}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {expanded === item.id && item.content && (
                <div className="px-3 pb-3 pt-0 border-t border-gray-100">
                  <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                    {item.content}
                  </div>
                  {item.type === 'email_draft' && (
                    <div className="flex gap-2 mt-3">
                      <button className="flex-1 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                        Review & Send
                      </button>
                      <button className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
