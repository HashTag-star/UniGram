# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start               # Start Expo dev server
npm run android         # Run on Android device/emulator
npm run ios             # Run on iOS simulator
npm run web             # Run web version

npm run build:android   # EAS production build for Android
npm run build:ios       # EAS production build for iOS
npm run build:preview   # EAS preview build (both platforms)
npm run build:dev       # EAS development build (Android)

npm run submit:android  # Submit to Google Play Store
npm run submit:ios      # Submit to Apple App Store
```

There are no lint or test scripts — TypeScript (`tsc --noEmit`) is the closest equivalent for static checking.

## Architecture

UniGram is a campus social platform built with **Expo 54 / React Native 0.81** using the new architecture. It targets iOS and Android (min SDK 24) and supports a web build.

### Entry & Navigation

`index.ts` → `App.tsx` is the entire app shell (~1300 lines). Navigation is **not** React Navigation tabs — instead `App.tsx` renders a `PagerView` with tabs lazy-mounted via `display: none` on first visit and kept alive thereafter. The `TABS` array in `App.tsx` defines tab order (Feed, Explore, Reels, Market, Profile). Modals (CreatePost, Notifications, Verification, Legal screens) are overlaid directly in `App.tsx` state.

Authentication state (`session`, `userProfile`, `onboardingDone`) gates which root view renders: auth screens → onboarding navigator → main shell.

### State Management

No Redux or Zustand. State lives in:
- **`App.tsx`** — session, tab state, badge counts, modal visibility
- **`context/ThemeContext.tsx`** — dark/light theme, persisted to AsyncStorage; provides a `colors` semantic token object used everywhere instead of raw hex values
- **`context/PopupContext.tsx`** — sequential global modal queue
- **`context/ToastContext.tsx`** — toast notifications
- Per-screen `useState`/`useRef` for local state

### Backend

**Supabase** is the sole backend (PostgreSQL + Auth + Realtime + Storage). The client is in `lib/supabase.ts` with a custom `SecureStoreAdapter` that chunks tokens >1.5 KB to work around an iOS SecureStore limit.

All database calls go through `services/` — one file per domain (posts, messages, profiles, reels, market, live, notifications, etc.). Screens import from services directly; there is no intermediate data layer.

Real-time subscriptions (notifications badge, message badge, live updates) are set up in `App.tsx` via `supabase.channel()`.

### Styling

**NativeWind 4** (Tailwind for React Native) is the primary styling system. Custom theme tokens are defined in `tailwind.config.js` (indigo palette). Component-level overrides use the `colors` object from `ThemeContext` for dynamic theming.

### Media & Calls

`expo-camera`, `expo-image-picker`, `expo-video`, `expo-audio` handle media capture and playback. Live streaming and video calls use `react-native-webrtc` — this requires native modules and won't work in Expo Go; use a development build.

### Push Notifications

Uses `expo-notifications` (managed workflow — no manual FCM/APNs config needed). Token registration and deep-link routing on notification tap are handled in `App.tsx`.

### Deep Linking

Scheme: `unigram://`. Auth callbacks (`unigram://auth-callback`) and password reset flows are handled via `Linking.addEventListener` in `App.tsx`.

### Key Non-Obvious Decisions

- **Chunked SecureStore**: `lib/supabase.ts` splits large tokens into 1.5 KB chunks with keys like `key_chunk_0`, `key_chunk_1`, etc. Required for Supabase session tokens on iOS.
- **Tab lazy-mount**: Screens are rendered once on first tab visit and hidden with `display:'none'` on switch — avoids remounting but means all mounted tabs receive state updates.
- **Google OAuth**: Falls back to browser-based flow in Expo Go; native `@react-native-google-signin/google-signin` module is used in development/production builds.
- **University detection**: `.edu` / `.ac.` email domain matching plus the Hipolabs universities API during onboarding.
