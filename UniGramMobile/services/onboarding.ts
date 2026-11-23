import { supabase } from '../lib/supabase';
import { INTERESTS } from '../data/interests';

export async function saveUserInterests(userId: string, interests: string[]) {
  const unique = Array.from(new Set(interests));
  if (unique.length === 0) {
    const { error } = await supabase.from('user_interests').delete().eq('user_id', userId);
    if (error) throw error;
    return;
  }
  // Insert/upsert FIRST so a failure can never leave the user with zero interests,
  // then prune whatever is no longer selected.
  const rows = unique.map(interest => ({ user_id: userId, interest }));
  const up = await supabase.from('user_interests').upsert(rows, { onConflict: 'user_id,interest' });
  if (up.error) {
    // No unique constraint (or older schema): insert only the rows that are missing.
    const existing = await supabase.from('user_interests').select('interest').eq('user_id', userId);
    if (existing.error) throw existing.error;
    const have = new Set((existing.data ?? []).map((r: any) => r.interest));
    const missing = rows.filter(r => !have.has(r.interest));
    if (missing.length) {
      const ins = await supabase.from('user_interests').insert(missing);
      if (ins.error) throw ins.error;
    }
  }
  const quoted = unique.map(i => `"${String(i).replace(/"/g, '')}"`).join(',');
  const del = await supabase
    .from('user_interests')
    .delete()
    .eq('user_id', userId)
    .not('interest', 'in', `(${quoted})`);
  if (del.error) throw del.error;
}

/**
 * SHA-256 of a normalised email (hex). Needs expo-crypto; returns null when it isn't installed.
 */
async function sha256Hex(input: string): Promise<string | null> {
  try {
    const Crypto = require('expo-crypto');
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
  } catch {
    return null;
  }
}

/**
 * Match device-contact emails against UniGram users.
 * Privacy: raw contact emails are only sent when the hashed RPC is unavailable. Prefers
 * RPC `match_contacts_hashed(p_hashes text[])` (SHA-256 hex of lower-cased emails); falls back to
 * `match_contacts(p_emails text[])`. Capped at 200 entries either way.
 */
export async function matchContactEmails(emails: string[]): Promise<any[] | null> {
  const clean = Array.from(new Set(emails.map(e => e.toLowerCase().trim()).filter(Boolean))).slice(0, 200);
  if (!clean.length) return [];
  try {
    const hashes = (await Promise.all(clean.map(sha256Hex))).filter(Boolean) as string[];
    if (hashes.length === clean.length) {
      const r = await supabase.rpc('match_contacts_hashed', { p_hashes: hashes });
      if (!r.error) return (r.data as any[]) ?? [];
    }
  } catch { /* fall back */ }
  const r = await supabase.rpc('match_contacts', { p_emails: clean });
  if (r.error) return null;
  return (r.data as any[]) ?? [];
}

export async function getUserInterests(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('user_interests')
    .select('interest')
    .eq('user_id', userId);
  return data?.map((r: any) => r.interest) ?? [];
}

