# Clairvoyant MVP Implementation Plan

A **macOS desktop application** that proactively prepares you for meetings, drafts emails, syncs calendars, and sets up your workspace automatically.

**Stack:** Supabase (Auth + Database + Edge Functions) · Claude API · Electron · TypeScript

**Note:** Users provide their own API keys (Anthropic, Notion) via the app's settings. No server-side API keys required.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    CLAIRVOYANT - macOS Desktop App                       │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         SUPABASE CLOUD                             │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐   │  │
│  │  │    Auth     │  │  Database   │  │    Edge Functions       │   │  │
│  │  │   (OAuth)   │  │ (Postgres)  │  │    (Deno Runtime)       │   │  │
│  │  │             │  │             │  │                         │   │  │
│  │  │ Google SSO  │  │ Users       │  │ /generate-brief         │   │  │
│  │  │ Apple SSO   │  │ Events      │  │ /draft-email            │   │  │
│  │  │             │  │ Emails      │  │ /extract-event          │   │  │
│  │  │             │  │ FeedItems   │  │ /score-importance       │   │  │
│  │  │             │  │ CalendarSync│  │                         │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    ↑                                    │
│                                    │ Supabase Client                    │
│                                    ↓                                    │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    ELECTRON DESKTOP APP (macOS)                    │  │
│  │                                                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐    │  │
│  │  │   Main UI    │  │   System     │  │   Native Agents      │    │  │
│  │  │   (React)    │  │    Tray      │  │                      │    │  │
│  │  │              │  │              │  │  • Calendar Sync     │    │  │
│  │  │  Feed View   │  │  Quick       │  │  • Workspace Setup   │    │  │
│  │  │  Settings    │  │  Actions     │  │  • Document Finder   │    │  │
│  │  │  Brief View  │  │  Status      │  │  • Window Manager    │    │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘    │  │
│  │                                                                    │  │
│  │  Native APIs: AppleScript · EventKit · Accessibility · Spotlight  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                         CLAUDE API                                 │  │
│  │  Meeting Briefs · Email Drafts · Event Extraction · Scoring       │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Project Setup

### Step 1.1: Initialize Electron App

**Tasks:**
```bash
mkdir clairvoyant-app && cd clairvoyant-app
pnpm init
pnpm add electron electron-builder @electron/remote
pnpm add -D typescript @types/node electron-devtools-installer
pnpm add react react-dom @types/react @types/react-dom
pnpm add tailwindcss postcss autoprefixer
pnpm add @supabase/supabase-js
pnpm add @anthropic-ai/sdk
pnpm add electron-store googleapis
```

**Directory Structure:**
```
clairvoyant-app/
├── src/
│   ├── main/              # Electron main process
│   │   ├── index.ts       # App entry, tray, windows
│   │   ├── agents/        # Native macOS agents
│   │   │   ├── calendar-sync.ts
│   │   │   ├── workspace-manager.ts
│   │   │   ├── document-finder.ts
│   │   │   └── window-manager.ts
│   │   └── ipc/           # IPC handlers
│   ├── renderer/          # React UI
│   │   ├── App.tsx
│   │   ├── components/
│   │   ├── hooks/
│   │   └── pages/
│   ├── shared/            # Shared types
│   │   └── supabase.ts
│   └── preload.ts         # Preload script
├── supabase/
│   ├── migrations/        # Database migrations
│   └── functions/         # Edge functions
│       ├── generate-brief/
│       ├── draft-email/
│       ├── extract-event/
│       └── score-importance/
├── assets/
│   └── tray-icon.png
├── package.json
├── electron-builder.json
├── tsconfig.json
├── tailwind.config.js
└── .env
```

**Create `src/main/index.ts`:**
```typescript
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
import path from 'path'
import { startMeetingWatcher } from './agents/workspace-manager'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    show: false,
    frame: false,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))

  mainWindow.on('blur', () => {
    mainWindow?.hide()
  })
}

function createTray() {
  const icon = nativeImage.createFromPath(
    path.join(__dirname, '../../assets/tray-icon.png')
  )
  tray = new Tray(icon.resize({ width: 18, height: 18 }))

  tray.setToolTip('Clairvoyant')

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide()
    } else {
      const bounds = tray!.getBounds()
      mainWindow?.setPosition(bounds.x - 180, bounds.y + bounds.height + 5)
      mainWindow?.show()
    }
  })

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Clairvoyant', click: () => mainWindow?.show() },
    { label: 'Sync Now', click: () => ipcMain.emit('sync-all') },
    { type: 'separator' },
    { label: 'Preferences...', accelerator: 'Cmd+,' },
    { type: 'separator' },
    { label: 'Quit', accelerator: 'Cmd+Q', click: () => app.quit() },
  ])

  tray.setContextMenu(contextMenu)
}

// Register deep link protocol
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('clairvoyant', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('clairvoyant')
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  startMeetingWatcher()
  app.dock?.hide() // Menubar app only
})

// Handle OAuth callback deep link
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (url.startsWith('clairvoyant://auth/callback')) {
    mainWindow?.webContents.send('auth-callback', url)
  }
})

app.on('window-all-closed', (e) => {
  e.preventDefault()
})
```

