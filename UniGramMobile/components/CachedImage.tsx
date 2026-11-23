import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleProp, ImageStyle, View, ViewStyle, Image } from 'react-native';

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
  onLoad?: (e: any) => void;
}

export const CachedImage: React.FC<Props> = React.memo(({
  uri, style, resizeMode = 'cover', placeholder, containerStyle,
  priority = 'normal', recyclingKey, blurhash, onLoad
}) => {
  // A failed load (flaky mobile data, timeout, DNS hiccup) used to leave a permanent blank box.
  // Retry quietly with a growing delay and a fresh request each time.
  const [attempt, setAttempt] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { setAttempt(0); }, [uri]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const handleError = useCallback(() => {
    if (attempt >= 3) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAttempt(a => a + 1), 1200 * (attempt + 1));
  }, [attempt]);

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
        key={attempt}
        source={{ uri }}
        style={style}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        placeholder={blurhash ? { blurhash } : placeholder}
        transition={{ duration: 150, effect: 'cross-dissolve' }}
        priority={priority}
        recyclingKey={recyclingKey ?? uri}
        allowDownscaling
        onLoad={onLoad}
        onError={handleError}
      />
    );
  }

  return <Image source={{ uri }} style={style as any} resizeMode={resizeMode} onLoad={onLoad} />;
});
