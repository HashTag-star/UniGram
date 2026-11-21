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
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const id = data.session?.user?.id ?? null;
      setUserId(id);
      hydrateSimulatedPro(id).catch(() => {});
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const id = session?.user?.id ?? null;
      setUserId(id);
      hydrateSimulatedPro(id).catch(() => {});
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
    () => ({ openPaywall, closePaywall, requirePro, isPro, entitlementVersion }),
    [openPaywall, closePaywall, requirePro, isPro, entitlementVersion],
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