**Checkpoints:**
- [ ] `pnpm electron .` starts app
- [ ] Tray icon appears in macOS menu bar
- [ ] Clicking tray shows/hides dropdown window
- [ ] App stays running when window closed
- [ ] Dock icon hidden (menubar app only)

**✅ Ready to proceed when:** Electron app runs as menubar app

---

### Step 1.2: Supabase Project Setup

**Tasks:**
1. Create Supabase project at https://supabase.com
2. Enable Google OAuth provider
3. Set up database schema

**Supabase Dashboard Steps:**
1. Create New Project → Name: "clairvoyant"
2. **Authentication → Providers → Google:**
   - Enable Google provider
   - Add Client ID & Secret from Google Cloud Console
   - Authorized redirect URI: `https://[project-ref].supabase.co/auth/v1/callback`
3. **Google Cloud Console** (console.cloud.google.com):
   - Create OAuth 2.0 credentials
   - Add scopes:
     - `https://www.googleapis.com/auth/calendar.readonly`
     - `https://www.googleapis.com/auth/gmail.readonly`
     - `https://www.googleapis.com/auth/gmail.compose`
   - Add redirect URI from Supabase

**Create `supabase/migrations/001_initial.sql`:**
```sql
-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,

  -- Google OAuth tokens (from Supabase Auth)
  google_access_token TEXT,
  google_refresh_token TEXT,
  google_token_expiry TIMESTAMPTZ,

  -- User-provided API keys (encrypted at rest by Supabase)
  anthropic_api_key TEXT,  -- User's Claude API key
  notion_api_key TEXT,     -- User's Notion API key
  notion_database_id TEXT, -- User's Notion calendar database

  -- User preferences
  preferences JSONB DEFAULT '{
    "briefTiming": 30,
    "dailyBriefTime": "08:00",
    "workspaceEnabled": true
  }'::jsonb,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Calendar Events
CREATE TABLE public.events (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  attendees TEXT[] DEFAULT '{}',
  location TEXT,
  meeting_link TEXT,
  brief TEXT,
  brief_generated_at TIMESTAMPTZ,
  source TEXT DEFAULT 'google',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own events" ON public.events FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_events_user_start ON public.events(user_id, start_time);

-- Emails
CREATE TABLE public.emails (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  thread_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  sender TEXT NOT NULL,
  recipients TEXT[] DEFAULT '{}',
  snippet TEXT,
  body TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  is_read BOOLEAN DEFAULT false,
  importance_score FLOAT,
  needs_response BOOLEAN DEFAULT false,
  draft_content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own emails" ON public.emails FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_emails_user_received ON public.emails(user_id, received_at DESC);
CREATE INDEX idx_emails_importance ON public.emails(user_id, importance_score DESC);

-- Feed Items
CREATE TABLE public.feed_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content JSONB NOT NULL,
  priority INT DEFAULT 0,
  source_id TEXT,
  show_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.feed_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own feed" ON public.feed_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_feed_user_show ON public.feed_items(user_id, show_at DESC);

-- Calendar Sync Tracking
CREATE TABLE public.calendar_syncs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  google_event_id TEXT,
  apple_event_id TEXT,
  notion_event_id TEXT,
  title TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  source_calendar TEXT NOT NULL,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, google_event_id),
  UNIQUE(user_id, apple_event_id),
  UNIQUE(user_id, notion_event_id)
);

ALTER TABLE public.calendar_syncs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own syncs" ON public.calendar_syncs FOR ALL USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

**Run migration:**
```bash
supabase db push
```

**Checkpoints:**
- [ ] Supabase project created
- [ ] Google OAuth provider enabled
- [ ] Google Cloud OAuth credentials created
- [ ] Database tables visible in Table Editor
- [ ] RLS policies active

**✅ Ready to proceed when:** Supabase fully configured

---

### Step 1.3: Supabase Client & Auth

**Create `src/shared/supabase.ts`:**
```typescript
import { createClient, Session } from '@supabase/supabase-js'
import { shell } from 'electron'
import Store from 'electron-store'

