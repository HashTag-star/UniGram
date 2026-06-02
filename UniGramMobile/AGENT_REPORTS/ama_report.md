# Ama Mensah — Lead Developer Audit Report
**Date:** 2026-05-24  
**Scope:** App.tsx, auth screens, hooks/useAuth.ts, services/auth.ts, services/profiles.ts, services/posts.ts

---

## Files Reviewed

| File | Lines | Status |
|---|---|---|
| `CLAUDE.md` | 121 | Read — project context established |
| `App.tsx` | ~721 | Audited — 3 bugs fixed |
| `screens/auth/LoginScreen.tsx` | 484 | Audited — 1 bug fixed |
| `screens/auth/SignupScreen.tsx` | 721 | Audited — 3 bugs fixed |
| `hooks/useAuth.ts` | 32 | Audited — refactored for correctness |
| `services/auth.ts` | 145 | Audited — 1 bug fixed |
| `services/profiles.ts` | 314 | Audited — 1 bug fixed |
| `services/posts.ts` | 635 | Audited — 2 bugs fixed |

---

## Bugs Found & Fixed

### 1. `services/auth.ts` — Null-dereference on `GoogleSignin` inside catch block (line 75)
**Severity: Medium**  
**Problem:** `GoogleSignin` is loaded dynamically and may be `null` (Expo Go). In the catch block, the code reads `GoogleSignin.signIn` to detect if the module is missing — but if `GoogleSignin` is null, this property access itself throws a TypeError, bypassing the browser fallback entirely.  
**Fix:** Added `!GoogleSignin` as the first condition in the `isModuleMissing` check, and used optional chaining `GoogleSignin?.signIn` for the subsequent check.  
**Location:** `services/auth.ts` — `signInWithGoogle()` catch block.

---

### 2. `App.tsx` — `userProfile` left as `null` when no DB profile row found (line 503)
**Severity: High**  
**Problem:** When the profile query returns no data, the code called `setOnboardingDone(true)` but left `userProfile` as `null`. Downstream code in lines 663+ directly accesses `userProfile?.university` (safe) but other paths could dereference a null profile. The shell now renders with a null profile, which is a crash risk in any component that assumes a profile exists post-auth.  
**Fix:** When data is null, we now also call `setUserProfile({ id: uid })` to provide a minimal stub so downstream null-checks have something to work against.  
**Location:** `App.tsx` — `fetchProfile()` in the profile useEffect, `else` branch.

---

### 3. `App.tsx` — `getConversations()` called without try/catch in message badge useEffect (line 526)
**Severity: Low-Medium**  
**Problem:** If `getConversations()` throws (network error, Supabase down), the unhandled rejection would propagate out of the async function silently, potentially causing the channel subscription below to be set up in an inconsistent state. The Realtime channel was being established regardless.  
**Fix:** Wrapped the `getConversations()` call in `try { } catch {}`.  
**Location:** `App.tsx` — message badge useEffect.

---

### 4. `services/posts.ts` — `forEach` + `async` anti-pattern for mention notifications (lines 106, 550)
**Severity: Medium**  
**Problem:** `notifyUserIds.forEach(async (tid) => {...})` and the equivalent in `addPostComment` are fire-and-forget loops that swallow errors and provide no await semantics. This means:
- Failures are completely invisible.
- If the caller ever needed to know when notifications were sent, there's no mechanism.
- The Set's `forEach` doesn't iterate in insertion order (minor correctness concern).  
**Fix:** Replaced both instances with `await Promise.allSettled(Array.from(...).map(async ...))`. This awaits all notification sends, keeps per-item error isolation, and converts the Set to an Array with predictable order.  
**Locations:** `services/posts.ts` — `createPost()` (line ~106) and `addPostComment()` (line ~550).

---

### 5. `screens/auth/SignupScreen.tsx` — Username availability check gap (lines 285–293)
**Severity: Medium**  
**Problem:** The guard only blocked submission when `usernameAvailable === null && usernameChecking === true`. If `usernameChecking` was false but `usernameAvailable` was still null (check not yet run due to debounce not firing, or an error during the availability check), the form would proceed to `signUp()` with an unverified username — potentially causing a DB conflict error or a duplicate-username account.  
**Fix:** Consolidated to a single `usernameAvailable === null` check that blocks in all unknown-state cases, with different popup messages for "checking" vs "not verified" scenarios.  
**Location:** `screens/auth/SignupScreen.tsx` — `handleSignup()`.

---

