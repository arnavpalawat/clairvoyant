-- Clairvoyant Initial Schema
-- Run with: supabase db push

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
  subtitle TEXT,
  content TEXT,
  priority INT DEFAULT 0,
  related_id TEXT,
  dismissed BOOLEAN DEFAULT false,
  action_taken TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE public.feed_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own feed" ON public.feed_items FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_feed_user_priority ON public.feed_items(user_id, priority DESC);

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

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_emails_updated_at
  BEFORE UPDATE ON public.emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
