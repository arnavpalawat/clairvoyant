import React, { useState, useEffect } from 'react'
import { supabase } from '../shared/supabase'

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

  useEffect(() => {
    loadSettings()
  }, [userId])

  async function loadSettings() {
    if (!userId) return

    const { data } = await supabase
      .from('profiles')
      .select('anthropic_api_key, notion_api_key, notion_database_id')
      .eq('id', userId)
      .single()

    if (data) {
      // Show masked keys if they exist
      setAnthropicKey(data.anthropic_api_key ? '••••••••' + data.anthropic_api_key.slice(-4) : '')
      setNotionKey(data.notion_api_key ? '••••••••' + data.notion_api_key.slice(-4) : '')
      setNotionDbId(data.notion_database_id || '')
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
        setSaving(false)
        return
      }
      updates.anthropic_api_key = anthropicKey
    }

    if (notionKey && !notionKey.startsWith('••••')) {
      if (!notionKey.startsWith('secret_')) {
        setMessage('Invalid Notion API key format')
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
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)

    if (error) {
      setMessage('Failed to save: ' + error.message)
    } else {
      setMessage('Settings saved!')
      setTimeout(() => onClose(), 1000)
    }

    setSaving(false)
  }

  return (
    <div className="h-screen bg-gray-50 overflow-auto">
      {/* Header */}
      <div className="drag-region sticky top-0 bg-gray-50/80 backdrop-blur-sm border-b border-gray-200 px-4 py-3">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="no-drag p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-md transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* API Keys Section */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">API Keys</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1.5">
                Anthropic API Key <span className="text-red-500">*</span>
              </label>
              <input
                type="password"
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Required for AI features.{' '}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Get your key →
                </a>
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1.5">
                Notion API Key <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="password"
                value={notionKey}
                onChange={(e) => setNotionKey(e.target.value)}
                placeholder="secret_..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                For Notion calendar sync.{' '}
                <a
                  href="https://www.notion.so/my-integrations"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Create integration →
                </a>
              </p>
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1.5">
                Notion Calendar Database ID <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={notionDbId}
                onChange={(e) => setNotionDbId(e.target.value)}
                placeholder="abc123def456..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                The 32-character ID from your Notion calendar database URL
              </p>
            </div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <p className={`text-sm ${message.includes('Failed') || message.includes('Invalid') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}

        {/* Save Button */}
        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full py-2.5 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 hover:bg-blue-700 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
