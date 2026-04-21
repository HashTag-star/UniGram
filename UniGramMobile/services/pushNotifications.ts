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
  
  // Get both Expo token (for basic testing) and Device token (for direct Firebase)
  const expoTokenData = await Notifications.getExpoPushTokenAsync({ projectId }).catch(() => null);
  const deviceTokenData = await Notifications.getDevicePushTokenAsync().catch(() => null);

  if (expoTokenData?.data) {
    await supabase.from('push_tokens').upsert(
      { user_id: userId, token: expoTokenData.data, platform: Platform.OS, type: 'expo', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    );
  }

  if (deviceTokenData?.data) {
    await supabase.from('push_tokens').upsert(
      { user_id: userId, token: deviceTokenData.data, platform: Platform.OS, type: 'native', updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    );
  }

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
      sound: 'notification_alert.wav', // Resource name must be simple lowercase/underscore
    });
  }

  return deviceTokenData?.data || expoTokenData?.data || null;
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
): Promise<void> {
  const { data: rows, error } = await supabase
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error || !rows?.length) return;

  const { error: edgeError } = await supabase.functions.invoke('send-push-notification', {
    body: { userId, title, body, data: data ?? {}, imageUrl, senderAvatarUrl },
  });

  if (edgeError) {
    console.warn('Edge function notification failed, falling back to Expo proxy:', edgeError);

    const expoMessages = rows
      .filter((r: any) => (r.token as string).startsWith('ExponentPushToken'))
      .map((r: any) => ({
        to: r.token,
        title,
        body,
        data: { ...(data ?? {}), imageUrl, senderAvatarUrl },
        sound: 'default',
        priority: 'high',
        channelId: 'default',
        // Expo supports mutableContent for iOS notification service extensions
        mutableContent: !!imageUrl,
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
