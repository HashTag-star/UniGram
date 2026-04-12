import { supabase } from '../lib/supabase';

export async function saveUserInterests(userId: string, interests: string[]) {
  // Delete old interests
  await supabase.from('user_interests').delete().eq('user_id', userId);
  if (interests.length === 0) return;
  const rows = interests.map(interest => ({ user_id: userId, interest }));
  const { error } = await supabase.from('user_interests').insert(rows);
  if (error) throw error;
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
    supabase.from('follows').select('following_id').eq('follower_id', userId),
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
        const { data: matched } = await supabase
          .rpc('match_contacts', { p_emails: emails.slice(0, 500) })
          .catch(() => ({ data: null }));

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