const store = new Store({
  encryptionKey: process.env.STORE_ENCRYPTION_KEY
})

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: {
      getItem: (key) => store.get(key) as string | null,
      setItem: (key, value) => store.set(key, value),
      removeItem: (key) => store.delete(key),
    },
    autoRefreshToken: true,
    persistSession: true,
  },
})

export async function signInWithGoogle(): Promise<void> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: 'clairvoyant://auth/callback',
      scopes: [
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/gmail.compose',
      ].join(' '),
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) throw error
  if (data.url) shell.openExternal(data.url)
}

export async function handleAuthCallback(url: string): Promise<Session | null> {
  const hashParams = new URL(url).hash.substring(1)
  const params = new URLSearchParams(hashParams)

  const accessToken = params.get('access_token')
  const refreshToken = params.get('refresh_token')

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    })

    if (error) throw error

    // Store Google tokens for API access
    const providerToken = params.get('provider_token')
    const providerRefreshToken = params.get('provider_refresh_token')

    if (providerToken && data.session) {
      await supabase.from('profiles').update({
        google_access_token: providerToken,
        google_refresh_token: providerRefreshToken,
      }).eq('id', data.session.user.id)
    }

    return data.session
  }
  return null
}

export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut()
}
```

**Checkpoints:**
- [ ] Deep link `clairvoyant://` registered
- [ ] Sign in opens browser to Google
- [ ] After OAuth, callback received
- [ ] Session persists across app restarts

**✅ Ready to proceed when:** Authentication works end-to-end

---

## Phase 2: Edge Functions (Claude-Powered)

### Step 2.1: Generate Meeting Brief

**Create `supabase/functions/generate-brief/index.ts`:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk'

serve(async (req) => {
  try {
    const { eventId } = await req.json()
    const authHeader = req.headers.get('Authorization')!

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get user's API key from their profile
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user.id)
      .single()

    if (!profile?.anthropic_api_key) {
      return new Response(JSON.stringify({ error: 'Please add your Anthropic API key in Settings' }), { status: 400 })
    }

    // Initialize Anthropic with user's API key
    const anthropic = new Anthropic({
      apiKey: profile.anthropic_api_key,
    })

    // Get event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .single()

    if (eventError || !event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), { status: 404 })
    }

    // Get related emails from attendees
    const attendees = event.attendees || []
    let relatedEmails: any[] = []

    if (attendees.length > 0) {
      const { data } = await supabase
        .from('emails')
        .select('subject, sender, snippet, received_at')
        .or(attendees.map((e: string) => `sender.ilike.%${e}%`).join(','))
        .order('received_at', { ascending: false })
        .limit(10)

      relatedEmails = data || []
    }

    const emailContext = relatedEmails.length > 0
      ? relatedEmails.map(e =>
          `- "${e.subject}" from ${e.sender} (${new Date(e.received_at).toLocaleDateString()}): ${e.snippet}`
        ).join('\n')
      : 'No recent email history with attendees.'

    // Generate with Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Generate a concise meeting prep brief.

MEETING: ${event.title}
TIME: ${new Date(event.start_time).toLocaleString()}
ATTENDEES: ${attendees.join(', ') || 'Just you'}
${event.description ? `DESCRIPTION: ${event.description}` : ''}

RECENT EMAILS WITH ATTENDEES:
${emailContext}

Provide 3-5 bullet points covering:
1. Quick context about the meeting
2. Key points from recent communications
3. Things to prepare or remember

Be concise and actionable.`
      }],
    })

    const brief = message.content[0].type === 'text' ? message.content[0].text : ''

    // Save to database
    await supabase
      .from('events')
      .update({ brief, brief_generated_at: new Date().toISOString() })
      .eq('id', eventId)

    return new Response(JSON.stringify({ brief }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
```

**Deploy:**
```bash
supabase functions deploy generate-brief
```

**Checkpoints:**
- [ ] Function deploys successfully
- [ ] Returns error if user has no API key set
- [ ] Returns generated brief when API key is valid
- [ ] Brief saved to events table

**✅ Ready to proceed when:** Brief generation works

---

### Step 2.2: Draft Email Response

**Create `supabase/functions/draft-email/index.ts`:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk'

