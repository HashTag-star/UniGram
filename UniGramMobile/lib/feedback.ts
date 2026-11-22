/**
 * One place for how the app FEELS: haptics + UI sounds, mapped to meaning.
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
 * Both haptics and sounds can be turned off in Settings; sounds are also kept
 * quiet and never interrupt media that's already playing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

let Haptics: any = null;
try { Haptics = require('expo-haptics'); } catch {}

let Audio: any = null;
try { Audio = require('expo-audio'); } catch {}

const KEY_SFX = 'ug_pref_sfx';
const KEY_HAPTICS = 'ug_pref_haptics';

let sfxOn = true;
let hapticsOn = true;
let loaded = false;
const listeners = new Set<() => void>();

async function loadPrefs() {
  if (loaded) return;
  loaded = true;
  try {
    const [s, h] = await Promise.all([AsyncStorage.getItem(KEY_SFX), AsyncStorage.getItem(KEY_HAPTICS)]);
    if (s === '0') sfxOn = false;
    if (h === '0') hapticsOn = false;
    listeners.forEach(l => l());
  } catch {}
}
loadPrefs();

export const feedbackPrefs = {
  isSfxOn: () => sfxOn,
  isHapticsOn: () => hapticsOn,
  async setSfx(v: boolean) { sfxOn = v; listeners.forEach(l => l()); try { await AsyncStorage.setItem(KEY_SFX, v ? '1' : '0'); } catch {} },
  async setHaptics(v: boolean) { hapticsOn = v; listeners.forEach(l => l()); try { await AsyncStorage.setItem(KEY_HAPTICS, v ? '1' : '0'); } catch {} },
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
};

// ─── Sounds ───────────────────────────────────────────────────────────────────
type SoundName = 'tap' | 'pop' | 'like' | 'send' | 'receive' | 'success' | 'error' | 'refresh' | 'notify';

const SOURCES: Record<SoundName, any> = {
  tap: require('../assets/sounds/tap.wav'),
  pop: require('../assets/sounds/pop.wav'),
  like: require('../assets/sounds/like.wav'),
  send: require('../assets/sounds/send.wav'),
  receive: require('../assets/sounds/receive.wav'),
  success: require('../assets/sounds/success.wav'),
  error: require('../assets/sounds/error.wav'),
  refresh: require('../assets/sounds/refresh.wav'),
  notify: require('../assets/sounds/notify.wav'),
};
const VOLUME: Partial<Record<SoundName, number>> = { tap: 0.35, pop: 0.5, like: 0.5, send: 0.55, receive: 0.5, success: 0.55, error: 0.5, refresh: 0.45, notify: 0.6 };

const players = new Map<SoundName, any>();
let lastPlayedAt = 0;

function player(name: SoundName) {
  let p = players.get(name);
  if (!p && Audio?.createAudioPlayer) {
    try {
      p = Audio.createAudioPlayer(SOURCES[name]);
      p.volume = VOLUME[name] ?? 0.5;
      players.set(name, p);
    } catch {}
  }
  return p;
}

/** Create the players up-front so the first tap isn't delayed. */
export function warmUpSounds() {
  (Object.keys(SOURCES) as SoundName[]).forEach(player);
}

function play(name: SoundName) {
  if (!sfxOn) return;
  // Don't stack sounds on rapid-fire gestures (e.g. scrubbing, fast taps).
  const now = Date.now();
  if (name === 'tap' && now - lastPlayedAt < 70) return;
  lastPlayedAt = now;
  try {
    const p = player(name);
    if (!p) return;
    p.seekTo(0);
    p.play();
  } catch {}
}

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
  tap() { impact('Light'); play('tap'); },
  /** Haptic only — for very frequent interactions. */
  tick() { selection(); },
  select() { selection(); play('tap'); },
  /** Medium haptic, no sound — for confirmations that aren't a "like". */
  press() { impact('Medium'); },
  like() { impact('Medium'); play('like'); },
  pop() { impact('Soft'); play('pop'); },
  send() { impact('Light'); play('send'); },
  receive() { impact('Soft'); play('receive'); },
  refresh() { impact('Medium'); play('refresh'); },
  notify() { notification('Success'); play('notify'); },
  /** Haptic only — quiet confirmation (toasts etc). */
  confirm() { notification('Success'); },
  success() { notification('Success'); play('success'); },
  warning() { notification('Warning'); },
  error() { notification('Error'); play('error'); },
  heavy() { impact('Heavy'); },
  /** Haptic + sound when the user has explicitly opted out of neither. */
  soundOnly: (n: SoundName) => play(n),
};
