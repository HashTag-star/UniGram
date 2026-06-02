# Kwame Darko — DevOps & Release Engineer
## Agent Report | 2026-05-24

---

## Summary

I reviewed all build configuration files, deployment documentation, and environment setup for UniGram. The app's native config (`app.json`) is production-ready. The build pipeline (`eas.json`) is structurally sound but had one critical bug. The dev toolchain config (babel, metro, tailwind) is correctly set up for NativeWind 4. Seven blockers stand between UniGram and a successful store submission — all are documented below with specific remediation steps.

---

## Files Reviewed

| File | Status |
|------|--------|
| `CLAUDE.md` | Read — context loaded |
| `DEPLOYMENT.md` | Read — comprehensive, well-written |
| `app.json` | Read — production-ready |
| `eas.json` | Read — **bug fixed** (see below) |
| `.env.example` | Read — complete and accurate |
| `.eas/workflows/create-production-builds.yml` | Read — valid, no issues |
| `.eas/workflows/publish-preview-update.yml` | Read — valid, no issues |
| `package.json` | Read — build scripts match eas.json profiles |
| `babel.config.js` | Read — correctly configured for NativeWind 4 |
| `tailwind.config.js` | Read — correctly configured for NativeWind 4 |
| `metro.config.js` | Read — correctly configured with NativeWind and Reanimated workaround |
| `.gitignore` | Read — updated (see below) |

---

## app.json Assessment

**Status: Production-ready with no changes needed.**

- Bundle ID: `com.unigram.mobile` — correct on both iOS and Android
- EAS project ID: `b08e2c74-68d1-4e72-94ac-a92750902d6a` — present and correct
- EAS owner: `heis_hashtag` — present and correct
- OTA updates URL: `https://u.expo.dev/b08e2c74-68d1-4e72-94ac-a92750902d6a` — correct
- Runtime version: `1.0.0` — matches app version, correct for first launch
- `newArchEnabled: true` — correct for Expo 54 / RN 0.81
- All iOS `infoPlist` permission strings: present and accurate
- All Android permissions: comprehensive, correct for camera/media/location/notifications
- `ITSAppUsesNonExemptEncryption: false` — correct, avoids French export compliance
- `supportsTablet: false` — intentional (no iPad support, removes iPad screenshot requirement)
- `googleServicesFile: "./google-services.json"` — path correct; file itself is missing (blocker)
- All plugins listed: complete and correct

---

## eas.json Assessment

**Status: One critical bug found and fixed.**

### Bug Fixed: `serviceAccountKeyPath` Conflict

**Before (broken)**:
```json
"android": {
  "serviceAccountKeyPath": "./google-services.json",
  "track": "production"
}
```

**After (fixed)**:
```json
"android": {
  "serviceAccountKeyPath": "./google-play-service-account.json",
  "track": "production"
}
```

**Root cause**: `google-services.json` is the Firebase/FCM config file referenced in `app.json → android.googleServicesFile`. It is not a Google Play service account key. Using it as a submission credential would cause `eas submit` to fail with an invalid credentials error. The Play Store submission requires a separate IAM service account JSON downloaded from Google Cloud Console with the `Release Manager` role on the Play Console project.

**Additional fix**: Added `google-play-service-account.json` to `.gitignore` to ensure the service account key is never committed.

### Other eas.json Observations

- `cli.version >= 10.0.0` — appropriate minimum, consistent with DEPLOYMENT.md
- `cli.appVersionSource: "remote"` — correct for `autoIncrement: true` on production builds
- `development` profile: APK build type, internal distribution, dev client — correct
- `preview` profile: APK build type, internal distribution — correct
- `production` profile: `autoIncrement: true`, no explicit build type (defaults to AAB for Android, IPA for iOS) — correct
- `submit.production.ios`: credentials are still placeholder values (`REPLACE_WITH_*`) — these must be filled in before `eas submit` can run
- `channel` values (`development`, `preview`, `production`) are consistent across build profiles

---

## package.json Build Scripts Assessment

**Status: All scripts correctly match eas.json profiles.**

| Script | Command | Matches eas.json |
|--------|---------|-----------------|
| `build:android` | `eas build --platform android --profile production` | ✅ |
| `build:ios` | `eas build --platform ios --profile production` | ✅ |
| `build:preview` | `eas build --platform all --profile preview` | ✅ |
| `build:dev` | `eas build --platform android --profile development` | ✅ |
| `submit:android` | `eas submit --platform android` | ✅ (uses default production profile) |
| `submit:ios` | `eas submit --platform ios` | ✅ (uses default production profile) |

Note: `submit:android` and `submit:ios` don't specify `--profile production` explicitly but EAS defaults to the production submit profile, which is correct.

---

## babel.config.js Assessment

**Status: Correctly configured for NativeWind 4.**

```js
presets: [
  ["babel-preset-expo", { jsxImportSource: "nativewind" }],
  "nativewind/babel",
]
```

This is the exact configuration required by NativeWind 4. The `jsxImportSource: "nativewind"` sets up CSS class prop support, and `nativewind/babel` handles the Tailwind class transformation. No changes needed.

---

## tailwind.config.js Assessment

**Status: Correctly configured for NativeWind 4.**

