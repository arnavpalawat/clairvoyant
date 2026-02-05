import React from 'react'

interface Recommendation {
  id: string
  type: 'context' | 'action' | 'reminder' | 'insight'
  title: string
  description: string
  confidence: number
  priority: number
  actions?: { id: string; label: string; primary?: boolean }[]
  source: 'vision' | 'calendar' | 'email' | 'manual'
}

interface RecommendationCardProps {
  recommendation: Recommendation
  onDismiss: () => void
  onAction: (actionId: string) => void
  index: number
}

const typeConfig = {
  context: { badge: 'badge-amber', label: 'Context' },
  action: { badge: 'badge-emerald', label: 'Action' },
  reminder: { badge: 'badge-violet', label: 'Reminder' },
  insight: { badge: 'badge-cream', label: 'Insight' },
}

const TypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'context':
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )
    case 'action':
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      )
    case 'reminder':
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      )
    case 'insight':
    default:
      return (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      )
  }
}

export default function RecommendationCard({
  recommendation,
  onDismiss,
  onAction,
  index,
}: RecommendationCardProps) {
  const { type, title, description, confidence, actions } = recommendation
  const config = typeConfig[type] || typeConfig.insight

  return (
    <div
      className={`recommendation-card card animate-fade-in stagger-${Math.min(index + 1, 5)}`}
    >
      <div className="flex justify-between items-start gap-2">
        <span className={`badge ${config.badge}`} style={{ fontSize: '10px', padding: '4px 8px' }}>
          <TypeIcon type={type} />
          {config.label}
        </span>
        <button
          onClick={onDismiss}
          className="btn-ghost p-1 rounded-lg flex-shrink-0"
          title="Dismiss"
        >
          <svg className="w-3 h-3" fill="none" stroke="var(--cream-dark)" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <h3
        className="font-body font-medium text-sm mt-2 leading-tight"
        style={{ color: 'var(--cream)' }}
      >
        {title}
      </h3>

      <p
        className="font-body text-xs mt-1 leading-relaxed"
        style={{ color: 'var(--cream-dark)' }}
      >
        {description}
      </p>

      {actions && actions.length > 0 && (
        <div className="flex gap-2 mt-3">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => onAction(action.id)}
              className={action.primary ? 'btn btn-primary flex-1' : 'btn btn-secondary flex-1'}
              style={{ fontSize: '11px', padding: '6px 10px' }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Low confidence indicator */}
      {confidence < 0.7 && (
        <div className="flex items-center gap-1 mt-2">
          <div
            className="h-1 rounded-full flex-1"
            style={{ background: 'var(--void-light)' }}
          >
            <div
              className="h-1 rounded-full"
              style={{
                width: `${confidence * 100}%`,
                background: confidence > 0.5 ? 'var(--amber)' : 'var(--cream-dark)',
              }}
            />
          </div>
          <span className="text-xs" style={{ color: 'var(--cream-dark)', fontSize: '9px' }}>
            {Math.round(confidence * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}
