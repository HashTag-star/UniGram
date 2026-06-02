# Abena Owusu — Frontend Developer Report
**Date**: 2026-05-24  
**Scope**: UI components, onboarding steps, auth screens, notifications, discover people

---

## 1. Component Quality Summary

### FeedPost.tsx
**Status: Good — production-quality architecture with a few gaps fixed**

- Large component (~1650 lines) but well-structured with sub-components (`ThreadTextCard`, `ReelVideoLayer`, `VideoPost`, `MediaCarousel`, `FullVideoModal`, `ImageViewerModal`, `PostMetaCycler`).
- Optimistic UI with rollback on all like/save/repost actions — correct.
- `DeviceEventEmitter` pattern for active-post video control avoids re-render cascades — smart.
- `AppState` subscription prevents video playing when app is backgrounded — correct.
- `keyboardShouldPersistTaps` is **absent** on the root but this component is used inside a FlatList managed by the parent screen, so this is acceptable.
- **Fixed**: All 5 action buttons (like, comment, repost, share, save) were missing `accessibilityLabel` and `accessibilityRole`. Added to all. (Lines ~1479–1515, after fix)
- **Issue remaining**: `showShare` state variable is referenced but `setShowShare` is never declared in props or state — this is a bug. The local state `const [showShare, setShowShare] = useState(false)` exists (line 885), confirmed. OK.
- `AIContextCard` renders inside the post card. The isDark check `colors.background === '#000000' || colors.background === '#0f0f0f'` is fragile — should use `isDark` from `useTheme()`. Flag for polish pass.

### CommentSheet.tsx
**Status: Production-ready**

- Uses `@gorhom/bottom-sheet` — correct library choice for keyboard-interactive sheets.
- `keyboardBehavior="interactive"` + `keyboardBlurBehavior="restore"` — properly configured.
- `keyboardShouldPersistTaps="handled"` on `BottomSheetFlatList` — correct.
- `FooterInput` is a stable memo component that owns text state so renderFooter never re-creates — elegant pattern.
- Mention autocomplete with debounce and following-priority sort — well done.
- Loading state: `CommentsSkeleton` shown while loading, `CommentsLoadMoreSkeleton` while paginating — complete.
- Empty state: icon + title + hint — complete.
- Error state: delete/report errors show popup — complete.
- AI highlights panel with loading indicator — complete.

### PostOptionsSheet.tsx
**Status: Partially broken — fixed**

- **Fixed**: List section was a bare `View`, not scrollable. Replaced with `ScrollView` + `keyboardShouldPersistTaps="handled"` so it works on small screens and doesn't clip content.
- **Fixed**: "Add to favorites" and "Unfollow" list items had no `onPress` handlers — they were tappable dead buttons. Added `onPress={onClose}` as a placeholder and commented TODO for product to wire these actions.
- **Fixed**: Added `accessibilityLabel` and `accessibilityRole="button"` to `ActionIcon` and `ListItem` sub-components.
- The `onDelete` prop is typed `(postId: string) => void` but `FeedPost` passes `handleDeletePost` which takes no args — the sheet calls `onDelete?.(post.id)` correctly but the parent's handler ignores the arg. This is a minor prop mismatch; no functional bug.
- The `post` prop is typed `any` — should be typed as `Post` from FeedPost. Flag for Ama (TS pass).

### PremiumPopup.tsx
**Status: Production-ready**

- Clean animation with `scaleAnim` + `opacityAnim` in parallel — good.
- iOS BlurView with correct tint detection — good.
- Multiple button styles (default/cancel/destructive) correctly styled — complete.
- `onRequestClose` wired — Android back button handled.
- `if (!visible && (opacityAnim as any)._value === 0) return null` — accessing `_value` directly is an Animated internal API. This works but is fragile. Should use a `useState(false)` visibility gate instead. Flag for future polish.
- No accessibility labels on buttons — minor issue, buttons use text children so screen readers read the label text naturally.

### ShareSheet.tsx
**Status: Fixed — was using hardcoded dark theme colors**

- **Fixed**: Sheet background was hardcoded `#1c1c1c` — breaks on light theme. Imported `useTheme` and applied `colors.bg` as inline style, removed hardcoded StyleSheet entry.
- **Fixed**: `FlatList` was missing `keyboardShouldPersistTaps="handled"` — tapping a name while keyboard is open would dismiss the keyboard instead of sending to that user.
- Error handling in `handleSend` and `loadConversations` only logs to console — no user-facing error feedback. Flag for product review.
- Empty state: if no conversations exist, FlatList renders empty with no message. Should add a "No conversations yet" empty state.

### RepostSheet.tsx
**Status: Production-ready**

- Two-mode sheet (menu / quote input) — clean UX pattern.
- `KeyboardAvoidingView` wrapping the modal — correct for quote input.
- Loading indicators on all async actions — complete.
- Character count display (500 - quoteText.length) — good.
- `autoFocus` on quote input — correct.

### UsersListSheet.tsx
**Status: Production-ready**

- Loading state with `ActivityIndicator` — complete.
- Empty state with icon + text — complete.
- `fetchedRef` prevents duplicate fetches on re-renders — correct.
- No `keyboardShouldPersistTaps` on FlatList, but this sheet is user-list only (no text input), so not needed.

