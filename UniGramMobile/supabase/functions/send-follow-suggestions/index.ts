import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import admin from "npm:firebase-admin@12.2.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Allow calls from pg_cron (service role) or explicit Bearer token
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    if (!admin.apps.length) {
      const firebaseConfig = Deno.env.get('FIREBASE_SERVICE_ACCOUNT');
      if (!firebaseConfig) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(firebaseConfig)) });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      serviceRoleKey,
    );

    // Find users who have a native push token but haven't received a follow
    // suggestion notification in the last 22 hours (slight buffer below 24 h).
    const { data: eligibleRows, error: eligibleErr } = await supabase.rpc(
      'get_users_for_follow_suggestions',
    );
    if (eligibleErr) throw eligibleErr;

    const userIds: string[] = (eligibleRows ?? []).map((r: any) => r.user_id as string);

    if (!userIds.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: 'No eligible users' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let sent = 0;
    let failed = 0;

    for (const userId of userIds) {
      try {
        // Get follow suggestions via RPC (same algorithm as the app uses)
        const { data: suggestions, error: rpcErr } = await supabase.rpc('get_suggested_users', {
          p_user_id: userId,
          p_limit: 3,
        });
        if (rpcErr || !suggestions?.length) continue;

        // Get recipient profile for display context
        const { data: recipient } = await supabase
          .from('profiles')
          .select('username, avatar_url')
          .eq('id', userId)
          .single();

        // Get native push tokens for this user
        const { data: tokens } = await supabase
          .from('push_tokens')
          .select('token')
          .eq('user_id', userId)
          .eq('type', 'native');

        if (!tokens?.length) continue;

        const top = suggestions.slice(0, 3);
        const names = top.length === 1
          ? `@${top[0].username}`
          : top.length === 2
            ? `@${top[0].username} and @${top[1].username}`
            : `@${top[0].username}, @${top[1].username} and @${top[2].username}`;

        const title = '👥 People you may know';
        const body = `${names} — follow them to stay connected`;

        // Write the in-app notification row
        await supabase.from('notifications').insert({
          user_id: userId,
          actor_id: top[0].id,
          type: 'follow_suggestion',
          text: body,
          is_read: false,
          metadata: { suggestion_ids: top.map((u: any) => u.id) },
        }).catch(() => {});

        // Send FCM to each registered device token
        for (const { token } of tokens) {
          try {
            await admin.messaging().send({
              token,
              notification: {
                title,
                body,
                // Show the first suggestion's avatar as the notification image
                ...(top[0].avatar_url ? { imageUrl: top[0].avatar_url } : {}),
              },
              android: {
                notification: {
                  channelId: 'follows',
                  sound: 'notification_alert',
                  ...(top[0].avatar_url ? { imageUrl: top[0].avatar_url } : {}),
                  clickAction: 'follow_suggestion',
                },
              },
              apns: {
                payload: {
                  aps: {
                    sound: 'notification_alert.wav',
                    category: 'follow_suggestion',
                    ...(top[0].avatar_url ? { 'mutable-content': 1 } : {}),
                  },
                },
                ...(top[0].avatar_url ? { fcmOptions: { imageUrl: top[0].avatar_url } } : {}),
              },
              data: {
                type: 'follow_suggestion',
                channelId: 'follows',
                categoryId: 'follow_suggestion',
                suggestionIds: top.map((u: any) => u.id).join(','),
                recipientUsername: recipient?.username ?? '',
                senderAvatarUrl: top[0].avatar_url ?? '',
              },
            });
            sent++;
          } catch (err: any) {
            failed++;
            // Remove stale tokens
            if (
              err.code === 'messaging/registration-token-not-registered' ||
              err.code === 'messaging/invalid-argument'
            ) {
              await supabase.from('push_tokens').delete().eq('token', token).catch(() => {});
            }
          }
        }
      } catch (_) {
        failed++;
      }
    }

    return new Response(JSON.stringify({ success: true, processed: userIds.length, sent, failed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    console.error('send-follow-suggestions error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
