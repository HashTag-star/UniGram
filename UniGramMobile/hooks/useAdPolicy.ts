import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getProfile } from '../services/profiles';
import { isProActive } from '../services/pro';
import { getAdPolicy, type AdPolicy } from '../services/adDelivery';
import { usePaywall } from '../context/PaywallContext';

/**
 * The viewer's ad policy, derived from their subscription (real or simulated).
 * Re-evaluates when they subscribe / cancel.
 */
export function useAdPolicy(): AdPolicy {
  const { entitlementVersion } = usePaywall();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const p = await getProfile(user.id).catch(() => null);
      if (alive) setProfile(p);
    })();
    return () => { alive = false; };
  }, []);

  return useMemo(() => getAdPolicy(isProActive(profile)), [profile, entitlementVersion]);
}
