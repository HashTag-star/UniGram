import React, { useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Modal, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CURRENT_USER, MOCK_POSTS, MOCK_USERS } from '../data/mockData';
import { User } from '../data/types';
import { VerifiedBadge } from '../components/VerifiedBadge';

const { width } = Dimensions.get('window');
const COL = (width - 2) / 3;

const HIGHLIGHTS = [
  { id: 'h1', title: 'Campus', cover: 'https://picsum.photos/seed/hl1/200' },
  { id: 'h2', title: 'Hackathon', cover: 'https://picsum.photos/seed/hl2/200' },
  { id: 'h3', title: 'Code', cover: 'https://picsum.photos/seed/hl3/200' },
  { id: 'h4', title: 'Travel', cover: 'https://picsum.photos/seed/hl4/200' },
];

interface Props {
  user?: User;
  isOwn?: boolean;
  onVerifyPress?: () => void;
  onBack?: () => void;
}

export const ProfileScreen: React.FC<Props> = ({ user = CURRENT_USER, isOwn = true, onVerifyPress, onBack }) => {
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'saved'>('posts');
  const [following, setFollowing] = useState(false);
  const [followers, setFollowers] = useState(user.followers);
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null);

  const posts = MOCK_POSTS.filter(p => p.mediaUrl);

  const verificationLabel: Record<string, string> = {
    student: 'Verified Student',
    professor: 'Verified Faculty',
    club: 'Verified Org',
    influencer: 'Notable Account',
    staff: 'Verified Staff',
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Cover */}
        <View style={styles.coverContainer}>
          <Image
            source={{ uri: user.coverImage || 'https://picsum.photos/seed/defaultcover/800/300' }}
            style={styles.cover}
          />
          <View style={styles.coverOverlay} />
          {onBack && (
            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          {isOwn && (
            <TouchableOpacity style={styles.settingsBtn}>
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Avatar row */}
        <View style={styles.avatarRow}>
          <View style={styles.avatarContainer}>
            <Image source={{ uri: user.avatar }} style={styles.avatar} />
            {user.verified && (
              <View style={styles.verifiedOverlay}>
                <VerifiedBadge type={user.verificationType} size="md" />
              </View>
            )}
          </View>
          <View style={styles.actionsRow}>
            {isOwn ? (
              <>
                <TouchableOpacity style={styles.editBtn}>
                  <Ionicons name="pencil" size={14} color="#fff" />
                  <Text style={styles.editBtnText}>Edit Profile</Text>
                </TouchableOpacity>
                {!user.verified && (
                  <TouchableOpacity style={styles.verifyBtn} onPress={onVerifyPress}>
                    <Ionicons name="shield-checkmark-outline" size={14} color="#818cf8" />
                    <Text style={styles.verifyBtnText}>Get Verified</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={() => { setFollowing(p => !p); setFollowers(p => following ? p - 1 : p + 1); }}
                  style={[styles.followBtn, following && styles.followingBtn]}
                >
                  <Text style={[styles.followBtnText, following && { color: 'rgba(255,255,255,0.5)' }]}>
                    {following ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.messageBtn}>
                  <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.fullName}>{user.fullName}</Text>
            {user.verified && (
              <View style={styles.verifiedPill}>
                <VerifiedBadge type={user.verificationType} size="sm" />
                <Text style={styles.verifiedPillText}>{verificationLabel[user.verificationType || 'student']}</Text>
              </View>
            )}
          </View>
          <Text style={styles.username}>@{user.username}</Text>
          {user.pronouns ? <Text style={styles.pronouns}>{user.pronouns}</Text> : null}
          <Text style={styles.bio}>{user.bio}</Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.4)" />
            <Text style={styles.metaText}>{user.university} · Class of {user.year}</Text>
          </View>
          {user.website && (
            <View style={styles.metaRow}>
              <Ionicons name="link-outline" size={13} color="#818cf8" />
              <Text style={[styles.metaText, { color: '#818cf8' }]}>{user.website}</Text>
            </View>
          )}
          <View style={styles.majorPill}>
            <Text style={styles.majorPillText}>{user.major}</Text>
          </View>

          {/* Stats */}
          <View style={styles.stats}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{user.posts}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <TouchableOpacity style={styles.statItem} onPress={() => setFollowModal('followers')}>
              <Text style={styles.statNum}>{followers.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statItem} onPress={() => setFollowModal('following')}>
              <Text style={styles.statNum}>{user.following.toLocaleString()}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Highlights */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 12 }}>
          {isOwn && (
            <View style={styles.highlightItem}>
              <View style={styles.highlightNewRing}>
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 22 }}>+</Text>
              </View>
              <Text style={styles.highlightLabel}>New</Text>
            </View>
          )}
          {HIGHLIGHTS.map(h => (
            <View key={h.id} style={styles.highlightItem}>
              <View style={styles.highlightRing}>
                <Image source={{ uri: h.cover }} style={styles.highlightImg} />
              </View>
              <Text style={styles.highlightLabel}>{h.title}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {(['posts', 'reels', 'saved'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={tab === 'posts' ? 'grid-outline' : tab === 'reels' ? 'film-outline' : 'bookmark-outline'}
                size={22}
                color={activeTab === tab ? '#fff' : 'rgba(255,255,255,0.3)'}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Grid */}
        {activeTab === 'posts' && (
          <View style={styles.grid}>
            {posts.map((post, i) => (
              <TouchableOpacity key={`${post.id}-${i}`} style={[styles.gridItem, { width: COL, height: COL }]}>
                <Image source={{ uri: post.mediaUrl }} style={{ width: '100%', height: '100%' }} />
              </TouchableOpacity>
            ))}
            {/* Fill with placeholders */}
            {[1,2,3,4,5,6,7,8].map(i => (
              <TouchableOpacity key={`ph-${i}`} style={[styles.gridItem, { width: COL, height: COL }]}>
                <Image source={{ uri: `https://picsum.photos/seed/prof${i}/300` }} style={{ width: '100%', height: '100%' }} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'reels' && (
          <View style={styles.grid}>
            {[1,2,3,4,5,6].map(i => (
              <TouchableOpacity key={i} style={[styles.gridItem, { width: COL, height: COL * 1.5 }]}>
                <Image source={{ uri: `https://picsum.photos/seed/reel${i}prof/300/450` }} style={{ width: '100%', height: '100%' }} />
                <View style={{ position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Ionicons name="play" size={11} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>{(Math.random() * 50 + 1).toFixed(0)}K</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {activeTab === 'saved' && (
          <View style={styles.emptyState}>
            <Ionicons name="bookmark-outline" size={48} color="rgba(255,255,255,0.15)" />
            <Text style={styles.emptyText}>No saved posts</Text>
          </View>
        )}
      </ScrollView>

      {/* Followers Modal */}
      <Modal visible={!!followModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setFollowModal(null)} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{followModal === 'followers' ? 'Followers' : 'Following'}</Text>
            {[CURRENT_USER, ...MOCK_USERS.slice(0, 4)].map(u => (
              <View key={u.id} style={styles.followListItem}>
                <Image source={{ uri: u.avatar }} style={styles.followListAvatar} />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.followListName}>{u.username}</Text>
                    {u.verified && <VerifiedBadge type={u.verificationType} size="sm" />}
                  </View>
                  <Text style={styles.followListMeta}>{u.fullName}</Text>
                </View>
                <TouchableOpacity style={styles.followListBtn}>
                  <Text style={styles.followListBtnText}>Follow</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  coverContainer: { height: 120, position: 'relative' },
  cover: { width: '100%', height: '100%' },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.2)' },
  backBtn: { position: 'absolute', top: 12, left: 14, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 6 },
  settingsBtn: { position: 'absolute', top: 12, right: 14, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 6 },
  avatarContainer: { position: 'relative' },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 14, marginTop: -48 },
  avatar: { width: 90, height: 90, borderRadius: 45, borderWidth: 4, borderColor: '#000' },
  verifiedOverlay: { position: 'absolute', bottom: 2, right: 2, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#000', overflow: 'hidden' },
  actionsRow: { flexDirection: 'row', gap: 8, paddingBottom: 6 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  editBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  verifyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(99,102,241,0.15)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  verifyBtnText: { color: '#818cf8', fontSize: 12, fontWeight: '600' },
  followBtn: { backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 20, paddingVertical: 8 },
  followingBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  followBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  messageBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 20, padding: 8 },
  infoSection: { paddingHorizontal: 14, marginTop: 10, marginBottom: 14 },
  fullName: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  verifiedPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  verifiedPillText: { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
  username: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  pronouns: { fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 },
  bio: { fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 18, marginTop: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  metaText: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  majorPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(99,102,241,0.1)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, marginTop: 6 },
  majorPillText: { fontSize: 11, color: '#818cf8' },
  stats: { flexDirection: 'row', gap: 24, marginTop: 14 },
  statItem: { alignItems: 'center' },
  statNum: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  statLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 },
  highlightItem: { alignItems: 'center', gap: 4, width: 68 },
  highlightRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  highlightNewRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  highlightImg: { width: '100%', height: '100%' },
  highlightLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  gridItem: { overflow: 'hidden' },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyText: { color: 'rgba(255,255,255,0.3)', marginTop: 8, fontSize: 13 },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '60%' },
  modalHandle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
  followListItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  followListAvatar: { width: 42, height: 42, borderRadius: 21 },
  followListName: { fontSize: 13, fontWeight: 'bold', color: '#fff' },
  followListMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  followListBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  followListBtnText: { color: '#fff', fontSize: 12 },
});
