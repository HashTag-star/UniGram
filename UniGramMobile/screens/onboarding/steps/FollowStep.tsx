import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Animated, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getSuggestedUsers } from '../../../services/onboarding';
import { followUser } from '../../../services/profiles';
import { VerifiedBadge } from '../../../components/VerifiedBadge';
import { CachedImage } from '../../../components/CachedImage';
import { useHaptics } from '../../../hooks/useHaptics';

interface Props {
  userId: string;
  onNext: () => void;
  onBack: () => void;
}

export function FollowStep({ userId, onNext, onBack }: Props) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { selection, success } = useHaptics();

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    getSuggestedUsers(userId, 15)
      .then(setSuggestions)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  const toggleFollow = async (targetId: string) => {
    await selection();
    const alreadyFollowing = followed.has(targetId);
    setFollowed(prev => {
      const next = new Set(prev);
      if (alreadyFollowing) next.delete(targetId); else next.add(targetId);
      return next;
    });
    if (!alreadyFollowing) {
      followUser(userId, targetId).catch(() => {});
    }
  };

  const handleNext = async () => {
    await success();
    onNext();
  };

  const renderItem = ({ item, index }: { item: any; index: number }) => {
    const isFollowing = followed.has(item.id);
    return (
      <Animated.View style={[styles.userCard, {
        opacity: fadeAnim,
        transform: [{ translateY: fadeAnim.interpolate({ inputRange: [0, 1], outputRange: [20 + index * 5, 0] }) }],
      }]}>
        {item.avatar_url
          ? <CachedImage uri={item.avatar_url} style={styles.avatar} />
          : <View style={[styles.avatar, { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={20} color="#444" />
            </View>
        }
        <View style={styles.userInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.username}>{item.username}</Text>
            {item.is_verified && <VerifiedBadge type={item.verification_type} size="sm" />}
          </View>
          <Text style={styles.meta} numberOfLines={1}>
            {item.major ?? item.university ?? 'UniGram User'}
            {item.mutual_friends > 0 && (
              <Text style={styles.commonTag}> · {item.mutual_friends} mutual{item.mutual_friends === 1 ? '' : 's'}</Text>
            )}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.followBtn, isFollowing && styles.followingBtn]}
          onPress={() => toggleFollow(item.id)}
        >
          {isFollowing
            ? <Ionicons name="checkmark" size={18} color="#c084fc" />
            : <Text style={styles.followBtnText}>Follow</Text>
          }
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepLabel}>Step 4 of 5</Text>
          <Text style={styles.title}>People to follow</Text>
        </View>
        {followed.size > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{followed.size} following</Text>
          </View>
        )}
      </View>

      <Text style={styles.subtitle}>
        Based on your interests, here are some people you might enjoy. You can always find more in Explore.
      </Text>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color="#8b5cf6" size="large" />
          <Text style={styles.loadingText}>Finding people for you...</Text>
        </View>
      ) : suggestions.length === 0 ? (
        <View style={styles.loadingWrap}>
          <Ionicons name="people-outline" size={52} color="#333" />
          <Text style={styles.loadingText}>Be one of the first! More people will appear as the community grows.</Text>
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={suggestions}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 28, gap: 8, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.bottom}>
        <TouchableOpacity style={styles.btn} onPress={handleNext}>
          <LinearGradient colors={['#8b5cf6', '#6366f1']} start={{x:0, y:0}} end={{x:1, y:1}} style={styles.btnGradient}>
            <Text style={styles.btnText}>
              {followed.size > 0 ? `Follow ${followed.size} & Continue` : 'Continue'}
            </Text>
            <Ionicons name="arrow-forward" size={18} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090b' },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 28, paddingTop: 16, paddingBottom: 8 },
  backBtn: { padding: 4, marginBottom: 2 },
  stepLabel: { fontSize: 12, color: '#8b5cf6', fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900', color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  countBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(139,92,246,0.1)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.3)', marginBottom: 2 },
  countText: { fontSize: 13, color: '#a855f7', fontWeight: '800' },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.5)', paddingHorizontal: 28, marginBottom: 20, marginTop: 12, lineHeight: 22 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  loadingText: { color: 'rgba(255,255,255,0.4)', fontSize: 15, textAlign: 'center', fontWeight: '500' },
  userCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 16, backgroundColor: '#18181b', borderRadius: 20, paddingHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: '#27272a' },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  userInfo: { flex: 1 },
  username: { fontSize: 16, fontWeight: '800', color: '#fff' },
  meta: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontWeight: '500' },
  commonTag: { color: '#a855f7' },
  followBtn: { backgroundColor: '#8b5cf6', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, minWidth: 84, alignItems: 'center', shadowColor: '#8b5cf6', shadowOffset: { width:0, height:4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  followingBtn: { backgroundColor: 'rgba(139,92,246,0.15)', borderWidth: 1, borderColor: 'rgba(139,92,246,0.4)', shadowOpacity: 0 },
  followBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  bottom: { paddingHorizontal: 28, paddingBottom: 36, paddingTop: 10 },
  btn: { borderRadius: 20, overflow: 'hidden', shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  btnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 18 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
