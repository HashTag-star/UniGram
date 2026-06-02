# Kofi Asante — Backend Engineer Report
**Date**: 2026-05-24  
**Agent**: Kofi Asante (Backend Engineer)  
**Project**: UniGram — Ghanaian University Social Network  
**Scope**: Full audit of all 36 migrations (002–036), all Edge Functions, and RPC call alignment in `services/algorithm.ts`, `services/messages.ts`, `services/posts.ts`

---

## 1. Schema Overview

The database schema is built across 36 migration files applied in filename order. The core tables (profiles, posts, follows, reels, stories, post_likes, post_saves, notifications, conversations, messages, etc.) are assumed to exist from a `001_` baseline migration that is NOT present in the local `supabase/migrations/` directory. Every migration from 002 onward references these tables as pre-existing.

### Core Tables (confirmed created or modified in migrations 002–036)

| Table | Created in | Notes |
|---|---|---|
| `dismissed_suggestions` | 002 | Algorithm support |
| `live_sessions` | 004 | Live streaming |
| `live_comments` | 004 | Live streaming |
| `blocks` | 007_blocks_table | User safety |
| `post_shares` | 010 | Engagement tracking |
| `calls` | 011_calls | WebRTC signaling |
| `call_ice_candidates` | 011_calls | WebRTC signaling |
| `user_feedback` | 014 | "Not interested" signals |
| `user_preferences` | 016 | Per-user affinity weights |
| `interactions` | 016 | Client batch interaction queue |
| `connection_moments` | 016 | Campus belonging signals |
| `campus_events` | 017 | Admin-managed events |
| `post_reposts` | 022 | Repost tracking |
| `post_ai_context` | 026_post_ai_context | AI misinformation cache |
| `message_reads` | 027 | Group read receipts |
| `sponsored_posts` | 030 | Admin-managed ads |
| `payments` | 031 | Paystack payment records |
| `profile_views` | 032 | Pro analytics |
| `campus_ads` | 034 | Self-serve ads |
| `keyword_filters` | *(referenced in edge fn)* | Assumed from 001 baseline |
| `reports` | *(referenced in edge fn)* | Assumed from 001 baseline |
| `verification_requests` | *(referenced in edge fn)* | Assumed from 001 baseline |
| `push_tokens` | *(referenced in edge fn)* | Assumed from 001 baseline |
| `user_interests` | *(referenced in 002)* | Assumed from 001 baseline |
| `user_relationships` | *(referenced in 002)* | Assumed from 001 baseline |
| `post_impressions` | *(referenced in 002)* | Assumed from 001 baseline |

---

## 2. Migration Issues Found

### CRITICAL: Duplicate migration number prefixes

The following number prefixes are reused, which causes filename-order ambiguity in Supabase's migration runner:

| Number | Files |
|---|---|
| 007 | `007_blocks_table.sql`, `007_delete_account.sql` |
| 011 | `011_calls.sql`, `011_verification_university.sql` |
| 026 | `026_feed_rpc_quote_repost_fields.sql`, `026_post_ai_context.sql` |
| 035 | `035_init_storage.sql`, `035_ad_review.sql` |

**Impact**: Supabase CLI uses the full filename as the migration key (stored in `supabase_migrations.name`). Duplicate prefixes do NOT actually block execution — Supabase tracks by full filename. However, the ordering within the same prefix is alphabetical, which produces these orderings:

- `007_blocks_table` before `007_delete_account` — SAFE (delete_account just creates a function)
- `011_calls` before `011_verification_university` — SAFE (no dependency between them)  
- `026_feed_rpc_quote_repost_fields` before `026_post_ai_context` — SAFE (independent)
- `035_ad_review` before `035_init_storage` — SAFE (`ad_review` modifies `campus_ads` from 034; `init_storage` creates storage buckets)

**Recommendation**: Rename these to sequential unique numbers (e.g., `007a_`/`007b_` or renumber) before the production `db push` to avoid future confusion and tooling issues. No functional breakage occurs with the current naming in Supabase's runner, but it is non-standard.

---

### CRITICAL (FIXED): Premature GRANT in migration 002

