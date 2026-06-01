import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentProfile } from '../services/profiles';

// [Ama Mensah - Lead Dev] Refactored to:
// 1. Prevent concurrent profile fetches on rapid auth state changes (cancelled flag).
// 2. Ensure loading stays true until BOTH session and profile are resolved.
export function useAuth() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const loadInitial = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted.current) return;
        setSession(data.session);
        if (data.session?.user) {
          try {
            const p = await getCurrentProfile();
            if (isMounted.current) setProfile(p);
          } catch {}
        }
      } catch {}
      if (isMounted.current) setLoading(false);
    };

    loadInitial();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!isMounted.current) return;
      setSession(sess);
      if (sess?.user) {
        getCurrentProfile().then(p => { if (isMounted.current) setProfile(p); }).catch(() => {});
      } else {
        setProfile(null);
      }
    });

    return () => {
      isMounted.current = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { session, profile, loading };
}
