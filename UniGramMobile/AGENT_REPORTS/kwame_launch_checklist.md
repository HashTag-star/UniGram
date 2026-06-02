# UniGram — Production Launch Checklist
**Owner**: Kwame Darko (DevOps & Release Engineer)  
**Last Updated**: 2026-05-24  
**App Bundle ID**: `com.unigram.mobile`  
**EAS Project**: `b08e2c74-68d1-4e72-94ac-a92750902d6a`  
**EAS Owner**: `heis_hashtag`  
**Supabase Project**: `rcvzcbfmstgwzrolnhvy`

---

## PHASE 1 — Prerequisites & Accounts

### 1.1 Developer Accounts
- [ ] **Apple Developer Account** — enrolled and paid ($99/year). Sign in at https://developer.apple.com
- [ ] **Google Play Console Account** — enrolled and paid ($25 one-time). Sign in at https://play.google.com/console
- [ ] **Expo Account** — created at https://expo.dev (owner: `heis_hashtag`)
- [ ] **Supabase Account** — project `rcvzcbfmstgwzrolnhvy` active at https://supabase.com/dashboard/project/rcvzcbfmstgwzrolnhvy

### 1.2 Required Tooling
- [ ] Node.js >= 18 installed: `node --version`
- [ ] EAS CLI >= 10.0.0 installed: `npm install -g eas-cli && eas --version`
- [ ] Logged into EAS: `eas login` (use `heis_hashtag` credentials)
- [ ] Supabase CLI installed (for migrations): `npm install -g supabase`
- [ ] Git repo is clean (no uncommitted changes before building): `git status`

---

## PHASE 2 — Environment Variables

### 2.1 Create Local .env File
- [ ] Copy the example file:
  ```bash
  cp .env.example .env
  ```
- [ ] Open `.env` and fill in ALL values (see below)

### 2.2 Required .env Values

**Supabase (REQUIRED — app will not launch without these)**
- [ ] `EXPO_PUBLIC_SUPABASE_URL` — set to `https://rcvzcbfmstgwzrolnhvy.supabase.co`
- [ ] `EXPO_PUBLIC_SUPABASE_ANON_KEY` — get from: https://supabase.com/dashboard/project/rcvzcbfmstgwzrolnhvy/settings/api → "Project API keys" → `anon public`

**TURN Server (REQUIRED for live streaming / video calls)**
- [ ] `EXPO_PUBLIC_TURN_URL` — e.g. `turn:relay.metered.ca:80`
- [ ] `EXPO_PUBLIC_TURNS_URL` — e.g. `turns:relay.metered.ca:443`
- [ ] `EXPO_PUBLIC_TURN_USERNAME` — from your TURN provider
- [ ] `EXPO_PUBLIC_TURN_CREDENTIAL` — from your TURN provider
  > Recommended provider: https://www.metered.ca/tools/openrelay/ (free tier available)

### 2.3 Supabase Edge Function Secrets (set via CLI, NOT in .env)
- [ ] Set Paystack secret key:
  ```bash
  npx supabase secrets set PAYSTACK_SECRET_KEY=sk_live_xxx --project-ref rcvzcbfmstgwzrolnhvy
  ```
- [ ] Register Paystack webhook URL in Paystack Dashboard → Settings → Webhooks:
  `https://rcvzcbfmstgwzrolnhvy.supabase.co/functions/v1/paystack-webhook`

### 2.4 EAS Secret Variables
- [ ] Add the Supabase anon key as an EAS secret (so production builds get it):
  ```bash
  eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "your_anon_key_here"
  ```
  > Do NOT commit the real anon key to eas.json — use EAS secrets instead.

---

## PHASE 3 — Supabase Backend Setup

### 3.1 Run All SQL Migrations
- [ ] Open Supabase SQL Editor: https://supabase.com/dashboard/project/rcvzcbfmstgwzrolnhvy/sql
- [ ] Paste and run the full contents of `supabase-migrations.sql`
  > Script is idempotent — safe to run multiple times
- [ ] **CRITICAL**: Verify migration `003_advanced_algorithm.sql` was applied (it timed out previously):
  ```sql
  -- Check if the migration objects exist
  SELECT routine_name FROM information_schema.routines
  WHERE routine_schema = 'public'
  ORDER BY routine_name;
  ```
