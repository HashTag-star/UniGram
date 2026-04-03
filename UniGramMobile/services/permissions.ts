import { Alert, Linking } from 'react-native';

async function loadCamera() {
  try { return await import('expo-camera'); } catch { return null; }
}
async function loadMediaLibrary() {
  try { return await import('expo-media-library'); } catch { return null; }
}
async function loadNotifications() {
  try { return await import('expo-notifications'); } catch { return null; }
}
async function loadImagePicker() {
  try { return await import('expo-image-picker'); } catch { return null; }
}

function openSettings(feature: string) {
  Alert.alert(
    `${feature} Permission Required`,
    `UniGram needs ${feature.toLowerCase()} access to work properly. Please enable it in Settings.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open Settings', onPress: () => Linking.openSettings() },
    ]
  );
}

export async function requestCameraPermission(): Promise<boolean> {
  const Camera = await loadCamera();
  if (!Camera) return false;
  const { status } = await Camera.Camera.requestCameraPermissionsAsync();
  if (status === 'denied') openSettings('Camera');
  return status === 'granted';
}

export async function requestMicrophonePermission(): Promise<boolean> {
  const Camera = await loadCamera();
  if (!Camera) return false;
  const { status } = await Camera.Camera.requestMicrophonePermissionsAsync();
  return status === 'granted';
}

export async function requestMediaLibraryPermission(): Promise<boolean> {
  const MediaLibrary = await loadMediaLibrary();
  if (!MediaLibrary) return false;
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status === 'denied') openSettings('Photo Library');
  return status === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  const Notifications = await loadNotifications();
  if (!Notifications) return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function requestImagePickerPermission(): Promise<boolean> {
  const ImagePicker = await loadImagePicker();
  if (!ImagePicker) return false;
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === 'denied') openSettings('Photo Library');
  return status === 'granted';
}

export async function checkAndRequestAllPermissions() {
  const camera = await requestCameraPermission();
  const mediaLibrary = await requestMediaLibraryPermission();
  const notifications = await requestNotificationPermission();
  return { camera, mediaLibrary, notifications };
}
