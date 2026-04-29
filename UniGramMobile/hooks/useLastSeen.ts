import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { supabase } from '../lib/supabase';

const INTERVAL_MS = 3 * 60 * 1000;

export function useLastSeen(userId: string | null) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ping = async () => {
    if (!userId) return;
    await supabase
      .from('profiles')
      .update({ last_seen: new Date().toISOString() })
      .eq('id', userId);
  };

  useEffect(() => {
    if (!userId) return;
    ping();
    timerRef.current = setInterval(ping, INTERVAL_MS);

    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') ping();
    });

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      sub.remove();
    };
  }, [userId]);
}