serve(async (req) => {
  try {
    const { emailId } = await req.json()
    const authHeader = req.headers.get('Authorization')!

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get user's API key
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user!.id)
      .single()

    if (!profile?.anthropic_api_key) {
      return new Response(JSON.stringify({ error: 'Please add your Anthropic API key in Settings' }), { status: 400 })
    }

    const anthropic = new Anthropic({ apiKey: profile.anthropic_api_key })

    const { data: email, error } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .single()

    if (error || !email) {
      return new Response(JSON.stringify({ error: 'Email not found' }), { status: 404 })
    }

    // Get sender history
    const senderEmail = email.sender.match(/<(.+)>/)?.[1] || email.sender
    const { data: history } = await supabase
      .from('emails')
      .select('subject, snippet, received_at')
      .ilike('sender', `%${senderEmail}%`)
      .neq('id', emailId)
      .order('received_at', { ascending: false })
      .limit(5)

    const historyContext = history?.length
      ? history.map(e => `- "${e.subject}" (${new Date(e.received_at).toLocaleDateString()}): ${e.snippet}`).join('\n')
      : 'No previous history.'

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Generate a professional email response.

ORIGINAL EMAIL:
From: ${email.sender}
Subject: ${email.subject}
Body: ${email.body || email.snippet}

HISTORY WITH SENDER:
${historyContext}

Write a response that:
1. Addresses all questions/requests
2. Is professional but warm
3. Is concise (under 150 words)

Return ONLY the email body text.`
      }],
    })

    const draft = message.content[0].type === 'text' ? message.content[0].text : ''

    await supabase
      .from('emails')
      .update({ draft_content: draft })
      .eq('id', emailId)

    return new Response(JSON.stringify({ draft }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
```

**Deploy:**
```bash
supabase functions deploy draft-email
```

**Checkpoints:**
- [ ] Function returns contextual draft
- [ ] Draft saved to emails table

**✅ Ready to proceed when:** Draft generation works

---

### Step 2.3: Score Email Importance

**Create `supabase/functions/score-importance/index.ts`:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk'

serve(async (req) => {
  try {
    const authHeader = req.headers.get('Authorization')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get user's API key
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user!.id)
      .single()

    if (!profile?.anthropic_api_key) {
      return new Response(JSON.stringify({ error: 'API key required' }), { status: 400 })
    }

    const anthropic = new Anthropic({ apiKey: profile.anthropic_api_key })

    const { data: emails } = await supabase
      .from('emails')
      .select('id, subject, sender, snippet, is_read')
      .is('importance_score', null)
      .limit(10)

    if (!emails?.length) {
      return new Response(JSON.stringify({ scored: 0 }))
    }

    let scored = 0

    for (const email of emails) {
      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-20250514', // Fast & cheap for scoring
        max_tokens: 100,
        messages: [{
          role: 'user',
          content: `Rate email importance 0-100. Respond JSON only.

Subject: ${email.subject}
From: ${email.sender}
Preview: ${email.snippet}

{"score": number, "needsResponse": boolean}`
        }],
      })

      try {
        const content = message.content[0].type === 'text' ? message.content[0].text : '{}'
        const result = JSON.parse(content.replace(/```json\n?|\n?```/g, ''))

        await supabase.from('emails').update({
          importance_score: Math.min(100, Math.max(0, result.score || 50)),
          needs_response: result.needsResponse || false,
        }).eq('id', email.id)

        scored++
      } catch { /* skip parse errors */ }
    }

    return new Response(JSON.stringify({ scored }))
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
```

**Deploy:**
```bash
supabase functions deploy score-importance
```

**Checkpoints:**
- [ ] Uses claude-haiku-4-20250514 (fast/cheap)
- [ ] Scores saved to database

**✅ Ready to proceed when:** Scoring works

---

### Step 2.4: Extract Events from Email

**Create `supabase/functions/extract-event/index.ts`:**
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk'

serve(async (req) => {
  try {
    const { emailId } = await req.json()
    const authHeader = req.headers.get('Authorization')!

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get user's API key
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user!.id)
      .single()

    if (!profile?.anthropic_api_key) {
      return new Response(JSON.stringify({ hasEvent: false, error: 'API key required' }))
    }

    const anthropic = new Anthropic({ apiKey: profile.anthropic_api_key })

    const { data: email } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .single()

    if (!email) {
      return new Response(JSON.stringify({ hasEvent: false }))
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Extract calendar event from email. Today: ${new Date().toISOString().split('T')[0]}

Subject: ${email.subject}
From: ${email.sender}
Body: ${email.body || email.snippet}

If event found, respond JSON:
{
  "hasEvent": true,
  "event": {
    "title": "string",
    "startDate": "ISO datetime",
    "endDate": "ISO datetime",
    "location": "string or null"
  }
}

If no event: {"hasEvent": false}`
      }],
    })

    const content = message.content[0].type === 'text' ? message.content[0].text : '{}'
    const result = JSON.parse(content.replace(/```json\n?|\n?```/g, ''))

    return new Response(JSON.stringify(result))
  } catch (error) {
    return new Response(JSON.stringify({ hasEvent: false }))
  }
})
```

**Deploy:**
```bash
supabase functions deploy extract-event
```

**Checkpoints:**
- [ ] Extracts "Let's meet Tuesday at 3pm"
- [ ] Returns structured event data

**✅ Ready to proceed when:** Extraction works

---

## Phase 3: Data Sync

### Step 3.1: Google Calendar & Gmail Sync

**Create `src/main/agents/google-sync.ts`:**
```typescript
import { google } from 'googleapis'
import { supabase } from '../../shared/supabase'

