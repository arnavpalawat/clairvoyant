import React, { useState, useEffect } from 'react'

interface VisionSettingsData {
  enabled: boolean
  captureInterval: number
  pauseOnIdle: boolean
  pauseOnBattery: boolean
  showIndicator: boolean
  overlayEnabled: boolean
  overlayOpacity: number
}

interface VisionSettingsProps {
  userId: string
  onUpdate: () => void
}

export default function VisionSettings({ userId, onUpdate }: VisionSettingsProps) {
  const [settings, setSettings] = useState<VisionSettingsData>({
    enabled: false,
    captureInterval: 60,
    pauseOnIdle: true,
    pauseOnBattery: true,
    showIndicator: true,
    overlayEnabled: true,
    overlayOpacity: 0.9,
  })
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSettings()
    checkPermission()
  }, [userId])

  async function loadSettings() {
    const result = await window.electronAPI.getProfile(userId)
    if (result.data?.preferences?.vision) {
      setSettings(prev => ({ ...prev, ...result.data.preferences.vision }))
    }
  }

  async function checkPermission() {
    const result = await window.electronAPI.checkVisionPermission()
    setHasPermission(result.granted)
  }

  async function requestPermission() {
    await window.electronAPI.requestVisionPermission()
    // Check again after user might have granted
    setTimeout(checkPermission, 2000)
  }

  async function saveSettings() {
    setSaving(true)
    setMessage('')

    const result = await window.electronAPI.updateVisionSettings(settings)

    if (result.error) {
      setMessage('Failed to save: ' + result.error)
    } else {
      setMessage('Settings saved')
      onUpdate()
      setTimeout(() => setMessage(''), 2000)
    }

    setSaving(false)
  }

  async function toggleVision() {
    const newEnabled = !settings.enabled
    setSettings(prev => ({ ...prev, enabled: newEnabled }))

    if (newEnabled) {
      await window.electronAPI.startVision()
    } else {
      await window.electronAPI.stopVision()
    }
  }

  async function toggleOverlay() {
    await window.electronAPI.toggleOverlay()
  }

  const Toggle = ({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) => (
    <button
      onClick={onChange}
      disabled={disabled}
      className={`toggle-switch ${checked ? 'active' : ''}`}
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    />
  )

  return (
    <div className="space-y-4">
      {/* Vision Settings Card */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--violet-glow)' }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: 'var(--violet)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
          <h3 className="font-display font-medium" style={{ color: 'var(--cream)' }}>
            Desktop Vision
          </h3>
        </div>

        {/* Permission Warning */}
        {hasPermission === false && (
          <div className="mb-4 p-3 rounded-xl" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
            <p className="font-body text-sm" style={{ color: 'var(--amber)' }}>
              Screen recording permission required.
            </p>
            <button
              onClick={requestPermission}
              className="font-body text-sm underline mt-1"
              style={{ color: 'var(--amber)' }}
            >
              Open System Preferences
            </button>
          </div>
        )}

        {/* Enable Toggle */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-body font-medium text-sm" style={{ color: 'var(--cream)' }}>
              Enable Vision Analysis
            </p>
            <p className="font-body text-xs" style={{ color: 'var(--cream-dark)' }}>
              Analyze your screen for contextual suggestions
            </p>
          </div>
          <Toggle
            checked={settings.enabled}
            onChange={toggleVision}
            disabled={hasPermission === false}
          />
        </div>

        {settings.enabled && (
          <>
            <div className="divider my-4" />

            {/* Capture Interval */}
            <div className="mb-4">
              <label className="block font-body text-sm mb-2" style={{ color: 'var(--cream-muted)' }}>
                Capture Frequency
              </label>
              <select
                value={settings.captureInterval}
                onChange={(e) => setSettings(prev => ({ ...prev, captureInterval: Number(e.target.value) }))}
                className="input"
              >
                <option value={30}>Every 30 seconds</option>
                <option value={60}>Every minute</option>
                <option value={120}>Every 2 minutes</option>
                <option value={300}>Every 5 minutes</option>
              </select>
              <p className="font-body text-xs mt-1" style={{ color: 'var(--cream-dark)' }}>
                More frequent = more responsive, but uses more API credits
              </p>
            </div>

            {/* Privacy Options */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-body text-sm" style={{ color: 'var(--cream-muted)' }}>
                  Show capture indicator
                </span>
                <Toggle
                  checked={settings.showIndicator}
                  onChange={() => setSettings(prev => ({ ...prev, showIndicator: !prev.showIndicator }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-body text-sm" style={{ color: 'var(--cream-muted)' }}>
                  Pause when idle
                </span>
                <Toggle
                  checked={settings.pauseOnIdle}
                  onChange={() => setSettings(prev => ({ ...prev, pauseOnIdle: !prev.pauseOnIdle }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-body text-sm" style={{ color: 'var(--cream-muted)' }}>
                  Reduce on battery
                </span>
                <Toggle
                  checked={settings.pauseOnBattery}
                  onChange={() => setSettings(prev => ({ ...prev, pauseOnBattery: !prev.pauseOnBattery }))}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Overlay Settings Card */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-4">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--emerald)', opacity: 0.15 }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: 'var(--emerald)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <h3 className="font-display font-medium" style={{ color: 'var(--cream)' }}>
            Overlay Window
          </h3>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-body font-medium text-sm" style={{ color: 'var(--cream)' }}>
              Show Overlay
            </p>
            <p className="font-body text-xs" style={{ color: 'var(--cream-dark)' }}>
              Always-visible recommendation panel
            </p>
          </div>
          <Toggle
            checked={settings.overlayEnabled}
            onChange={toggleOverlay}
          />
        </div>

        {/* Opacity Slider */}
        <div>
          <label className="block font-body text-sm mb-2" style={{ color: 'var(--cream-muted)' }}>
            Overlay Opacity: {Math.round(settings.overlayOpacity * 100)}%
          </label>
          <input
            type="range"
            min="30"
            max="100"
            value={settings.overlayOpacity * 100}
            onChange={(e) => {
              const opacity = Number(e.target.value) / 100
              setSettings(prev => ({ ...prev, overlayOpacity: opacity }))
              window.electronAPI.setOverlayOpacity(opacity)
            }}
            className="w-full"
            style={{ accentColor: 'var(--amber)' }}
          />
        </div>
      </div>

      {/* Privacy Notice */}
      <div className="p-4 rounded-xl" style={{ background: 'var(--void-light)', border: '1px solid var(--border)' }}>
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(5, 150, 105, 0.15)' }}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ color: 'var(--emerald)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h4 className="font-body text-sm font-medium" style={{ color: 'var(--cream)' }}>
              Privacy First
            </h4>
            <p className="font-body text-xs leading-relaxed" style={{ color: 'var(--cream-dark)' }}>
              Screenshots are sent directly to Claude using your API key.
              They are processed in memory only and never stored.
            </p>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={saveSettings}
        disabled={saving}
        className="btn btn-primary w-full"
        style={{ opacity: saving ? 0.6 : 1 }}
      >
        {saving ? 'Saving...' : 'Save Vision Settings'}
      </button>

      {/* Message */}
      {message && (
        <p
          className="font-body text-sm text-center"
          style={{ color: message.includes('Failed') ? 'var(--rose)' : 'var(--emerald)' }}
        >
          {message}
        </p>
      )}
    </div>
  )
}
