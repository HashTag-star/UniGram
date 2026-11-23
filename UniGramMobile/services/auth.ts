import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { resetSessionState } from '../lib/sessionCleanup';
import { unregisterPushTokens } from './pushNotifications';

// Dynamic require to prevent crashes in Expo Go (Non-native environments)
// [Ama Mensah - Lead Dev] webClientId now sourced from env; fall back to the
// hardcoded production value so existing builds keep working if the env var
// is unset (e.g. local dev that hasn't copied .env.example).
const GOOGLE_WEB_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  '679547157570-boeo81q3q6rabecqrjorg9l7um5su2ta.apps.googleusercontent.com';
let GoogleSignin: any = null;
try {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: true,
  });
} catch (e) {
  console.log('GoogleSignin not available in this environment (likely Expo Go). Falling back to browser OAuth.');
}

WebBrowser.maybeCompleteAuthSession();

export async function checkUsernameAvailable(username: string): Promise<boolean> {
  if (!username || username.length < 3) return false;
  const clean = username.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .eq('username', clean)
    .maybeSingle();
  return !data;
}

export async function signUp(email: string, password: string, username: string, fullName: string, dob: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, full_name: fullName, date_of_birth: dob },
      emailRedirectTo: 'unigram://auth-callback',
    },
  });
  if (error) throw error;
  return data;
}

export function isUniversityEmail(email: string) {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return domain.endsWith('.edu.gh') || domain.endsWith('.ac.gh');
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithGoogle(): Promise<'success' | 'cancelled'> {
  // 1. Attempt Native Flow
  try {
    // Check if the native module is actually registered
    // On some environments, simply accessing these methods might throw if the library isn't linked
    await GoogleSignin.hasPlayServices();
    const userInfo = await GoogleSignin.signIn();
    
    const idToken = userInfo.data?.idToken;
    if (!idToken) throw new Error('ID Token not found');

    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: 'google',
      token: idToken,
    });

    if (error) throw error;
    return 'success';
  } catch (error: any) {
    // Check if the error is "Module not found" or "Native portion not found"
    // [Ama Mensah - Lead Dev] Guard against null GoogleSignin before property access
    const isModuleMissing = !GoogleSignin ||
                            error.message?.includes('could not be found') ||
                            error.message?.includes('Native module') ||
                            !GoogleSignin?.signIn;

    if (isModuleMissing) {
      console.log('Native GoogleSignin module missing, switching to browser-based OAuth.');
      return await signInWithGoogleBrowser();
    }

    // Handle standard cancellations
    if (error.code === 'SIGN_IN_CANCELLED' || error.code === '12501') {
      return 'cancelled';
    }
    throw error;
  }
}

/**
 * Fallback browser-based OAuth flow for Expo Go and non-native environments.
 */
async function signInWithGoogleBrowser(): Promise<'success' | 'cancelled'> {
  const redirectTo = Linking.createURL('auth-callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  
  if (error) throw error;
  if (!data.url) throw new Error('Browser sign-in URL not generated.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === 'success' && result.url) {
    // exchangeCodeForSession expects the auth code, not the whole redirect URL.
    const params = parseAuthUrl(result.url);
    if (!params.code && params.access_token && params.refresh_token) {
      const { error: setErr } = await supabase.auth.setSession({
        access_token: params.access_token, refresh_token: params.refresh_token,
      });
      if (setErr) throw setErr;
      return 'success';
    }
    if (!params.code) throw new Error('Browser sign-in did not return a code.');
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(params.code);
    if (sessionError) throw sessionError;
    return 'success';
  }

  return 'cancelled';
}

const RECOVERY_PENDING_KEY = 'ug_recovery_pending';
const RECOVERY_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: 'unigram://auth-callback',
  });
  if (error) throw error;
  // PKCE recovery links carry only `?code=` (no type=recovery), so remember we asked for one.
  try { await AsyncStorage.setItem(RECOVERY_PENDING_KEY, String(Date.now())); } catch {}
}

/** True if this device recently requested a password-reset email. */
export async function isRecoveryPending(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(RECOVERY_PENDING_KEY);
    return !!raw && Date.now() - Number(raw) < RECOVERY_WINDOW_MS;
  } catch { return false; }
}

export async function clearRecoveryPending() {
  try { await AsyncStorage.removeItem(RECOVERY_PENDING_KEY); } catch {}
}

/** Parses query + fragment params from an auth deep link (fragment wins on conflicts). */
export function parseAuthUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const read = (s: string) => {
    s.split('&').forEach(pair => {
      if (!pair) return;
      const i = pair.indexOf('=');
      const k = decodeURIComponent(i === -1 ? pair : pair.slice(0, i));
      const v = i === -1 ? '' : decodeURIComponent(pair.slice(i + 1).replace(/\+/g, ' '));
      out[k] = v;
    });
  };
  try {
    const hashIdx = url.indexOf('#');
    const beforeHash = hashIdx === -1 ? url : url.slice(0, hashIdx);
    const qIdx = beforeHash.indexOf('?');
    if (qIdx !== -1) read(beforeHash.slice(qIdx + 1));
    if (hashIdx !== -1) read(url.slice(hashIdx + 1));
  } catch {}
  return out;
}

export async function signOut() {
  // Stop this device receiving the signed-out user's pushes (needs the live session).
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id;
    if (uid) await unregisterPushTokens(uid);
  } catch {}
  const { error } = await supabase.auth.signOut();
  // Never let the next account on this device see this account's cached data.
  await resetSessionState();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Detects university name from email domain using the Hipolabs API
export async function detectUniversityFromEmail(email: string): Promise<string | null> {
  const parts = email.split('@');
  if (parts.length !== 2 || !parts[1].includes('.')) return null;
  const domain = parts[1].toLowerCase();
  try {
    const res = await fetch(`https://universities.hipolabs.com/search?domain=${encodeURIComponent(domain)}`);
    const data: any[] = await res.json();
    return data?.[0]?.name ?? null;
  } catch {
    return null;
  }
}
