import { supabase } from '../lib/supabase';

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
    const { error } = await supabase
      .from('live_comments')
      .insert([{ session_id: sessionId, user_id: userId, text }]);

    if (error) throw error;
  },

  // Increment viewer count
  async joinLive(sessionId: string): Promise<void> {
    await supabase.rpc('increment_viewer_count', { p_session_id: sessionId });
  },

  // Decrement viewer count
  async leaveLive(sessionId: string): Promise<void> {
    await supabase.rpc('decrement_viewer_count', { p_session_id: sessionId });
  },

  // Fetch initial comments for a session
  async getComments(sessionId: string): Promise<LiveComment[]> {
    const { data, error } = await supabase
      .from('live_comments')
      .select(`
        *,
        profiles (username, avatar_url)
      `)
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data as LiveComment[];
  },

  // Subscribe to real-time comments and session changes
  subscribeToLive(
    sessionId: string,
    onComment: (comment: LiveComment) => void,
    onUpdate: (session: Partial<LiveSession>) => void,
    onReaction: (emoji: string) => void
  ) {
    // 1 Postgres Change for Comments
    const commentSub = supabase
      .channel(`live-comments-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'live_comments', filter: `session_id=eq.${sessionId}` },
        async (payload: any) => {
          // Fetch the user's details for the comment (can be optimized but safe for now)
          const { data: userData } = await supabase
            .from('profiles')
            .select('username, avatar_url')
            .eq('id', payload.new.user_id)
            .single();

          onComment({
            ...payload.new,
            profiles: userData
          });
        }
      )
      .subscribe();

    // 2 Broadcast channel for ephemeral reactions (hearts, emojis)
    const reactionChannel = supabase
      .channel(`live-reactions-${sessionId}`)
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        onReaction(payload.emoji);
      })
      .subscribe();

    // 3 Postgres Change for Session status/viewers
    const sessionSub = supabase
      .channel(`live-session-${sessionId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${sessionId}` },
        (payload: any) => {
          onUpdate(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(commentSub);
      supabase.removeChannel(reactionChannel);
      supabase.removeChannel(sessionSub);
    };
  },

  // Broadcast a reaction to all viewers
  async sendReaction(sessionId: string, emoji: string): Promise<void> {
    await supabase.channel(`live-reactions-${sessionId}`).send({
      type: 'broadcast',
      event: 'reaction',
      payload: { emoji },
    });
  }
};
