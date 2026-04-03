import { useCallback } from 'react';
import { Platform } from 'react-native';

let Haptics: any = null;

async function loadHaptics() {
  if (!Haptics) {
    try {
      Haptics = await import('expo-haptics');
    } catch {
      // Haptics not available (web/emulator)
    }
  }
  return Haptics;
}

export function useHaptics() {
  const light = useCallback(async () => {
    const h = await loadHaptics();
    if (!h) return;
    try { await h.impactAsync(h.ImpactFeedbackStyle.Light); } catch {}
  }, []);

  const medium = useCallback(async () => {
    const h = await loadHaptics();
    if (!h) return;
    try { await h.impactAsync(h.ImpactFeedbackStyle.Medium); } catch {}
  }, []);

  const heavy = useCallback(async () => {
    const h = await loadHaptics();
    if (!h) return;
    try { await h.impactAsync(h.ImpactFeedbackStyle.Heavy); } catch {}
  }, []);

  const success = useCallback(async () => {
    const h = await loadHaptics();
    if (!h) return;
    try { await h.notificationAsync(h.NotificationFeedbackType.Success); } catch {}
  }, []);

  const error = useCallback(async () => {
    const h = await loadHaptics();
    if (!h) return;
    try { await h.notificationAsync(h.NotificationFeedbackType.Error); } catch {}
  }, []);

  const warning = useCallback(async () => {
    const h = await loadHaptics();
    if (!h) return;
    try { await h.notificationAsync(h.NotificationFeedbackType.Warning); } catch {}
  }, []);

  const selection = useCallback(async () => {
    const h = await loadHaptics();
    if (!h) return;
    try { await h.selectionAsync(); } catch {}
  }, []);

  return { light, medium, heavy, success, error, warning, selection };
}
