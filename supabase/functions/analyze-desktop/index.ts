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
    const { screenshot, context } = await req.json()
    const authHeader = req.headers.get('Authorization')

    console.log('[Edge] Request received, auth header present:', !!authHeader)

    if (!screenshot) {
      return new Response(
        JSON.stringify({ error: 'Screenshot required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!authHeader) {
      console.log('[Edge] No Authorization header')
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')
    console.log('[Edge] Env vars present:', { url: !!supabaseUrl, key: !!supabaseKey })

    // Authenticate user
    const supabase = createClient(
      supabaseUrl!,
      supabaseKey!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    console.log('[Edge] Auth result:', { userId: user?.id, error: userError?.message })

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: `Not authenticated: ${userError?.message || 'no user'}` }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's Anthropic API key
    const { data: profile } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user.id)
      .single()

    if (!profile?.anthropic_api_key) {
      return new Response(
        JSON.stringify({ error: 'Anthropic API key not configured. Add it in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const anthropic = new Anthropic({ apiKey: profile.anthropic_api_key })

    // Build context string
    const contextParts: string[] = []
    if (context?.upcomingEvents?.length > 0) {
      contextParts.push(`Upcoming meetings: ${context.upcomingEvents.map((e: { title: string }) => e.title).join(', ')}`)
    }
    if (context?.recentEmails) {
      contextParts.push(`Recent email topics: ${context.recentEmails}`)
    }
    const contextStr = contextParts.length > 0 ? contextParts.join('\n') : 'No additional context available.'

    // Analyze screenshot with Claude Vision
    const message = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: screenshot,
            },
          },
          {
            type: 'text',
            text: `Analyze this desktop screenshot and provide contextual insights to help the user.

CONTEXT:
${contextStr}

Analyze:
1. What application is the user currently working in?
2. What task or activity appears to be in progress?
3. Are there any visible issues, errors, or incomplete items?
4. What relevant suggestions could help the user RIGHT NOW?

Focus on actionable, helpful insights. Be specific to what you see.

Respond ONLY with valid JSON (no markdown):
{
  "currentApp": "application name",
  "activity": "brief description of what user is doing",
  "context": "inferred context (e.g., 'preparing presentation', 'debugging code')",
  "suggestions": [
    {
      "type": "context|action|reminder|insight",
      "title": "short title (max 50 chars)",
      "description": "helpful suggestion (max 150 chars)",
      "confidence": 0.0-1.0,
      "priority": 1-10,
      "actions": [{"id": "action_id", "label": "Button Text", "primary": true}]
    }
  ],
  "detectedIssues": ["any visible errors or problems"]
}

Guidelines:
- "context" type: Observations about current work
- "action" type: Specific actions to take now
- "reminder" type: Things the user might have forgotten
- "insight" type: Helpful tips or suggestions
- Maximum 3 suggestions
- Higher priority = more urgent/relevant
- Include actions only when there's a clear action to take
- Be concise and specific`
          }
        ],
      }],
    })

    const analysisText = message.content[0].type === 'text' ? message.content[0].text : ''

    // Parse JSON response
    let analysis
    try {
      // Try to extract JSON from potential markdown code block
      const jsonMatch = analysisText.match(/```json\n?([\s\S]*?)\n?```/) ||
                        analysisText.match(/```\n?([\s\S]*?)\n?```/) ||
                        [null, analysisText]
      const jsonStr = (jsonMatch[1] || jsonMatch[0] || analysisText).trim()
      analysis = JSON.parse(jsonStr)
    } catch {
      console.error('Failed to parse analysis JSON:', analysisText.slice(0, 200))
      analysis = {
        currentApp: 'Unknown',
        activity: 'Unknown',
        context: 'Unable to analyze',
        suggestions: [],
        detectedIssues: ['Analysis parsing failed'],
      }
    }

    // Log analysis (without screenshot)
    console.log('[Vision Analysis]', {
      userId: user.id,
      currentApp: analysis.currentApp,
      activity: analysis.activity,
      suggestionCount: analysis.suggestions?.length || 0,
    })

    return new Response(
      JSON.stringify({
        analysis,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Vision analysis error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
