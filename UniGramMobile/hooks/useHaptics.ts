import { useMemo } from 'react';
import { fx } from '../lib/feedback';

/**
 * Haptic feedback hook. Kept for the ~25 existing call sites; it now routes through
 * lib/feedback so the Settings "Haptics" switch applies everywhere, and the
 * previously mislabelled intensities are corrected:
 *   light = subtle tap, medium = confirm, heavy = emphasis.
 */
const haptics = {
  light: () => { fx.tick(); },
  medium: () => { fx.press(); },
  heavy: () => { fx.heavy(); },
  success: () => { fx.success(); },
  error: () => { fx.error(); },
  warning: () => { fx.warning(); },
  selection: () => { fx.select(); },
};

export function useHaptics() {
  // Stable identity: callers put this object in effect deps.
  return useMemo(() => haptics, []);
}