- [ ] If `003_advanced_algorithm.sql` objects are missing, apply it manually via the SQL Editor

### 3.2 Verify Storage Buckets
- [ ] Go to: https://supabase.com/dashboard/project/rcvzcbfmstgwzrolnhvy/storage/buckets
- [ ] Confirm these buckets exist and are set to **Public**:
  - [ ] `avatars` — Public, 5 MB limit
  - [ ] `post-media` — Public, 50 MB limit
  - [ ] `market-media` — Public, 50 MB limit
  - [ ] `message-media` — Public, 50 MB limit
  - [ ] `reel-media` (if applicable) — Public, 100 MB limit
- [ ] If any bucket is missing, create it manually in the Storage dashboard

### 3.3 Verify RLS Policies
- [ ] Run this query in the SQL Editor to confirm all tables have RLS enabled:
  ```sql
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY tablename;
  ```
- [ ] All tables should show `rowsecurity = true`

### 3.4 Add Database Indexes
- [ ] Run these indexes for query performance:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
  CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_follows_follower ON follows(follower_id);
  CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
  ```

### 3.5 Deploy Edge Functions
- [ ] Deploy all Edge Functions:
  ```bash
  supabase functions deploy --all --project-ref rcvzcbfmstgwzrolnhvy
  ```
- [ ] Confirm functions appear in: https://supabase.com/dashboard/project/rcvzcbfmstgwzrolnhvy/functions

### 3.6 Set Admin User
- [ ] After first sign-up with your admin account, run:
  ```sql
  UPDATE profiles
  SET is_admin = true
  WHERE username = 'your_admin_username';
  ```

---

## PHASE 4 — iOS Credentials & App Store Connect Setup

### 4.1 Create the App in App Store Connect
- [ ] Go to: https://appstoreconnect.apple.com
- [ ] Click **+** → **New App**
  - Platform: iOS
  - Name: `UniGram`
  - Primary Language: English
  - Bundle ID: `com.unigram.mobile` (register in Apple Developer portal first if not already)
  - SKU: `UNIGRAM001` (any unique identifier)
- [ ] Note the **App ID (ascAppId)** — 10-digit numeric value shown in App Store Connect URL

### 4.2 Get Apple Developer Credentials
- [ ] **Apple ID email**: your Apple Developer account email
- [ ] **Apple Team ID**: go to https://developer.apple.com/account → Membership → Team ID
- [ ] **App Store Connect App ID (ascAppId)**: numeric ID from the URL of your app in App Store Connect (e.g., `https://appstoreconnect.apple.com/apps/1234567890/...` → `1234567890`)

### 4.3 Update eas.json with Real Apple Credentials
- [ ] Open `eas.json` and update the `submit.production.ios` section:
  ```json
  "ios": {
    "appleId": "your@apple.id",
    "ascAppId": "1234567890",
    "appleTeamId": "ABCDEF1234"
  }
  ```
  > File is at: `C:\Users\#iamhashtag\Desktop\UniGram\UniGramMobile\eas.json`

### 4.4 Configure APNs for Push Notifications
- [ ] Run: `eas credentials`
- [ ] Select iOS → production → Push Notifications → let EAS auto-create the key
  > EAS manages APNs certificates automatically via managed workflow

### 4.5 App Store Listing — Required Metadata
- [ ] **App Name**: UniGram
- [ ] **Subtitle** (30 chars max): "Campus Social Network"
- [ ] **Description** (4000 chars max): Write a compelling description covering features (feed, reels, marketplace, events, DMs, live)
- [ ] **Keywords** (100 chars): "university,campus,social,students,Ghana,KNUST,UG,marketplace"
- [ ] **Support URL**: your support URL (e.g., Instagram DM or email landing page)
- [ ] **Privacy Policy URL**: Required — create a simple one at https://www.privacypolicygenerator.info/
- [ ] **Age Rating**: Complete the questionnaire (likely 12+ due to social features)
- [ ] **Screenshots** (required sizes):
  - [ ] iPhone 6.9" (1320×2868 px) — at least 3 screenshots
  - [ ] iPhone 6.5" (1284×2778 px) — at least 3 screenshots
  - [ ] iPad Pro 12.9" — only if `supportsTablet: true` (currently false, so skip)
