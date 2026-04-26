import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import admin from "npm:firebase-admin@12.2.0";

// Handle CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { userId, title, body, data, imageUrl, senderAvatarUrl, categoryId, groupId } = await req.json();

    if (!userId || !title || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      const firebaseConfig = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (!firebaseConfig) {
        throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set");
      }
      const serviceAccount = JSON.parse(firebaseConfig);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    // Create Supabase client with Service Role Key to bypass RLS
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch native tokens and recipient profile in parallel
    const [tokensResult, recipientResult] = await Promise.all([
      supabaseClient
        .from("push_tokens")
        .select("token")
        .eq("user_id", userId)
        .eq("type", "native"),
      supabaseClient
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", userId)
        .single(),
    ]);

    if (tokensResult.error) throw tokensResult.error;
    const tokens = tokensResult.data;
    const recipientUsername: string = recipientResult.data?.username ?? '';

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No native tokens found for user", sentCount: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    let sentCount = 0;

    // Use post/story image if available, fall back to sender's avatar so profile
    // pics always appear in the notification when there's no content image.
    const effectiveImageUrl = imageUrl || senderAvatarUrl || null;
    const channelId: string = (data as any)?.channelId ?? 'default';

    for (const t of tokens) {
      try {
        const message: any = {
          token: t.token,
          notification: {
            title,
            body,
            ...(effectiveImageUrl ? { imageUrl: effectiveImageUrl } : {}),
          },
          android: {
            notification: {
              sound: 'notification_alert',
              channelId,
              ...(effectiveImageUrl ? { imageUrl: effectiveImageUrl } : {}),
              ...(groupId ? { tag: groupId } : {}),
              ...(categoryId ? { clickAction: categoryId } : {}),
            },
            ...(groupId ? { collapseKey: groupId } : {}),
          },
          apns: {
            payload: {
              aps: {
                sound: 'notification_alert.wav',
                ...(categoryId ? { category: categoryId } : {}),
                ...(groupId ? { 'thread-id': groupId } : {}),
                ...(effectiveImageUrl ? { 'mutable-content': 1 } : {}),
              },
            },
            ...(effectiveImageUrl ? { fcmOptions: { imageUrl: effectiveImageUrl } } : {}),
          },
          data: {
            ...(data || {}),
            ...(imageUrl ? { imageUrl } : {}),
            ...(senderAvatarUrl ? { senderAvatarUrl } : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(groupId ? { groupId } : {}),
            // Recipient context — used by the app to identify which account
            // received this notification (mirrors Instagram's "• @username" header)
            recipientUsername,
          },
        };
        const response = await admin.messaging().send(message);
        results.push({ token: t.token, success: true, messageId: response });
        sentCount++;
      } catch (err: any) {
        console.error(`Error sending to token ${t.token}:`, err);
        results.push({ token: t.token, success: false, error: err.message });
        
        // Clean up invalid tokens
        if (err.code === 'messaging/registration-token-not-registered' || err.code === 'messaging/invalid-argument') {
           await supabaseClient.from("push_tokens").delete().eq("token", t.token);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, results, sentCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("send-push-notification error:", error);
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
