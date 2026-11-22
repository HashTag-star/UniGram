/**
 * One place for how the app FEELS: haptics, mapped to meaning.
 *
 *   fx.tap()      – any ordinary button press (barely-there tick)
 *   fx.select()   – switching tabs / segments / toggles
 *   fx.like()     – liking, hearting, reacting
 *   fx.pop()      – follow, save, bookmark, add
 *   fx.send()     – message / comment / post sent
 *   fx.receive()  – message arrives while you're looking
 *   fx.refresh()  – pull-to-refresh trigger
 *   fx.notify()   – a new notification arrives
 *   fx.success()/fx.warning()/fx.error() – outcomes
 *
 * Haptics can be turned off in Settings. (There are deliberately no UI sounds.)
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

let Haptics: any = null;
try { Haptics = require('expo-haptics'); } catch {}

const KEY_HAPTICS = 'ug_pref_haptics';

let hapticsOn = true;
let loaded = false;
const listeners = new Set<() => void>();

async function loadPrefs() {
  if (loaded) return;
  loaded = true;
  try {
    const h = await AsyncStorage.getItem(KEY_HAPTICS);
    if (h === '0') hapticsOn = false;
    listeners.forEach(l => l());
  } catch {}
}
loadPrefs();

export const feedbackPrefs = {
  isHapticsOn: () => hapticsOn,
  async setHaptics(v: boolean) { hapticsOn = v; listeners.forEach(l => l()); try { await AsyncStorage.setItem(KEY_HAPTICS, v ? '1' : '0'); } catch {} },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

// ─── Haptics ──────────────────────────────────────────────────────────────────
function impact(style: 'Light' | 'Medium' | 'Heavy' | 'Soft' | 'Rigid') {
  if (!hapticsOn || !Haptics) return;
  try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle[style]); } catch {}
}
function notification(kind: 'Success' | 'Warning' | 'Error') {
  if (!hapticsOn || !Haptics) return;
  try { Haptics.notificationAsync(Haptics.NotificationFeedbackType[kind]); } catch {}
}
function selection() {
  if (!hapticsOn || !Haptics) return;
  try { Haptics.selectionAsync(); } catch {}
}

// ─── Semantic API ─────────────────────────────────────────────────────────────
export const fx = {
  tap() { impact('Light');; },
  /** Haptic only — for very frequent interactions. */
  tick() { selection(); },
  select() { selection();; },
  /** Medium haptic, no sound — for confirmations that aren't a "like". */
  press() { impact('Medium'); },
  like() { impact('Medium');; },
  pop() { impact('Soft');; },
  send() { impact('Light');; },
  receive() { impact('Soft');; },
  refresh() { impact('Medium');; },
  notify() { notification('Success');; },
  /** Haptic only — quiet confirmation (toasts etc). */
  confirm() { notification('Success'); },
  success() { notification('Success');; },
  warning() { notification('Warning'); },
  error() { notification('Error');; },
  heavy() { impact('Heavy'); },
};

/** Kept so existing imports keep working; there are no sounds to preload. */
export function warmUpSounds() {}
