import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { eventId } = await req.json()
    const authHeader = req.headers.get('Authorization')!

    // Create Supabase client with user's auth
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Get authenticated user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's Anthropic API key from their profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.anthropic_api_key) {
      return new Response(
        JSON.stringify({ error: 'Please add your Anthropic API key in Settings' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Anthropic with user's API key
    const anthropic = new Anthropic({
      apiKey: profile.anthropic_api_key,
    })

    // Get the event
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', eventId)
      .eq('user_id', user.id)
      .single()

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get related emails from attendees (last 30 days)
    const attendees = event.attendees || []
    let relatedEmails: Array<{ subject: string; sender: string; snippet: string; received_at: string }> = []

    if (attendees.length > 0) {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: emails } = await supabase
        .from('emails')
        .select('subject, sender, snippet, received_at')
        .eq('user_id', user.id)
        .gte('received_at', thirtyDaysAgo.toISOString())
        .or(attendees.map((email: string) => `sender.ilike.%${email}%`).join(','))
        .order('received_at', { ascending: false })
        .limit(10)

      relatedEmails = emails || []
    }

    // Build email context for the prompt
    const emailContext = relatedEmails.length > 0
      ? relatedEmails.map(e =>
          `- "${e.subject}" from ${e.sender} (${new Date(e.received_at).toLocaleDateString()}): ${e.snippet?.slice(0, 200) || 'No preview'}`
        ).join('\n')
      : 'No recent email history with attendees.'

    // Generate brief with Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Generate a concise meeting prep brief for this upcoming meeting.

MEETING DETAILS:
- Title: ${event.title}
- Time: ${new Date(event.start_time).toLocaleString()}
- Duration: ${Math.round((new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 60000)} minutes
- Attendees: ${attendees.length > 0 ? attendees.join(', ') : 'Just you'}
- Location: ${event.location || 'Not specified'}
${event.meeting_link ? `- Meeting Link: ${event.meeting_link}` : ''}
${event.description ? `- Description: ${event.description}` : ''}

RECENT EMAIL HISTORY WITH ATTENDEES:
${emailContext}

Please provide a brief (3-5 bullet points) that includes:
1. Quick context about what this meeting is likely about
2. Key points from recent email communications (if any)
3. Things to prepare or remember
4. Any action items or follow-ups to discuss

Be concise and actionable. Focus on what will help prepare for this specific meeting.`
      }],
    })

    // Extract the text content
    const brief = message.content[0].type === 'text' ? message.content[0].text : ''

    // Save brief to the event
    const { error: updateError } = await supabase
      .from('events')
      .update({
        brief,
        brief_generated_at: new Date().toISOString()
      })
      .eq('id', eventId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Failed to save brief:', updateError)
    }

    // Check if feed item already exists for this event
    const { data: existingItem } = await supabase
      .from('feed_items')
      .select('id')
      .eq('user_id', user.id)
      .eq('related_id', eventId)
      .eq('type', 'meeting_brief')
      .single()

    if (existingItem) {
      // Update existing feed item
      await supabase
        .from('feed_items')
        .update({
          content: brief,
          dismissed: false,
        })
        .eq('id', existingItem.id)
    } else {
      // Create new feed item
      await supabase.from('feed_items').insert({
        user_id: user.id,
        type: 'meeting_brief',
        title: `Brief: ${event.title}`,
        subtitle: new Date(event.start_time).toLocaleString(),
        content: brief,
        priority: 80,
        related_id: eventId,
        dismissed: false,
      })
    }

    return new Response(
      JSON.stringify({ brief, eventId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error generating brief:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