- Uses `require("nativewind/preset")` — correct for NativeWind 4 (v3 used `nativewind/tailwind/native`)
- Content paths cover `App.tsx`, `app/`, `screens/`, `components/` — appropriate for this project structure
- Custom indigo color palette extends the defaults correctly
- No issues found.

---

## metro.config.js Assessment

**Status: Correct with intentional workarounds.**

The custom `resolveRequest` for `react-native-reanimated` (pointing to pre-compiled build) and `event-target-shim/index` (WebRTC dependency fix) are necessary workarounds for known compatibility issues with Reanimated 4.x and NativeWind's CSS interop. These are correct and should not be removed.

`withNativeWind(config, { input: "./global.css" })` is the correct NativeWind 4 metro integration.

---

## EAS Workflow Files Assessment

**Status: Both workflows are valid. Minor observation on production workflow.**

### `create-production-builds.yml`
The workflow does not specify a `profile` parameter. By default, EAS workflow build jobs use the `production` profile — this is correct behavior but should be made explicit to avoid ambiguity if more profiles are added later. This is a recommendation, not a blocker.

### `publish-preview-update.yml`
Correctly triggers on any branch push and uses the branch name as the update channel. `${{ github.ref_name || 'test' }}` fallback is appropriate.

---

## .env.example Assessment

**Status: Complete and accurate.**

Contains all required client-side environment variables:
- Supabase URL and anon key
- TURN server config (4 variables for WebRTC live streaming)
- Paystack configuration comment (correctly notes it's a Supabase Edge Function secret, not an Expo env var)

The `.env.example` correctly uses `EXPO_PUBLIC_` prefix for all client-accessible variables, which is required by Expo's env var security model.

---

## Pre-Launch Blockers (7 items)

### BLOCKER 1 — `google-services.json` is missing
**Impact**: Android build will fail.  
**Fix**: Create a Firebase project at https://console.firebase.google.com, add Android app with package `com.unigram.mobile`, download `google-services.json`, place at project root.

### BLOCKER 2 — Apple credentials are placeholders in eas.json
**Impact**: `eas submit --platform ios` will fail.  
**Fix**: Fill in `appleId`, `ascAppId`, and `appleTeamId` in `eas.json → submit.production.ios` with real values from Apple Developer account.

### BLOCKER 3 — `EXPO_PUBLIC_SUPABASE_ANON_KEY` not set for EAS builds
**Impact**: Production builds will have no Supabase anon key; all API calls will fail.  
**Fix**: `eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "real_key_here"`

### BLOCKER 4 — Play Store service account JSON doesn't exist yet
**Impact**: `eas submit --platform android` will fail (file not found at `./google-play-service-account.json`).  
**Fix**: Create service account in Google Cloud Console with Release Manager role, download JSON, save as `./google-play-service-account.json`.

### BLOCKER 5 — Migration `003_advanced_algorithm.sql` status unknown
**Impact**: Advanced feed algorithm may not function correctly in production.  
**Fix**: Verify in Supabase SQL Editor whether the migration's objects exist; re-run if missing.

### BLOCKER 6 — App Store Connect listing not created
**Impact**: iOS submission will fail with "app not found in App Store Connect".  
**Fix**: Create the app in App Store Connect at https://appstoreconnect.apple.com before attempting iOS submission.

### BLOCKER 7 — Google Play Console listing not created
**Impact**: Android submission will fail; Play Console requires an app to exist before uploading AAB.  
**Fix**: Create the app in Google Play Console, complete store listing, and set up release track before submitting.

---

## Recommendations (Non-Blocking)

1. **Add `--profile production` to submit scripts** in `package.json` for explicitness:
   ```json
   "submit:android": "eas submit --platform android --profile production",
   "submit:ios": "eas submit --platform ios --profile production"
   ```

2. **Add explicit profile to `create-production-builds.yml`** to future-proof the workflow:
   ```yaml
   params:
     platform: android
     profile: production
   ```

3. **Set up TURN server before first test of live/video call features** — the TURN variables in `.env.example` are well documented but the actual server needs to be provisioned (Metered.ca free tier is sufficient for initial testing).

4. **Consider adding `EXPO_PUBLIC_SUPABASE_ANON_KEY` as a build-time env variable** in `eas.json → build.production.env` rather than (or in addition to) an EAS secret, as a fallback.

5. **`preview-apk` and `preview-apk-optimized` profiles** in `eas.json` are valid but redundant with the main `preview` profile (which already specifies APK). These can be cleaned up after launch.

---

## Files Modified

| File | Change |
|------|--------|
| `eas.json` | Fixed `serviceAccountKeyPath` from `./google-services.json` to `./google-play-service-account.json` |
| `.gitignore` | Added `google-play-service-account.json` entry |
| `AGENT_REPORTS/kwame_launch_checklist.md` | Created — comprehensive step-by-step launch checklist |
| `AGENT_REPORTS/kwame_report.md` | Created — this report |

---

## Deliverables

- **Launch Checklist**: `AGENT_REPORTS/kwame_launch_checklist.md` — 9-phase checklist covering all steps from account setup through post-launch monitoring, with real commands and URLs
- **Bug Fix**: `eas.json` — `serviceAccountKeyPath` corrected
- **Security Fix**: `.gitignore` — Play Store service account key protected from accidental commit

---

*Kwame Darko — DevOps & Release Engineer*  
*UniGram Engineering Team | 2026-05-24*  
*// [Kwame Darko - DevOps]*
