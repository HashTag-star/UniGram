import { useEffect, useMemo, useState } from 'react';
import { getProfile } from '../services/profiles';
import { isProActive } from '../services/pro';
import { getAdPolicy, type AdPolicy } from '../services/adDelivery';
import { usePaywall } from '../context/PaywallContext';

/**
 * The viewer's ad policy, derived from their subscription (real or simulated).
 * The signed-in user comes from the shared PaywallContext, so the policy follows
 * account switches and sign-outs; it also re-evaluates on purchase / cancellation.
 */
export function useAdPolicy(): AdPolicy {
  const { entitlementVersion, userId } = usePaywall();
  const [profile, setProfile] = useState<any>(null);

  // Refetch the real (server) subscription fields whenever the account or the
  // entitlement changes (e.g. just purchased).
  useEffect(() => {
    let alive = true;
    if (!userId) { setProfile(null); return; }
    getProfile(userId)
      .then(p => { if (alive) setProfile(p); })
      .catch(() => {});
    return () => { alive = false; };
  }, [userId, entitlementVersion]);

  // `?? {}` so a simulated (device-local) Pro still counts before the profile loads.
  return useMemo(
    () => getAdPolicy(userId ? isProActive(profile ?? {}) : false),
    [profile, userId, entitlementVersion],
  );
}
