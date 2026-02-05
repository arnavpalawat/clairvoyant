import { EventEmitter } from 'events'
import { overlayManager, Recommendation } from '../overlay-window'
import { VisionAnalysis, VisionSuggestion, visionEngine } from './desktop-vision'

function generateId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function stringSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase()
  const bLower = b.toLowerCase()

  if (aLower === bLower) return 1
  if (aLower.includes(bLower) || bLower.includes(aLower)) return 0.8

  // Simple word overlap
  const aWords = new Set(aLower.split(/\s+/))
  const bWords = new Set(bLower.split(/\s+/))
  const intersection = [...aWords].filter(w => bWords.has(w))
  const union = new Set([...aWords, ...bWords])

  return intersection.length / union.size
}

class RecommendationEngine extends EventEmitter {
  private recommendations: Map<string, Recommendation> = new Map()
  private maxRecommendations = 4 // Only show 3-5 most important items
  private minConfidence = 0.5 // Filter out low-confidence suggestions
  private minPriority = 4 // Filter out low-priority suggestions (1-10 scale)
  private expirationMs = 3 * 60 * 1000 // 3 minutes expiration for freshness

  constructor() {
    super()
    this.setupVisionListener()
    this.startExpirationCheck()
  }

  private setupVisionListener(): void {
    visionEngine.on('analysis-complete', (analysis: VisionAnalysis) => {
      this.processVisionAnalysis(analysis)
    })
  }

  private startExpirationCheck(): void {
    // Check for expired recommendations every minute
    setInterval(() => {
      this.pruneExpired()
    }, 60 * 1000)
  }

  processVisionAnalysis(analysis: VisionAnalysis): void {
    if (!analysis.suggestions || analysis.suggestions.length === 0) {
      return
    }

    const now = new Date()

    // Filter to only important suggestions (high confidence + high priority)
    const importantSuggestions = analysis.suggestions.filter((s: VisionSuggestion) =>
      s.confidence >= this.minConfidence && s.priority >= this.minPriority
    )

    if (importantSuggestions.length === 0) {
      console.log('[Recommendations] No high-priority suggestions from analysis')
      return
    }

    const newRecommendations: Recommendation[] = importantSuggestions.map((s: VisionSuggestion) => ({
      id: generateId(),
      type: s.type,
      title: s.title,
      description: s.description,
      confidence: s.confidence,
      priority: s.priority,
      actions: s.actions,
      source: 'vision' as const,
      createdAt: now,
      expiresAt: new Date(now.getTime() + this.expirationMs),
    }))

    // Dedupe and merge with existing
    for (const newRec of newRecommendations) {
      const existing = this.findSimilar(newRec)
      if (existing) {
        // Update existing recommendation
        existing.confidence = Math.max(existing.confidence, newRec.confidence)
        existing.priority = Math.max(existing.priority, newRec.priority)
        existing.expiresAt = newRec.expiresAt // Extend expiry
        console.log(`[Recommendations] Updated existing: ${existing.title}`)
      } else {
        // Add new recommendation
        this.recommendations.set(newRec.id, newRec)
        console.log(`[Recommendations] Added new: ${newRec.title}`)
      }
    }

    // Enforce max limit
    this.enforceLimit()

    // Notify overlay
    this.notifyOverlay()
  }

  private findSimilar(rec: Recommendation): Recommendation | undefined {
    for (const existing of this.recommendations.values()) {
      if (existing.type === rec.type &&
          stringSimilarity(existing.title, rec.title) > 0.7) {
        return existing
      }
    }
    return undefined
  }

  private enforceLimit(): void {
    if (this.recommendations.size <= this.maxRecommendations) {
      return
    }

    // Sort by priority (desc) and creation time (desc)
    const sorted = [...this.recommendations.values()].sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority
      return b.createdAt.getTime() - a.createdAt.getTime()
    })

    // Remove lowest priority items
    const toRemove = sorted.slice(this.maxRecommendations)
    for (const rec of toRemove) {
      this.recommendations.delete(rec.id)
    }
  }

  private pruneExpired(): void {
    const now = new Date()
    let removed = 0

    for (const [id, rec] of this.recommendations) {
      if (rec.expiresAt && rec.expiresAt < now) {
        this.recommendations.delete(id)
        removed++
      }
    }

    if (removed > 0) {
      console.log(`[Recommendations] Pruned ${removed} expired`)
      this.notifyOverlay()
    }
  }

  private notifyOverlay(): void {
    const sorted = this.getCurrent()
    overlayManager.sendRecommendations(sorted)
    this.emit('updated', sorted)
  }

  getCurrent(): Recommendation[] {
    return [...this.recommendations.values()]
      .sort((a, b) => {
        // Sort by priority (desc), then confidence (desc)
        if (b.priority !== a.priority) return b.priority - a.priority
        return b.confidence - a.confidence
      })
  }

  dismiss(id: string): boolean {
    const deleted = this.recommendations.delete(id)
    if (deleted) {
      console.log(`[Recommendations] Dismissed: ${id}`)
      this.notifyOverlay()
    }
    return deleted
  }

  async takeAction(id: string, actionId: string): Promise<void> {
    const rec = this.recommendations.get(id)
    if (!rec) {
      console.log(`[Recommendations] Action failed - not found: ${id}`)
      return
    }

    const action = rec.actions?.find(a => a.id === actionId)
    if (!action) {
      console.log(`[Recommendations] Action not found: ${actionId}`)
      return
    }

    console.log(`[Recommendations] Taking action: ${action.label} on ${rec.title}`)

    // Handle common action types
    if (actionId.startsWith('open:')) {
      const target = actionId.replace('open:', '')
      const { shell } = await import('electron')
      shell.openExternal(target)
    } else if (actionId.startsWith('app:')) {
      const appName = actionId.replace('app:', '')
      const { exec } = await import('child_process')
      exec(`open -a "${appName}"`)
    } else if (actionId === 'dismiss') {
      this.dismiss(id)
      return
    }

    // Remove recommendation after action
    this.dismiss(id)
  }

  // Add manual recommendation (e.g., from calendar events)
  addManual(rec: Omit<Recommendation, 'id' | 'createdAt'>): void {
    const full: Recommendation = {
      ...rec,
      id: generateId(),
      createdAt: new Date(),
    }
    this.recommendations.set(full.id, full)
    this.notifyOverlay()
  }

  clear(): void {
    this.recommendations.clear()
    this.notifyOverlay()
  }
}

export const recommendationEngine = new RecommendationEngine()