async function getGoogleAuth(userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('google_access_token, google_refresh_token')
    .eq('id', userId)
    .single()

  if (!profile?.google_access_token) throw new Error('No Google tokens')

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  )

  oauth2Client.setCredentials({
    access_token: profile.google_access_token,
    refresh_token: profile.google_refresh_token,
  })

  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.access_token) {
      await supabase.from('profiles').update({
        google_access_token: tokens.access_token,
        google_refresh_token: tokens.refresh_token || profile.google_refresh_token,
      }).eq('id', userId)
    }
  })

  return oauth2Client
}

export async function syncGoogleCalendar(userId: string): Promise<number> {
  const auth = await getGoogleAuth(userId)
  const calendar = google.calendar({ version: 'v3', auth })

  const now = new Date()
  const oneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

  const { data } = await calendar.events.list({
    calendarId: 'primary',
    timeMin: now.toISOString(),
    timeMax: oneWeek.toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
  })

  let synced = 0
  for (const event of data.items || []) {
    if (!event.id || !event.start?.dateTime) continue

    await supabase.from('events').upsert({
      id: event.id,
      user_id: userId,
      title: event.summary || 'No title',
      description: event.description,
      start_time: event.start.dateTime,
      end_time: event.end?.dateTime || event.start.dateTime,
      attendees: event.attendees?.map(a => a.email).filter(Boolean) || [],
      location: event.location,
      meeting_link: event.hangoutLink,
      source: 'google',
    })
    synced++
  }

  return synced
}

export async function syncGmail(userId: string): Promise<number> {
  const auth = await getGoogleAuth(userId)
  const gmail = google.gmail({ version: 'v1', auth })

  const { data: list } = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 30,
    q: 'in:inbox',
  })

  let synced = 0
  for (const msg of (list.messages || []).slice(0, 20)) {
    if (!msg.id) continue

    const { data: existing } = await supabase
      .from('emails').select('id').eq('id', msg.id).single()
    if (existing) continue

    const { data: full } = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'full',
    })

    const headers = full.payload?.headers || []
    const getHeader = (name: string) => headers.find(h => h.name === name)?.value || ''

    let body = ''
    if (full.payload?.body?.data) {
      body = Buffer.from(full.payload.body.data, 'base64').toString('utf-8')
    } else if (full.payload?.parts) {
      const textPart = full.payload.parts.find(p => p.mimeType === 'text/plain')
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
      }
    }

    await supabase.from('emails').insert({
      id: msg.id,
      user_id: userId,
      thread_id: full.threadId || msg.id,
      subject: getHeader('Subject') || '(No subject)',
      sender: getHeader('From'),
      recipients: getHeader('To').split(',').map(e => e.trim()),
      snippet: full.snippet || '',
      body: body.slice(0, 10000),
      received_at: new Date(parseInt(full.internalDate || '0')),
      is_read: !full.labelIds?.includes('UNREAD'),
    })
    synced++
  }

  return synced
}
```

**Checkpoints:**
- [ ] Calendar events sync to Supabase
- [ ] Emails sync to Supabase
- [ ] Token refresh works

**✅ Ready to proceed when:** Google sync works

---

### Step 3.2: Apple Calendar Integration

**Create `src/main/agents/apple-calendar.ts`:**
```typescript
import { exec } from 'child_process'
import { promisify } from 'util'
import { supabase } from '../../shared/supabase'

const execAsync = promisify(exec)

