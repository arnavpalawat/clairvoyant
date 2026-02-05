import { desktopCapturer, systemPreferences, powerMonitor } from 'electron'
import { EventEmitter } from 'events'
import { supabase, getSession } from '../supabase'
import { overlayManager } from '../overlay-window'

export interface VisionAnalysis {
  currentApp: string
  activity: string
  context: string
  suggestions: VisionSuggestion[]
  detectedIssues: string[]
  timestamp: string
}

export interface VisionSuggestion {
  type: 'context' | 'action' | 'reminder' | 'insight'
  title: string
  description: string
  confidence: number
  priority: number
  actions?: { id: string; label: string; primary?: boolean }[]
}

interface VisionSettings {
  enabled: boolean
  captureInterval: number // How often to capture (in seconds)
  analysisInterval: number // Minimum time between API calls (in seconds)
  pauseOnIdle: boolean
  pauseOnBattery: boolean
  showIndicator: boolean
  changeThreshold: number // 0-1, how much change triggers analysis
}

const DEFAULT_SETTINGS: VisionSettings = {
  enabled: true, // Enabled by default
  captureInterval: 2, // Capture every 2 seconds (fast local check)
  analysisInterval: 3, // Minimum 3 seconds between API calls
  pauseOnIdle: true,
  pauseOnBattery: false, // Don't pause on battery by default
  showIndicator: true,
  changeThreshold: 0.15, // 15% change triggers analysis (balanced sensitivity)
}

// No rate limiting - perpetual operation
const COOLDOWN_AFTER_ERROR_MS = 3000 // Only 3 seconds after error, then retry

class DesktopVisionEngine extends EventEmitter {
  private captureInterval: NodeJS.Timeout | null = null
  private settings: VisionSettings = DEFAULT_SETTINGS
  private isPaused = false
  private lastCapture: Date | null = null
  private lastScreenshot: string | null = null
  private consecutiveErrors = 0
  private errorCooldownUntil: Date | null = null

  async checkScreenPermission(): Promise<boolean> {
    if (process.platform === 'darwin') {
      const status = systemPreferences.getMediaAccessStatus('screen')
      return status === 'granted'
    }
    return true
  }

