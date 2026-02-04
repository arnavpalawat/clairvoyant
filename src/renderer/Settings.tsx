import React, { useState, useEffect } from 'react'

interface SettingsProps {
  userId: string
  onClose: () => void
}

export default function Settings({ userId, onClose }: SettingsProps) {
  const [anthropicKey, setAnthropicKey] = useState('')
  const [notionKey, setNotionKey] = useState('')
  const [notionDbId, setNotionDbId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')

  useEffect(() => {
    loadSettings()
  }, [userId])

  async function loadSettings() {
    if (!userId) return

    // Use IPC to get profile through main process (which has the auth session)
    const result = await window.electronAPI.getProfile(userId)

    if (result.data) {
      // Show masked keys if they exist
      setAnthropicKey(result.data.anthropic_api_key ? '••••••••' + result.data.anthropic_api_key.slice(-4) : '')
      setNotionKey(result.data.notion_api_key ? '••••••••' + result.data.notion_api_key.slice(-4) : '')
      setNotionDbId(result.data.notion_database_id || '')
    } else if (result.error) {
      console.error('[Settings] Failed to load:', result.error)
    }
  }

  async function saveSettings() {
    setSaving(true)
    setMessage('')

    if (!userId) return

    const updates: Record<string, string> = {}

    // Only update if not masked value
    if (anthropicKey && !anthropicKey.startsWith('••••')) {
      // Validate Anthropic key format
      if (!anthropicKey.startsWith('sk-ant-')) {
        setMessage('Invalid Anthropic API key format')
        setMessageType('error')
        setSaving(false)
        return
      }
      updates.anthropic_api_key = anthropicKey
    }

    if (notionKey && !notionKey.startsWith('••••')) {
      if (!notionKey.startsWith('secret_')) {
        setMessage('Invalid Notion API key format')
        setMessageType('error')
        setSaving(false)
        return
      }
      updates.notion_api_key = notionKey
    }

    if (notionDbId) {
      updates.notion_database_id = notionDbId
    }

    if (Object.keys(updates).length === 0) {
      setMessage('No changes to save')
      setMessageType('error')
      setSaving(false)
      return
    }

    // Use IPC to update profile through main process (which has the auth session)
    const result = await window.electronAPI.updateProfile(userId, updates)

    if (result.error) {
      setMessage('Failed to save: ' + result.error)
      setMessageType('error')
    } else {
      setMessage('Settings saved successfully')
      setMessageType('success')
      setTimeout(() => onClose(), 1000)
    }

    setSaving(false)
  }

  return (
    <div className="h-screen overflow-auto void-pattern" style={{ background: 'var(--void)' }}>
      {/* Header */}
      <div
        className="drag-region sticky top-0 z-20 px-4 py-3 glass"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: 'var(--cream-muted)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h2 className="font-display text-lg font-semibold" style={{ color: 'var(--cream)' }}>
              Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="no-drag p-2 rounded-lg transition-colors"
            style={{ color: 'var(--cream-dark)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--void-light)'
              e.currentTarget.style.color = 'var(--cream-muted)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color = 'var(--cream-dark)'
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6 animate-fade-in">
        {/* API Keys Section */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--amber-glow)' }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ color: 'var(--amber)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h3 className="font-display font-medium" style={{ color: 'var(--cream)' }}>
              API Keys
            </h3>
          </div>

          <div className="space-y-4">
            {/* Anthropic API Key */}
            <div>
              <label className="block font-body text-sm mb-2" style={{ color: 'var(--cream-muted)' }}>
                Anthropic API Key
                <span className="ml-1" style={{ color: 'var(--rose)' }}>*</span>
              </label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="input"
              />
              <p className="font-body text-xs mt-2" style={{ color: 'var(--cream-dark)' }}>
                Required for AI features.{' '}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors"
                  style={{ color: 'var(--amber)' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Get your key
                </a>
              </p>
            </div>

            <div className="divider" />

            {/* Notion API Key */}
            <div>
              <label className="block font-body text-sm mb-2" style={{ color: 'var(--cream-muted)' }}>
                Notion API Key
                <span className="ml-1.5 text-xs" style={{ color: 'var(--cream-dark)' }}>(optional)</span>
              </label>
              <input
                type="password"
                value={notionKey}
                onChange={(e) => setNotionKey(e.target.value)}
                placeholder="secret_..."
                className="input"
              />
              <p className="font-body text-xs mt-2" style={{ color: 'var(--cream-dark)' }}>
                For Notion calendar sync.{' '}
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors"
                  style={{ color: 'var(--amber)' }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '0.8'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                >
                  Create integration
                </a>
              </p>
            </div>

            {/* Notion Database ID */}
            <div>
              <label className="block font-body text-sm mb-2" style={{ color: 'var(--cream-muted)' }}>
                Notion Calendar Database ID
                <span className="ml-1.5 text-xs" style={{ color: 'var(--cream-dark)' }}>(optional)</span>
              </label>
              <input
                type="text"
                value={notionDbId}
                onChange={(e) => setNotionDbId(e.target.value)}
                placeholder="abc123def456..."
                className="input"
              />
              <p className="font-body text-xs mt-2" style={{ color: 'var(--cream-dark)' }}>
                The 32-character ID from your Notion calendar database URL
              </p>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            className="p-3 rounded-xl animate-fade-in"
            style={{
              background: messageType === 'success'
                ? 'rgba(5, 150, 105, 0.1)'
                : 'rgba(225, 29, 72, 0.1)',
              border: `1px solid ${messageType === 'success'
                ? 'rgba(5, 150, 105, 0.2)'
                : 'rgba(225, 29, 72, 0.2)'}`,
            }}
          >
            <p
              className="font-body text-sm"
              style={{
                color: messageType === 'success'
                  ? 'var(--emerald)'
                  : 'var(--rose)',
              }}
            >
              {message}
            </p>
          </div>
        )}

        {/* Save Button */}
        <button
          onClick={saveSettings}
          disabled={saving}
          className="btn btn-primary w-full"
          style={{
            opacity: saving ? 0.6 : 1,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <div className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px' }} />
              Saving...
            </span>
          ) : (
            'Save Settings'
          )}
        </button>

        {/* Info Card */}
        <div
          className="p-4 rounded-xl"
          style={{
            background: 'var(--void-light)',
            border: '1px solid var(--border)',
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--violet-glow)' }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                style={{ color: 'var(--violet)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h4 className="font-body text-sm font-medium mb-1" style={{ color: 'var(--cream)' }}>
                About API Keys
              </h4>
              <p className="font-body text-xs leading-relaxed" style={{ color: 'var(--cream-dark)' }}>
                Your API keys are stored securely and encrypted in the database.
                They are only used to make requests on your behalf.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom ambient glow */}
      <div
        className="fixed bottom-0 left-0 right-0 h-24 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(245, 158, 11, 0.03) 0%, transparent 100%)',
        }}
      />
    </div>
  )
}
