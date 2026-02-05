import React, { useState, useEffect } from 'react'
import VisionSettings from './components/VisionSettings'

interface SettingsProps {
  userId: string
  onClose: () => void
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

    const result = await window.electronAPI.getProfile(userId)

    if (result.data) {
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

    if (anthropicKey && !anthropicKey.startsWith('••••')) {
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
                Settings
              </h1>
            </div>
            <button
              onClick={onClose}
              className="no-drag btn-ghost p-2 rounded-lg"
              style={{ color: 'var(--cream-muted)' }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4 pb-24">
          {/* API Keys Section */}
          <div className="card p-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(245, 158, 11, 0.1)' }}
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
              <div>
                <h3 className="font-display text-sm" style={{ color: 'var(--cream)' }}>
                  API Keys
                </h3>
                <p className="font-body text-xs" style={{ color: 'var(--cream-dark)' }}>
                  Connect your services
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Anthropic API Key */}
              <div className="animate-fade-in stagger-1">
                <label className="block font-body text-sm mb-2" style={{ color: 'var(--cream-muted)' }}>
                  Anthropic API Key
                  <span className="ml-1.5 badge badge-rose text-xs" style={{ padding: '2px 6px' }}>Required</span>
                </label>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={(e) => setAnthropicKey(e.target.value)}
                  placeholder="sk-ant-api03-..."
                  className="input"
                />
                <p className="font-body text-xs mt-2" style={{ color: 'var(--cream-dark)' }}>
                  Powers AI features.{' '}
                  <a
                    href="https://console.anthropic.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-amber"
                  >
                    Get your key
                  </a>
                </p>
              </div>

              <div className="divider" />

              {/* Notion API Key */}
              <div className="animate-fade-in stagger-2">
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
                    className="link-amber"
                  >
                    Create integration
                  </a>
                </p>
              </div>

              {/* Notion Database ID */}
              <div className="animate-fade-in stagger-3">
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
              className="p-4 rounded-xl animate-fade-in"
              style={{
                background: messageType === 'success'
                  ? 'rgba(16, 185, 129, 0.08)'
                  : 'rgba(244, 63, 94, 0.08)',
                border: `1px solid ${messageType === 'success'
                  ? 'rgba(16, 185, 129, 0.2)'
                  : 'rgba(244, 63, 94, 0.2)'}`,
              }}
            >
              <div className="flex items-center gap-3">
                {messageType === 'success' ? (
                  <svg className="w-4 h-4" fill="none" stroke="var(--emerald)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="var(--rose)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                )}
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
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={saveSettings}
            disabled={saving}
            className="btn btn-primary w-full animate-fade-in stagger-4"
            style={{
              opacity: saving ? 0.6 : 1,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <div className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px' }} />
                Saving...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Save Settings
              </span>
            )}
          </button>

          {/* Info Card */}
          <div className="card p-4 animate-fade-in stagger-5">
            <div className="flex items-start gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(139, 92, 246, 0.1)' }}
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
                  They are only used to make requests on your behalf and never shared.
                </p>
              </div>
            </div>
          </div>

          <div className="divider" />

          {/* Vision Settings */}
          <VisionSettings userId={userId} onUpdate={() => setMessage('Vision settings updated')} />

          {/* Version Info */}
          <div className="text-center mt-6 animate-fade-in">
            <p className="font-body text-xs" style={{ color: 'var(--cream-dark)' }}>
              Clairvoyant v1.0.0
            </p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <div className="status-dot active" />
              <span className="font-body text-xs" style={{ color: 'var(--cream-dark)' }}>
                All systems operational
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="ambient-bottom" />
    </div>
  )
}
