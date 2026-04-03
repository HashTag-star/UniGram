import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Modal, ActivityIndicator, Alert,
  TextInput, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfilePostsSkeleton, ProfileHeaderSkeleton } from '../components/Skeleton';
import { SettingsScreen } from './SettingsScreen';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { getProfile, getFollowers, getFollowing, isFollowing, followUser, unfollowUser, uploadAvatar, updateProfile } from '../services/profiles';
import { getUserPosts, getSavedPosts, getLikedPostIds } from '../services/posts';
import { getUserReels } from '../services/reels';
import { getUserStories } from '../services/stories';
import { FeedPost } from './FeedScreen';
import { createDirectConversation } from '../services/messages';
import { supabase } from '../lib/supabase';

let profileCache: Record<string, any> = {};
let profilePostsCache: Record<string, any[]> = {};
let profileReelsCache: Record<string, any[]> = {};
let profileStoriesCache: Record<string, any[]> = {};
let profileFollowersCache: Record<string, any[]> = {};
let profileFollowingCache: Record<string, any[]> = {};
let profileSavedCache: Record<string, any[]> = {};
let profileLikedSetCache: Record<string, Set<string>> = {};

const { width } = Dimensions.get('window');
const COL = (width - 2) / 3;

const verificationLabel: Record<string, string> = {
  student: 'Verified Student', professor: 'Verified Faculty',
  club: 'Verified Org', influencer: 'Notable Account', staff: 'Verified Staff',
};

interface Props {
  userId?: string;
  isOwn?: boolean;
  onVerifyPress?: () => void;
  onBack?: () => void;
  onMessagePress?: (convId: string, otherProfile: any) => void;
}

