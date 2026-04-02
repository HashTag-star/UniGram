import React, { useState, useRef } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MOCK_REELS } from '../data/mockData';
import { Reel } from '../data/types';
import { VerifiedBadge } from '../components/VerifiedBadge';

const { width, height } = Dimensions.get('window');
const ITEM_HEIGHT = height;

const ReelItem: React.FC<{ reel: Reel }> = ({ reel }) => {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(reel.likes);
  const [saved, setSaved] = useState(false);
  const [following, setFollowing] = useState(false);

  return (
    <View style={[styles.reelContainer, { height: ITEM_HEIGHT }]}>
      <Image source={{ uri: reel.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      {/* Gradient overlay */}
      <View style={styles.gradient} />

      {/* Right actions */}
      <View style={styles.rightActions}>
        <TouchableOpacity
          onPress={() => { setLiked(p => !p); setLikes(p => liked ? p - 1 : p + 1); }}
          style={styles.actionItem}
        >
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={30} color={liked ? '#ef4444' : '#fff'} />
          <Text style={styles.actionCount}>{(likes / 1000).toFixed(1)}K</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="chatbubble-outline" size={28} color="#fff" />
          <Text style={styles.actionCount}>{reel.comments}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="repeat" size={28} color="#fff" />
          <Text style={styles.actionCount}>{reel.shares}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setSaved(p => !p)} style={styles.actionItem}>
          <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={27} color={saved ? '#fbbf24' : '#fff'} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionItem}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Bottom info */}
      <View style={styles.bottomInfo}>
        {/* User */}
        <View style={styles.userRow}>
          <Image source={{ uri: reel.user.avatar }} style={styles.reelAvatar} />
          <Text style={styles.reelUsername}>{reel.user.username}</Text>
          {reel.user.verified && <VerifiedBadge type={reel.user.verificationType} />}
          <TouchableOpacity
            onPress={() => setFollowing(p => !p)}
            style={[styles.followBtn, following && styles.followingBtn]}
          >
            <Text style={[styles.followBtnText, following && { color: 'rgba(255,255,255,0.5)' }]}>
              {following ? 'Following' : 'Follow'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Caption */}
        <Text style={styles.reelCaption} numberOfLines={2}>{reel.caption}</Text>

        {/* Song */}
        {reel.song && (
          <View style={styles.songRow}>
            <Ionicons name="musical-notes" size={13} color="rgba(255,255,255,0.7)" />
            <Text style={styles.songText}>{reel.song}</Text>
          </View>
        )}

        <Text style={styles.viewCount}>{(reel.views / 1000).toFixed(0)}K views · {reel.timestamp}</Text>
      </View>
    </View>
  );
};

export const ReelsScreen: React.FC = () => {
  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <FlatList
        data={MOCK_REELS}
        keyExtractor={r => r.id}
        renderItem={({ item }) => <ReelItem reel={item} />}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  reelContainer: { width, position: 'relative' },
  gradient: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 300,
    backgroundColor: 'transparent',
    // simulated gradient with opacity
  },
  rightActions: {
    position: 'absolute', right: 12, bottom: 100,
    alignItems: 'center', gap: 18,
  },
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