**File**: `002_algorithm_rpcs.sql` — lines 213–219 (original)  
**Issue**: The migration grants `EXECUTE` on `get_suggested_users` and `get_trending_hashtags` before those functions are defined. `get_suggested_users` is defined in `003_advanced_algorithm.sql` and `get_trending_hashtags` is referenced in the grants but never explicitly defined in 002 (it's used as a client-side function in `services/algorithm.ts`). Running this grant before the function exists produces: `ERROR: function get_suggested_users(unknown) does not exist`.

**Fix applied**: Removed the premature grants for `get_suggested_users` and `get_trending_hashtags` from 002. The grant for `get_suggested_users` already exists in `003_advanced_algorithm.sql` (line 107). The grant for `get_trending_hashtags` was never valid — there is no DB function by that name; trending hashtag logic runs client-side in `services/algorithm.ts`.

---

### CRITICAL (FIXED): Reference to non-existent `is_suspended` column in 036

**File**: `036_security_hardening.sql` — line 48 (original)  
**Issue**: The `profiles_guard_privileged_cols` trigger function checks `NEW.is_suspended IS DISTINCT FROM OLD.is_suspended`. No migration in the entire set ever adds an `is_suspended` column to `profiles`. The only ban-related column is `is_banned` (added in 018). Running this trigger would produce: `ERROR: column "is_suspended" does not exist`.

**Fix applied**: Removed the `is_suspended` check and replaced with a comment explaining the omission.

---

### MEDIUM (FIXED): Missing GRANT EXECUTE on `delete_current_user`

**File**: `007_delete_account.sql`  
**Issue**: The `delete_current_user()` function is `SECURITY DEFINER` and has no `GRANT EXECUTE` statement. Without the grant, authenticated users calling `supabase.rpc('delete_current_user')` from the client will receive a `permission denied for function delete_current_user` error.

**Fix applied**: Added `GRANT EXECUTE ON FUNCTION public.delete_current_user() TO authenticated;` at the end of the migration.

---

### MEDIUM: Migration 003 timeout risk (the known issue)

**File**: `003_advanced_algorithm.sql`  
**Issue reported**: This migration timed out during `supabase db push`.

**Root cause analysis**:
- Line 7: `CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;` — This is idempotent and safe.
- Line 10: `ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS embedding extensions.vector(384);` — Idempotent, safe.
- Line 13: `CREATE INDEX IF NOT EXISTS posts_embedding_idx ON public.posts USING hnsw (embedding vector_ip_ops);` — **This is the timeout culprit.** HNSW index creation on `posts` is an O(n log n) operation that locks the table and rebuilds in memory. On a large posts table (even thousands of rows), this can take 30+ seconds and exceeds Supabase's default statement timeout on `db push` (20s).
- Lines 17–108: `DROP FUNCTION IF EXISTS` + `CREATE OR REPLACE FUNCTION` — These are DDL operations, fast.

**Idempotency assessment**: The migration IS fully idempotent (`IF NOT EXISTS` guards everywhere). It is safe to re-run after fixing the timeout.

**Recommendation for Supabase dashboard**: Run migration 003 manually via the SQL Editor in two steps:
```sql
-- Step 1: schema (fast)
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS embedding extensions.vector(384);

-- Step 2: index creation separately (may take 1–5 min — no timeout in SQL Editor)
CREATE INDEX IF NOT EXISTS posts_embedding_idx
  ON public.posts USING hnsw (embedding vector_ip_ops);
```
Then run the function definitions (lines 16–108) as a third step.

---

### MEDIUM: Hardcoded `YOUR_SERVICE_ROLE_KEY` placeholder in cron jobs

**Files**: `015_follow_suggestions_cron.sql` (lines 66, 81), `016_preferences_interactions_trending.sql` (lines 240, 246)  
**Issue**: The pg_cron job definitions that call Edge Functions use the literal string `YOUR_SERVICE_ROLE_KEY` as the Bearer token. These cron jobs will fail silently with 401 Unauthorized responses from the Edge Functions.

**The migration is correctly guarded** (`IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')`) so it won't fail on push — it will only schedule broken jobs.

**Fix required in Supabase Dashboard**: After deployment, run the following in the SQL Editor to update the cron job body with the real service role key:
```sql
-- In Supabase SQL Editor:
SELECT cron.unschedule('follow-suggestions-morning');
SELECT cron.unschedule('follow-suggestions-evening');
SELECT cron.unschedule('reengagement-notifications');
-- Then re-run the relevant sections of 015 and 016 with the real key substituted.
```
Alternatively, use Supabase Vault to store the service role key and read it with `current_setting('app.service_role_key')`.

---

### LOW: `live_ended` notification type inserted before constraint allows it

**Files**: `023_live_ended_notification.sql` inserts `'live_ended'` into notifications.  
The constraint at 009 does not include `'live_ended'`. It was added to the constraint in `025_fix_post_type_check.sql`.

**Impact**: If migrations 023 through 024 were applied but 025 was not yet applied, any live stream that ends would produce a constraint violation. Since all 36 migrations should be applied together on first push, the practical risk is zero — but on a partial migration scenario (e.g., if 025 fails before applying), live-end notifications would crash.

**No code change applied** — ordering is correct in a complete push. The constraint is rebuilt idempotently in each subsequent migration.

---

### LOW: `re_engagement` notification type not in constraint

**File**: `016_preferences_interactions_trending.sql` and `send-reengagement-notifications` edge function  
**Issue**: The `send-reengagement-notifications` Edge Function inserts notifications with `type: 're_engagement'`. The final notifications type constraint (defined in `025_fix_post_type_check.sql`) does NOT include `'re_engagement'`. This will produce a check constraint violation every time the re-engagement cron job fires.

**The fix**: Add `'re_engagement'` to the notifications type constraint. The constraint is rebuilt in 025 — we need it there or in a subsequent migration.

Since 025 is the last migration to rebuild this constraint, we should add it there. However, editing a previously-applied migration that may already be live is risky. The safe approach is to add a new migration. For now, I am flagging this as a required action before deployment.

**Required action**: Run the following in the SQL Editor after all migrations:
```sql
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
ADD CONSTRAINT notifications_type_check
CHECK (type IN (
    'like', 'comment', 'follow', 'mention', 'repost', 'quote', 'save',
    'live_started', 'live_ended', 'reel_like', 'reel_comment',
    'follow_suggestion', 'new_post', 'new_story', 'message', 'story_view',
    're_engagement',
    'admin_report', 'admin_verification', 'admin_ban',
    'verification_approved', 'verification_rejected',
    'announcement', 'account_suspended', 'account_unsuspended'
));
```

---

### LOW: `message_reads` references `auth.users` instead of `profiles`

**File**: `027_messages_upgrades.sql` — line 20  
```sql
user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
```
All other user-referencing tables in this schema reference `public.profiles(id)`, not `auth.users(id)`. While functionally equivalent (profiles.id = auth.users.id), using `auth.users` directly is inconsistent with the rest of the schema and can cause issues with PostgREST joins since the `auth` schema is not exposed via the API.

**No fix applied** — low impact, but worth noting for consistency.

---

### LOW: `admin-ai-chat` function bypasses the `profiles_guard_privileged_cols` trigger

**File**: `supabase/functions/admin-ai-chat/index.ts` — line 245  
```typescript
await supabase.from('profiles').update({ is_banned: true }).eq('id', args.userId)
```
This update is made using `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS and triggers. The guard trigger in `036_security_hardening.sql` checks `current_user NOT IN ('postgres', 'service_role')`, so service_role calls ARE allowed through. This is by design but means the admin AI agent can ban users directly without any further guard.

**Risk**: If the `admin-ai-chat` Edge Function's admin auth check is bypassed (e.g., by an LLM prompt injection attack via the chat history), any authenticated user who can get the LLM to call `ban_user` could ban arbitrary accounts. The admin gate at lines 130–147 of `admin-ai-chat/index.ts` is the only protection.

---

## 3. Edge Function Issues

### `generate-post-embedding/index.ts`
- Uses `Supabase.ai.Session('gte-small')` — a Supabase-specific runtime API. This is valid in the Supabase Edge Runtime but will fail in local Deno execution without mocking.
- No CORS headers and no OPTIONS handler. This is a Database Webhook function (not called directly by clients), so CORS is not needed — design is correct.
- Uses `SUPABASE_SERVICE_ROLE_KEY` — correct for a server-side webhook.
- **Issue**: No validation that `payload.record` exists before destructuring. If the webhook fires for a row with a NULL id, the UPDATE will silently do nothing (not a crash, but worth noting).

### `get-explore-feed/index.ts`
- Uses `Supabase.ai.Session('gte-small')` — same as above, valid in production runtime.
- No auth check on the incoming request. Any unauthenticated caller with the URL can invoke it and consume embedding generation compute. The `userId` parameter is also passed in the body and trusted without verification against the JWT. **Security gap**: the function should validate the Bearer JWT and verify the `userId` claim matches `auth.uid()`.
- Calls `get_vector_explore_posts` RPC — this RPC exists in `003_advanced_algorithm.sql`. Match is correct.

### `keyword-filter-check/index.ts`
- References `keyword_filters` table (not created in any migration 002–036). Assumed to exist in the 001 baseline. If the table doesn't exist, the function silently returns `{ flagged: false }` — the `try/catch` catches the error and fails open. This is intentional but means keyword filtering is silently broken if the table is missing.
- No auth check. The function is designed to be called server-side during post creation, which is fine for an internal Edge Function.

### `ai-regulation-scan/index.ts`
- References `ai_action_log` table (line 136: `supabase.from('ai_action_log').insert(rows)`). This table is **not created in any migration 002–036**. The `.catch(() => {})` silently swallows the error, meaning AI action logging is currently broken (no-op) if this table doesn't exist in the 001 baseline.
- Admin auth check is correctly implemented.
- References `reports` and `verification_requests` tables — assumed from 001 baseline.

### `send-follow-suggestions/index.ts`
- Auth check: verifies request Bearer matches `SUPABASE_SERVICE_ROLE_KEY` directly (line 18). This is correct for a cron-triggered function.
- Calls `get_users_for_follow_suggestions` RPC (defined in 015) — match is correct.
- Calls `get_suggested_users` RPC (defined in 003) — match is correct.
- Uses Firebase Admin SDK for push — requires `FIREBASE_SERVICE_ACCOUNT` secret to be set in Supabase dashboard.

### `send-reengagement-notifications/index.ts`
- Calls `get_trending_post_for_university` RPC (defined in 016) — match is correct.
- Inserts `type: 're_engagement'` notifications — **will violate the notifications_type_check constraint** (see issue above). The `.catch(() => {})` on the insert means this fails silently and the cron job continues, but no cooldown row is written, so users could receive unlimited re-engagement pushes.

### `paystack-webhook/index.ts`
- Signature verification using `crypto.subtle` — correct and secure.
- Idempotency guard: checks `payment.status === 'success'` before re-processing — correct.
- Does NOT handle `ad_payment` product type (only `market_boost` and `pro_sub`). This is handled in `paystack-verify/index.ts` but not in the webhook. If Paystack fires the webhook for an ad payment before the user can call the verify endpoint, the ad will remain in `pending` status indefinitely.

### `paystack-verify/index.ts`
- Handles `ad_payment` via `applyAdPayment` — correct.
- Security: verifies user auth and matches `reference` to `user_id` in the same query (line 83) — correctly prevents one user from verifying another's payment.

### `admin-ai-chat/index.ts`
- All admin errors return HTTP 200 (not 4xx). This makes it harder for the client to distinguish auth failures from successful responses. Intentional pattern for the admin console but non-standard.
- The `delete_content` tool maps `targetType === 'comment'` to `comments` table and `targetType === 'market_item'` to `market_items` — correct.
- Uses `SUPABASE_SERVICE_ROLE_KEY` for direct profile/ban mutations which bypasses the `profiles_guard_privileged_cols` trigger (service_role is exempt). This is the correct pattern.

### `caption-assistant/index.ts`
- Correctly validates Bearer JWT against Supabase auth before processing.
- Uses `SUPABASE_ANON_KEY` for JWT validation and `SUPABASE_SERVICE_ROLE_KEY` for data reads — correct two-client pattern.
- Vision model fallback chain (`llama-4-scout` → `llama-3.2-11b-vision-preview`) is correct.

### `post-ai-context/index.ts`
- Cache stale-check logic (re-analyze if `hasAnalyzableImage && !cached.analyzed_with_vision`) is well designed.
- Uses service_role to upsert into `post_ai_context` — matches the "only service role may write" comment in 026_post_ai_context.sql.
- Vision model fallback chain is identical to caption-assistant — correct.

### `analytics-insights/index.ts`
- Calls `get_profile_analytics` (defined in 033) and `get_post_analytics` (defined in 032) — matches are correct.
- The `deriveOutlook` calculation uses `total_views_30d` but the `get_profile_analytics` RPC (033 version) returns this field — correct.

### `_shared/groq.ts`
- Well-structured shared module. However, none of the Edge Functions that have their own inline `callGroq` helpers actually import from `_shared/groq.ts`. The shared module is defined but not used. This means model name constants (`GROQ_MODEL_FAST`, `GROQ_MODEL_SMART`) are not centrally managed.
- **Recommendation**: Refactor all Edge Functions to import from `_shared/groq.ts` to prevent model name drift.

---

## 4. RPC Call Alignment — services/ vs migrations

### services/algorithm.ts

| RPC Called | Defined In | Parameters Match | Status |
|---|---|---|---|
| `get_hybrid_campus_feed` | 026_feed_rpc_quote_repost_fields | `p_user_id, p_limit, p_offset` — correct | OK |
| `update_rel_strength` | assumed 001 baseline | `p_actor, p_target, p_delta` | Cannot verify (001 not present) |
| `increment_post_shares` | 002 | `p_post_id` — correct | OK |
| `get_explore_posts` | 002 | `p_user_id, p_limit, p_offset` — correct | OK |
| `get_suggested_users` | 003 | `p_user_id, p_limit` — correct | OK |

**Note**: `recordProfileView` in `services/algorithm.ts` (line 138) calls `update_rel_strength` with parameters `p_actor`, `p_target`, `p_delta`. The function signature in migrations uses `p_user_a`, `p_user_b`, `p_delta` (inferred from the `user_relationships` column names `user_a`, `user_b`). The exact parameter names of `update_rel_strength` cannot be verified without the 001 baseline migration. If the parameter names don't match, all rel_strength calls will silently fail (Supabase RPC returns an error for named parameter mismatches).

### services/messages.ts

| RPC Called | Defined In | Parameters Match | Status |
|---|---|---|---|
| `get_user_conversations_v2` | 028 | `p_user_id, p_archived` — correct | OK |
| `create_dm` | assumed 001 baseline | `user1, user2` | Cannot verify |
| `create_group_v2` | assumed 001 baseline | `owner_id, member_ids, group_name` | Cannot verify |
| `delete_message_for_me` | 036 (updated from 028) | `p_message_id` only — correct | OK |

**Critical**: `services/messages.ts` calls `delete_message_for_me` with only `p_message_id` (line 231–233). The 036 migration correctly updated the function signature to remove the now-dangerous `p_user_id` parameter. The service file is correctly aligned with the 036 signature. If the database still has the 028-era function (with two parameters), the call will fail. Verify migration 036 has been applied.

### services/posts.ts

| RPC/direct call | Notes |
|---|---|
| Direct table inserts/selects on `posts` | No RPCs used for basic CRUD |
| `increment_post_shares` | Called indirectly via `services/algorithm.ts` |
| `increment_post_reposts` (022) | Used in reposts flow in posts.ts |

No RPC mismatches detected in `services/posts.ts`.

---

## 5. Schema Summary — Missing Tables Referenced by Edge Functions

The following tables are referenced in Edge Functions but do not appear in migrations 002–036. They must exist in the 001 baseline migration (or equivalent):

| Table | Referenced By |
|---|---|
| `reports` | `admin-ai-chat`, `ai-regulation-scan`, `services/algorithm.ts` |
| `verification_requests` | `admin-ai-chat`, `ai-regulation-scan` |
| `push_tokens` | `send-follow-suggestions`, `send-reengagement-notifications`, `send-push-notification` |
| `user_interests` | `002_algorithm_rpcs`, `caption-assistant`, `services/algorithm.ts` |
| `user_relationships` | `002_algorithm_rpcs`, `010_hybrid_algorithm` |
| `post_impressions` | `002_algorithm_rpcs`, `010_hybrid_algorithm`, `032_pro_subscription` |
| `keyword_filters` | `keyword-filter-check` |
| `ai_action_log` | `ai-regulation-scan` |
| `message_reactions` | `services/messages.ts` |
| `post_saves` | `002_algorithm_rpcs` (trigger references it) |
| `post_likes` | `016` (trigger references it) |
| `follows` | Multiple migrations |
| `profiles` | All migrations |
| `posts` | All migrations |
| `conversations` | Multiple migrations |
| `conversation_participants` | Multiple migrations |
| `messages` | Multiple migrations |

**Action**: Confirm the 001 baseline migration was applied to the Supabase project. The dashboard SQL editor can verify by running `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;`.

---

## 6. Supabase Dashboard Setup Checklist

Before running `supabase db push` and `supabase functions deploy --all`:

### Database

- [ ] Verify migration 001 (baseline) is applied to the project (`rcvzcbfmstgwzrolnhvy`)
- [ ] Run migration 003 manually in 3 parts (schema, HNSW index, functions) to avoid timeout
- [ ] After all migrations, run the `re_engagement` type constraint fix (SQL in section 2 above)
- [ ] After all migrations, update cron job Bearer tokens in 015 and 016 with the real service role key
- [ ] Create the `ai_action_log` table (referenced in `ai-regulation-scan` but never migrated)
- [ ] Run `SELECT promote_to_admin('haantierkuu@st.knust.edu.gh');` (or the founder's email) using the service role to create the first admin

### Extensions required (enable in Supabase dashboard → Database → Extensions)

- [ ] `pgvector` (required by 003) — enable before running 003
- [ ] `pg_cron` (required by 015, 016) — Supabase Pro/Team only
- [ ] `pg_net` (required by cron HTTP calls in 015, 016) — Supabase Pro/Team only

### Edge Function Secrets (Supabase Dashboard → Settings → Edge Functions)

- [ ] `GROQ_API_KEY` — Groq API key for all AI functions
- [ ] `FIREBASE_SERVICE_ACCOUNT` — JSON string of Firebase service account (for push notifications)
- [ ] `PAYSTACK_SECRET_KEY` — Paystack secret key (sk_live_... or sk_test_...)
- [ ] `CLOUDINARY_CLOUD_NAME` — Optional; for composite avatar images in push notifications
- [ ] `SUPABASE_URL` — Auto-injected by Supabase runtime (do not set manually)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — Auto-injected by Supabase runtime (do not set manually)
- [ ] `SUPABASE_ANON_KEY` — Required by `caption-assistant` (not auto-injected; must be set)

### Storage Buckets

Migration 035_init_storage.sql creates all 7 required buckets via SQL. However, storage bucket creation via SQL `INSERT INTO storage.buckets` may not work on all Supabase tiers. **Verify these buckets exist** in the Supabase dashboard → Storage after migration:

- `ad-media` (public)
- `post-media` (public)
- `videos` (public)
- `avatars` (public)
- `market-images` (public)
- `verifications` (private)
- `reel-thumbnails` (public)

Also create: `message-media` (referenced in `services/messages.ts` for voice/image messages but NOT in any migration).

### Realtime

Migration 004 runs:
```sql
ALTER PUBLICATION supabase_realtime ADD TABLE live_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE live_sessions;
```
Additional tables that need Realtime for the app to function (referenced in `App.tsx` subscriptions):
- `notifications` — for badge counts
- `messages` — for DM realtime
- `calls` — for WebRTC signaling
- `call_ice_candidates` — for WebRTC ICE

These must be added to the `supabase_realtime` publication either in a migration or via the Supabase dashboard → Database → Replication.

---

## 7. Fixes Applied to Local Files

| File | Fix |
|---|---|
| `supabase/migrations/002_algorithm_rpcs.sql` | Removed premature GRANT on `get_suggested_users` and `get_trending_hashtags` (these functions don't exist yet at migration 002) |
| `supabase/migrations/007_delete_account.sql` | Added missing `GRANT EXECUTE ON FUNCTION public.delete_current_user() TO authenticated` |
| `supabase/migrations/036_security_hardening.sql` | Removed reference to non-existent `is_suspended` column in `profiles_guard_privileged_cols` trigger |

All fixes are signed with `-- [Kofi Asante - Backend]` inline comments.

---

## 8. Recommendations Summary

| Priority | Item |
|---|---|
| P0 | Apply all pending migrations via Supabase SQL Editor (not `db push`) to avoid timeout |
| P0 | Run migration 003 in 3 manual steps — HNSW index will timeout in `db push` |
| P0 | Add `re_engagement` to notifications_type_check constraint before deploying cron jobs |
| P0 | Set `SUPABASE_ANON_KEY` in Edge Function secrets (required by `caption-assistant`) |
| P0 | Create `message-media` storage bucket (missing from migration, used by messages.ts) |
| P1 | Replace `YOUR_SERVICE_ROLE_KEY` placeholder in cron job bodies (015, 016) |
| P1 | Create `ai_action_log` table to enable AI moderation action tracking |
| P1 | Add `notifications`, `messages`, `calls`, `call_ice_candidates` to `supabase_realtime` publication |
| P2 | Refactor Edge Functions to import from `_shared/groq.ts` instead of each having its own inline `callGroq` |
| P2 | Rename duplicate-numbered migration files (007, 011, 026, 035) to unique sequential names |
| P2 | Add `ad_payment` handling to `paystack-webhook/index.ts` (currently only in `paystack-verify`) |
| P3 | Add auth check to `get-explore-feed/index.ts` to prevent unauthenticated embedding generation |
| P3 | Change `message_reads.user_id` FK to reference `public.profiles(id)` for consistency |

---

*Report written by Kofi Asante — Backend Engineer, UniGram*  
*2026-05-24*
