import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import admin from "npm:firebase-admin@12.2.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// URL-safe base64 (no padding) — required by Cloudinary's l_fetch: param
function toUrlSafeBase64(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Build a Cloudinary Fetch URL that composites two avatar circles:
 *   - recipientAvatar: large circle in the back (the person receiving the notification)
 *   - senderAvatar:    smaller circle in the front-right (the actor / follower)
 *
 * Requires CLOUDINARY_CLOUD_NAME env variable. Falls back to senderAvatar alone.
 */
function buildCompositeAvatarUrl(
  cloudName: string,
  recipientAvatar: string,
  senderAvatar: string,
): string {
  const senderB64 = toUrlSafeBase64(senderAvatar);
  // recipient (200×200 circle) as base, sender (130×130 circle) overlaid bottom-right
  return (
    `https://res.cloudinary.com/${cloudName}/image/fetch/` +
    `w_200,h_200,c_fill,r_max/` +
    `l_fetch:${senderB64},w_130,h_130,c_fill,r_max,g_south_east,x_-8,y_-8,fl_layer_apply/` +
    `f_png/${encodeURIComponent(recipientAvatar)}`
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const bodyJson = await req.json();
    const { userId, title, body, data, imageUrl, senderAvatarUrl, categoryId, groupId } = bodyJson;

    if (!userId || !title || !body) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!admin.apps.length) {
      const firebaseConfig = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (!firebaseConfig) throw new Error("FIREBASE_SERVICE_ACCOUNT environment variable is not set");
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(firebaseConfig)) });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch tokens + recipient profile in parallel
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
    const recipientAvatarUrl: string | null = recipientResult.data?.avatar_url ?? null;

    if (!tokens || tokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No native tokens found for user", sentCount: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const hasImage = !!imageUrl;
    const hasAvatar = !!senderAvatarUrl;
    const channelId: string = (data as any)?.channelId ?? 'default';
    const notifType: string = (data as any)?.type ?? '';

    // For follow-type notifications, composite recipient (back) + sender (front) into one image
    const cloudinaryCloudName = Deno.env.get("CLOUDINARY_CLOUD_NAME");
    const isFollowType = notifType === 'follow' || notifType === 'follow_suggestion';

    let avatarImageUrl: string | undefined = senderAvatarUrl ?? undefined;

    if (isFollowType && hasAvatar && recipientAvatarUrl && cloudinaryCloudName) {
      avatarImageUrl = buildCompositeAvatarUrl(cloudinaryCloudName, recipientAvatarUrl, senderAvatarUrl);
    }

    // Main expanded image: prefer content image (post/story), fall back to avatar composite
    const expandedImageUrl = imageUrl || avatarImageUrl;

    const results = [];
    let sentCount = 0;

    for (const t of tokens) {
      try {
        const message: any = {
          token: t.token,
          notification: {
            title,
            body,
            ...(expandedImageUrl ? { imageUrl: expandedImageUrl } : {}),
          },
          android: {
            notification: {
              sound: 'notification_alert',
              channelId,
              // Large icon: composite for follow, sender avatar for all others
              ...(avatarImageUrl ? { largeIcon: avatarImageUrl } : {}),
              // BigPicture: content image if available
              ...(hasImage ? { imageUrl } : (avatarImageUrl ? { imageUrl: avatarImageUrl } : {})),
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
                'mutable-content': 1,
              },
            },
            fcmOptions: {
              imageUrl: expandedImageUrl,
            },
          },
          data: {
            ...(data || {}),
            ...(imageUrl ? { imageUrl } : {}),
            ...(senderAvatarUrl ? { senderAvatarUrl } : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(groupId ? { groupId } : {}),
            recipientUsername,
          },
        };

        const response = await admin.messaging().send(message);
        results.push({ token: t.token, success: true, messageId: response });
        sentCount++;
      } catch (err: any) {
        console.error(`Error sending to token ${t.token}:`, err);
        results.push({ token: t.token, success: false, error: err.message });

        if (
          err.code === 'messaging/registration-token-not-registered' ||
          err.code === 'messaging/invalid-argument'
        ) {
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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
