import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { emailId } = await req.json()
    const authHeader = req.headers.get('Authorization')!

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ hasEvent: false, error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's API key
    const { data: profile } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user.id)
      .single()

    if (!profile?.anthropic_api_key) {
      return new Response(
        JSON.stringify({ hasEvent: false, error: 'API key required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropic = new Anthropic({ apiKey: profile.anthropic_api_key })

    // Get the email
    const { data: email, error: emailError } = await supabase
      .from('emails')
      .select('*')
      .eq('id', emailId)
      .eq('user_id', user.id)
      .single()

    if (emailError || !email) {
      return new Response(
        JSON.stringify({ hasEvent: false, error: 'Email not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const today = new Date().toISOString().split('T')[0]

    // Extract event with Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `Extract calendar event information from this email if it contains a meeting, appointment, or event invitation.

Today's date: ${today}

EMAIL:
From: ${email.sender}
Subject: ${email.subject}
Date Received: ${new Date(email.received_at).toLocaleString()}
Body:
${email.body || email.snippet || 'No content'}

If the email contains event information (meeting request, appointment, deadline, etc.), respond with JSON:
{
  "hasEvent": true,
  "event": {
    "title": "Meeting/Event title",
    "startDate": "ISO 8601 datetime (e.g., 2024-03-15T14:00:00)",
    "endDate": "ISO 8601 datetime (e.g., 2024-03-15T15:00:00)",
    "location": "Location or null if not specified",
    "description": "Brief description or null"
  }
}

If no event is found, respond with:
{"hasEvent": false}

Important:
- Parse relative dates like "tomorrow", "next Tuesday", "in 2 weeks" relative to today (${today})
- If only a date is given without time, use 9:00 AM as default start
- If no end time, assume 1 hour duration
- Only extract actual scheduled events, not vague mentions of "we should meet sometime"

Respond with JSON only, no explanation.`
      }],
    })

    const content = message.content[0].type === 'text' ? message.content[0].text : '{"hasEvent": false}'
    const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim()

    let result: { hasEvent: boolean; event?: { title: string; startDate: string; endDate: string; location?: string; description?: string } }

    try {
      result = JSON.parse(cleanContent)
    } catch {
      return new Response(
        JSON.stringify({ hasEvent: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!result.hasEvent || !result.event) {
      return new Response(
        JSON.stringify({ hasEvent: false }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create a feed item suggesting to add this event
    const { data: existingItem } = await supabase
      .from('feed_items')
      .select('id')
      .eq('user_id', user.id)
      .eq('related_id', emailId)
      .eq('type', 'calendar_event')
      .single()

    const eventContent = JSON.stringify({
      ...result.event,
      sourceEmailId: emailId,
      sourceEmailSubject: email.subject,
    })

    if (existingItem) {
      await supabase
        .from('feed_items')
        .update({ content: eventContent, dismissed: false })
        .eq('id', existingItem.id)
    } else {
      await supabase.from('feed_items').insert({
        user_id: user.id,
        type: 'calendar_event',
        title: `Add to calendar: ${result.event.title}`,
        subtitle: new Date(result.event.startDate).toLocaleString(),
        content: eventContent,
        priority: 60,
        related_id: emailId,
        dismissed: false,
      })
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error extracting event:', error)
    return new Response(
      JSON.stringify({ hasEvent: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