export async function getAppleCalendarEvents(start: Date, end: Date) {
  const script = `
    const app = Application('Calendar')
    const events = []
    app.calendars().forEach(cal => {
      try {
        cal.events.whose({
          startDate: { _greaterThan: new Date('${start.toISOString()}') },
          endDate: { _lessThan: new Date('${end.toISOString()}') }
        })().forEach(e => {
          events.push({
            uid: e.uid(),
            title: e.summary(),
            startDate: e.startDate().toISOString(),
            endDate: e.endDate().toISOString(),
            location: e.location() || null
          })
        })
      } catch(err) {}
    })
    JSON.stringify(events)
  `

  try {
    const { stdout } = await execAsync(`osascript -l JavaScript -e '${script.replace(/'/g, "\\'")}'`)
    return JSON.parse(stdout.trim())
  } catch {
    return []
  }
}

export async function createAppleCalendarEvent(event: {
  title: string
  startDate: Date
  endDate: Date
  location?: string
}) {
  const script = `
    const app = Application('Calendar')
    const cal = app.calendars()[0]
    const e = app.Event({
      summary: '${event.title.replace(/'/g, "\\'")}',
      startDate: new Date('${event.startDate.toISOString()}'),
      endDate: new Date('${event.endDate.toISOString()}')
      ${event.location ? `, location: '${event.location.replace(/'/g, "\\'")}'` : ''}
    })
    cal.events.push(e)
    e.uid()
  `

  const { stdout } = await execAsync(`osascript -l JavaScript -e '${script.replace(/'/g, "\\'")}'`)
  return stdout.trim()
}

export async function syncAppleCalendar(userId: string): Promise<number> {
  const now = new Date()
  const oneWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const events = await getAppleCalendarEvents(now, oneWeek)

  let synced = 0
  for (const event of events) {
    await supabase.from('events').upsert({
      id: `apple_${event.uid}`,
      user_id: userId,
      title: event.title,
      start_time: event.startDate,
      end_time: event.endDate,
      location: event.location,
      source: 'apple',
    })
    synced++
  }

  return synced
}
```

**Checkpoints:**
- [ ] macOS Calendar permission granted
- [ ] Events read from Apple Calendar
- [ ] Can create events

**✅ Ready to proceed when:** Apple Calendar works

---

## Phase 4: Workspace Agent

### Step 4.1: Window Manager

**Create `src/main/agents/window-manager.ts`:**
```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

type Position = 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export async function openApp(name: string) {
  await execAsync(`open -a "${name}"`)
  await new Promise(r => setTimeout(r, 1000))
}

export async function openUrl(url: string) {
  await execAsync(`open "${url}"`)
}

export async function openFile(path: string) {
  await execAsync(`open "${path}"`)
}

export async function positionWindow(app: string, position: Position) {
  const { stdout } = await execAsync(`system_profiler SPDisplaysDataType | grep -E "Resolution:" | head -1`)
  const match = stdout.match(/(\d+) x (\d+)/)
  const w = parseInt(match?.[1] || '1920')
  const h = parseInt(match?.[2] || '1080')
  const menuBar = 25, dock = 70
  const usable = h - menuBar - dock

  const pos: Record<Position, [number, number, number, number]> = {
    'left': [0, menuBar, w/2, usable],
    'right': [w/2, menuBar, w/2, usable],
    'top-left': [0, menuBar, w/2, usable/2],
    'top-right': [w/2, menuBar, w/2, usable/2],
    'bottom-left': [0, menuBar + usable/2, w/2, usable/2],
    'bottom-right': [w/2, menuBar + usable/2, w/2, usable/2],
  }

  const [x, y, width, height] = pos[position]

  await execAsync(`osascript -e '
    tell application "${app}"
      activate
      set bounds of front window to {${x}, ${y}, ${x + width}, ${y + height}}
    end tell
  '`)
}

export async function setupWorkspace(layouts: Array<{ app: string; position: Position; url?: string; file?: string }>) {
  for (const l of layouts) {
    await openApp(l.app)
    if (l.url) await openUrl(l.url)
    if (l.file) await openFile(l.file)
    await positionWindow(l.app, l.position)
  }
}
```

**Checkpoints:**
- [ ] Accessibility permission granted
- [ ] Apps open and position correctly

**✅ Ready to proceed when:** Window management works

---

### Step 4.2: Document Finder

**Create `src/main/agents/document-finder.ts`:**
```typescript
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function searchLocalFiles(query: string, limit = 10) {
  try {
    const { stdout } = await execAsync(
      `mdfind "kMDItemDisplayName == '*${query}*'wc" | head -${limit}`
    )
    return stdout.trim().split('\n').filter(Boolean).map(path => ({
      name: path.split('/').pop() || path,
      path,
      source: 'local' as const,
    }))
  } catch {
    return []
  }
}

