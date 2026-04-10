import { NativeModules, Platform } from 'react-native';

/**
 * Diagnostic utility to check if specific Expo native modules are 
 * effectively linked and available in the current APK/Binary.
 */
export const SafeModules = {
  hasVideo: () => {
    // expo-video check
    return !!NativeModules.ExpoVideo || !!NativeModules.NativeUnimoduleProxy?.viewManagersMetadata?.ExpoVideoView;
  },
  
  hasThumbnails: () => {
    // expo-video-thumbnails check
    return !!NativeModules.ExpoVideoThumbnail || !!NativeModules.ExpoVideoThumbnails;
  },
  
  hasBlur: () => {
    // expo-blur check
    return !!NativeModules.ExpoBlurView;
  },
  
  hasHaptics: () => {
    // expo-haptics check
    return !!NativeModules.ExpoHaptics;
  },

  // Safe library getters
  get thumbnails() {
    try {
      if (this.hasThumbnails()) return require('expo-video-thumbnails');
    } catch (e) { /* ignore */ }
    return null;
  },

  get video() {
    try {
      if (this.hasVideo()) return require('expo-video');
    } catch (e) { /* ignore */ }
    return null;
  },

  get blur() {
    try {
      if (this.hasBlur()) return require('expo-blur');
    } catch (e) { /* ignore */ }
    return null;
  }
};

/**
 * Helper to log module status for debugging
 */
export const logModuleStatus = () => {
  console.log('--- Native Module Audit ---');
  console.log('Video (New):', SafeModules.hasVideo() ? '✅' : '❌ (Fallback to expo-av)');
  console.log('Thumbnails:', SafeModules.hasThumbnails() ? '✅' : '❌ (Skipping)');
  console.log('Blur:', SafeModules.hasBlur() ? '✅' : '❌ (Fallback to View)');
  console.log('---------------------------');
};
