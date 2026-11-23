import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';

// expo-notifications was removed from Expo Go in SDK 53.
// Only load in standalone/development builds.
const isExpoGo = (Constants as any).executionEnvironment === 'storeClient';

export const NOTIF_ENABLED_KEY = 'unigram_notifications_enabled';
const REGISTERED_TOKENS_KEY = 'unigram_registered_push_tokens';

let Notifications: any = null;
let Device: any = null;

async function loadModules() {
  if (isExpoGo) return;
  if (!Notifications) {
    try {
      Notifications = await import('expo-notifications');
      Device = await import('expo-device');
    } catch {
      console.warn('expo-notifications not available');
    }
  }
}

/**
 * Foreground display behaviour, Android channels and action-button categories.
 * Runs once at module load so notifications are presented correctly on every
 * launch, not only after the onboarding permission step.
 */
let setupPromise: Promise<void> | null = null;
function setupNotifications(): Promise<void> {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    await loadModules();
    if (!Notifications) return;

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    try {
      await Notifications.setNotificationCategoryAsync('post_like', [
        { identifier: 'VIEW_POST', buttonTitle: 'View Post', options: { opensAppToForeground: true } },
      ]);
      await Notifications.setNotificationCategoryAsync('post_comment', [
        {
          identifier: 'REPLY_COMMENT',
          buttonTitle: 'Reply',
          textInput: { submitButtonTitle: 'Post', placeholder: 'Add a comment…' },
          options: { opensAppToForeground: false },
        },
      ]);
      await Notifications.setNotificationCategoryAsync('follow', [
        { identifier: 'FOLLOW_BACK', buttonTitle: 'Follow Back', options: { opensAppToForeground: true } },
        { identifier: 'VIEW_PROFILE', buttonTitle: 'View Profile', options: { opensAppToForeground: true } },
      ]);
      await Notifications.setNotificationCategoryAsync('follow_suggestion', [
        { identifier: 'VIEW', buttonTitle: 'View', options: { opensAppToForeground: true } },
        { identifier: 'NOT_INTERESTED', buttonTitle: 'Not Interested', options: { isDestructive: true, opensAppToForeground: false } },
      ]);
      await Notifications.setNotificationCategoryAsync('chat_message', [
        {
          identifier: 'REPLY',
          buttonTitle: 'Reply',
          textInput: { submitButtonTitle: 'Send', placeholder: 'Type a message…' },
          options: { opensAppToForeground: false },
        },
      ]);
    } catch (e: any) {
      console.warn('[push] category setup failed:', e?.message);
    }

    if (Platform.OS === 'android') {
      const I = Notifications.AndroidImportance;
      const ch = (id: string, name: string, importance: any, vibrationPattern: number[]) =>
        Notifications.setNotificationChannelAsync(id, {
          name, importance, vibrationPattern, lightColor: '#4f46e5', sound: 'notification_alert.wav',
        }).catch(() => {});
      await Promise.all([
        ch('social', 'Likes & Comments', I.HIGH, [0, 200, 0, 200]),
        ch('messages', 'Direct Messages', I.MAX, [0, 250, 250, 250]),
        ch('follows', 'Followers', I.DEFAULT, [0, 150]),
        ch('stories', 'Stories', I.DEFAULT, [0, 150]),
        ch('default', 'UniGram', I.HIGH, [0, 250, 250, 250]),
      ]);
    }
  })().catch((e) => { console.warn('[push] setup failed:', e?.message); });
  return setupPromise;
}

// Module load: configure the handler / channels / categories immediately.
setupNotifications();

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unavailable';

/** Current OS-level notification permission (never prompts). */
export async function getPushPermissionStatus(): Promise<PushPermission> {
  await loadModules();
  if (!Notifications || !Device?.isDevice) return 'unavailable';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

async function upsertToken(userId: string, token: string, type: 'expo' | 'native') {
  await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform: Platform.OS, type, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,token' }
  );
}

/**
 * Registers this device for push. `prompt: true` (default, used by onboarding and the
 * Settings toggle) may show the OS permission dialog; `prompt: false` (used on every
 * launch) is silent: it only registers when permission is already granted and never
 * re-prompts a user who denied.
 */
