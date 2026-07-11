import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import { callAiWithFallback, repairJson, sanitizeError, CORS } from "../_shared/groq.ts";

type Outlook = 'positive' | 'neutral' | 'needs_work';

function deriveOutlook(pa: any): Outlook {
  const engRate = pa.total_views_30d > 0
    ? ((pa.likes_30d + pa.comments_30d) / pa.total_views_30d) * 100
    : 0;
  const viewGrowth = pa.total_views_prev_30d > 0
    ? ((pa.total_views_30d - pa.total_views_prev_30d) / pa.total_views_prev_30d) * 100
    : 0;
  const profileGrowth = pa.profile_views_prev_30d > 0
    ? ((pa.profile_views_30d - pa.profile_views_prev_30d) / pa.profile_views_prev_30d) * 100
    : 0;

  const positiveSignals = [engRate >= 5, viewGrowth >= 10, profileGrowth >= 10].filter(Boolean).length;
  const negativeSignals = [engRate < 1, viewGrowth < -20, profileGrowth < -20].filter(Boolean).length;

  if (positiveSignals >= 2) return 'positive';
  if (negativeSignals >= 2) return 'needs_work';
  return 'neutral';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing authorization');

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authErr || !user) throw new Error('Unauthorized');

    const [paRes, postsRes] = await Promise.all([
      supabase.rpc('get_profile_analytics', { p_user_id: user.id }),
      supabase.rpc('get_post_analytics', { p_user_id: user.id, p_days: 30 }),
    ]);

    if (paRes.error) throw new Error(`Analytics fetch failed: ${paRes.error.message}`);
    const pa = paRes.data;
    const posts: any[] = postsRes.data ?? [];

    const engRate = pa.total_views_30d > 0
      ? ((pa.likes_30d + pa.comments_30d) / pa.total_views_30d * 100).toFixed(1)
      : '0';

    const topPost = posts.sort((a: any, b: any) => (b.views ?? 0) - (a.views ?? 0))[0];

    const prompt = `You are a social media analytics advisor for a university campus app called UniGram.

Analyse this creator's 30-day performance and give 3–4 short, actionable insights. Be specific, encouraging where warranted, and honest where improvement is needed. Write in plain English — no markdown, no asterisks, no bullet symbols. Each insight must be a single complete sentence. Return ONLY a JSON array of strings.

Data:
- Followers: ${pa.followers}
- Profile views (last 7d): ${pa.profile_views_7d} vs prev 7d: ${pa.profile_views_prev_7d}
- Profile views (last 30d): ${pa.profile_views_30d} vs prev 30d: ${pa.profile_views_prev_30d}
- Post impressions (last 30d): ${pa.total_views_30d} vs prev 30d: ${pa.total_views_prev_30d}
- Engagement rate: ${engRate}%
- Likes (30d): ${pa.likes_30d}, Comments (30d): ${pa.comments_30d}
- Total posts (30d): ${posts.length}
- Top post views: ${topPost?.views ?? 0} | caption: "${topPost?.caption?.slice(0, 60) ?? 'N/A'}"

Return format (JSON array only, no other text):
["insight 1", "insight 2", "insight 3"]`;

    // Invoke via unified fallback client
    const rawText = await callAiWithFallback({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      maxTokens: 512,
      modelOverride: 'llama-3.1-8b-instant'
    });

    let insights: string[];
    try {
      insights = JSON.parse(repairJson(rawText));
      if (!Array.isArray(insights)) throw new Error('not array');
    } catch {
      insights = rawText.split('\n').filter((l: string) => l.trim().length > 10).slice(0, 4);
    }

    const outlook: Outlook = deriveOutlook(pa);

    return new Response(
      JSON.stringify({ insights, outlook }),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 200 },
    );
  } catch (e: any) {
    const errorDetails = sanitizeError(e, 'analytics-insights');
    return new Response(
      JSON.stringify(errorDetails),
      { headers: { ...CORS, 'Content-Type': 'application/json' }, status: 400 },
    );
  }
});