- [ ] **App Icon**: 1024×1024 PNG, no alpha/transparency, no rounded corners

---

## PHASE 5 — Android Credentials & Google Play Console Setup

### 5.1 Create the App in Google Play Console
- [ ] Go to: https://play.google.com/console
- [ ] Click **Create app**
  - App name: `UniGram`
  - Default language: English
  - App type: App
  - Free or paid: Free
  - Declarations: complete all
- [ ] Package name: `com.unigram.mobile`

### 5.2 Get Google Play Service Account Key (for automated submission)
- [ ] In Google Play Console → Setup → API access → Link to Google Cloud project
- [ ] In Google Cloud Console, create a service account with **Release Manager** role
- [ ] Download the JSON key file
- [ ] **Important**: The `serviceAccountKeyPath` in `eas.json` currently points to `./google-services.json` — this is **WRONG** for the submission service account. The `google-services.json` in `app.json` is for Firebase/FCM.

  **Fix**: Create a separate file for the Play Store service account:
  1. Save the Play service account JSON as `./google-play-service-account.json`
  2. Update `eas.json` `submit.production.android.serviceAccountKeyPath` to `"./google-play-service-account.json"`
  3. Add `google-play-service-account.json` to `.gitignore`

### 5.3 Get Firebase / FCM Config File
- [ ] Go to: https://console.firebase.google.com
- [ ] Create a project for UniGram (or use existing)
- [ ] Add an Android app with package name `com.unigram.mobile`
- [ ] Download `google-services.json`
- [ ] Place it at: `C:\Users\#iamhashtag\Desktop\UniGram\UniGramMobile\google-services.json`
  > This file is already referenced in `app.json` → `android.googleServicesFile`

### 5.4 Google Play Store Listing — Required Metadata
- [ ] **Short description** (80 chars max): "The social network built for Ghanaian university students"
- [ ] **Full description** (4000 chars max): same as iOS description
- [ ] **App icon**: 512×512 PNG
- [ ] **Feature graphic**: 1024×500 PNG (banner shown at top of Play Store listing)
- [ ] **Screenshots**: at least 2 phone screenshots (recommend 8 max)
- [ ] **Privacy Policy URL**: same as iOS
- [ ] **Content rating**: complete the questionnaire
- [ ] **Target audience**: 18+ (university students)
- [ ] **Data safety section**: complete the form detailing what data is collected

---

## PHASE 6 — EAS Build

### 6.1 Pre-Build Verification
- [ ] Confirm EAS project is linked:
  ```bash
  eas project:info
  ```
  Expected: project ID `b08e2c74-68d1-4e72-94ac-a92750902d6a`, owner `heis_hashtag`
- [ ] Confirm `google-services.json` exists at project root
- [ ] Confirm `eas.json` has real Apple credentials filled in
- [ ] Confirm EAS secrets are set: `eas secret:list`

### 6.2 Run a Development Build First (Optional but Recommended)
- [ ] Build a dev APK to test on a real device:
  ```bash
  npm run build:dev
  # or: eas build --platform android --profile development
  ```
- [ ] Install on Android device and verify:
  - [ ] Sign-up / Sign-in works
  - [ ] Feed loads
  - [ ] Camera access works
  - [ ] Push notifications received
  - [ ] Google Sign-In works (native module)
  - [ ] Video/Reels playback works
  - [ ] DMs and real-time updates work

### 6.3 Run a Preview Build (QA / TestFlight)
- [ ] Build preview for both platforms:
  ```bash
  npm run build:preview
  # or: eas build --platform all --profile preview
  ```
- [ ] Distribute Android APK to testers internally
- [ ] Upload iOS IPA to TestFlight for beta testing:
  ```bash
  eas submit --platform ios --profile production
  ```
  (EAS will submit to TestFlight automatically)

### 6.4 Run Production Build
- [ ] Build production Android AAB:
  ```bash
  npm run build:android
  # or: eas build --platform android --profile production
  ```
- [ ] Build production iOS IPA:
  ```bash
  npm run build:ios
  # or: eas build --platform ios --profile production
  ```
- [ ] Monitor builds at: https://expo.dev/accounts/heis_hashtag/projects/unigram-mobile-v2/builds
- [ ] Wait for both builds to complete (typically 15–30 minutes each)