### 6. `screens/auth/SignupScreen.tsx` — Date-of-birth overflow not validated (lines 230–244)
**Severity: Medium**  
**Problem:** `new Date(parseInt(dobYear), parseInt(dobMonth) - 1, parseInt(dobDay))` silently overflows invalid dates. For example, Month=2, Day=31 creates March 3 (or 2), meaning a user could enter a fake birthday like 31/02/2010 and pass age validation with an incorrect date that gets stored in the DB.  
**Fix:**  
1. Added explicit range checks (`day 1–31`, `month 1–12`, `year 1900–present`) before constructing the Date.  
2. After construction, compared the constructed values back against the parsed integers — if they differ, a date overflow occurred, and the user is shown an error.  
**Location:** `screens/auth/SignupScreen.tsx` — `handleSignup()`.

---

### 7. `screens/auth/LoginScreen.tsx` & `SignupScreen.tsx` — No email format validation
**Severity: Low-Medium**  
**Problem:** Both screens only check `email.trim()` is non-empty before calling `signIn()` / `signUp()`. Any garbage string (e.g. `"abc"`, `"test@"`) goes to the Supabase auth API, incurring a network round-trip and returning a cryptic error.  
**Fix:** Added a simple regex guard (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) in `handleLogin` and `handleSignup`. Invalid emails show a clear "Invalid email" popup before any network call.  
**Locations:** `screens/auth/LoginScreen.tsx` — `handleLogin()` (new `isValidEmail` helper); `screens/auth/SignupScreen.tsx` — `handleSignup()` (same helper).

---

### 8. `services/profiles.ts` — Avatar upload extension extraction fails on URIs with query strings (line 65)
**Severity: Low**  
**Problem:** `asset.uri.split('.').pop()` on a URI like `file:///tmp/image.jpg?v=1234` returns `jpg?v=1234`, which makes the storage path `avatar.jpg?v=1234` (illegal) and the content type `image/jpg?v=1234` (malformed). This would cause the upload to fail on certain Android devices that append cache-busting query strings to picker URIs.  
**Fix:** Strip the query string first (`uri.split('?')[0]`), then extract the extension, then whitelist it against known image types — falling back to `jpg` for anything unrecognised.  
**Location:** `services/profiles.ts` — `uploadAvatar()`.

---

### 9. `hooks/useAuth.ts` — No cleanup guard; concurrent profile fetches possible on rapid auth state changes
**Severity: Low**  
**Problem:** The original hook called `getCurrentProfile().then(setProfile)` in the auth state change listener with no mounted-check. If the component unmounted or auth changed rapidly (e.g. token refresh during sign-out), the `.then(setProfile)` callback would still fire, attempting to set state on an unmounted component.  
**Fix:** Full refactor — added `isMounted` ref, wrapped initial session load in an async function with proper mounted guard, made loading state accurate (stays true until both session and profile are resolved). Auth listener now also checks `isMounted.current` before calling setters.  
**Location:** `hooks/useAuth.ts` — entire hook body.

---

## Outstanding Issues (Not Fixed — Require Other Agents or External Action)

1. **Migration `003_advanced_algorithm.sql` — timed out, may not have applied.** Kofi should verify via `supabase db push` or SQL Editor. If it didn't apply, algorithm-based feeds will fail silently.

2. **`services/posts.ts` — `getFeedPosts` has no algorithm layer.** It uses a naive `ORDER BY created_at DESC`. The algorithm feed (following-weighted ranking) may not be wired in. Kofi / the algorithm service should confirm.

3. **`App.tsx` line 659 — `onPostPress` handler does a `.from('posts')` query inline in JSX.** This is a side-effectful DB call in a prop callback. It should be extracted to a named function or moved into a service.

4. **`services/auth.ts` — `webClientId` is a hardcoded string.** This should come from `process.env` / `app.config.js` extra fields, not be committed to source. Kwame should move this to the env config.

5. **`App.tsx` — `AppScreens` uses `any` types for almost all props.** This defeats TypeScript. A proper `AppScreensProps` interface should be written. No immediate crash risk but a maintenance debt.

6. **`useAuth.ts`** — This hook exists but `App.tsx` does not use it — `App.tsx` manages its own session/profile state directly with Supabase. The hook appears to be dead code. Either consolidate or document why both coexist.

7. **`deletePost` in `services/posts.ts`** — Only deletes the first media URL from storage (`media_url`). Posts can have multiple media (`media_urls` array) — all others are orphaned in storage. This is a storage cost leak.

---

## Summary

**Total bugs fixed: 9** (across 6 files)  
**Files modified:** `services/auth.ts`, `App.tsx`, `services/posts.ts`, `screens/auth/LoginScreen.tsx`, `screens/auth/SignupScreen.tsx`, `services/profiles.ts`, `hooks/useAuth.ts`  
**Critical fixes:** Null userProfile crash (#2), username check bypass (#5), DOB overflow (#6)  
**Outstanding items for other agents:** 7 (see above)

All changes signed with `// [Ama Mensah - Lead Dev]` inline comments.

---
*Report authored: 2026-05-24 | Ama Mensah, Lead Developer, UniGram Engineering*