### Skeleton.tsx
**Status: Production-ready**

- Pulse animation correctly uses `useNativeDriver: true` — smooth.
- Good coverage: FeedPostSkeleton, StorySkeleton, ConvSkeleton, MarketSkeleton, ProfilePostsSkeleton, MessagesSkeleton, CommentsSkeleton, CommentsLoadMoreSkeleton, ProfileHeaderSkeleton, NotificationSkeleton — comprehensive.
- `ProfileHeaderSkeleton` has correct avatar overlap with negative `marginTop` — correct visual approximation.

### VerifiedBadge.tsx
**Status: Production-ready**

- Adapts ring color to `colors.bg` for light/dark theme — correct.
- All 6 verification types have distinct colors — good differentiation.
- `accessibilityLabel` missing but the badge is decorative (parent `TouchableOpacity` has the label in FeedPost) — acceptable.

---

## 2. Onboarding Steps (5/5)

### WelcomeStep.tsx (Step 1)
**Status: Complete**
- Clean animation sequence (logo scale → content fade + slide).
- "Get Started" button is prominent with gradient and shadow.
- Terms notice present.
- No back button needed (first step) — correct.
- No validation needed (no inputs) — correct.

### ProfileSetupStep.tsx (Step 2)
**Status: Complete — good UX**
- University and major use `SearchModal` with debounced search, loading indicator, "Use as typed" option — excellent pattern.
- `keyboardShouldPersistTaps="handled"` on ScrollView — correct.
- `KeyboardAvoidingView` present — correct.
- Pronoun chip selection with custom input fallback — inclusive design.
- Year chip selector — complete.
- Bio field with character counter (150 chars) — complete.
- Required field validation (university + major) with popup — correct.
- Skip button present for optional fields — correct.
- Missing: `ScrollView` on the `SearchModal`'s `FlatList` should have `keyboardShouldPersistTaps="handled"` — it does, on line 109. OK.

### InterestsStep.tsx (Step 3)
**Status: Complete**
- Category filter horizontal scroll — good UX.
- Interest grid with selection state and checkmark overlay — clean.
- Counter badge shows selected count vs minimum required — good real-time feedback.
- Button label dynamically changes: `"Select X more"` vs `"Continue with N interests"` — excellent.
- Minimum 3 interests enforced before proceeding — correct.
- Loading state on submit — present.
- Error popup on failure — present.

### FollowStep.tsx (Step 4)
**Status: Complete**
- Loading state: `ActivityIndicator` with text — present.
- Empty state: icon + explanatory text for early adopters — thoughtful.
- Staggered fade-in animation per user card — polished.
- Follow/unfollow toggle with optimistic UI and service call (fire-and-forget) — correct for onboarding context.
- "Follow N & Continue" button label updates dynamically — nice.
- No error feedback if `getSuggestedUsers` fails (`.catch(() => {})`) — silent failure. Since empty state handles 0 results gracefully, this is acceptable for onboarding.

### PermissionsStep.tsx (Step 5)
**Status: Fixed + Complete**
- Per-permission request with loading indicator — correct.
- "Allow All" button sequences through all un-granted permissions — thoughtful.
- Graceful: if permission denied, offers "Open Settings" — correct.
- Completes onboarding via `completeOnboarding(userId)` with error fallback that still calls `onNext()` — resilient.
- **Fixed**: Button text was `"🎉 Enter UniGram"` — emoji in button text can cause font rendering issues on some Android OEMs (emoji fallback fonts differ by manufacturer). Removed emoji, now reads `"Enter UniGram"`.

---

## 3. Auth Screens

### LoginScreen.tsx
**Status: Production-ready**

- `KeyboardAvoidingView` + `ScrollView` with `keyboardShouldPersistTaps="handled"` — correct and complete.
- `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}` — correct platform split.
- Ban check immediately after login — important security step, correctly implemented.
- `returnKeyType="next"` on email → `returnKeyType="done"` + `onSubmitEditing={handleLogin}` on password — correct keyboard flow.
- Password toggle (show/hide) — present.
- Forgot password flow validates email field first — good UX.
- Loading states on both "Sign in" and "Continue with Google" buttons — complete.
- Feature strip pills at top — good onboarding reminder for returning users.
- Animated entrance sequence — polished.
- `autoCorrect={false}` on both fields — correct.

### SignupScreen.tsx
**Status: Production-ready**

- `keyboardShouldPersistTaps="handled"` on ScrollView — correct.
- Username availability check with debounce (500ms) + visual indicator (green/red border + checkmark/x icon) — excellent UX.
- University email detection from domain with debounce (700ms) — smart, campus-first feature.
- Date of birth with three separate inputs (DD/MM/YYYY) + age validation (13+) — correct.
- Password strength meter (4 levels) — good.
- Terms acceptance checkbox required — correct.
- Google OAuth available — present.
- Error handling for all validation cases before calling the server — correct order.
- Duplicate consent: both an inline checkbox AND a "By creating..." footer text — redundant. The inline checkbox is the functional gate; the footer is purely informational. This is legally safer but visually noisy. Flag for designer review.

