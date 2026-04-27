import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";
import admin from "npm:firebase-admin@12.2.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    if (!admin.apps.length) {
      const firebaseConfig = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
      if (!firebaseConfig) throw new Error("FIREBASE_SERVICE_ACCOUNT not set");
      admin.initializeApp({ credential: admin.credential.cert(JSON.parse(firebaseConfig)) });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);

    // Target users whose last app open was more than 8 hours ago.
    // push_tokens.updated_at is refreshed every time registerForPushNotifications
    // runs (i.e. every app open via the upsert with updated_at: now()).
    const cutoff = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const cooldownCutoff = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const { data: tokenRows, error: tokenErr } = await supabase
      .from("push_tokens")
      .select("user_id, token")
      .eq("type", "native")
      .lt("updated_at", cutoff);

    if (tokenErr) throw tokenErr;
    if (!tokenRows?.length) {
      return new Response(JSON.stringify({ success: true, sent: 0, message: "No inactive users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Group tokens by user_id
    const userTokens = new Map<string, string[]>();
    for (const row of tokenRows) {
      const list = userTokens.get(row.user_id) ?? [];
      list.push(row.token);
      userTokens.set(row.user_id, list);
    }

    let sent = 0;
    let skipped = 0;

    for (const [userId, tokens] of userTokens) {
      // 12-hour cooldown: don't send re-engagement twice in the same window
      const { data: recentRE } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", userId)
        .eq("type", "re_engagement")
        .gte("created_at", cooldownCutoff)
        .limit(1)
        .maybeSingle();

      if (recentRE) { skipped++; continue; }

      // Check unread notification count (exclude re_engagement rows themselves)
      const { count: unread } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("is_read", false)
        .neq("type", "re_engagement");

      let pushTitle: string;
      let pushBody: string;
      let pushData: Record<string, string>;

      if ((unread ?? 0) >= 3) {
        pushTitle = "You have new activity";
        pushBody = `${unread} notifications are waiting for you on UniGram`;
        pushData = { type: "re_engagement", screen: "notifications", channelId: "social" };
      } else {
        // Fall back to trending post at the user's university
        const { data: profile } = await supabase
          .from("profiles")
          .select("university")
          .eq("id", userId)
          .maybeSingle();

        if (!profile?.university) { skipped++; continue; }

        const { data: trending } = await supabase.rpc("get_trending_post_for_university", {
          p_university: profile.university,
        });

        if (!trending?.[0]) { skipped++; continue; }

        const preview = (trending[0].caption as string)?.slice(0, 45) ?? "A post";
        pushTitle = "Trending at your campus";
        pushBody = `"${preview}…" is getting a lot of attention right now`;
        pushData = { type: "re_engagement", screen: "feed", channelId: "social" };
      }

      // Record cooldown row (is_read: true so it doesn't show in the notification bell)
      await supabase.from("notifications").insert({
        user_id: userId,
        actor_id: userId,
        type: "re_engagement",
        text: pushBody,
        is_read: true,
      }).catch(() => {});

      // Deliver to every registered native token for this user
      for (const token of tokens) {
        try {
          await admin.messaging().send({
            token,
            notification: { title: pushTitle, body: pushBody },
            android: {
              notification: {
                channelId: pushData.channelId,
                sound: "notification_alert",
              },
            },
            apns: {
              payload: { aps: { sound: "notification_alert.wav" } },
            },
            data: pushData,
          });
          sent++;
        } catch (err: any) {
          if (
            err.code === "messaging/registration-token-not-registered" ||
            err.code === "messaging/invalid-argument"
          ) {
            await supabase.from("push_tokens").delete().eq("token", token).catch(() => {});
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: userTokens.size, sent, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("send-reengagement-notifications error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
