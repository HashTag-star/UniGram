import React from 'react';
import { View, StyleSheet, ViewStyle, Image } from 'react-native';
import { CachedImage } from './CachedImage';

interface StackedAvatarsProps {
  urls: string[];
  size?: number;
  overlap?: number;
  style?: ViewStyle;
}

/**
 * Renders a row of overlapping profile pictures.
 * Commonly used for "Followed by X and 5 others" UI patterns.
 */
export const StackedAvatars: React.FC<StackedAvatarsProps> = ({ 
  urls, 
  size = 24, 
  overlap = 10, 
  style 
}) => {
  // Limit to max 3-4 avatars for better UI
  const displayUrls = urls.slice(0, 4);

  return (
    <View style={[styles.container, style]}>
      {displayUrls.map((url, index) => (
        <View 
          key={`${url}-${index}`} 
          style={[
            styles.avatarWrap, 
            { 
              width: size, 
              height: size, 
              borderRadius: size / 2,
              marginLeft: index === 0 ? 0 : -overlap,
              zIndex: 10 - index, // First one on top
            }
          ]}
        >
          {url ? (
            <CachedImage 
              uri={url} 
              style={{ width: size, height: size, borderRadius: size / 2 }} 
            />
          ) : (
            <View style={[styles.placeholder, { width: size, height: size, borderRadius: size / 2 }]} />
          )}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    borderWidth: 2,
    borderColor: '#000', // Matches background to create the "cutout" look
    backgroundColor: '#111',
    overflow: 'hidden',
  },
  placeholder: {
    backgroundColor: '#333',
  }
});
