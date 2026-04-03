import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getCurrentProfile } from '../services/profiles';

export function useAuth() {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session?.user) {
        getCurrentProfile().then(setProfile).catch(() => {});
      }
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      if (sess?.user) {
        getCurrentProfile().then(setProfile).catch(() => {});
      } else {
        setProfile(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, profile, loading };
}