export async function completeOnboarding(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_completed: true })
    .eq('id', userId);
  if (error) throw error;

  // Seed user_preferences.affinities with a head-start from selected interests
  // so the feed has personalization signal on day one instead of starting cold.
  const interests = await getUserInterests(userId);
  if (interests.length > 0) {
    const affinities: Record<string, number> = {};
    interests.forEach(interestId => {
      const interest = INTERESTS.find(i => i.id === interestId);
      if (interest?.category) {
        affinities[interest.category] = (affinities[interest.category] ?? 0) + 10;
      }
    });
    try {
      await supabase
        .from('user_preferences')
        .upsert(
          { user_id: userId, affinities, university_affinities: {}, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
    } catch {}
  }
}

export async function isOnboardingComplete(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('onboarding_completed')
    .eq('id', userId)
    .single();
  return data?.onboarding_completed ?? false;
}

export async function getSuggestedUsers(userId: string, limit = 15): Promise<any[]> {
  // Try the scored RPC first (uses mutual follows + university matching)
  try {
    const { data, error } = await supabase.rpc('get_suggested_users', {
      p_user_id: userId,
      p_limit: limit,
    });
    if (!error && data && data.length > 0) return data;
  } catch { /* fall through */ }

  // ── Client-side fallback for new users ────────────────────────────────────────
  // Priority order:
  //   1. Contact matching — device contacts already signed up on UniGram (highest trust)
  //   2. Friends-of-contacts — who those users follow AND who follows them
  //   3. Interest overlap — users sharing selected interests
  //   4. Popular padding — top profiles if the above pools are too thin

  // Fetch own interests + already-following list in parallel
  const [myInterestsData, followingData] = await Promise.all([
    supabase.from('user_interests').select('interest').eq('user_id', userId),
    supabase.from('follows').select('following_id').eq('follower_id', userId).limit(1000),
  ]);

  const myInterestSet = new Set<string>((myInterestsData.data ?? []).map((r: any) => r.interest));
  const excludeIds = new Set<string>((followingData.data ?? []).map((f: any) => f.following_id));
  excludeIds.add(userId);

  // scoreMap: id → { user, score, reason }
  const scoreMap = new Map<string, { user: any; score: number; reason: string }>();

  // ── 1. Contact matching ──────────────────────────────────────────────────────
  // Requires expo-contacts to be installed (`npx expo install expo-contacts`) and
  // a Supabase RPC `match_contacts(p_emails text[])` that joins auth.users with
  // profiles and returns matching profile rows for the given email list.
  let contactMatchedIds: string[] = [];
  try {
    const Contacts = await import('expo-contacts');
    const { status } = await Contacts.getPermissionsAsync();
    if (status === 'granted') {
      const { data: contactList } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails],
      });

      const emails: string[] = [];
      for (const contact of contactList) {
        contact.emails?.forEach((e: any) => {
          if (e.email) emails.push(e.email.toLowerCase().trim());
        });
      }

      if (emails.length > 0) {
        // match_contacts: SELECT p.* FROM auth.users u JOIN profiles p ON p.id = u.id
        //                 WHERE u.email = ANY(p_emails) AND p.id != current_user_id
        let matched: any[] | null = null;
        try {
          // hashed + capped at 200 (see matchContactEmails)
          matched = await matchContactEmails(emails);
        } catch { matched = null; }

        if (matched?.length) {
          contactMatchedIds = (matched as any[]).map((u: any) => u.id);
          (matched as any[]).forEach((u: any) => {
            if (!excludeIds.has(u.id)) {
              scoreMap.set(u.id, {
                user: u,
                score: 100 + Math.log1p(u.followers_count ?? 0),
                reason: 'In your contacts',
              });
            }
          });
        }
      }
    }
  } catch { /* expo-contacts not installed or permission not yet granted */ }

  // ── 2. Friends-of-contacts ───────────────────────────────────────────────────
  // Suggest who contact-matched users follow AND who follows them.
  if (contactMatchedIds.length > 0) {
    const seedIds = contactMatchedIds.slice(0, 30);
    const [theirFollowing, theirFollowers] = await Promise.all([
      supabase.from('follows').select('following_id').in('follower_id', seedIds),
      supabase.from('follows').select('follower_id').in('following_id', seedIds),
    ]);

    const fofIds = new Set<string>([
      ...(theirFollowing.data ?? []).map((r: any) => r.following_id),
      ...(theirFollowers.data ?? []).map((r: any) => r.follower_id),
    ]);

    const freshFofIds = [...fofIds].filter(id => !excludeIds.has(id) && !scoreMap.has(id));
    if (freshFofIds.length > 0) {
      const { data: fofProfiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, is_verified, verification_type, university, major, followers_count')
        .in('id', freshFofIds)
        .eq('is_banned', false)
        .not('username', 'is', null);

      (fofProfiles ?? []).forEach((u: any) => {
        scoreMap.set(u.id, {
          user: u,
          score: 40 + Math.log1p(u.followers_count ?? 0),
          reason: 'Connected to your contacts',
        });
      });
    }
  }

  // ── 3. Interest overlap ──────────────────────────────────────────────────────
  if (myInterestSet.size > 0) {
    const { data: interestMatches } = await supabase
      .from('user_interests')
      .select('user_id, interest')
      .in('interest', [...myInterestSet])
      .neq('user_id', userId)
      .limit(200);

    const overlapCount = new Map<string, number>();
    (interestMatches ?? []).forEach((r: any) => {
      overlapCount.set(r.user_id, (overlapCount.get(r.user_id) ?? 0) + 1);
    });

    const freshInterestIds = [...overlapCount.keys()].filter(id => !excludeIds.has(id) && !scoreMap.has(id));
    if (freshInterestIds.length > 0) {
      const { data: interestProfiles } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, is_verified, verification_type, university, major, followers_count')
        .in('id', freshInterestIds)
        .eq('is_banned', false)
        .not('username', 'is', null);

      (interestProfiles ?? []).forEach((u: any) => {
        const overlap = overlapCount.get(u.id) ?? 1;
        scoreMap.set(u.id, {
          user: u,
          score: overlap * 10 + Math.log1p(u.followers_count ?? 0),
          reason: overlap === 1 ? 'Shares your interest' : `${overlap} shared interests`,
        });
      });
    }
  }

  // ── 4. Popular padding ───────────────────────────────────────────────────────
  if (scoreMap.size < limit) {
    const { data: popular } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, is_verified, verification_type, university, major, followers_count')
      .neq('id', userId)
      .eq('is_banned', false)
      .not('username', 'is', null)
      .order('followers_count', { ascending: false })
      .limit(limit * 2);

    (popular ?? []).forEach((u: any) => {
      if (!excludeIds.has(u.id) && !scoreMap.has(u.id)) {
        scoreMap.set(u.id, {
          user: u,
          score: Math.log1p(u.followers_count ?? 0),
          reason: 'Popular on UniGram',
        });
      }
    });
  }

  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(entry => ({ ...entry.user, mutual_friends: 0, follows_me: false, reason: entry.reason }));
}

export async function updateProfileSetup(userId: string, updates: {
  university?: string;
  major?: string;
  year?: string;
  bio?: string;
  pronouns?: string;
}) {
  const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
  if (error) throw error;
}
