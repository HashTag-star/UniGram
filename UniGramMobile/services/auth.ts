import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';

// Dynamic require to prevent crashes in Expo Go (Non-native environments)
let GoogleSignin: any = null;
try {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  GoogleSignin.configure({
    webClientId: '679547157570-boeo81q3q6rabecqrjorg9l7um5su2ta.apps.googleusercontent.com',
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

export async function signUp(email: string, password: string, username: string, fullName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username, full_name: fullName },
      emailRedirectTo: 'unigram://auth-callback',
    },
  });
  if (error) throw error;
  return data;
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
    const isModuleMissing = error.message?.includes('could not be found') || 
                            error.message?.includes('Native module') ||
                            !GoogleSignin.signIn;

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
    const { error: sessionError } = await supabase.auth.exchangeCodeForSession(result.url);
    if (sessionError) throw sessionError;
    return 'success';
  }

  return 'cancelled';
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: 'unigram://auth-callback',
  });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
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
