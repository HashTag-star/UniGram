# UniGram — Production Deployment Guide

Supabase Project: `rcvzcbfmstgwzrolnhvy`

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | >= 18 | LTS recommended |
| EAS CLI | >= 10.0.0 | `npm install -g eas-cli` |
| Expo account | — | expo.dev |
| Apple Developer account | — | Required for iOS builds and App Store submission |
| Google Play Console account | — | Required for Android submission |

---

## 1. Environment Variables

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

Required variables:

```
EXPO_PUBLIC_SUPABASE_URL=https://rcvzcbfmstgwzrolnhvy.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your anon key from Supabase Dashboard → Settings → API>
```

Never commit `.env` to version control. The `.env.example` file is safe to commit and serves as documentation.

---

## 2. Run Supabase SQL Migrations

Open the [Supabase SQL Editor](https://supabase.com/dashboard/project/rcvzcbfmstgwzrolnhvy/sql) and paste the full contents of `supabase-migrations.sql`, then click **Run**.

This migration:
- Adds `is_admin` and `is_banned` columns to `profiles`
- Adds `type` and `media_url` columns to `messages`
- Creates `message_reactions`, `market_saves`, and `reports` tables
- Creates the `message-media` storage bucket
- Sets up all RLS policies
- Creates the `on_message_insert` trigger

The script is idempotent — it is safe to run multiple times.

---

## 3. Supabase Storage Buckets

The migration script creates the `message-media` bucket automatically. Verify in the Supabase Dashboard:

1. Go to **Storage** in the left sidebar
2. Confirm `message-media` bucket exists and is set to **Public**
3. Confirm existing buckets (`avatars`, `post-media`, `market-media`, etc.) have the correct public/private settings

If any bucket is missing, create it manually:
- `avatars` — Public, 5 MB limit
- `post-media` — Public, 50 MB limit
- `market-media` — Public, 50 MB limit
- `message-media` — Public, 50 MB limit (created by migration)

---

## 4. Supabase RLS Policies

After running the migration, verify RLS is enabled on all tables:

```sql
-- Check RLS status
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

All tables should show `rowsecurity = true`. If any are missing, the migration script enables them automatically for the new tables.

---

## 5. Push Notifications (Expo Push Service)

UniGram uses Expo's push notification service — no separate FCM/APNs setup is required for managed workflow.

1. Ensure `expo-notifications` is in your plugins list in `app.json` (already done)
2. Run `eas credentials` to configure APNs credentials for iOS
3. For Android, EAS handles FCM automatically via the managed workflow
4. Test push delivery with the [Expo Push Notification Tool](https://expo.dev/notifications)

To obtain a push token in the app:

```ts
import * as Notifications from 'expo-notifications';
const { data: token } = await Notifications.getExpoPushTokenAsync();
```

Store the token in the `profiles` table (add a `push_token` column if needed) and call Expo's push API from your Supabase Edge Functions or a backend worker.

---

## 6. EAS Setup

Log in and link the project:

```bash
eas login
eas build:configure   # generates/updates eas.json
```

Update `eas.json` → `submit.production` with your real credentials:

- `appleId`: Your Apple ID email
- `ascAppId`: App Store Connect App ID (numeric)
- `appleTeamId`: Apple Developer Team ID
- `serviceAccountKeyPath`: Path to your Google Play service account JSON

---

## 7. Building

### Development Build (internal testing, physical device)

```bash
npm run build:dev
# or: eas build --platform android --profile development
```

### Preview Build (QA / TestFlight / internal track)

```bash
npm run build:preview
# or: eas build --platform all --profile preview
```

### Production Build

```bash
npm run build:android   # Android AAB for Play Store
npm run build:ios       # iOS IPA for App Store
```

Builds run in the cloud on EAS servers. Monitor progress at:
`https://expo.dev/accounts/<your-account>/projects/unigram-mobile/builds`

---

## 8. Submitting to App Stores

### App Store (iOS)

1. Create the app in [App Store Connect](https://appstoreconnect.apple.com)
2. Fill in app metadata, screenshots, and privacy details
3. Submit:

```bash
npm run submit:ios
# or: eas submit --platform ios --profile production
```

EAS will upload the IPA and submit it for TestFlight review.

### Google Play (Android)

1. Create the app in [Google Play Console](https://play.google.com/console)
2. Complete store listing, content rating, and privacy policy
3. Download a service account JSON key with the `Release Manager` role
4. Place the file at `./google-services.json` (path set in `eas.json`)
5. Submit:

```bash
npm run submit:android
# or: eas submit --platform android --profile production
```

---

## 9. App Store Metadata Checklist

Before submission, prepare:

- [ ] App icon (1024x1024 PNG, no alpha)
- [ ] Screenshots for iPhone 6.9", 6.5", and iPad 12.9" (if tablet supported)
- [ ] Short description (< 30 chars for Google Play)
- [ ] Full description
- [ ] Privacy policy URL (required by both stores)
- [ ] Support URL
- [ ] Age rating questionnaire

---

## 10. Post-Launch Checklist

### Day 1
- [ ] Monitor Supabase logs for query errors (Dashboard → Logs)
- [ ] Verify push notifications are delivered successfully
- [ ] Check storage bucket usage and set billing alerts
- [ ] Confirm all RLS policies are working (try querying as an anonymous user)
- [ ] Set `is_admin = true` for your admin user in the `profiles` table

### Week 1
- [ ] Review Supabase usage and upgrade plan if needed
- [ ] Set up Supabase database backups (Dashboard → Database → Backups)
- [ ] Enable Supabase realtime only on tables that need it (messages, notifications)
- [ ] Add database indexes for frequently queried columns:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
  CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
  ```

### Ongoing
- [ ] Monitor crash reports via EAS Update / Expo Dashboard
- [ ] Publish OTA updates for JS-only fixes: `eas update --branch production`
- [ ] Rotate Supabase service role key if ever exposed
- [ ] Review and respond to user reports in the Admin Dashboard

---

## Admin Dashboard Access

To grant admin access to a user, run in the Supabase SQL Editor:

```sql
UPDATE profiles
SET is_admin = true
WHERE username = 'your_username_here';
```

The Admin Dashboard is accessible from the Profile screen when `is_admin = true`.

---

## OTA Updates (No New Build Required)

For JavaScript/TypeScript changes that don't affect native code:

```bash
# Install EAS Update if not already
npm install -g eas-cli

# Publish to production channel
eas update --branch production --message "Fix: ..."
```

Native code changes (new plugins, permissions, SDK upgrades) always require a new build.
