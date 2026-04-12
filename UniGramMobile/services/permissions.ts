import { Linking } from 'react-native';
import Constants from 'expo-constants';

// expo-notifications removed from Expo Go in SDK 53
const isExpoGo = (Constants as any).executionEnvironment === 'storeClient';

async function loadCamera() {
  try { return await import('expo-camera'); } catch { return null; }
}
async function loadMediaLibrary() {
  try { return await import('expo-media-library'); } catch { return null; }
}
async function loadNotifications() {
  if (isExpoGo) return null; // not supported in Expo Go SDK 53+
  try { return await import('expo-notifications'); } catch { return null; }
}
async function loadImagePicker() {
  try { return await import('expo-image-picker'); } catch { return null; }
}

// Manual settings opening if needed by UI
export const goToSettings = () => Linking.openSettings();

export async function requestCameraPermission(): Promise<boolean> {
  const Camera = await loadCamera();
  if (!Camera) return false;
  const { status } = await Camera.Camera.requestCameraPermissionsAsync();
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
  return status === 'granted';
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (isExpoGo) {
    console.log('Push notifications not supported in Expo Go. Use a development build.');
    return false;
  }
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
  return status === 'granted';
}

export async function checkAndRequestAllPermissions() {
  const camera = await requestCameraPermission();
  const mediaLibrary = await requestMediaLibraryPermission();
  const notifications = await requestNotificationPermission();
  return { camera, mediaLibrary, notifications };
}
