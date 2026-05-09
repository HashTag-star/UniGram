import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'ban_user',
      description: 'Permanently ban a user from the platform.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'The UUID of the user to ban.' },
          reason: { type: 'string', description: 'Internal reason for the ban.' }
        },
        required: ['userId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'resolve_report',
      description: 'Mark a moderation report as resolved.',
      parameters: {
        type: 'object',
        properties: {
          reportId: { type: 'string', description: 'The UUID of the report.' }
        },
        required: ['reportId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_content',
      description: 'Delete a post, comment, or market item.',
      parameters: {
        type: 'object',
        properties: {
          targetId: { type: 'string', description: 'The UUID of the content.' },
          targetType: { type: 'string', enum: ['post', 'comment', 'market_item', 'reel'], description: 'Type of content.' }
        },
        required: ['targetId', 'targetType']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_announcement',
      description: 'Send a push notification to all users or a specific user.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The notification message.' },
          userId: { type: 'string', description: 'Optional: Specific user UUID to notify.' }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'approve_verification',
      description: 'Approve a user verification request.',
      parameters: {
        type: 'object',
        properties: {
          requestId: { type: 'string', description: 'The UUID of the verification request.' }
        },
        required: ['requestId']
      }
    }
  }
]

async function callGroq(apiKey: string, messages: any[], tools: any[] | null = null): Promise<any> {
  const body: any = {
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.2,
    max_tokens: 1000,
  }
  if (tools && tools.length > 0) body.tools = tools

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const errorText = await resp.text()
    throw new Error(`Groq API Error (${resp.status}): ${errorText.slice(0, 200)}`)
  }
  const result = await resp.json()
  return result.choices?.[0]?.message
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), { status: 200, headers: CORS })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const groqKey = Deno.env.get('GROQ_API_KEY')

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Supabase URL/Key environment variables are missing on the server' }), { status: 200, headers: CORS })
    }
    if (!groqKey) {
      return new Response(JSON.stringify({ error: 'GROQ_API_KEY is not set in Supabase secrets' }), { status: 200, headers: CORS })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verify Admin
    const token = authHeader.slice(7)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: `Authentication failed: ${authErr?.message || 'User not found'}` }), { status: 200, headers: CORS })
    }

    const { data: adminProfile, error: profileErr } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()

    if (profileErr) {
      return new Response(JSON.stringify({ error: `Failed to fetch user profile: ${profileErr.message}` }), { status: 200, headers: CORS })
    }

    if (!adminProfile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Access denied: You are not flagged as an admin in the profiles table' }), { status: 200, headers: CORS })
    }

    // Process Payload
    let body;
    try {
      body = await req.json()
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JSON payload in request body' }), { status: 200, headers: CORS })
    }

    const { messages: incomingMessages } = body
    if (!incomingMessages || !Array.isArray(incomingMessages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages array in request body' }), { status: 200, headers: CORS })
    }

    const lastUserMessage = incomingMessages[incomingMessages.length - 1].content

    // Handle Approval logic
    if (lastUserMessage.startsWith('APPROVED: Execute')) {
      const match = lastUserMessage.match(/Execute (\w+) with (.+)/)
      if (match) {
        const [, toolName, argsJson] = match
        incomingMessages[incomingMessages.length - 1].content = `I have approved the action. Please execute ${toolName} with arguments: ${argsJson} now.`
      }
    }
    
    // Fetch live platform context gracefully
    const fetchPromises = [
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('verification_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('reports').select('id, target_id, target_type, reason, status, created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(5),
      supabase.from('verification_requests').select('id, user_id, full_name, type, status, submitted_at').eq('status', 'pending').order('submitted_at', { ascending: false }).limit(5),
      supabase.from('profiles').select('id, username, full_name, created_at').order('created_at', { ascending: false }).limit(5),
    ]

    const results = await Promise.allSettled(fetchPromises)
    
    const getVal = (idx: number) => results[idx].status === 'fulfilled' ? (results[idx] as any).value : null
    
    const totalUsers = getVal(0)?.count ?? 'Unknown'
    const pendingReports = getVal(1)?.count ?? 0
    const pendingVerifications = getVal(2)?.count ?? 0
    const recentReports = getVal(3)?.data ?? []
    const recentVerifications = getVal(4)?.data ?? []
    const recentUsers = getVal(5)?.data ?? []

    const platformContext = `
SYSTEM SNAPSHOT:
Total Users: ${totalUsers}
Pending Reports: ${pendingReports}
Pending Verifications: ${pendingVerifications}

RECENT USERS:
${JSON.stringify(recentUsers)}

RECENT PENDING REPORTS:
${JSON.stringify(recentReports)}

RECENT PENDING VERIFICATIONS:
${JSON.stringify(recentVerifications)}
`.trim()

    const systemMessage = {
      role: 'system',
      content: `You are the UniGram Autonomous Admin Agent. You manage a university social network.
You have the power to moderate content, manage users, and handle verifications.

YOUR GOAL: Be agentic.
1. DIRECT COMMANDS: If the admin says "Ban user X", execute the tool immediately.
2. SCANNING/PROPOSALS: If the admin asks for a scan or suggestions, or if you notice something concerning in the context, provide PROPOSALS.

PROPOSAL FORMAT:
[PROPOSALS]
[{"name": "tool_name", "args": {"arg1": "val1"}}]
[/PROPOSALS]

PLATFORM CONTEXT:
${platformContext}

RULES:
1. Explain WHY you are taking or suggesting an action.
2. Be professional and concise.`
    }

    let currentMessages = [systemMessage, ...incomingMessages]
    let responseMessage = await callGroq(groqKey, currentMessages, TOOLS)

    // Handle tool calls
    if (responseMessage.tool_calls) {
      const toolResults = []
      for (const toolCall of responseMessage.tool_calls) {
        const { name, arguments: argsString } = toolCall.function
        const args = JSON.parse(argsString)
        let result = { success: true, message: '' }

        try {
          if (name === 'ban_user') {
            await supabase.from('profiles').update({ is_banned: true }).eq('id', args.userId)
            result.message = `User ${args.userId} banned.`
          } else if (name === 'resolve_report') {
            await supabase.from('reports').update({ status: 'resolved' }).eq('id', args.reportId)
            result.message = `Report ${args.reportId} resolved.`
          } else if (name === 'delete_content') {
            let table = args.targetType === 'market_item' ? 'market_items' : args.targetType + 's'
            await supabase.from(table).delete().eq('id', args.targetId)
            result.message = `${args.targetType} deleted.`
          } else if (name === 'approve_verification') {
            await supabase.from('verification_requests').update({ status: 'approved' }).eq('id', args.requestId)
            result.message = `Verification ${args.requestId} approved.`
          } else if (name === 'send_announcement') {
            await supabase.from('notifications').insert({
              actor_id: user.id,
              user_id: args.userId || null,
              text: args.message,
              type: 'announcement'
            })
            result.message = `Announcement sent.`
          }
        } catch (e: any) {
          result = { success: false, message: e.message }
        }
        
        toolResults.push({
          tool_call_id: toolCall.id,
          role: 'tool',
          name,
          content: JSON.stringify(result)
        })
      }

      const finalMessages = [...currentMessages, responseMessage, ...toolResults]
      const finalResponse = await callGroq(groqKey, finalMessages, null)
      
      return new Response(JSON.stringify({ 
        answer: finalResponse.content,
        actions: responseMessage.tool_calls.map((tc: any) => ({
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments)
        }))
      }), {
        headers: { ...CORS, 'Content-Type': 'application/json' },
      })
    }

    // Handle Proposals
    const proposalMatch = responseMessage.content.match(/\[PROPOSALS\]([\s\S]*?)\[\/PROPOSALS\]/)
    let proposals = null
    let answer = responseMessage.content
    if (proposalMatch) {
      try {
        proposals = JSON.parse(proposalMatch[1].trim())
        answer = answer.replace(/\[PROPOSALS\][\s\S]*?\[\/PROPOSALS\]/, '').trim()
      } catch (e) {
        console.error('Proposal parse error:', e)
      }
    }

    return new Response(JSON.stringify({ answer, proposals }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('Edge Function Fatal Error:', err.message)
    return new Response(JSON.stringify({ error: `Server Error: ${err.message}` }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
