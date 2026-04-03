import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';

// Lazy imports to avoid crashing if package not yet installed
let Notifications: any = null;
let Device: any = null;

async function loadModules() {
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

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const token = tokenData.data;

  // Store token in Supabase
  await supabase.from('push_tokens').upsert({
    user_id: userId,
    token,
    platform: Platform.OS as 'ios' | 'android' | 'web',
    updated_at: new Date().toISOString(),
  });

  // Configure notification behavior
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