---

## PHASE 7 — App Store Submission

### 7.1 Submit to Apple App Store
- [ ] Ensure iOS production build is complete and shows "Finished" in EAS dashboard
- [ ] Submit:
  ```bash
  npm run submit:ios
  # or: eas submit --platform ios --profile production
  ```
- [ ] EAS will prompt for Apple credentials if not cached
- [ ] Build will appear in App Store Connect under TestFlight first
- [ ] After TestFlight processing (~15 min), click **Submit for Review** in App Store Connect
- [ ] Apple review typically takes 24–48 hours

### 7.2 Submit to Google Play
- [ ] Ensure Android production build (AAB) is complete
- [ ] **First submission must be done manually** via Google Play Console:
  1. Go to Play Console → Your App → Production → Create new release
  2. Upload the AAB file (download from EAS dashboard first)
  3. Complete release notes
  4. Roll out
- [ ] For subsequent submissions, use automated EAS submit:
  ```bash
  npm run submit:android
  # or: eas submit --platform android --profile production
  ```

---

## PHASE 8 — Post-Launch Monitoring (Day 1)

### 8.1 Supabase Health Checks
- [ ] Monitor logs: https://supabase.com/dashboard/project/rcvzcbfmstgwzrolnhvy/logs/edge-logs
- [ ] Check for query errors in database logs
- [ ] Verify push notifications are being sent by Edge Functions
- [ ] Verify all storage buckets are accessible (test upload/download)
- [ ] Test RLS: sign in as a test user and verify you can only see permitted data

### 8.2 App Store Monitoring
- [ ] **iOS**: Check App Store Connect → TestFlight for crash reports
- [ ] **Android**: Check Google Play Console → Android Vitals → Crashes
- [ ] Monitor EAS dashboard for any OTA update failures

### 8.3 Set Up Billing Alerts
- [ ] Supabase: Dashboard → Settings → Billing → set usage alerts
- [ ] EAS: check build minutes usage at https://expo.dev/accounts/heis_hashtag/settings/billing

### 8.4 Week 1 Operational Tasks
- [ ] Enable database backups: https://supabase.com/dashboard/project/rcvzcbfmstgwzrolnhvy/database/backups
- [ ] Review Realtime usage — ensure only `messages` and `notifications` tables have Realtime enabled
- [ ] Set up monitoring for the Paystack webhook endpoint
- [ ] Review and respond to any App Store reviews

---

## PHASE 9 — OTA Updates (Post-Launch Fixes)

### 9.1 Publishing JavaScript-Only Updates
For fixes that don't change native code (no new plugins, no new permissions):
- [ ] Make your changes
- [ ] Publish to production:
  ```bash
  eas update --branch production --message "Fix: describe the fix"
  ```
- [ ] Users will receive the update silently on next app launch

### 9.2 When You MUST Do a Full Build
A new native build is required if you:
- Add or remove any Expo plugin
- Change any permission declarations
- Upgrade the Expo SDK version
- Add any native module (react-native-xyz)
- Change `app.json` native config (icons, splash, bundle ID)

---

## CRITICAL ISSUES TO RESOLVE BEFORE LAUNCH

1. **`google-services.json` is missing** — required for Android builds. Get from Firebase Console.
2. **Apple credentials in `eas.json` are placeholders** — `REPLACE_WITH_APPLE_ID`, `REPLACE_WITH_ASC_APP_ID`, `REPLACE_WITH_TEAM_ID` must be replaced with real values.
3. **`EXPO_PUBLIC_SUPABASE_ANON_KEY` is not set** — must be set as an EAS secret before production build.
4. **Play Store service account JSON path conflict** — `eas.json` `submit.android.serviceAccountKeyPath` points to `./google-services.json` (the Firebase file). A separate service account JSON for Play Store submission must be created and referenced correctly.
5. **Migration `003_advanced_algorithm.sql` timed out** — verify it was applied to the production Supabase project.
6. **App Store Connect listing not created** — must exist before submitting the iOS build.
7. **Google Play Console listing not created** — must exist and have a completed store listing before submitting the Android build.

---

*Checklist authored by Kwame Darko — DevOps & Release Engineer*  
*UniGram Engineering Team | 2026-05-24*
