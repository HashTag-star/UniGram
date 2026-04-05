import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';

// expo-notifications was removed from Expo Go in SDK 53.
// Only load in standalone/development builds.
const isExpoGo = (Constants as any).executionEnvironment === 'storeClient';

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

export async function registerForPushNotifications(userId: string): Promise<string | null> {
  await loadModules();
  if (!Notifications || !Device) return null;

  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  // Must pass projectId for SDK 53+
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? '9e110753-5591-4a10-ac02-018cf974dc91';
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;

  // Store token in Supabase
  await supabase.from('push_tokens').upsert(
    { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,token' },
  );

  // Configure notification display behaviour
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS === 'android') {
    Notifications.setNotificationChannelAsync('default', {
      name: 'UniGram',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4f46e5',
    });
  }

  return token;
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
): Promise<void> {
  // Fetch this user's push tokens
  const { data: rows, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error || !rows?.length) return;

  const messages = rows.map((r: any) => ({
    to: r.token,
    title,
    body,
    data: data ?? {},
    sound: 'default',
    priority: 'high',
    channelId: 'default',
  }));

  // Expo push API — free, handles both FCM and APNs routing
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
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
