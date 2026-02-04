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
        JSON.stringify({ error: 'Not authenticated' }),
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
        JSON.stringify({ error: 'API key required', scored: 0 }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Use Haiku for fast, cheap scoring
    const anthropic = new Anthropic({ apiKey: profile.anthropic_api_key })

    // Get unscored emails (limit to batch of 10)
    const { data: emails } = await supabase
      .from('emails')
      .select('id, subject, sender, snippet, is_read')
      .eq('user_id', user.id)
      .is('importance_score', null)
      .order('received_at', { ascending: false })
      .limit(10)

    if (!emails?.length) {
      return new Response(
        JSON.stringify({ scored: 0, message: 'No unscored emails' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let scored = 0
    const highPriorityEmails: Array<{ id: string; subject: string; score: number }> = []

    for (const email of emails) {
      try {
        const message = await anthropic.messages.create({
          model: 'claude-haiku-4-20250514', // Fast & cheap for scoring
          max_tokens: 100,
          messages: [{
            role: 'user',
            content: `Rate this email's importance from 0-100 and determine if it needs a response. Respond with JSON only, no explanation.

Subject: ${email.subject}
From: ${email.sender}
Preview: ${email.snippet?.slice(0, 300) || 'No preview'}
Already Read: ${email.is_read ? 'Yes' : 'No'}

Scoring guidelines:
- 90-100: Urgent/time-sensitive (meetings today, deadlines, emergencies)
- 70-89: Important (direct requests, key stakeholders, action needed)
- 50-69: Normal (regular work emails, updates)
- 30-49: Low priority (newsletters, FYIs, automated)
- 0-29: Very low (marketing, spam-like, irrelevant)

Response format: {"score": number, "needsResponse": boolean}`
          }],
        })

        const content = message.content[0].type === 'text' ? message.content[0].text : '{}'

        // Parse JSON, handling potential markdown code blocks
        const cleanContent = content.replace(/```json\n?|\n?```/g, '').trim()
        const result = JSON.parse(cleanContent)

        const score = Math.min(100, Math.max(0, result.score || 50))
        const needsResponse = result.needsResponse || false

        await supabase
          .from('emails')
          .update({
            importance_score: score,
            needs_response: needsResponse,
          })
          .eq('id', email.id)
          .eq('user_id', user.id)

        scored++

        // Track high priority emails for feed items
        if (score >= 70) {
          highPriorityEmails.push({ id: email.id, subject: email.subject, score })
        }

      } catch (parseError) {
        console.error('Failed to score email:', email.id, parseError)
        // Set default score on parse error
        await supabase
          .from('emails')
          .update({ importance_score: 50, needs_response: false })
          .eq('id', email.id)
          .eq('user_id', user.id)
        scored++
      }
    }

    // Create feed items for high-priority emails
    for (const email of highPriorityEmails) {
      const { data: existingItem } = await supabase
        .from('feed_items')
        .select('id')
        .eq('user_id', user.id)
        .eq('related_id', email.id)
        .eq('type', 'email_important')
        .single()

      if (!existingItem) {
        await supabase.from('feed_items').insert({
          user_id: user.id,
          type: 'email_important',
          title: email.subject,
          subtitle: `Priority: ${email.score}/100`,
          content: null,
          priority: email.score,
          related_id: email.id,
          dismissed: false,
        })
      }
    }

    return new Response(
      JSON.stringify({
        scored,
        highPriority: highPriorityEmails.length,
        message: `Scored ${scored} emails, ${highPriorityEmails.length} high priority`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error scoring emails:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', scored: 0 }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
