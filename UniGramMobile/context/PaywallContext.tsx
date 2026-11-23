import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import { supabase } from '../lib/supabase';
import { PaywallSheet } from '../components/PaywallSheet';
import { isProActive } from '../services/pro';
import {
  hydrateSimulatedPro, subscribeSimulatedPro, getSimulatedProVersion,
} from '../services/simulatedPro';
import type { PaywallFeature } from '../services/paywallFeatures';
import { useToast } from './ToastContext';

interface PaywallContextType {
  /** Open the paywall from anywhere. `feature` tailors the headline. */
  openPaywall: (feature?: PaywallFeature) => void;
  closePaywall: () => void;
  /**
   * Run `action` if the user has Pro, otherwise open the paywall for `feature`.
   * Returns true when the action ran.
   */
  requirePro: (profile: any, feature: PaywallFeature, action?: () => void) => boolean;
  /** Pro status for a profile, kept fresh across purchases / cancellations. */
  isPro: (profile: any) => boolean;
  /** Bumps whenever the entitlement changes (use as a re-render key). */
  entitlementVersion: number;
  /** Signed-in user id (null when signed out). Shared source for pro/ad-policy hooks. */
  userId: string | null;
}

const PaywallContext = createContext<PaywallContextType | undefined>(undefined);

export const PaywallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { showToast } = useToast();
  const [visible, setVisible] = useState(false);
  const [feature, setFeature] = useState<PaywallFeature>('general');
  const [userId, setUserId] = useState<string | null>(null);
  const [entitlementVersion, setEntitlementVersion] = useState(getSimulatedProVersion());

  // Track the signed-in user and load their (simulated) subscription.
  useEffect(() => {
    let alive = true;
    // Only react to an actual user change; TOKEN_REFRESHED / USER_UPDATED etc. fire
    // many times per session and must not re-read storage or re-render consumers.
    let lastId: string | null | undefined = undefined;
    const apply = (id: string | null) => {
      if (id === lastId) return;
      lastId = id;
      setUserId(id);
      hydrateSimulatedPro(id).catch(() => {});
    };
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      apply(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      apply(session?.user?.id ?? null);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => subscribeSimulatedPro(() => setEntitlementVersion(getSimulatedProVersion())), []);

  const openPaywall = useCallback((f: PaywallFeature = 'general') => {
    setFeature(f);
    setVisible(true);
  }, []);
  const closePaywall = useCallback(() => setVisible(false), []);

  const isPro = useCallback((profile: any) => isProActive(profile), [entitlementVersion]);

  const requirePro = useCallback((profile: any, f: PaywallFeature, action?: () => void) => {
    if (isProActive(profile)) { action?.(); return true; }
    openPaywall(f);
    return false;
  }, [openPaywall, entitlementVersion]);

  const value = useMemo<PaywallContextType>(
    () => ({ openPaywall, closePaywall, requirePro, isPro, entitlementVersion, userId }),
    [openPaywall, closePaywall, requirePro, isPro, entitlementVersion, userId],
  );

  return (
    <PaywallContext.Provider value={value}>
      {children}
      <PaywallSheet
        visible={visible}
        feature={feature}
        userId={userId}
        onClose={closePaywall}
        onPurchased={() => showToast('Welcome to UniGram Pro!', 'success')}
      />
    </PaywallContext.Provider>
  );
};

export function usePaywall(): PaywallContextType {
  const ctx = useContext(PaywallContext);
  if (!ctx) throw new Error('usePaywall must be used within a PaywallProvider');
  return ctx;
}
