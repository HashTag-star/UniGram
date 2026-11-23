import { supabase } from '../lib/supabase';

export interface CampusEvent {
  id: string;
  creator_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  image_url: string | null;
  university: string | null;
  going_count: number;
  interested_count: number;
  my_rsvp: 'going' | 'interested' | null;
  creator?: { username: string; avatar_url: string | null } | null;
}

export type EventsResult = { events: CampusEvent[]; unavailable: boolean };

/** Upcoming events. `unavailable` is true when the table is missing so the UI can show a friendly empty state. */
export async function getUpcomingEvents(university?: string | null): Promise<EventsResult> {
  const { data: { user } } = await supabase.auth.getUser();
  let q = supabase.from('events').select('*').gte('starts_at', new Date(Date.now() - 3 * 3600_000).toISOString()).order('starts_at', { ascending: true }).limit(50);
  if (university) q = q.or(`university.eq.${university.replace(/[,()]/g, ' ')},university.is.null`);
  const { data, error } = await q;
  if (error) return { events: [], unavailable: true };
  const rows = data ?? [];
  if (!rows.length) return { events: [], unavailable: false };
  const ids = rows.map((r: any) => r.id);
  const [{ data: rsvps }, { data: creators }] = await Promise.all([
    supabase.from('event_rsvps').select('event_id, user_id, status').in('event_id', ids),
    supabase.from('profiles').select('id, username, avatar_url').in('id', Array.from(new Set(rows.map((r: any) => r.creator_id)))),
  ]);
  const cmap = new Map((creators ?? []).map((c: any) => [c.id, c]));
  return {
    unavailable: false,
    events: rows.map((r: any) => {
      const rs = (rsvps ?? []).filter((x: any) => x.event_id === r.id);
      return {
        ...r,
        going_count: rs.filter((x: any) => x.status === 'going').length,
        interested_count: rs.filter((x: any) => x.status === 'interested').length,
        my_rsvp: (rs.find((x: any) => x.user_id === user?.id)?.status as any) ?? null,
        creator: (cmap.get(r.creator_id) as any) ?? null,
      } as CampusEvent;
    }),
  };
}

export async function setRsvp(eventId: string, status: 'going' | 'interested' | null): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  if (status === null) {
    const { error } = await supabase.from('event_rsvps').delete().eq('event_id', eventId).eq('user_id', user.id);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from('event_rsvps').upsert({ event_id: eventId, user_id: user.id, status }, { onConflict: 'event_id,user_id' });
  if (error) throw error;
}

export async function createEvent(input: { title: string; description?: string; location?: string; starts_at: string; image_url?: string | null; university?: string | null }): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  const title = input.title.trim();
  if (!title) throw new Error('Add a title');
  const { error } = await supabase.from('events').insert({
    creator_id: user.id,
    title: title.slice(0, 120),
    description: input.description?.trim().slice(0, 1000) || null,
    location: input.location?.trim().slice(0, 160) || null,
    starts_at: input.starts_at,
    image_url: input.image_url ?? null,
    university: input.university ?? null,
  });
  if (error) throw error;
}

export async function deleteEvent(id: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('id', id);
  if (error) throw error;
}
