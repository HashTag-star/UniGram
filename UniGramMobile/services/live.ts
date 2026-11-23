import { supabase } from '../lib/supabase';
import { cleanUserText } from '../lib/contentSafety';

const activeReactionChannels = new Map<string, ReturnType<typeof supabase.channel>>();
// Commenter profiles seen during live sessions — one lookup per user, not one per comment.
const commenterProfiles = new Map<string, { username: string; avatar_url?: string } | null>();
const LIVE_COMMENTS_PAGE = 100;

export interface LiveSession {
  id: string;
  creator_id: string;
  started_at: string;
  ended_at?: string;
  status: 'live' | 'ended';
  viewer_count: number;
}

export interface LiveComment {
  id: string;
  session_id: string;
  user_id: string;
  text: string;
  created_at: string;
  profiles?: {
    username: string;
    avatar_url?: string;
  };
}

export const LiveService = {
  // Start a new live session
  async startLive(userId: string): Promise<string> {
    const { data, error } = await supabase
      .from('live_sessions')
      .insert([{ creator_id: userId, status: 'live' }])
      .select()
      .single();

    if (error) throw error;
    return data.id;
  },

  // End a live session
  async endLive(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from('live_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) throw error;
  },

  // Post a live comment
  async sendComment(sessionId: string, userId: string, text: string): Promise<void> {
    const sanitized = cleanUserText(text, 'comment');
    const { error } = await supabase
      .from('live_comments')
      .insert([{ session_id: sessionId, user_id: userId, text: sanitized }]);

    if (error) throw error;
  },

  // Increment viewer count
  async joinLive(sessionId: string): Promise<void> {
    const { error } = await supabase.rpc('increment_viewer_count', { p_session_id: sessionId });
    if (error) console.warn('[live] joinLive failed:', error.message);
  },

  // Decrement viewer count
  async leaveLive(sessionId: string): Promise<void> {
    const { error } = await supabase.rpc('decrement_viewer_count', { p_session_id: sessionId });
    if (error) console.warn('[live] leaveLive failed:', error.message);
  },

  // Fetch initial comments for a session
  async getComments(sessionId: string): Promise<LiveComment[]> {
    // Latest N comments (a long stream must not download thousands of rows), oldest-first for display.
    const { data, error } = await supabase
      .from('live_comments')
      .select(`
        id, session_id, user_id, text, created_at,
        profiles (username, avatar_url)
      `)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(LIVE_COMMENTS_PAGE);

    if (error) throw error;
    const rows = ((data ?? []) as any[]).reverse();
    rows.forEach(r => {
      const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
      if (p && r.user_id) commenterProfiles.set(r.user_id, p);
    });
    return rows as LiveComment[];
  },

  // Subscribe to real-time comments and session changes
  subscribeToLive(
    sessionId: string,
    onComment: (comment: LiveComment) => void,
    onUpdate: (session: Partial<LiveSession>) => void,
    onReaction: (emoji: string) => void
  ) {
    let active = true; // unmounted guard: no callbacks after the returned cleanup ran

    // 1 Postgres Change for Comments
    const commentSub = supabase
      .channel(`live-comments-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `session_id=eq.${sessionId}` },
        async (payload: any) => {
          if (!active) return;
          const uid = payload.new.user_id;
          let userData = commenterProfiles.get(uid);
          if (userData === undefined) {
            try {
              const { data } = await supabase
                .from('profiles')
                .select('username, avatar_url')
                .eq('id', uid)
                .maybeSingle();
              userData = data ?? null;
              commenterProfiles.set(uid, userData);
            } catch { userData = null; }
          }
          if (!active) return;

          onComment({
            ...payload.new,
            profiles: userData ?? undefined
          });
        }
      )
      .subscribe();

    // 2 Broadcast channel for ephemeral reactions (hearts, emojis)
    const reactionChannel = supabase
      .channel(`live-reactions-${sessionId}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        if (active) onReaction(payload.emoji);
      })
      .subscribe();
    activeReactionChannels.set(sessionId, reactionChannel);

    // 3 Postgres Change for Session status/viewers
    const sessionSub = supabase
      .channel(`live-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${sessionId}` },
        (payload: any) => {
          if (active) onUpdate(payload.new);
        }
      )
      .subscribe();

    return () => {
      active = false;
      activeReactionChannels.delete(sessionId);
      supabase.removeChannel(commentSub);
      supabase.removeChannel(reactionChannel);
      supabase.removeChannel(sessionSub);
    };
  },

  // Broadcast a reaction to all viewers
  async sendReaction(sessionId: string, emoji: string): Promise<void> {
    const channel = activeReactionChannels.get(sessionId);
    if (!channel) return;
    await channel.send({
      type: 'broadcast',
      event: 'reaction',
      payload: { emoji },
    });
  }
};
