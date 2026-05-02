import React from 'react';
import { StyleProp, ImageStyle, View, ViewStyle } from 'react-native';

let ExpoImage: any = null;
try {
  ExpoImage = require('expo-image').Image;
} catch {}

interface Props {
  uri: string | null | undefined;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch' | 'center';
  placeholder?: any;
  containerStyle?: StyleProp<ViewStyle>;
  priority?: 'low' | 'normal' | 'high';
  recyclingKey?: string;
  blurhash?: string;
}

export const CachedImage: React.FC<Props> = ({
  uri, style, resizeMode = 'cover', placeholder, containerStyle,
  priority = 'normal', recyclingKey, blurhash,
}) => {
  if (!uri) {
    return <View style={[style as ViewStyle, containerStyle]} />;
  }

  if (ExpoImage) {
    const contentFit =
      resizeMode === 'stretch' ? 'fill' :
      resizeMode === 'center' ? 'scale-down' :
      resizeMode;

    return (
      <ExpoImage
        source={{ uri }}
        style={style}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        placeholder={blurhash ? { blurhash } : placeholder}
        transition={{ duration: 150, effect: 'cross-dissolve' }}
        priority={priority}
        recyclingKey={recyclingKey ?? uri}
        allowDownscaling
      />
    );
  }

  const { Image } = require('react-native');
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
};
