import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CommentSheet } from '../components/CommentSheet';
import { getReels, likeReel, unlikeReel, getLikedReelIds } from '../services/reels';
import { followUser, unfollowUser, isFollowing } from '../services/profiles';
import { supabase } from '../lib/supabase';

const { width, height } = Dimensions.get('window');
const ITEM_HEIGHT = height;

function fmtCount(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

const ReelItem: React.FC<{
  reel: any;
  currentUserId: string;
  isLiked: boolean;
  isActive: boolean;
}> = ({ reel, currentUserId, isLiked: initLiked, isActive }) => {
  const [liked, setLiked] = useState(initLiked);
  const [likes, setLikes] = useState(reel.likes_count ?? 0);
  const [commentCount, setCommentCount] = useState(reel.comments_count ?? 0);
  const [following, setFollowing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<any>(null);
  const profile = reel.profiles;

  useEffect(() => {
    if (currentUserId && profile?.id && profile.id !== currentUserId) {
      isFollowing(currentUserId, profile.id).then(setFollowing).catch(() => {});
    }
  }, [currentUserId, profile?.id]);

  useEffect(() => {
    if (!videoRef.current) return;
    if (isActive) videoRef.current.playAsync().catch(() => {});
    else videoRef.current.pauseAsync().catch(() => {});
  }, [isActive]);

  const toggleLike = async () => {
    const next = !liked;
    setLiked(next);
    setLikes((n: number) => next ? n + 1 : n - 1);
    try {
      if (next) await likeReel(reel.id, currentUserId);
      else await unlikeReel(reel.id, currentUserId);
    } catch { setLiked(!next); setLikes((n: number) => next ? n - 1 : n + 1); }
  };

  const toggleFollow = async () => {
    if (!currentUserId || !profile?.id) return;
    const next = !following;
    setFollowing(next);
    try {
      if (next) await followUser(currentUserId, profile.id);
      else await unfollowUser(currentUserId, profile.id);
    } catch { setFollowing(!next); }
  };

  return (
    <View style={[styles.reelContainer, { height: ITEM_HEIGHT }]}>
      {reel.video_url ? (
        <Video
          ref={videoRef}
          source={{ uri: reel.video_url }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          isLooping
          shouldPlay={isActive}
          isMuted={muted}
          posterSource={reel.thumbnail_url ? { uri: reel.thumbnail_url } : undefined}
          usePoster={!!reel.thumbnail_url}
        />
      ) : reel.thumbnail_url ? (
        <Image source={{ uri: reel.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name="film-outline" size={64} color="#333" />
        </View>
      )}
      <View style={styles.gradient} />

      {/* Right actions */}
      <View style={styles.rightActions}>
        <TouchableOpacity onPress={toggleLike} style={styles.actionItem}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? '#ef4444' : '#fff'} />
          <Text style={styles.actionCount}>{fmtCount(likes)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setShowComments(true)}>
          <Ionicons name="chatbubble-outline" size={28} color="#fff" />
          <Text style={styles.actionCount}>{fmtCount(commentCount)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="paper-plane-outline" size={26} color="#fff" />
          <Text style={styles.actionCount}>{fmtCount(reel.shares_count ?? 0)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem} onPress={() => setMuted(m => !m)}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={styles.bottomInfo}>
        <View style={styles.userRow}>
          {profile?.avatar_url
            ? <Image source={{ uri: profile.avatar_url }} style={styles.reelAvatar} />
            : <View style={[styles.reelAvatar, { backgroundColor: '#222' }]} />
          }
          <Text style={styles.reelUsername}>{profile?.username ?? 'user'}</Text>
          {profile?.is_verified && <VerifiedBadge type={profile.verification_type} />}
          {profile?.id !== currentUserId && (
            <TouchableOpacity
              onPress={toggleFollow}
              style={[styles.followBtn, following && styles.followingBtn]}
            >
              <Text style={[styles.followBtnText, following && { color: 'rgba(255,255,255,0.5)' }]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.reelCaption} numberOfLines={2}>{reel.caption}</Text>
        {reel.song && (
          <View style={styles.songRow}>
            <Ionicons name="musical-notes" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.songText}>{reel.song}</Text>
          </View>
        )}
        <Text style={styles.viewCount}>
          {fmtCount(reel.views_count ?? 0)} views · {timeAgo(reel.created_at)}
        </Text>
      </View>

      <CommentSheet
        visible={showComments}
        targetId={reel.id}
        targetType="reel"
        currentUserId={currentUserId}
        onClose={() => setShowComments(false)}
        onCountChange={delta => setCommentCount(n => Math.max(0, n + delta))}
      />
    </View>
  );
};

export const ReelsScreen: React.FC<{ onBack?: () => void }> = ({ onBack }) => {
  const [reels, setReels] = useState<any[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
        const [reelsData, likedData] = await Promise.all([getReels(), getLikedReelIds(user.id)]);
        setReels(reelsData);
        setLikedIds(new Set(likedData));
      }
    } catch (e) {
      console.error('Reels load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar hidden />
        {onBack && (
          <TouchableOpacity style={reelNavStyles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <Ionicons name="film-outline" size={48} color="#333" />
        <Text style={{ color: '#555', marginTop: 12 }}>Loading reels...</Text>
      </View>
    );
  }

  if (reels.length === 0) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar hidden />
        {onBack && (
          <TouchableOpacity style={reelNavStyles.backBtn} onPress={onBack}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
        )}
        <Ionicons name="film-outline" size={64} color="#333" />
        <Text style={{ color: '#555', marginTop: 16, fontSize: 16 }}>No reels yet</Text>
        <Text style={{ color: '#444', marginTop: 6, fontSize: 13 }}>Post a reel using the + button!</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <FlatList
        data={reels}
        keyExtractor={r => r.id}
        renderItem={({ item, index }) => (
          <ReelItem
            reel={item}
            currentUserId={currentUserId}
            isLiked={likedIds.has(item.id)}
            isActive={index === activeIndex}
          />
        )}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
      />
      {onBack && (
        <TouchableOpacity style={reelNavStyles.backBtn} onPress={onBack}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const reelNavStyles = StyleSheet.create({
  backBtn: {
    position: 'absolute', top: 52, left: 16, zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 8,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  reelContainer: { width, position: 'relative' },
  gradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 300 },
  rightActions: { position: 'absolute', right: 12, bottom: 100, alignItems: 'center', gap: 18 },
  actionItem: { alignItems: 'center', gap: 3 },
  actionCount: { color: '#fff', fontSize: 12, fontWeight: '600', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  bottomInfo: { position: 'absolute', bottom: 30, left: 14, right: 70 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  reelAvatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: '#fff' },
  reelUsername: { color: '#fff', fontWeight: 'bold', fontSize: 14, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  followBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  followingBtn: { borderColor: 'rgba(255,255,255,0.2)' },
  followBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  reelCaption: { color: '#fff', fontSize: 13, lineHeight: 18, marginBottom: 8, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  songRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  songText: { color: 'rgba(255,255,255,0.8)', fontSize: 12 },
  viewCount: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
});
