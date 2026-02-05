import React, { useEffect, useState } from 'react'
import RecommendationCard from './components/RecommendationCard'

interface Recommendation {
  id: string
  type: 'context' | 'action' | 'reminder' | 'insight'
  title: string
  description: string
  confidence: number
  priority: number
  actions?: { id: string; label: string; primary?: boolean }[]
  source: 'vision' | 'calendar' | 'email' | 'manual'
  expiresAt?: string
  createdAt: string
}

export default function OverlayApp() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [isMinimized, setIsMinimized] = useState(false)
  const [isCapturing, setIsCapturing] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    // Listen for recommendation updates
    window.overlayAPI.onRecommendationsUpdate((recs) => {
      setRecommendations(recs)
    })

    // Listen for capture status
    window.overlayAPI.onCaptureStatus((capturing) => {
      setIsCapturing(capturing)
    })

    // Listen for minimize state
    window.overlayAPI.onMinimizedChange((minimized) => {
      setIsMinimized(minimized)
    })
  }, [])

  const handleDismiss = async (id: string) => {
    await window.overlayAPI.dismissRecommendation(id)
    setRecommendations(recs => recs.filter(r => r.id !== id))
  }

  const handleAction = async (id: string, actionId: string) => {
    await window.overlayAPI.takeAction(id, actionId)
    // Optionally remove after action
    setRecommendations(recs => recs.filter(r => r.id !== id))
  }

  const handleMinimize = () => {
    window.overlayAPI.minimize()
  }

  const handlePauseToggle = async () => {
    if (isPaused) {
      await window.overlayAPI.resumeVision()
    } else {
      await window.overlayAPI.pauseVision()
    }
    setIsPaused(!isPaused)
  }

  // Minimized state - just shows icon + count
  if (isMinimized) {
    return (
      <div
        className="overlay-minimized"
        onClick={() => window.overlayAPI.expand()}
      >
        <img src="../logo.png" alt="Clairvoyant" className="h-6 object-contain" />
        {recommendations.length > 0 && (
          <span className="count-badge">{recommendations.length}</span>
        )}
      </div>
    )
  }

  return (
    <div className="overlay-container">
      {/* Header */}
      <div className="overlay-header">
        <div className="flex items-center gap-2">
          <img src="../logo.png" alt="Clairvoyant" className="h-6 object-contain" />
          <span className="font-display text-sm" style={{ color: 'var(--cream)' }}>
            Insights
          </span>
        </div>
        <div className="flex items-center gap-1 no-drag">
          {/* Pause/Resume button */}
          <button
            onClick={handlePauseToggle}
            className="btn-ghost p-1.5 rounded-lg"
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="var(--cream-muted)" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="var(--cream-muted)" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
          {/* Minimize button */}
          <button
            onClick={handleMinimize}
            className="btn-ghost p-1.5 rounded-lg"
            title="Minimize"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="var(--cream-muted)" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="overlay-content">
        {recommendations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
              style={{ background: 'var(--void-card)', border: '1px solid var(--border)' }}
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="var(--cream-dark)" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <p className="font-body text-xs" style={{ color: 'var(--cream-muted)' }}>
              {isPaused ? 'Vision paused' : 'Watching for insights...'}
            </p>
            <p className="font-body text-xs mt-1" style={{ color: 'var(--cream-dark)' }}>
              {isPaused
                ? 'Click play to resume'
                : 'Suggestions will appear based on your activity'
              }
            </p>
          </div>
        ) : (
          recommendations.map((rec, index) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              onDismiss={() => handleDismiss(rec.id)}
              onAction={(actionId) => handleAction(rec.id, actionId)}
              index={index}
            />
          ))
        )}
      </div>

      {/* Vision indicator */}
      <div className={`vision-indicator ${isCapturing ? 'active' : ''}`}>
        <span className="pulse-dot" />
        <span className="text-xs">
          {isCapturing ? 'Analyzing...' : isPaused ? 'Paused' : 'Watching'}
        </span>
      </div>
    </div>
  )
}
