import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Modal, ActivityIndicator, Alert,
  TextInput, KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfilePostsSkeleton, ProfileHeaderSkeleton } from '../components/Skeleton';
import { SettingsScreen } from './SettingsScreen';
import { VerificationScreen } from './VerificationScreen';
import { AdminScreen } from './AdminScreen';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { getProfile, getFollowers, getFollowing, isFollowing, followUser, unfollowUser, uploadAvatar, updateProfile } from '../services/profiles';
import { getUserPosts, getSavedPosts, getLikedPostIds, updatePost } from '../services/posts';
import { getUserReels } from '../services/reels';
import { FeedPost } from './FeedScreen';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';

const { width } = Dimensions.get('window');
const COL = (width - 2) / 3;

interface Props {
  userId?: string;
  isOwn?: boolean;
  isVisible?: boolean;
  onVerifyPress?: () => void;
  onBack?: () => void;
  onMessagePress?: (convId: string, otherProfile: any) => void;
}

export const ProfileScreen: React.FC<Props> = ({
  userId: propUserId,
  isOwn: propIsOwn,
  isVisible,
  onVerifyPress,
  onBack,
  onMessagePress,
}) => {
  const insets = useSafeAreaInsets();
  const { selection, success, medium } = useHaptics();

  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [reels, setReels] = useState<any[]>([]);
  const [taggedPosts, setTaggedPosts] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [isFollowingUser, setIsFollowingUser] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'tagged' | 'saved' | 'threads'>('posts');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState('');
  const [isOwn, setIsOwn] = useState(propIsOwn ?? false);
  const [focusedPost, setFocusedPost] = useState<any>(null);

  const [showEdit, setShowEdit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showEditPost, setShowEditPost] = useState(false);
  const [editPostCaption, setEditPostCaption] = useState('');
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

      const [prof, userPosts, userReels, followersList, followingList, likedSet, savedSet, taggedData] = await Promise.all([
        getProfile(targetId),
        getUserPosts(targetId),
        getUserReels(targetId),
        getFollowers(targetId),
        getFollowing(targetId),
        getLikedPostIds(user.id),
        own ? getSavedPosts(user.id) : Promise.resolve([]),
        supabase.from('posts').select('*, profiles(*)').contains('tagged_users', [targetId]).order('created_at', { ascending: false }).then(r => r.data || []),
      ]);

      setProfile(prof);
      setPosts(userPosts);
      setReels(userReels);
      setFollowers(followersList);
      setFollowing(followingList);
      setLikedIds(new Set(likedSet));
      setSavedPosts(savedSet);
      setTaggedPosts(taggedData);

      if (!own) {
        const following = await isFollowing(user.id, targetId);
        setIsFollowingUser(following);
      }
    } catch (e) {
      console.error('Profile load error', e);
    } finally {
      setLoading(false);
    }
  }, [propUserId, propIsOwn]);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleFollow = async () => {
    if (!profile) return;
    const next = !isFollowingUser;
    setIsFollowingUser(next);
    setProfile((p: any) => ({ ...p, followers_count: next ? p.followers_count + 1 : p.followers_count - 1 }));
    try {
      if (next) await followUser(currentUserId, profile.id);
      else await unfollowUser(currentUserId, profile.id);
      await medium();
    } catch (e: any) {
      Alert.alert('Error', 'Failed to update follow status');
      setIsFollowingUser(!next);
    }
  };

  const handleAvatarChange = async () => {
    if (!isOwn) return;
    try {
      const url = await uploadAvatar(currentUserId);
      if (url) {
        setProfile((p: any) => ({ ...p, avatar_url: url }));
        await success();
      }
    } catch (e: any) {
      Alert.alert('Upload Error', e.message);
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
        full_name: editName.trim(), bio: editBio.trim(),
        pronouns: editPronouns.trim(), website: editWebsite.trim(),
        major: editMajor.trim(), year: editYear.trim(),
      });
      await success();
      await load();
      setShowEdit(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const initiateEditPost = () => {
    if (!focusedPost) return;
    setEditPostCaption(focusedPost.caption || '');
    setShowEditPost(true);
  };

  const handlePostUpdate = async () => {
    if (!focusedPost) return;
    setSaving(true);
    try {
      await updatePost(focusedPost.id, currentUserId, { caption: editPostCaption });
      setFocusedPost({ ...focusedPost, caption: editPostCaption });
      setPosts(prev => prev.map(p => p.id === focusedPost.id ? { ...p, caption: editPostCaption } : p));
      await success();
      setShowEditPost(false);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <View style={styles.container}>
      <ProfileHeaderSkeleton />
      <ProfilePostsSkeleton colSize={COL} />
    </View>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {/* Cover & Header Section */}
        <View style={styles.coverSection}>
          <Image source={{ uri: profile?.cover_url || 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=1000' }} style={styles.cover} />
          <View style={styles.coverOverlay} />
          <View style={styles.headerTop}>
            {onBack && (
              <TouchableOpacity onPress={onBack} style={styles.navBtn}>
                <Ionicons name="chevron-back" size={24} color="#fff" />
              </TouchableOpacity>
            )}
            <View style={{ flex: 1 }} />
            {isOwn && (
              <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.navBtn}>
                <Ionicons name="settings-outline" size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Profile Info */}
        <View style={styles.infoSection}>
          <View style={styles.avatarRow}>
            <View style={styles.avatarContainer}>
              <View style={[styles.avatarRing, profile?.is_verified && { borderColor: '#818cf8' }]}>
                <Image source={{ uri: profile?.avatar_url || 'https://via.placeholder.com/150' }} style={styles.avatar} />
                {isOwn && (
                  <TouchableOpacity style={styles.avatarEditOverlay} onPress={handleAvatarChange}>
                    <Ionicons name="camera" size={24} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
              {profile?.is_verified && (
                <View style={styles.verifiedBadgeRow}>
                  <VerifiedBadge type={profile.verification_type} size="sm" />
                </View>
              )}
            </View>

            <View style={styles.profileActions}>
              <View style={styles.actionRow}>
                {isOwn ? (
                  <>
                    <TouchableOpacity style={styles.editBtn} onPress={openEdit}>
                      <Text style={styles.btnText}>Edit Profile</Text>
                    </TouchableOpacity>
                    {!profile?.is_verified && (
                      <TouchableOpacity style={styles.verifyBtn} onPress={() => setShowVerification(true)}>
                        <Ionicons name="shield-checkmark" size={16} color="#fff" />
                        <Text style={styles.verifyText}>Get Verified</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <>
                    <TouchableOpacity 
                      style={[styles.followBtn, isFollowingUser && styles.followingBtn]} 
                      onPress={toggleFollow}
                    >
                      <Text style={styles.followBtnText}>{isFollowingUser ? 'Following' : 'Follow'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.msgBtn} onPress={() => {/* message logic */}}>
                      <Ionicons name="chatbubble-outline" size={18} color="#fff" />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>

          <View style={{ marginTop: 12 }}>
            <Text style={styles.nameText}>{profile?.full_name}</Text>
            <Text style={styles.usernameText}>@{profile?.username}</Text>
            {profile?.bio && <Text style={styles.bioText}>{profile.bio}</Text>}
            <View style={styles.metaRow}>
              {profile?.major && (
                <View style={styles.majorTag}>
                  <Text style={styles.majorTagText}>{profile.major}</Text>
                </View>
              )}
              {profile?.university && <Text style={styles.metaLabel}>{profile.university}</Text>}
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}><Text style={styles.statVal}>{posts.length}</Text><Text style={styles.statLab}>Posts</Text></View>
            <View style={styles.statItem}><Text style={styles.statVal}>{profile?.followers_count || 0}</Text><Text style={styles.statLab}>Followers</Text></View>
            <View style={styles.statItem}><Text style={styles.statVal}>{profile?.following_count || 0}</Text><Text style={styles.statLab}>Following</Text></View>
          </View>
        </View>

        {/* Tabs — must be a plain View, direct child of ScrollView for stickyHeaderIndices to work */}
        <View style={styles.tabHeader}>
          <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('posts'); }}>
            <Ionicons name={activeTab === 'posts' ? 'apps' : 'apps-outline'} size={22} color={activeTab === 'posts' ? '#fff' : 'rgba(255,255,255,0.35)'} />
            {activeTab === 'posts' && <View style={styles.tabActiveBar} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('reels'); }}>
            <Ionicons name={activeTab === 'reels' ? 'film' : 'film-outline'} size={22} color={activeTab === 'reels' ? '#fff' : 'rgba(255,255,255,0.35)'} />
            {activeTab === 'reels' && <View style={styles.tabActiveBar} />}
          </TouchableOpacity>
          <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('threads'); }}>
            <Ionicons name={activeTab === 'threads' ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={activeTab === 'threads' ? '#fff' : 'rgba(255,255,255,0.35)'} />
            {activeTab === 'threads' && <View style={styles.tabActiveBar} />}
          </TouchableOpacity>
          {isOwn && (
            <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('saved'); }}>
              <Ionicons name={activeTab === 'saved' ? 'bookmark' : 'bookmark-outline'} size={22} color={activeTab === 'saved' ? '#fff' : 'rgba(255,255,255,0.35)'} />
              {activeTab === 'saved' && <View style={styles.tabActiveBar} />}
            </TouchableOpacity>
          )}
          {isOwn && (
            <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('tagged'); }}>
              <Ionicons name={activeTab === 'tagged' ? 'person-add' : 'person-add-outline'} size={22} color={activeTab === 'tagged' ? '#fff' : 'rgba(255,255,255,0.35)'} />
              {activeTab === 'tagged' && <View style={styles.tabActiveBar} />}
            </TouchableOpacity>
          )}
        </View>

        {/* Content Section */}
        <View style={styles.tabContent}>
          {activeTab === 'posts' && (
            <View style={styles.grid}>
              {posts.filter(p => p.type !== 'thread').map(post => (
                <TouchableOpacity key={post.id} style={styles.gridBtn} onPress={() => setFocusedPost(post)}>
                  <Image source={{ uri: post.media_url || post.media_urls?.[0] }} style={styles.gridImg} />
                  {post.media_urls?.length > 1 && <View style={styles.mediaBadge}><Ionicons name="layers" size={12} color="#fff" /></View>}
                  {post.type === 'video' && <View style={styles.mediaBadge}><Ionicons name="play" size={12} color="#fff" /></View>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeTab === 'reels' && (
            <View style={styles.grid}>
              {reels.map(reel => (
                <TouchableOpacity key={reel.id} style={[styles.gridBtn, { height: COL * 1.6 }]} onPress={() => setFocusedPost(reel)}>
                  <Image source={{ uri: reel.thumbnail_url }} style={styles.gridImg} />
                  <View style={styles.reelMeta}>
                    <Ionicons name="play-outline" size={12} color="#fff" />
                    <Text style={styles.reelMetaText}>{reel.views_count || 0}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeTab === 'tagged' && (
            <View style={styles.grid}>
              {taggedPosts.map(post => (
                <TouchableOpacity key={post.id} style={styles.gridBtn} onPress={() => setFocusedPost(post)}>
                  <Image source={{ uri: post.media_url || post.media_urls?.[0] }} style={styles.gridImg} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeTab === 'saved' && (
            <View style={styles.grid}>
              {savedPosts.map(post => (
                <TouchableOpacity key={post.id} style={styles.gridBtn} onPress={() => setFocusedPost(post)}>
                  <Image source={{ uri: post.media_url || post.media_urls?.[0] }} style={styles.gridImg} />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeTab === 'threads' && (
            <View>
              {posts.filter(p => p.type === 'thread').map(post => (
                <FeedPost 
                  key={post.id} 
                  post={post} 
                  currentUserId={currentUserId} 
                  isLiked={likedIds.has(post.id)}
                  isMuted={true}
                  setIsMuted={() => {}}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Admin Dashboard Modal */}
      <Modal visible={showAdmin} animationType="slide" onRequestClose={() => setShowAdmin(false)}>
        <AdminScreen onBack={() => setShowAdmin(false)} adminId={currentUserId} />
      </Modal>

      {/* Focus Modal */}
      <Modal visible={!!focusedPost} transparent animationType="fade" onRequestClose={() => setFocusedPost(null)}>
        <View style={styles.focusContainer}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setFocusedPost(null)} />
          <View style={[styles.focusContent, { marginTop: insets.top + 10 }]}>
            <View style={styles.focusHeader}>
              <TouchableOpacity onPress={() => setFocusedPost(null)}><Ionicons name="chevron-back" size={28} color="#fff" /></TouchableOpacity>
              <Text style={styles.focusTitle}>Post</Text>
              {focusedPost?.user_id === currentUserId ? (
                <TouchableOpacity onPress={initiateEditPost}>
                  <Text style={{ color: '#818cf8', fontWeight: 'bold' }}>Edit</Text>
                </TouchableOpacity>
              ) : <View style={{ width: 28 }} />}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {focusedPost && (
                <FeedPost 
                  post={focusedPost} 
                  currentUserId={currentUserId} 
                  isLiked={likedIds.has(focusedPost.id)}
                  isMuted={false}
                  setIsMuted={() => {}}
                />
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Edit Post Caption Modal */}
      <Modal visible={showEditPost} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.editPostContainer}>
           <View style={styles.editPostContent}>
              <View style={styles.editPostHeader}>
                <TouchableOpacity onPress={() => setShowEditPost(false)}><Text style={{ color: '#fff' }}>Cancel</Text></TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Edit Caption</Text>
                <TouchableOpacity onPress={handlePostUpdate} disabled={saving}>
                  <Text style={{ color: '#6366f1', fontWeight: 'bold' }}>{saving ? '...' : 'Done'}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.editPostInput}
                value={editPostCaption}
                onChangeText={setEditPostCaption}
                multiline
                autoFocus
              />
           </View>
        </KeyboardAvoidingView>
      </Modal>

      <SettingsScreen visible={showSettings} profile={profile} onClose={() => setShowSettings(false)} onProfileUpdated={setProfile} onAdminPress={() => { setShowSettings(false); setShowAdmin(true); }} />
      <VerificationScreen visible={showVerification} onClose={() => setShowVerification(false)} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  coverSection: { height: 160, position: 'relative' },
  cover: { width: '100%', height: '100%' },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  headerTop: { position: 'absolute', top: 50, left: 16, right: 16, flexDirection: 'row', alignItems: 'center' },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  
  infoSection: { marginTop: -40, paddingHorizontal: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  avatarContainer: { position: 'relative' },
  avatarRing: { 
    width: 86, height: 86, borderRadius: 43, 
    borderWidth: 3, borderColor: '#000', overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  avatar: { width: '100%', height: '100%' },
  avatarEditOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  verifiedBadgeRow: { position: 'absolute', bottom: 0, right: -4 },
  
  profileActions: { alignItems: 'center', marginBottom: 6 },
  actionRow: { flexDirection: 'row', gap: 8 },
  editBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  verifyBtn: { backgroundColor: 'rgba(129, 140, 248, 0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(129, 140, 248, 0.3)' },
  verifyText: { color: '#818cf8', fontWeight: '600', fontSize: 13 },
  btnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  followBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 8 },
  followingBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  followBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  msgBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },

  nameText: { fontSize: 20, fontWeight: '800', color: '#fff' },
  usernameText: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  bioText: { color: 'rgba(255,255,255,0.8)', marginTop: 10, lineHeight: 20, fontSize: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  majorTag: { backgroundColor: 'rgba(99,102,241,0.12)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)' },
  majorTagText: { color: '#818cf8', fontSize: 12, fontWeight: '700' },
  metaLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '500' },

  statsRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    marginTop: 20, 
    paddingVertical: 14, 
    borderTopWidth: 1, 
    borderBottomWidth: 1, 
    borderColor: 'rgba(255,255,255,0.06)',
    width: '100%',
  },
  statItem: { alignItems: 'center' },
  statVal: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  statLab: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },

  tabHeader: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#000',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  tabBtn: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  tabActiveBar: {
    position: 'absolute',
    bottom: 0,
    left: '20%',
    right: '20%',
    height: 2,
    backgroundColor: '#fff',
    borderRadius: 1,
  },
  tabContent: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridBtn: { width: COL, height: COL, margin: 0.33, position: 'relative' },
  gridImg: { width: '100%', height: '100%' },
  mediaBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: 3 },
  reelMeta: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  reelMetaText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  focusContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  focusContent: { flex: 1, backgroundColor: '#000', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  focusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  focusTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  editPostContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  editPostContent: { backgroundColor: '#111', padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  editPostHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  editPostInput: { color: '#fff', fontSize: 15, backgroundColor: '#222', borderRadius: 10, padding: 12, height: 120, textAlignVertical: 'top' },
});
