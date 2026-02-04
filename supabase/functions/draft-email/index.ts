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
        JSON.stringify({ error: 'Not authenticated' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's API key
    const { data: profile } = await supabase
      .from('profiles')
      .select('anthropic_api_key, full_name, email')
      .eq('id', user.id)
      .single()

    if (!profile?.anthropic_api_key) {
      return new Response(
        JSON.stringify({ error: 'Please add your Anthropic API key in Settings' }),
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
        JSON.stringify({ error: 'Email not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get sender's email history
    const senderEmail = email.sender.match(/<(.+)>/)?.[1] || email.sender
    const { data: history } = await supabase
      .from('emails')
      .select('subject, snippet, received_at')
      .eq('user_id', user.id)
      .ilike('sender', `%${senderEmail}%`)
      .neq('id', emailId)
      .order('received_at', { ascending: false })
      .limit(5)

    const historyContext = history?.length
      ? history.map(e =>
          `- "${e.subject}" (${new Date(e.received_at).toLocaleDateString()}): ${e.snippet?.slice(0, 150) || 'No preview'}`
        ).join('\n')
      : 'No previous email history with this sender.'

    // Generate draft with Claude
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: `Generate a professional email response.

ORIGINAL EMAIL:
From: ${email.sender}
Subject: ${email.subject}
Date: ${new Date(email.received_at).toLocaleString()}
Body:
${email.body || email.snippet || 'No content'}

PREVIOUS EMAIL HISTORY WITH THIS SENDER:
${historyContext}

YOUR INFO:
Name: ${profile.full_name || 'User'}
Email: ${profile.email || user.email}

Write a response that:
1. Addresses all questions or requests in the original email
2. Is professional but warm and friendly
3. Is concise (under 150 words)
4. Uses appropriate greeting and sign-off

Return ONLY the email body text (no subject line, no "Subject:" prefix).`
      }],
    })

    const draft = message.content[0].type === 'text' ? message.content[0].text : ''

    // Save draft to the email record
    await supabase
      .from('emails')
      .update({ draft_content: draft })
      .eq('id', emailId)
      .eq('user_id', user.id)

    // Create feed item for the draft
    const { data: existingItem } = await supabase
      .from('feed_items')
      .select('id')
      .eq('user_id', user.id)
      .eq('related_id', emailId)
      .eq('type', 'email_draft')
      .single()

    if (existingItem) {
      await supabase
        .from('feed_items')
        .update({ content: draft, dismissed: false })
        .eq('id', existingItem.id)
    } else {
      await supabase.from('feed_items').insert({
        user_id: user.id,
        type: 'email_draft',
        title: `Reply: ${email.subject}`,
        subtitle: `To: ${email.sender}`,
        content: draft,
        priority: 70,
        related_id: emailId,
        dismissed: false,
      })
    }

    return new Response(
      JSON.stringify({ draft, emailId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error drafting email:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