---

## 4. NotificationsScreen.tsx
**Status: Fixed + Good**

- Module-level cache (`_cachedNotifs`) with 30s TTL prevents redundant fetches on tab switch — correct for the lazy-mount PagerView architecture.
- Real-time Supabase channel subscription pushes new notifications inline — correct.
- Time-sectioned list (Today / This Week / Earlier) — good UX.
- Dual-avatar display for `follow` type (IG-style overlap) — polished.
- `NotificationSkeleton` shown during initial load — complete.
- Mark all read + individual read on press — complete.
- **Fixed**: `emptyTitle` and `emptySubtitle` styles had hardcoded `rgba(255,255,255,0.5)` and `rgba(255,255,255,0.25)` — breaks on light theme. Moved colors to `colors.textSub` / `colors.textMuted` applied inline.
- Empty state icon + title + subtitle — complete.
- `FlatList` with a single `data={[1]}` item wrapping all sections — unconventional but avoids nested VirtualizedLists. It means the entire notification list renders at once (no virtualisation). For large notification lists this could be a perf issue, but acceptable for current scale.

---

## 5. DiscoverPeopleScreen.tsx
**Status: Fixed + Good**

- `DiscoverSkeleton` shown during initial load — complete.
- `InterestUserCard` includes follow-toggle with optimistic UI, loading indicator, and `SocialSync` event — correct.
- `UserRow` uses `useSocialFollow` hook for cross-screen sync — correct.
- Contact sync with `expo-contacts` — permission requested inline, falls back gracefully.
- **Fixed**: "See all" button in Shared Interests section had no `onPress`. Dead interactive element confuses users. Commented out with TODO for product to wire to a browse screen.
- **Fixed**: "View More Suggestions" button in People You May Know section had no `onPress`. Same issue — commented out with TODO.
- Facebook Friends row calls `warning()` haptic on press — this is a placeholder. The button looks functional but does nothing. Should either be removed or show a "Coming soon" popup. Flag for product.
- `loadData` error only logs to console (`console.warn`) — no user-facing feedback on load failure. Should show empty state or error message.
- "Invite Friends" `Share Link` button has no `onPress` — another dead button. Flag for product.

---

## 6. Issues Found But Not Fixed (Require Product/Designer Decision)

| # | Location | Issue | Severity |
|---|---|---|---|
| 1 | `FeedPost.tsx` line 1521 | `isDark` detection via `colors.background === '#000000'` is fragile; should use `isDark` from `useTheme()` directly | Low |
| 2 | `PremiumPopup.tsx` line 49 | Accessing `(opacityAnim as any)._value` — Animated internal API, will break on future RN versions | Low |
| 3 | `PostOptionsSheet.tsx` | `post` prop typed as `any` — should be `Post` from FeedPost types | Low |
| 4 | `ShareSheet.tsx` | No empty state when user has no conversations | Medium |
| 5 | `ShareSheet.tsx` | No user-facing error if share fails (only `console.error`) | Medium |
| 6 | `DiscoverPeopleScreen.tsx` | "Facebook Friends" button is placeholder — calls `warning()` haptic and does nothing | High |
| 7 | `DiscoverPeopleScreen.tsx` | "Share Link" invite button has no `onPress` | High |
| 8 | `DiscoverPeopleScreen.tsx` | `loadData` failure is silent — no empty/error state shown | Medium |
| 9 | `SignupScreen.tsx` | Duplicate consent text (checkbox + footer paragraph) — redundant, designer should simplify | Low |
| 10 | `PostOptionsSheet.tsx` | "Add to favorites" and "Unfollow" are not wired to any service calls | High |
| 11 | `NotificationsScreen.tsx` | Full notification list rendered in a single FlatList item — no virtualisation | Low |
| 12 | `FeedPost.tsx` | No `accessibilityRole` on avatar `TouchableOpacity` (navigates to profile) | Low |

---

## 7. Changes Made (File List)

| File | Change |
|---|---|
| `components/FeedPost.tsx` | Added `accessibilityLabel` + `accessibilityRole="button"` to all 5 action buttons |
| `components/PostOptionsSheet.tsx` | Converted bare `View` list to `ScrollView` + `keyboardShouldPersistTaps`; added placeholder `onPress` to dead items; added `accessibilityLabel`/`accessibilityRole` to `ActionIcon` and `ListItem` |
| `components/ShareSheet.tsx` | Imported `useTheme`; replaced hardcoded `#1c1c1c` sheet background with `colors.bg`; added `keyboardShouldPersistTaps="handled"` to FlatList |
| `screens/NotificationsScreen.tsx` | Moved hardcoded white-alpha empty state colors to `colors.textSub` / `colors.textMuted` theme tokens |
| `screens/DiscoverPeopleScreen.tsx` | Commented out dead "See all" and "View More Suggestions" buttons with TODOs |
| `screens/onboarding/steps/PermissionsStep.tsx` | Removed emoji from "Enter UniGram" button text |

---

*Report authored by Abena Owusu, Frontend Developer — UniGram Engineering*  
*2026-05-24*
