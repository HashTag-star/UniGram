# Caching & Performance Optimisation — Sprint 2 Report
**Agent:** Ama Mensah — Lead Developer
**Date:** 25 May 2026
**Priority:** Urgent (CEO directive)
**Task:** Wire app-wide caching to all repetitive data access patterns in UniGram

---

## Summary

The `lib/cache.ts` two-tier cache layer (memory + AsyncStorage, stale-while-revalidate) existed but was only wired to `algorithm.ts` and `campusContent.ts`. The four highest-traffic services — `posts.ts`, `profiles.ts`, `market.ts`, and the cache module itself — had no caching at all.

**Every feed load, every profile view, every market browse, and every avatar render was hitting Supabase on every call.** This sprint closes that gap.

---

## Changes Made

### 1. `lib/cache.ts` — New `invalidatePattern()` method

Added prefix-based cache invalidation so write operations can bust entire families of keys in one call (e.g. all `feed:*` keys when a new post is created).

```typescript
invalidatePattern(prefix: string): void {
  for (const key of mem.keys()) {
    if (key.startsWith(prefix)) {
      mem.delete(key);
      AsyncStorage.removeItem(PREFIX + key).catch(() => {});
    }
  }
}
```

---

### 2. `services/posts.ts` — Feed and profile post caching

**`getFeedPosts(limit, offset)`**
- Cache key: `feed:{limit}:{offset}`
- TTL: 2 minutes (`TTL.feed`)
- Pattern: **synchronous memory hit → instant return**, background refresh fires async so the next render gets fresh data
- On hit: returns stale result immediately, revalidates in background (no loading spinner for returning users)

**`getUserPosts(userId)`**
- Cache key: `userposts:{userId}`
- TTL: 5 minutes (`TTL.profile`)
- Pattern: async two-tier lookup (memory → AsyncStorage)

**Cache invalidation wired to all write operations:**
- `createPost` — busts `feed:*` pattern + `userposts:{userId}`
- `updatePost` — busts same (caption/location edits change feed display)
- `deletePost` — busts same (deleted posts must not appear in stale feed)

---

### 3. `services/profiles.ts` — Profile caching

**`getProfile(userId)`**
- Cache key: `profile:{userId}`
- TTL: 5 minutes (`TTL.profile`)
- Pattern: synchronous memory hit for instant avatar/username renders
- Called on every post card, DM header, explore grid card — this was by far the most repeated DB call in the app

**`updateProfile`**
- On success: invalidates old entry + immediately writes the fresh result back to cache so the profile screen reflects changes without a follow-up fetch

---

### 4. `services/market.ts` — Marketplace caching

**`getMarketItems(category, search, limit, offset)`**
- Cache key: `market:{category}:{limit}:{offset}`
- TTL: 3 minutes (`TTL.market`)
- Search queries bypass cache (too many unique combinations; users expect live results)
- Browse without search term: full SWR caching

**`getMyListings(userId)`**
- Cache key: `mylistings:{userId}`
- TTL: 3 minutes

**Cache invalidation wired to:**
- `createMarketItem` — busts `market:*` + `mylistings:{sellerId}`
- `updateMarketItem` — busts `market:*` + `mylistings:{userId}`
- `deleteMarketItem` — busts `market:*` + `mylistings:{userId}`
- `markItemSold` — busts `market:*` + `mylistings:{userId}` (sold items must disappear from browse)

---

## Performance Impact (Estimated)

| Scenario | Before | After |
|---|---|---|
| Feed re-open within 2 min | ~200ms Supabase round-trip | ~0ms (memory hit) |
| Profile card render (already viewed) | ~200ms per unique user | ~0ms (memory hit) |
| Market browse (same filter, paginated) | ~200ms per scroll load | ~0ms within TTL |
| User profile page visit (own grid) | ~300ms (profiles + posts) | ~0ms if recently fetched |
| Supabase DB read volume (estimated) | Baseline | **~60-70% reduction** during active sessions |

The memory tier is synchronous — zero milliseconds for in-session cache hits. The AsyncStorage tier (~5ms) serves cold starts after app kill.

---

## Pre-Existing TypeScript Issues (Not Caused by This Work)

Three TS1002/TS1005 errors exist in functions outside the scope of this sprint:
- `market.ts:284` — in `toggleSaveItem` (unterminated string literal, pre-existing)
- `posts.ts:629` — in `searchPosts` (syntax error, pre-existing)
- `profiles.ts:306` — in `getBlockedUserIds` (pre-existing)

These were present before this sprint. Flagging for Kofi to investigate the encoding issue on those lines.

---

## Cache TTL Reference

| Data type | TTL | Rationale |
|---|---|---|
| Feed posts | 2 min | Posts age quickly, users expect relative freshness |
| User post grid | 5 min | Profile grids change less often |
| Profiles | 5 min | Username/avatar rarely change mid-session |
| Market browse | 3 min | Listings can sell out; medium TTL balances freshness vs. perf |
| Discover / suggestions | 10 min | Social graph changes are infrequent |
| Trending hashtags | 5 min | Changes slowly enough to cache aggressively |

---

## Next Recommended Steps

1. **React.memo audit** — Abena should wrap high-frequency list item components (`FeedPost`, `UserCard`, `MarketCard`) in `React.memo` to prevent re-renders when parent state changes
2. **Image caching** — Replace `<Image>` with `expo-image` (built-in disk + memory cache) across the app for avatar and post media rendering
3. **Supabase select trimming** — Several services use `select('*')` which fetches all columns; switching to named columns reduces payload size
4. **`getSavedItemIds` caching** — Not cached yet; add `savedids:{userId}` with TTL.market once save/unsave invalidation is wired

---

*Report filed by Ama Mensah (Lead Developer) — Hashtechs Tech Department*
*All changes signed with `[Ama Mensah - Lead Dev]` inline comments*
