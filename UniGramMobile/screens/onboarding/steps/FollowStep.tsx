import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Animated, ActivityIndicator, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getSuggestedUsers } from '../../../services/onboarding';
import { followUser } from '../../../services/profiles';
import { VerifiedBadge } from '../../../components/VerifiedBadge';
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
          ? <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
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
            {item.common_interests > 0 && (
              <Text style={styles.commonTag}> · {item.common_interests} shared interests</Text>
            )}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.followBtn, isFollowing && styles.followingBtn]}
          onPress={() => toggleFollow(item.id)}
        >
          {isFollowing
            ? <Ionicons name="checkmark" size={16} color="#818cf8" />
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
          <ActivityIndicator color="#4f46e5" size="large" />
          <Text style={styles.loadingText}>Finding people for you...</Text>
        </View>
      ) : suggestions.length === 0 ? (
        <View style={styles.loadingWrap}>
          <Ionicons name="people-outline" size={52} color="#333" />
          <Text style={styles.loadingText}>No suggestions yet — more will appear as the community grows!</Text>
        </View>
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 24, gap: 4, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <View style={styles.bottom}>
        <TouchableOpacity style={styles.btn} onPress={handleNext}>
          <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.btnGradient}>
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
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 4 },
  backBtn: { padding: 4, marginBottom: 2 },
  stepLabel: { fontSize: 11, color: '#4f46e5', fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', marginTop: 2 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(99,102,241,0.15)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)', marginBottom: 2 },
  countText: { fontSize: 11, color: '#818cf8', fontWeight: '700' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.4)', paddingHorizontal: 24, marginBottom: 16, marginTop: 8, lineHeight: 18 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 40 },
  loadingText: { color: '#555', fontSize: 14, textAlign: 'center' },
  userCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24 },
  userInfo: { flex: 1 },
  username: { fontSize: 14, fontWeight: '700', color: '#fff' },
  meta: { fontSize: 11, color: '#555', marginTop: 2 },
  commonTag: { color: '#4f46e5' },
  followBtn: { backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 7, minWidth: 76, alignItems: 'center' },
  followingBtn: { backgroundColor: 'rgba(99,102,241,0.15)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.4)' },
  followBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bottom: { paddingHorizontal: 24, paddingBottom: 32 },
  btn: { borderRadius: 14, overflow: 'hidden' },
  btnGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