export async function findRelevantDocuments(title: string, attendees: string[]) {
  const terms = [title, ...attendees.map(a => a.split('@')[0])].slice(0, 5)
  const allDocs: Array<{ name: string; path: string; source: 'local' }> = []

  for (const term of terms) {
    const docs = await searchLocalFiles(term, 5)
    allDocs.push(...docs)
  }

  const seen = new Set<string>()
  return allDocs.filter(d => {
    if (seen.has(d.path)) return false
    seen.add(d.path)
    return true
  }).slice(0, 10)
}
```

**Checkpoints:**
- [ ] Spotlight search returns files

**✅ Ready to proceed when:** Document search works

---

### Step 4.3: Meeting Trigger

**Create `src/main/agents/workspace-manager.ts`:**
```typescript
import { Notification } from 'electron'
import { supabase, getSession } from '../../shared/supabase'
import { setupWorkspace } from './window-manager'
import { findRelevantDocuments } from './document-finder'

const triggered = new Set<string>()

export function startMeetingWatcher() {
  setInterval(async () => {
    const session = await getSession()
    if (!session) return

    const now = new Date()
    const soon = new Date(now.getTime() + 5 * 60 * 1000)
    const soonPlus = new Date(now.getTime() + 6 * 60 * 1000)

    const { data: events } = await supabase
      .from('events')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('start_time', soon.toISOString())
      .lt('start_time', soonPlus.toISOString())

    for (const event of events || []) {
      if (triggered.has(event.id)) continue
      triggered.add(event.id)

      new Notification({
        title: 'Preparing workspace',
        body: `Setting up for: ${event.title}`,
      }).show()

      const docs = await findRelevantDocuments(event.title, event.attendees || [])
      const layouts: any[] = []

      if (event.meeting_link?.includes('zoom')) {
        layouts.push({ app: 'zoom.us', position: 'left' })
      } else if (event.meeting_link?.includes('meet.google')) {
        layouts.push({ app: 'Google Chrome', position: 'left', url: event.meeting_link })
      }

      layouts.push({ app: 'Slack', position: 'top-right' })

      if (docs[0]) {
        layouts.push({ app: 'Preview', position: 'bottom-right', file: docs[0].path })
      }

      await setupWorkspace(layouts)
    }
  }, 30000)
}
```

**Checkpoints:**
- [ ] Watcher triggers 5 min before
- [ ] Notification shows
- [ ] Workspace sets up

**✅ Ready to proceed when:** Auto-workspace works

---

## Phase 5: UI

### Step 5.1: Settings UI (API Keys)

**Tasks:**
1. Create settings page for API key input
2. Save keys to user's profile
3. Validate keys before saving

**Create `src/renderer/Settings.tsx`:**
```tsx
import React, { useState, useEffect } from 'react'
import { supabase } from '../shared/supabase'

interface SettingsProps {
  onClose: () => void
}

