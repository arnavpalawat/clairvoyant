# Clairvoyant

**The AI assistant that knows what you need — and does it for you.**

A macOS menubar app that proactively prepares you for meetings, auto-drafts emails, syncs calendars across platforms, and sets up your workspace with relevant apps and documents.

---

## The Problem

Knowledge workers waste hours every week on:

- **Unprepared meetings** — scrambling to remember what was discussed last time
- **Email overload** — 500 emails, 3 actually matter, all need responses
- **Context switching** — manually opening apps, finding documents, arranging windows
- **Calendar chaos** — events scattered across Google, Apple, Notion
- **Forgotten commitments** — "I said I'd follow up... when was that?"

Clairvoyant watches, learns, and **takes action** before you even realize you need it.

---

## Features

### Auto-Draft Email Responses
- AI generates contextual draft responses for important emails
- Matches your writing style and tone
- One-click to review, edit, and send
- Powered by Claude for natural, thoughtful responses

### Intelligent Workspace Setup
Your Mac prepares itself for every meeting:
- **Auto-opens relevant apps** — Zoom, Slack, browser tabs
- **Pulls up related documents** — decks, specs, notes from last meeting
- **Arranges split-screen layout** — everything positioned and ready
- Triggers 5 minutes before meetings

### Cross-Calendar Sync
One source of truth across all your calendars:
- **Apple Calendar** ↔ **Google Calendar** ↔ **Notion**
- Creates, updates, and deletes events across platforms
- Extracts events from emails automatically

### Pre-Meeting Briefs
Context 15-30 minutes before every meeting:
- Previous conversations with attendees
- Relevant email threads
- Key discussion points and action items

### Smart Email Triage
- Importance scoring (not spam filtering)
- Surfaces emails that need your attention
- "3 emails need responses today" vs inbox of 500

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    macOS MENUBAR APP                            │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Feed UI   │  │   System    │  │   Native Agents         │  │
│  │   (React)   │  │    Tray     │  │                         │  │
│  │             │  │             │  │  • Workspace Setup      │  │
│  │  Meetings   │  │  Sync Now   │  │  • Calendar Sync        │  │
│  │  Emails     │  │  Status     │  │  • Document Finder      │  │
│  │  Briefs     │  │             │  │  • Window Manager       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│                            ↓                                    │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  AppleScript · Accessibility API · Spotlight · EventKit  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                        SUPABASE                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │    Auth     │  │  Database   │  │    Edge Functions       │  │
│  │  (Google)   │  │ (Postgres)  │  │                         │  │
│  │             │  │             │  │  /generate-brief        │  │
│  │             │  │  Events     │  │  /draft-email           │  │
│  │             │  │  Emails     │  │  /score-importance      │  │
│  │             │  │  Feed       │  │  /extract-event         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      CLAUDE API                                 │
│    Meeting Briefs · Email Drafts · Importance Scoring           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Desktop App** | Electron (macOS menubar) |
| **UI** | React + Tailwind CSS |
| **Backend** | Supabase (Auth + Postgres + Edge Functions) |
| **AI** | Claude API (Anthropic) |
| **macOS Automation** | AppleScript, JXA, Accessibility APIs |
| **Calendar Sync** | Google Calendar API, Apple EventKit, Notion API |
| **Email** | Gmail API (read + compose) |
| **Local Storage** | electron-store (encrypted) |

---

## User Input & Output

### What You Connect
| Source | Access |
|--------|--------|
| Google Account | Calendar, Gmail (via Supabase OAuth) |
| Apple Calendar | Local events (via EventKit/AppleScript) |
| Notion | Calendar databases (via API) |
| Local Mac | Documents, apps (via Spotlight/AppleScript) |

### What Clairvoyant Does
| Action | When | How |
|--------|------|-----|
| **Draft email responses** | Important emails arrive | Claude + Gmail API |
| **Sync calendar events** | Real-time | Google ↔ Apple ↔ Notion |
| **Set up workspace** | 5 min before meetings | AppleScript |
| **Open relevant docs** | Before meetings | Spotlight + Finder |
| **Arrange split-screen** | Before meetings | Accessibility API |
| **Generate meeting briefs** | 15-30 min before | Claude API |

---

## Security & Privacy

- **BYOK (Bring Your Own Key)** — Users provide their own API keys
- **Local-first** — Workspace automation runs entirely on your Mac
- **Encrypted storage** — Tokens stored with electron-store encryption
- **Supabase RLS** — Row-level security on all database tables
- **No training** — Your data never trains AI models
- **Draft review required** — AI never sends emails without approval

---

## Getting Started

### Prerequisites
- macOS 12+
- Node.js 18+
- Supabase account
- Anthropic API key
- Google Cloud OAuth credentials

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/clairvoyant.git
cd clairvoyant

# Install dependencies
pnpm install

# Copy environment template
cp .env.template .env

# Fill in your credentials in .env

# Run the app
pnpm electron .
```

### Supabase Setup
1. Create project at supabase.com
2. Enable Google OAuth provider
3. Run migrations: `supabase db push`
4. Deploy edge functions: `supabase functions deploy`

### First Launch
1. Sign in with Google
2. Enter your Anthropic API key in Settings (prompted on first launch)
3. Optionally add Notion API key for calendar sync

### Permissions Required
- **Accessibility** — For window management
- **Calendar** — For Apple Calendar sync
- **Automation** — For AppleScript execution

---

## Roadmap

- [x] Product specification
- [ ] Electron menubar app
- [ ] Supabase auth + database
- [ ] Google Calendar sync
- [ ] Gmail sync + importance scoring
- [ ] Meeting brief generation (Claude)
- [ ] Auto-draft email responses
- [ ] Apple Calendar sync
- [ ] Notion calendar sync
- [ ] Workspace automation
- [ ] Document finder
- [ ] Split-screen layout

---

## Environment Variables

See `.env.template` for required configuration:

```bash
# Supabase
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Google OAuth (from Google Cloud Console)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Local encryption
STORE_ENCRYPTION_KEY=
```

**User-Provided Keys (entered in app Settings):**
- `Anthropic API Key` — Required for AI features (briefs, drafts, scoring)
- `Notion API Key` — Optional, for Notion calendar sync

---

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <strong>Stop reacting. Start anticipating. Let the agent handle it.</strong>
  <br>
  A macOS desktop app powered by Supabase + Claude.
</p>
