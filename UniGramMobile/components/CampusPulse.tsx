import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { CachedImage } from './CachedImage';
import { useTheme } from '../context/ThemeContext';

const { width } = Dimensions.get('window');

/**
 * Campus Pulse (Layer 2)
 * Shows trending content specifically from the user's university
 * utilizing Velocity and Campus Relevance signals.
 */
export const CampusPulse: React.FC<{
  userId: string;
  onPostPress: (post: any) => void;
}> = ({ userId, onPostPress }) => {
  const { colors } = useTheme();
  const [trending, setTrending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPulse();
  }, [userId]);

  const loadPulse = async () => {
    try {
      // Fetch trending posts with high velocity/campus weight
      const { data } = await supabase.rpc('get_hybrid_campus_feed', {
        p_user_id: userId,
        p_limit: 10,
        p_offset: 0
      });
      
      // Filter for university relevance (optional here, RPC already weights it)
      setTrending(data || []);
    } catch (err) {
      console.warn('Campus Pulse failed', err);
    } finally {
      setLoading(false);
    }
  };

  if (!loading && trending.length === 0) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <View style={[styles.pulseIcon, { backgroundColor: colors.accent + '20' }]}>
            <Ionicons name="flash" size={16} color={colors.accent} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Campus Pulse</Text>
        </View>
        <Text style={[styles.tagline, { color: colors.textMuted }]}>Trending at your university</Text>
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
           [1,2,3].map(i => (
             <View key={i} style={[styles.skeleton, { backgroundColor: colors.bg2 }]} />
           ))
        ) : (
          trending.map((post) => (
            <TouchableOpacity 
              key={post.id} 
              style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => onPostPress(post)}
              activeOpacity={0.8}
            >
              <CachedImage uri={post.media_url} style={styles.cardImage} />
              <View style={styles.cardMeta}>
                <Text style={[styles.cardUser, { color: colors.text }]} numberOfLines={1}>
                  @{post.profiles?.username}
                </Text>
                <View style={styles.engagementRow}>
                  <Ionicons name="flame" size={12} color="#f59e0b" />
                  <Text style={[styles.engagementText, { color: colors.textMuted }]}>
                    {Math.round(post.score)} pts
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  header: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 12,
    marginTop: 2,
    marginLeft: 36,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 12,
  },
  card: {
    width: width * 0.4,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: width * 0.45,
    backgroundColor: '#111',
  },
  cardMeta: {
    padding: 8,
  },
  cardUser: {
    fontSize: 12,
    fontWeight: '700',
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  engagementText: {
    fontSize: 10,
    fontWeight: '600',
  },
  skeleton: {
    width: width * 0.4,
    height: width * 0.55,
    borderRadius: 16,
  }
});