  async requestScreenPermission(): Promise<void> {
    if (process.platform === 'darwin') {
      // On macOS, we need to attempt a capture first to trigger the permission prompt
      try {
        console.log('[Vision] Triggering screen capture to prompt permission...')
        await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 1, height: 1 },
        })
      } catch (e) {
        console.log('[Vision] Initial capture attempt (expected to fail):', e)
      }

      // Then open System Preferences
      const { shell } = await import('electron')
      shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    }
  }

  async loadSettings(): Promise<void> {
    try {
      const session = await getSession()
      if (!session?.user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', session.user.id)
        .single()

      if (profile?.preferences?.vision) {
        this.settings = { ...DEFAULT_SETTINGS, ...profile.preferences.vision }
      }
    } catch (error) {
      console.error('[Vision] Failed to load settings:', error)
    }
  }

  async start(): Promise<void> {
    if (this.captureInterval) {
      console.log('[Vision] Already running')
      return
    }

    // Force aggressive defaults for now (override any saved settings)
    this.settings = { ...DEFAULT_SETTINGS }
    console.log('[Vision] Using default settings:', this.settings)

    const hasPermission = await this.checkScreenPermission()
    if (!hasPermission) {
      console.log('[Vision] Screen permission not granted')
      this.emit('permission-required')
      return
    }

    console.log(`[Vision] Starting - capture every ${this.settings.captureInterval}s, analyze every ${this.settings.analysisInterval}s minimum`)

    // Initial capture after short delay
    setTimeout(() => this.captureLoop(), 2000)

    // Set up capture interval (fast, local only)
    this.captureInterval = setInterval(
      () => this.captureLoop(),
      this.settings.captureInterval * 1000
    )

    // Show the overlay
    overlayManager.show()

    this.emit('started')
  }

  stop(): void {
    if (this.captureInterval) {
      clearInterval(this.captureInterval)
      this.captureInterval = null
    }
    this.lastScreenshot = null
    this.emit('stopped')
    console.log('[Vision] Stopped')
  }

  pause(): void {
    this.isPaused = true
    this.emit('paused')
    console.log('[Vision] Paused')
  }

  resume(): void {
    this.isPaused = false
    this.emit('resumed')
    console.log('[Vision] Resumed')
  }

  getStatus(): { running: boolean; paused: boolean; lastCapture: Date | null } {
    return {
      running: this.captureInterval !== null,
      paused: this.isPaused,
      lastCapture: this.lastCapture,
    }
  }

  private shouldCapture(): boolean {
    if (this.isPaused) return false

    // Check idle state (if configured) - only pause if truly idle for 5+ minutes
    if (this.settings.pauseOnIdle) {
      const idleTime = powerMonitor.getSystemIdleTime()
      if (idleTime > 300) { // Idle for more than 5 minutes
        return false
      }
    }

    return true
  }

  private shouldAnalyze(): boolean {
    // Only check error cooldown - no rate limiting
    if (this.errorCooldownUntil && new Date() < this.errorCooldownUntil) {
      return false
    }
    return true
  }

  /**
   * Compare two screenshots to detect significant changes
   * Returns a value 0-1 representing how different they are
   */
  private compareScreenshots(current: string, previous: string): number {
    if (!previous) return 1 // First screenshot, always different

    // Quick length-based comparison (very different lengths = very different content)
    const lengthDiff = Math.abs(current.length - previous.length) / Math.max(current.length, previous.length)
    if (lengthDiff > 0.3) return 1 // Very different

    // Sample-based comparison (compare random samples of the base64 string)
    const sampleSize = 1000
    const samples = 10
    let differences = 0

    for (let i = 0; i < samples; i++) {
      const pos = Math.floor(Math.random() * (Math.min(current.length, previous.length) - sampleSize))
      const currentSample = current.substring(pos, pos + sampleSize)
      const prevSample = previous.substring(pos, pos + sampleSize)

      if (currentSample !== prevSample) {
        differences++
      }
    }

    return differences / samples
  }

  private async captureLoop(): Promise<void> {
    if (!this.shouldCapture()) return

    try {
      // Capture screenshot
      const screenshot = await this.captureDesktop()
      if (!screenshot) return

      this.lastCapture = new Date()

      // Compare with previous screenshot to detect changes
      const changeAmount = this.compareScreenshots(screenshot, this.lastScreenshot || '')

      // Store current screenshot
      this.lastScreenshot = screenshot

      // Only send to API if there's meaningful change
      const hasSignificantChange = changeAmount >= this.settings.changeThreshold

      if (!hasSignificantChange) {
        // Screen unchanged - skip API call
        return
      }

      // Check if we can analyze (cooldowns)
      const canAnalyze = this.shouldAnalyze()

      if (canAnalyze) {
        // Show capture indicator
        if (this.settings.showIndicator) {
          overlayManager.sendCaptureStatus(true)
        }

        console.log(`[Vision] Change detected (${(changeAmount * 100).toFixed(1)}%), sending to API...`)

        const context = await this.getAnalysisContext()
        const analysis = await this.analyzeScreenshot(screenshot, context)

        if (analysis) {
          this.consecutiveErrors = 0
          this.emit('analysis-complete', analysis)
          console.log('[Vision] Analysis:', analysis.currentApp, '-', analysis.activity)
        }

        if (this.settings.showIndicator) {
          overlayManager.sendCaptureStatus(false)
        }
      } else {
        console.log(`[Vision] Skipping (error cooldown active)`)
      }
    } catch (error) {
      console.error('[Vision] Capture loop error:', error)
      this.handleError()
    }
  }

  private async captureDesktop(): Promise<string | null> {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 },
      })

      if (sources.length > 0) {
        const thumbnail = sources[0].thumbnail
        const pngBuffer = thumbnail.toPNG()
        return pngBuffer.toString('base64')
      }
    } catch (error) {
      console.error('[Vision] Desktop capture failed:', error)
    }
    return null
  }

  private async getAnalysisContext(): Promise<Record<string, unknown>> {
    const session = await getSession()
    if (!session?.user) return {}

    const context: Record<string, unknown> = {
      currentTime: new Date().toISOString(),
    }

    try {
      // Get upcoming events
      const { data: events } = await supabase
        .from('events')
        .select('title, start_time')
        .eq('user_id', session.user.id)
        .gte('start_time', new Date().toISOString())
        .lte('start_time', new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString())
        .limit(3)

      context.upcomingEvents = events || []

      // Get recent email subjects
      const { data: emails } = await supabase
        .from('emails')
        .select('subject')
        .eq('user_id', session.user.id)
        .order('received_at', { ascending: false })
        .limit(5)

      context.recentEmails = emails?.map(e => e.subject).join(', ') || ''
    } catch (error) {
      console.error('[Vision] Context fetch error:', error)
    }

    return context
  }

  private async analyzeScreenshot(
    screenshotBase64: string,
    context: Record<string, unknown>
  ): Promise<VisionAnalysis | null> {
    try {
      // Use refreshSession to ensure we have a valid token
      const { data: { session }, error: sessionError } = await supabase.auth.refreshSession()

      if (sessionError || !session) {
        console.error('[Vision] No valid session:', sessionError?.message)
        return null
      }

      console.log('[Vision] Session valid, expires:', session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'unknown')

      // Use raw fetch to debug the actual request
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
      const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${supabaseUrl}/functions/v1/analyze-desktop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': supabaseKey || '',
        },
        body: JSON.stringify({ screenshot: screenshotBase64, context }),
      })

      const responseText = await response.text()
      let data: { error?: string; analysis?: VisionAnalysis }

      try {
        data = JSON.parse(responseText)
      } catch {
        console.error('[Vision] Failed to parse response:', responseText.slice(0, 200))
        return null
      }

      if (!response.ok) {
        console.error('[Vision] API error:', response.status, data)
        return null
      }

      if (data.error) {
        console.error('[Vision] API returned error:', data.error)
        return null
      }

      return data.analysis || null
    } catch (error) {
      console.error('[Vision] Analysis failed:', error)
      return null
    }
  }

  private handleError(): void {
    this.consecutiveErrors++
    // Brief cooldown after error, then retry
    this.errorCooldownUntil = new Date(Date.now() + COOLDOWN_AFTER_ERROR_MS)
    console.log(`[Vision] Error occurred, brief cooldown (${COOLDOWN_AFTER_ERROR_MS / 1000}s)`)
  }

  async captureNow(): Promise<VisionAnalysis | null> {
    // Force immediate capture and analysis (bypasses rate limits)
    const hasPermission = await this.checkScreenPermission()
    if (!hasPermission) return null

    try {
      overlayManager.sendCaptureStatus(true)
      const screenshot = await this.captureDesktop()
      if (!screenshot) return null

      this.lastScreenshot = screenshot
      this.lastCapture = new Date()

      const context = await this.getAnalysisContext()
      const analysis = await this.analyzeScreenshot(screenshot, context)

      if (analysis) {
        this.emit('analysis-complete', analysis)
      }

      return analysis
    } finally {
      overlayManager.sendCaptureStatus(false)
    }
  }
}

export const visionEngine = new DesktopVisionEngine()
