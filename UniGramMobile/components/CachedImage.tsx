/**
 * Drop-in replacement for React Native <Image> that uses expo-image's
 * built-in memory + disk LRU cache. Images loaded once are served from
 * disk on every subsequent render — no network round-trip.
 *
 * Usage: replace <Image source={{ uri }} style={...} />
 *   with <CachedImage uri={uri} style={...} />
 */
import React from 'react';
import { StyleProp, ImageStyle, View, ViewStyle } from 'react-native';

let ExpoImage: any = null;
try {
  // Dynamic require so the app doesn't crash if expo-image isn't linked yet
  ExpoImage = require('expo-image').Image;
} catch {}

interface Props {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  placeholder?: any;         // blurhash string or require(...)
  containerStyle?: StyleProp<ViewStyle>;
}

export const CachedImage: React.FC<Props> = ({
  uri, style, resizeMode = 'cover', placeholder, containerStyle,
}) => {
  if (!uri) {
    return <View style={[style as ViewStyle, containerStyle]} />;
  }

  if (ExpoImage) {
    // Map React Native resizeMode to expo-image contentFit
    const contentFit = 
      resizeMode === 'stretch' ? 'fill' :
      resizeMode === 'center' ? 'scale-down' : 
      resizeMode;

    return (
      <ExpoImage
        source={{ uri }}
        style={style}
        contentFit={contentFit}
        cachePolicy="memory-disk"   // memory LRU + persistent disk cache
        placeholder={placeholder}
        transition={200}            // 200ms fade-in on first load only
      />
    );
  }

  // Fallback to standard Image if expo-image not available
  const { Image } = require('react-native');
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
};
