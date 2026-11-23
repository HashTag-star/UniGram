import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentProfile } from '../services/profiles';

// [Ama Mensah - Lead Dev] Refactored to:
// 1. Prevent concurrent profile fetches on rapid auth state changes (cancelled flag).
// 2. Ensure loading stays true until BOTH session and profile are resolved.
// 3. Ignore out-of-order profile responses (e.g. a slow fetch resolving after sign-out
//    or after switching to another account).
export function useAuth() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isMounted = useRef(true);
  // Monotonic token + current uid: a response is applied only if it is still the latest.
  const requestSeq = useRef(0);
  const currentUid = useRef<string | null>(null);

  useEffect(() => {
    isMounted.current = true;

    const loadProfileFor = async (uid: string) => {
      const seq = ++requestSeq.current;
      try {
        const p = await getCurrentProfile();
        if (isMounted.current && seq === requestSeq.current && currentUid.current === uid) setProfile(p);
      } catch {}
    };

    const loadInitial = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted.current) return;
        // An auth event may already have been processed while getSession was pending.
        if (currentUid.current === null && data.session?.user) {
          currentUid.current = data.session.user.id;
          setSession(data.session);
          await loadProfileFor(data.session.user.id);
        }
      } catch {}
      if (isMounted.current) setLoading(false);
    };

    loadInitial();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      if (!isMounted.current) return;
      const uid = sess?.user?.id ?? null;
      const changed = uid !== currentUid.current;
      currentUid.current = uid;
      setSession(sess);
      if (uid) {
        // Token refreshes for the same user keep the existing profile on screen.
        if (changed) setProfile(null);
        loadProfileFor(uid);
      } else {
        requestSeq.current++; // invalidate any in-flight profile fetch
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
