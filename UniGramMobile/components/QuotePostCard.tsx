import React from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { CachedImage } from './CachedImage';
import { VerifiedBadge } from './VerifiedBadge';

interface QuotePostCardProps {
  post: any;
  onPress?: () => void;
}

export const QuotePostCard: React.FC<QuotePostCardProps> = ({ post, onPress }) => {
  const { colors } = useTheme();
  if (!post) return null;

  const profile = post.profiles;
  const thumb = post.media_urls?.[0] || post.media_url;
  const isThread = post.type === 'thread' || (!thumb && !post.caption);

  return (
    <TouchableOpacity
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card ?? colors.background }]}
      onPress={onPress}
      activeOpacity={0.82}
    >
      {/* Author header */}
      <View style={styles.header}>
        {profile?.avatar_url ? (
          <CachedImage uri={profile.avatar_url} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: '#1a1a2e', alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="person" size={10} color="#555" />
          </View>
        )}
        <Text style={[styles.username, { color: colors.text }]} numberOfLines={1}>
          @{profile?.username ?? 'user'}
        </Text>
        {profile?.is_verified && (
          <VerifiedBadge type={profile.verification_type} size="sm" />
        )}
        {isThread && (
          <View style={styles.threadPill}>
            <Ionicons name="chatbubbles-outline" size={10} color="#6366f1" />
            <Text style={styles.threadPillText}>Thread</Text>
          </View>
        )}
      </View>

      {/* Content */}
      <View style={styles.body}>
        {post.caption ? (
          <Text style={[styles.caption, { color: colors.text }]} numberOfLines={4}>
            {post.caption}
          </Text>
        ) : null}
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumb} resizeMode="cover" />
        ) : !post.caption ? (
          <Text style={[styles.empty, { color: colors.textMuted }]}>View original post</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: 14,
    marginBottom: 10,
    marginTop: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
  },
  username: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  threadPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(99,102,241,0.1)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  threadPillText: {
    color: '#6366f1',
    fontSize: 10,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
  },
  thumb: {
    width: '100%',
    height: 160,
    borderRadius: 10,
    marginTop: 2,
  },
  empty: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});