export async function registerForPushNotifications(
  userId: string,
  opts: { prompt?: boolean } = {},
): Promise<string | null> {
  const prompt = opts.prompt ?? true;
  await setupNotifications();
  if (!Notifications || !Device) return null;

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  if (!prompt) {
    try {
      if ((await AsyncStorage.getItem(NOTIF_ENABLED_KEY)) === 'false') return null;
    } catch {}
  }

  const perm = await Notifications.getPermissionsAsync();
  let finalStatus = perm.status;

  if (finalStatus !== 'granted') {
    if (!prompt || perm.canAskAgain === false) return null;
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  // Must pass projectId for SDK 53+
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? '9e110753-5591-4a10-ac02-018cf974dc91';

  // Get both Expo token (for basic testing) and Device token (for direct Firebase)
  const expoTokenData = await Notifications.getExpoPushTokenAsync({ projectId }).catch(() => null);
  const deviceTokenData = await Notifications.getDevicePushTokenAsync().catch(() => null);

  const registered: string[] = [];
  try {
    if (expoTokenData?.data) { await upsertToken(userId, expoTokenData.data, 'expo'); registered.push(expoTokenData.data); }
    if (deviceTokenData?.data) { await upsertToken(userId, String(deviceTokenData.data), 'native'); registered.push(String(deviceTokenData.data)); }
    if (registered.length) await AsyncStorage.setItem(REGISTERED_TOKENS_KEY, JSON.stringify(registered)).catch(() => {});
  } catch (e: any) {
    console.warn('[push] token upsert failed:', e?.message);
  }

  return deviceTokenData?.data || expoTokenData?.data || null;
}

/** Removes this device's tokens for `userId` (sign-out / notifications toggled off). */
export async function unregisterPushTokens(userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(REGISTERED_TOKENS_KEY);
    const tokens: string[] = raw ? JSON.parse(raw) : [];
    if (tokens.length) {
      await supabase.from('push_tokens').delete().eq('user_id', userId).in('token', tokens);
    }
    await AsyncStorage.removeItem(REGISTERED_TOKENS_KEY);
  } catch {}
}

/** Re-registers when the OS rotates the push token. Returns an unsubscribe fn. */
export async function onPushTokenChanged(userId: string): Promise<() => void> {
  await loadModules();
  if (!Notifications?.addPushTokenListener) return () => {};
  const sub = Notifications.addPushTokenListener(() => {
    registerForPushNotifications(userId, { prompt: false }).catch(() => {});
  });
  return () => { try { sub.remove(); } catch {} };
}

/** The notification response that cold-started the app (null if none). */
export async function getLastNotificationResponse(): Promise<any | null> {
  await loadModules();
  if (!Notifications?.getLastNotificationResponseAsync) return null;
  try { return await Notifications.getLastNotificationResponseAsync(); } catch { return null; }
}

export async function clearLastNotificationResponse(): Promise<void> {
  await loadModules();
  try { await Notifications?.clearLastNotificationResponseAsync?.(); } catch {}
}

/**
 * Send an Expo push notification to one or more users.
 * Looks up their registered tokens from push_tokens table and calls Expo's push API.
 */
export async function sendPushToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>,
  imageUrl?: string,
  senderAvatarUrl?: string,
  categoryId?: string,
  groupId?: string,
): Promise<void> {
  const { data: rows, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error || !rows?.length) return;

  const { error: edgeError } = await supabase.functions.invoke('send-push-notification', {
    body: { userId, title, body, data: data ?? {}, imageUrl, senderAvatarUrl, categoryId, groupId },
  });

  if (edgeError) {
    console.warn('Edge function notification failed, falling back to Expo proxy:', edgeError);

    const channelId = (data as any)?.channelId ?? 'default';
    const expoMessages = rows
      .filter((r: any) => (r.token as string).startsWith('ExponentPushToken'))
      .map((r: any) => ({
        to: r.token,
        title,
        body,
        data: { ...(data ?? {}), imageUrl, senderAvatarUrl, categoryId, groupId },
        sound: 'default',
        priority: 'high',
        channelId,
        categoryId,
        mutableContent: !!(imageUrl || senderAvatarUrl),
      }));

    if (expoMessages.length > 0) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(expoMessages),
      });
    }
  }
}

export async function scheduleLocalNotification(title: string, body: string, data?: object) {
  await loadModules();
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    content: { title, body, data: data ?? {} },
    trigger: null, // immediate
  });
}

export async function getBadgeCount(): Promise<number> {
  await loadModules();
  if (!Notifications) return 0;
  return Notifications.getBadgeCountAsync();
}

export async function setBadgeCount(count: number) {
  await loadModules();
  if (!Notifications) return;
  await Notifications.setBadgeCountAsync(count);
}
export async function onNotificationResponseReceived(callback: (response: any) => void) {
  await loadModules();
  if (!Notifications) return;
  return Notifications.addNotificationResponseReceivedListener(callback);
}