export default function Settings({ onClose }: SettingsProps) {
  const [anthropicKey, setAnthropicKey] = useState('')
  const [notionKey, setNotionKey] = useState('')
  const [notionDbId, setNotionDbId] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('profiles')
      .select('anthropic_api_key, notion_api_key, notion_database_id')
      .eq('id', user.id)
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const updates: any = {}

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

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)

    if (error) {
      setMessage('Failed to save: ' + error.message)
    } else {
      setMessage('Settings saved!')
      setTimeout(() => onClose(), 1000)
    }

    setSaving(false)
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="font-bold text-lg">Settings</h2>
        <button onClick={onClose} className="text-gray-500">×</button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Anthropic API Key *
          </label>
          <input
            type="password"
            value={anthropicKey}
            onChange={(e) => setAnthropicKey(e.target.value)}
            placeholder="sk-ant-api03-..."
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Get from <a href="https://console.anthropic.com" className="text-blue-600">console.anthropic.com</a>
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notion API Key (optional)
          </label>
          <input
            type="password"
            value={notionKey}
            onChange={(e) => setNotionKey(e.target.value)}
            placeholder="secret_..."
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notion Calendar Database ID (optional)
          </label>
          <input
            type="text"
            value={notionDbId}
            onChange={(e) => setNotionDbId(e.target.value)}
            placeholder="abc123..."
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>

        {message && (
          <p className={`text-sm ${message.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
            {message}
          </p>
        )}

        <button
          onClick={saveSettings}
          disabled={saving}
          className="w-full py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
```

**Checkpoints:**
- [ ] Settings UI renders
- [ ] API keys save to database
- [ ] Keys are masked when displayed
- [ ] Validation catches invalid key formats

**✅ Ready to proceed when:** Users can save their API keys

---

### Step 5.2: React Feed UI

**Create `src/renderer/App.tsx`:**
```tsx
import React, { useEffect, useState } from 'react'
import { supabase, signInWithGoogle, signOut, getSession } from '../shared/supabase'
import Settings from './Settings'

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [feed, setFeed] = useState<any[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [hasApiKey, setHasApiKey] = useState(false)

  useEffect(() => {
    getSession().then(setSession)
    supabase.auth.onAuthStateChange((_, s) => setSession(s))
  }, [])

  useEffect(() => {
    if (session) {
      checkApiKey()
      loadFeed()
    }
  }, [session])

  async function checkApiKey() {
    const { data } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', session.user.id)
      .single()
    setHasApiKey(!!data?.anthropic_api_key)
    if (!data?.anthropic_api_key) setShowSettings(true)
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

  async function dismiss(id: string) {
    await supabase.from('feed_items').update({ dismissed: true }).eq('id', id)
    setFeed(f => f.filter(i => i.id !== id))
  }

  async function generateBrief(eventId: string, itemId: string) {
    const { data } = await supabase.functions.invoke('generate-brief', { body: { eventId } })
    if (data?.brief) {
      setFeed(f => f.map(i => i.id === itemId
        ? { ...i, content: { ...i.content, brief: data.brief, hasBrief: true } }
        : i
      ))
    }
  }

  if (!session) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
        <h1 className="text-2xl font-bold mb-4">Clairvoyant</h1>
        <button onClick={signInWithGoogle} className="px-4 py-2 bg-white border rounded-lg shadow">
          Sign in with Google
        </button>
      </div>
    )
  }

  if (showSettings) {
    return <Settings onClose={() => { setShowSettings(false); checkApiKey() }} />
  }

  return (
    <div className="h-screen bg-gray-50 overflow-auto p-4">
      <div className="flex justify-between mb-4">
        <h1 className="font-bold">Clairvoyant</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(true)} className="text-xs text-gray-500">⚙️</button>
          <button onClick={signOut} className="text-xs text-gray-500">Sign out</button>
        </div>
      </div>

      {!hasApiKey && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            ⚠️ Add your Anthropic API key in <button onClick={() => setShowSettings(true)} className="underline">Settings</button> to enable AI features
          </p>
        </div>
      )}

      {feed.map(item => (
        <div key={item.id} className="bg-white rounded-lg shadow mb-3 p-3">
          <div className="flex justify-between" onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
            <div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {item.type}
              </span>
              <h3 className="font-medium mt-1">{item.title}</h3>
            </div>
            <button onClick={(e) => { e.stopPropagation(); dismiss(item.id) }}>×</button>
          </div>

          {expanded === item.id && item.type === 'meeting_brief' && (
            <div className="mt-3 pt-3 border-t">
              {item.content.hasBrief ? (
                <pre className="text-sm whitespace-pre-wrap">{item.content.brief}</pre>
              ) : (
                <button
                  onClick={() => generateBrief(item.content.eventId, item.id)}
                  className="text-sm px-3 py-1 bg-blue-600 text-white rounded"
                >
                  Generate Brief
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

**Checkpoints:**
- [ ] Login works
- [ ] Feed displays
- [ ] Brief generation works
- [ ] Dismiss works

**✅ Ready to proceed when:** UI is functional

---

## Testing Checklist Summary

### Phase 1: Setup
- [ ] Electron menubar app runs
- [ ] Supabase configured
- [ ] OAuth flow works

### Phase 2: Edge Functions
- [ ] generate-brief works
- [ ] draft-email works
- [ ] score-importance works
- [ ] extract-event works

### Phase 3: Sync
- [ ] Google Calendar syncs
- [ ] Gmail syncs
- [ ] Apple Calendar syncs

### Phase 4: Workspace
- [ ] Window positioning works
- [ ] Document search works
- [ ] Meeting trigger fires

### Phase 5: UI
- [ ] Feed displays
- [ ] Brief generation works
- [ ] Dismiss works

---

**Total checkpoints: 32**
