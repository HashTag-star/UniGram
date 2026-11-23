/**
 * Lightweight network status.
 * Uses @react-native-community/netinfo or expo-network when installed (loaded via
 * dynamic require so the app still builds without them). Otherwise it relies on the
 * app_online / app_offline events emitted by lib/supabase.ts (real reachability).
 */
import { DeviceEventEmitter } from 'react-native';

export interface NetState {
  isOnline: boolean;
  /** Only known when netinfo / expo-network is installed. */
  isCellular: boolean;
}

let state: NetState = { isOnline: true, isCellular: false };
const listeners = new Set<(s: NetState) => void>();

function set(next: Partial<NetState>) {
  const merged = { ...state, ...next };
  if (merged.isOnline === state.isOnline && merged.isCellular === state.isCellular) return;
  state = merged;
  listeners.forEach(l => { try { l(state); } catch {} });
}

DeviceEventEmitter.addListener('app_offline', () => set({ isOnline: false }));
DeviceEventEmitter.addListener('app_online', () => set({ isOnline: true }));

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const NetInfo = require('@react-native-community/netinfo');
  const ni = NetInfo?.default ?? NetInfo;
  ni.addEventListener((s: any) => {
    set({ isOnline: s.isConnected !== false && s.isInternetReachable !== false, isCellular: s.type === 'cellular' });
  });
} catch {
  try {
    const Network = require('expo-network');
    const poll = async () => {
      try {
        const s = await Network.getNetworkStateAsync();
        set({ isOnline: !!s.isConnected && s.isInternetReachable !== false, isCellular: s.type === Network.NetworkStateType?.CELLULAR });
      } catch {}
    };
    poll();
    setInterval(poll, 30_000);
  } catch { /* neither installed — supabase.ts events only */ }
}

export function getNetState(): NetState { return state; }
export function isOnline(): boolean { return state.isOnline; }
export function subscribeNet(l: (s: NetState) => void): () => void {
  listeners.add(l);
  return () => { listeners.delete(l); };
}