export const ProfileScreen: React.FC<Props> = ({
  userId: propUserId,
  isOwn: propIsOwn,
  onVerifyPress,
  onBack,
  onMessagePress,
}) => {
  const insets = useSafeAreaInsets();
  
  // Use propUserId or currentUserId (which we might only know later), 
  // but if propUserId is available, we can init from cache immediately.
  const initId = propUserId ?? 'own_profile';

  const [profile, setProfile] = useState<any>(profileCache[initId] || null);
  const [posts, setPosts] = useState<any[]>(profilePostsCache[initId] || []);
  const [reels, setReels] = useState<any[]>(profileReelsCache[initId] || []);
  const [stories, setStories] = useState<any[]>(profileStoriesCache[initId] || []);
  const [savedPosts, setSavedPosts] = useState<any[]>(profileSavedCache[initId] || []);
  const [followers, setFollowers] = useState<any[]>(profileFollowersCache[initId] || []);
  const [following, setFollowing] = useState<any[]>(profileFollowingCache[initId] || []);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [loading, setLoading] = useState(!profileCache[initId]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'saved' | 'threads' | 'stories'>('posts');
  const [likedIds, setLikedIds] = useState<Set<string>>(profileLikedSetCache[initId] || new Set());
  const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [isOwn, setIsOwn] = useState(propIsOwn ?? false);

  const [showEdit, setShowEdit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editPronouns, setEditPronouns] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [editMajor, setEditMajor] = useState('');
  const [editYear, setEditYear] = useState('');

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const targetId = propUserId ?? user.id;
      const own = propIsOwn ?? targetId === user.id;
      setIsOwn(own);

      const [prof, userPosts, userReels, userStoryData, followersList, followingList, likedSet] = await Promise.all([
        getProfile(targetId),
        getUserPosts(targetId),
        getUserReels(targetId),
        getUserStories(targetId),
        getFollowers(targetId),
        getFollowing(targetId),
        getLikedPostIds(targetId),
      ]);

      setProfile(prof);
      setPosts(userPosts);
      setReels(userReels);
      setStories(userStoryData);
      setFollowers(followersList);
      setFollowing(followingList);
      setLikedIds(new Set(likedSet));

      const cacheKey = propUserId ?? 'own_profile';
      profileCache[cacheKey] = prof;
      profileCache[targetId] = prof; // map both
      profilePostsCache[cacheKey] = userPosts;
      profileReelsCache[cacheKey] = userReels;
      profileStoriesCache[cacheKey] = userStoryData;
      profileFollowersCache[cacheKey] = followersList;
      profileFollowingCache[cacheKey] = followingList;
      profileLikedSetCache[cacheKey] = new Set(likedSet);

      if (!own) {
        const following = await isFollowing(user.id, targetId);
        setIsFollowingUser(following);
      }

      if (own) {
        const saved = await getSavedPosts(user.id);
        setSavedPosts(saved);
        profileSavedCache[cacheKey] = saved;
      }
    } catch (e) {
      console.error('Profile load error', e);
    } finally {
      setLoading(false);
    }
  }, [propUserId, propIsOwn]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFollow = async () => {
    if (!profile) return;
    const next = !isFollowingUser;
    setIsFollowingUser(next);
    setProfile((p: any) => ({ ...p, followers_count: next ? p.followers_count + 1 : p.followers_count - 1 }));
    try {
      if (next) await followUser(currentUserId, profile.id);
      else await unfollowUser(currentUserId, profile.id);
    } catch (e: any) {
      Alert.alert('Follow Error', e.message ?? 'Failed to update following status');
      setIsFollowingUser(!next);
      setProfile((p: any) => ({ ...p, followers_count: !next ? p.followers_count + 1 : p.followers_count - 1 }));
    }
  };

  const handleMessage = async () => {
    if (!profile) return;
    try {
      const convId = await createDirectConversation(currentUserId, profile.id);
      onMessagePress?.(convId, profile);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  const openEdit = () => {
    setEditName(profile?.full_name ?? '');
    setEditBio(profile?.bio ?? '');
    setEditPronouns(profile?.pronouns ?? '');
    setEditWebsite(profile?.website ?? '');
    setEditMajor(profile?.major ?? '');
    setEditYear(profile?.year ?? '');
    setShowEdit(true);
  };

  const saveEdit = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await updateProfile(profile.id, {
        full_name: editName.trim(),
        bio: editBio.trim(),
        pronouns: editPronouns.trim(),
        website: editWebsite.trim(),
        major: editMajor.trim(),
        year: editYear.trim(),
      });
      setProfile((p: any) => ({
        ...p,
        full_name: editName.trim(),
        bio: editBio.trim(),
        pronouns: editPronouns.trim(),
        website: editWebsite.trim(),
        major: editMajor.trim(),
        year: editYear.trim(),
      }));
      setShowEdit(false);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async () => {
    if (!profile) return;
    try {
      const url = await uploadAvatar(profile.id);
      if (url) setProfile((p: any) => ({ ...p, avatar_url: url }));
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ProfileHeaderSkeleton />
        <ProfilePostsSkeleton colSize={COL} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#555' }}>Profile not found</Text>
      </View>
    );
  }

  const FollowListModal = () => (
    <Modal visible={!!followModal} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setFollowModal(null)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{followModal === 'followers' ? 'Followers' : 'Following'}</Text>
          <ScrollView>
            {(followModal === 'followers' ? followers : following).map((u: any) => (
              <View key={u.id} style={styles.followListItem}>
                {u.avatar_url
                  ? <Image source={{ uri: u.avatar_url }} style={styles.followListAvatar} />
                  : <View style={[styles.followListAvatar, { backgroundColor: '#222' }]} />
                }
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={styles.followListName}>{u.username}</Text>
                    {u.is_verified && <VerifiedBadge type={u.verification_type} size="sm" />}
                  </View>
                  <Text style={styles.followListMeta}>{u.full_name}</Text>
                </View>
              </View>
            ))}
            {(followModal === 'followers' ? followers : following).length === 0 && (
              <Text style={{ color: '#555', textAlign: 'center', padding: 20 }}>
                No {followModal} yet
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {/* Cover */}
        <View style={styles.coverContainer}>
          {profile.cover_url
            ? <Image source={{ uri: profile.cover_url }} style={styles.cover} />
            : <View style={[styles.cover, { backgroundColor: '#1a1a2e' }]} />
          }
          <View style={styles.coverOverlay} />
          {onBack && (
            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
          )}
          {isOwn && (
            <TouchableOpacity style={styles.settingsBtn} onPress={() => setShowSettings(true)}>
              <Ionicons name="settings-outline" size={22} color="#fff" />
            </TouchableOpacity>
          )}
        </View>

        {/* Avatar row */}
        <View style={styles.avatarRow}>
          <TouchableOpacity onPress={isOwn ? handleAvatarUpload : undefined} style={styles.avatarContainer}>
            {profile.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              : <View style={[styles.avatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={36} color="#555" />
                </View>
            }
            {profile.is_verified && (
              <View style={styles.verifiedOverlay}>
                <VerifiedBadge type={profile.verification_type} size="md" />
              </View>
            )}
            {isOwn && (
              <View style={styles.editAvatarBtn}>
                <Ionicons name="camera" size={10} color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <View style={styles.actionsRow}>
            {isOwn ? (
              <>
                <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
                  <Ionicons name="pencil" size={14} color="#fff" />
                  <Text style={styles.editBtnText}>Edit Profile</Text>
                </TouchableOpacity>
                {!profile.is_verified && (
                  <TouchableOpacity style={styles.verifyBtn} onPress={onVerifyPress}>
                    <Ionicons name="shield-checkmark-outline" size={14} color="#818cf8" />
                    <Text style={styles.verifyBtnText}>Get Verified</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <TouchableOpacity onPress={toggleFollow} style={[styles.followBtn, isFollowingUser && styles.followingBtn]}>
                  <Text style={[styles.followBtnText, isFollowingUser && { color: 'rgba(255,255,255,0.5)' }]}>
                    {isFollowingUser ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.messageBtn} onPress={handleMessage}>
                  <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.fullName}>{profile.full_name}</Text>
            {profile.is_verified && (
              <View style={styles.verifiedPill}>
                <VerifiedBadge type={profile.verification_type} size="sm" />
                <Text style={styles.verifiedPillText}>{verificationLabel[profile.verification_type ?? 'student']}</Text>
              </View>
            )}
          </View>
          <Text style={styles.username}>@{profile.username}</Text>
          {profile.pronouns ? <Text style={styles.pronouns}>{profile.pronouns}</Text> : null}
          {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}
          {profile.university ? (
            <View style={styles.metaRow}>
              <Ionicons name="location-outline" size={13} color="rgba(255,255,255,0.4)" />
              <Text style={styles.metaText}>{profile.university}{profile.year ? ` · Class of ${profile.year}` : ''}</Text>
            </View>
          ) : null}
          {profile.website ? (
            <View style={styles.metaRow}>
              <Ionicons name="link-outline" size={13} color="#818cf8" />
              <Text style={[styles.metaText, { color: '#818cf8' }]}>{profile.website}</Text>
            </View>
          ) : null}
          {profile.major ? (
            <View style={styles.majorPill}>
              <Text style={styles.majorPillText}>{profile.major}</Text>
            </View>
          ) : null}

          <View style={styles.stats}>
            <View style={styles.statItem}>
              <Text style={styles.statNum}>{profile.posts_count ?? posts.length}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <TouchableOpacity style={styles.statItem} onPress={() => setFollowModal('followers')}>
              <Text style={styles.statNum}>{(profile.followers_count ?? 0).toLocaleString()}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.statItem} onPress={() => setFollowModal('following')}>
              <Text style={styles.statNum}>{(profile.following_count ?? 0).toLocaleString()}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab bar */}
        <View style={styles.tabBar}>
          {(['posts', 'threads', 'stories', 'reels', 'saved'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Ionicons
                name={tab === 'posts' ? 'image-outline' : tab === 'threads' ? 'chatbubbles-outline' : tab === 'stories' ? 'time-outline' : tab === 'reels' ? 'film-outline' : 'bookmark-outline'}
                size={22}
                color={activeTab === tab ? '#fff' : 'rgba(255,255,255,0.3)'}
              />
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'posts' && (
          posts.filter(p => !['thread', 'video'].includes(p.type)).length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="camera-outline" size={48} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No posts yet</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {posts.filter(p => !['thread'].includes(p.type) && p.media_url).map(post => (
                <TouchableOpacity key={post.id} style={[styles.gridItem, { width: COL, height: COL }]}>
                  <Image source={{ uri: post.media_url }} style={{ width: '100%', height: '100%' }} />
                </TouchableOpacity>
              ))}
            </View>
          )
        )}

        {activeTab === 'threads' && (
          posts.filter(p => p.type === 'thread').length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="chatbubbles-outline" size={48} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No threads yet</Text>
            </View>
          ) : (
            <View>
              {posts.filter(p => p.type === 'thread').map(post => (
                <FeedPost 
                  key={post.id} 
                  post={post} 
                  currentUserId={currentUserId} 
                  isLiked={likedIds.has(post.id)}
                  isSaved={savedPosts.some(s => s.id === post.id)} 
                />
              ))}
            </View>
          )
        )}

        {activeTab === 'stories' && (
          stories.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={48} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No stories yet</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {stories.filter(s => s.media_url).map(story => (
                <TouchableOpacity key={story.id} style={[styles.gridItem, { width: COL, height: COL * 1.5 }]}>
                  <Image source={{ uri: story.media_url }} style={{ width: '100%', height: '100%' }} />
                </TouchableOpacity>
              ))}
            </View>
          )
        )}

        {activeTab === 'reels' && (
          reels.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="film-outline" size={48} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No reels yet</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {reels.map(reel => (
                <TouchableOpacity key={reel.id} style={[styles.gridItem, { width: COL, height: COL * 1.5 }]}>
                  {reel.thumbnail_url
                    ? <Image source={{ uri: reel.thumbnail_url }} style={{ width: '100%', height: '100%' }} />
                    : <View style={{ width: '100%', height: '100%', backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="film-outline" size={24} color="#333" />
                      </View>
                  }
                  <View style={{ position: 'absolute', bottom: 6, left: 6, flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="play" size={11} color="#fff" />
                    <Text style={{ color: '#fff', fontSize: 10, fontWeight: '600' }}>{reel.views_count ?? 0}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )
        )}

        {activeTab === 'saved' && isOwn && (
          savedPosts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="bookmark-outline" size={48} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No saved posts</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {savedPosts.filter(p => p?.media_url).map((post: any) => (
                <TouchableOpacity key={post.id} style={[styles.gridItem, { width: COL, height: COL }]}>
                  <Image source={{ uri: post.media_url }} style={{ width: '100%', height: '100%' }} />
                </TouchableOpacity>
              ))}
            </View>
          )
        )}
      </ScrollView>

      <FollowListModal />

      {/* ── Settings ─────────────────────────────────────────────── */}
      <SettingsScreen
        visible={showSettings}
        profile={profile}
        onClose={() => setShowSettings(false)}
        onProfileUpdated={updated => { setProfile(updated); setShowSettings(false); }}
      />

      {/* ── Edit Profile Modal ─────────────────────────────────────── */}
      <Modal visible={showEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEdit(false)}>
        <KeyboardAvoidingView
          style={[editStyles.container, { paddingTop: insets.top || 16 }]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={editStyles.header}>
            <TouchableOpacity onPress={() => setShowEdit(false)}>
              <Text style={editStyles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={editStyles.title}>Edit Profile</Text>
            <TouchableOpacity onPress={saveEdit} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#818cf8" size="small" />
                : <Text style={editStyles.save}>Save</Text>
              }
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 4 }} keyboardShouldPersistTaps="handled">
            {[
              { label: 'Name', value: editName, onChange: setEditName, placeholder: 'Full name' },
              { label: 'Bio', value: editBio, onChange: setEditBio, placeholder: 'Write a bio...', multi: true },
              { label: 'Pronouns', value: editPronouns, onChange: setEditPronouns, placeholder: 'e.g. they/them' },
              { label: 'Website', value: editWebsite, onChange: setEditWebsite, placeholder: 'https://...', keyboard: 'url' as any },
              { label: 'Major', value: editMajor, onChange: setEditMajor, placeholder: 'Your major' },
              { label: 'Year', value: editYear, onChange: setEditYear, placeholder: 'e.g. 2026', keyboard: 'numeric' as any },
            ].map(({ label, value, onChange, placeholder, multi, keyboard }) => (
              <View key={label} style={editStyles.field}>
                <Text style={editStyles.label}>{label}</Text>
                <TextInput
                  style={[editStyles.input, multi && { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                  value={value}
                  onChangeText={onChange}
                  placeholder={placeholder}
                  placeholderTextColor="rgba(255,255,255,0.25)"
                  multiline={multi}
                  keyboardType={keyboard}
                  autoCapitalize="none"
                />
              </View>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
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
  editAvatarBtn: { position: 'absolute', bottom: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#000' },
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
  tabBar: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#fff' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  gridItem: { overflow: 'hidden' },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyText: { color: 'rgba(255,255,255,0.3)', marginTop: 8, fontSize: 13 },
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

const editStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  title: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancel: { fontSize: 15, color: 'rgba(255,255,255,0.5)' },
  save: { fontSize: 15, fontWeight: '700', color: '#818cf8' },
  field: { marginBottom: 16 },
  label: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    color: '#fff', fontSize: 15,
  },
});
