import React, { useCallback, useEffect, useState, useMemo } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Modal, ActivityIndicator, Alert,
  TextInput, KeyboardAvoidingView, Platform, RefreshControl,
  DeviceEventEmitter, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProfilePostsSkeleton, ProfileHeaderSkeleton } from '../components/Skeleton';
import { EditProfileModal } from './EditProfileModal';
import { SettingsScreen } from './SettingsScreen';
import { VerificationScreen } from './VerificationScreen';
import { AdminScreen } from './AdminScreen';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CachedImage } from '../components/CachedImage';
import { getProfile, getFollowers, getFollowing, isFollowing, followUser, unfollowUser, uploadAvatar, updateProfile } from '../services/profiles';
import { getUserPosts, getSavedPosts, getLikedPostIds, updatePost } from '../services/posts';
import { getUserReels } from '../services/reels';
import { FeedPost } from '../components/FeedPost';
import { PostDetailModal } from '../components/PostDetailModal';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import { useSocialFollow } from '../hooks/useSocialSync';
import { SocialSync } from '../services/social_sync';
import { recordProfileView } from '../services/algorithm';
import { AccountService } from '../services/accounts';
import { isProActive, getPostAnalytics, getProfileAnalytics, recordProfileViewAnalytics, getAIInsights } from '../services/pro';
import { LinearGradient } from 'expo-linear-gradient';
import { ProSheet } from '../components/ProSheet';
import { useTheme } from '../context/ThemeContext';
import { usePopup } from '../context/PopupContext';
import { useToast } from '../context/ToastContext';
import { UsersListSheet } from '../components/UsersListSheet';
import { ProfilePicViewer } from '../components/ProfilePicViewer';

const { width, height } = Dimensions.get('window');
const COL = (width - 2) / 3;

interface Props {
  userId?: string;
  isOwn?: boolean;
  isVisible?: boolean;
  onVerifyPress?: () => void;
  onBack?: () => void;
  onMessagePress?: (convId: string, otherProfile: any) => void;
  onShowPrivacy?: () => void;
  onShowTerms?: () => void;
  onShowGuidelines?: () => void;
  refreshKey?: number;
}

export const ProfileScreen = React.memo<Props>(({
  userId: propUserId,
  isOwn: propIsOwn,
  isVisible,
  onVerifyPress,
  onBack,
  onMessagePress,
  onShowPrivacy,
  onShowTerms,
  onShowGuidelines,
  refreshKey,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const { showPopup } = usePopup();
  const { showToast } = useToast();
  const { selection, success, medium } = useHaptics();

  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [reels, setReels] = useState<any[]>([]);
  const [taggedPosts, setTaggedPosts] = useState<any[]>([]);
  const [savedPosts, setSavedPosts] = useState<any[]>([]);
  const [followers, setFollowers] = useState<any[]>([]);
  const [following, setFollowing] = useState<any[]>([]);
  const [isFollowingUser, setIsFollowingUser] = useSocialFollow(propUserId ?? '', false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'tagged' | 'saved' | 'threads' | 'analytics'>('posts');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState('');
  const [isOwn, setIsOwn] = useState(propIsOwn ?? false);
  const [focusedPost, setFocusedPost] = useState<any>(null);
  const [isSuspended, setIsSuspended] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showFollowersSheet, setShowFollowersSheet] = useState(false);
  const [showFollowingSheet, setShowFollowingSheet] = useState(false);
  const [showPicViewer, setShowPicViewer] = useState(false);
  const [showEditPost, setShowEditPost] = useState(false);
  const [editPostCaption, setEditPostCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [activeAccounts, setActiveAccounts] = useState<any[]>([]);
  const [showProSheet, setShowProSheet] = useState(false);
  const [proAnalytics, setProAnalytics] = useState<any>(null);
  const [postAnalytics, setPostAnalytics] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [aiInsights, setAiInsights] = useState<string[] | null>(null);
  const [aiOutlook, setAiOutlook] = useState<'positive' | 'neutral' | 'needs_work' | null>(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);
  const [aiInsightsError, setAiInsightsError] = useState<string | null>(null);
  const aiLoadedRef = React.useRef(false);

  const isPro = isProActive(profile);

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
        supabase.from('posts')
          .select(`
            id, user_id, type, caption, media_url, media_urls, location, song, 
            likes_count, comments_count, reposts_count, created_at, tagged_users, is_flagged, aspect_ratio,
            profiles!posts_user_id_fkey(id, username, avatar_url, is_verified, verification_type)
          `)
          .contains('tagged_users', [targetId])
          .order('created_at', { ascending: false })
          .then(r => r.data || []),
      ]);

      setProfile(prof);
      setPosts(userPosts);
      setReels(userReels);
      setFollowers(followersList);
      setFollowing(followingList);
      setLikedIds(new Set(likedSet));
      setSavedPosts(savedSet);
      setTaggedPosts(taggedData);
      setIsSuspended(!!(prof as any)?.is_suspended);

      if (!own) {
        const following = await isFollowing(user.id, targetId);
        setIsFollowingUser(following);
        recordProfileView(user.id, targetId).catch(() => {});
        recordProfileViewAnalytics(targetId, user.id).catch(() => {});
      }
    } catch (e: any) {
      showToast(e?.message || 'Failed to load profile.', 'error');
    } finally {
      setLoading(false);
    }
  }, [propUserId, propIsOwn]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    if (isOwn) {
      AccountService.getAccounts().then(setActiveAccounts);
    }
  }, [isOwn]);

  // Refresh account list every time the switcher opens so deleted accounts
  // don't linger after removeAccount has already cleared them from storage.
  useEffect(() => {
    if (showAccountSwitcher) {
      AccountService.getAccounts().then(setActiveAccounts);
    }
  }, [showAccountSwitcher]);

  useEffect(() => {
    const sub = SocialSync.on('REEL_DELETE', ({ targetId }) => {
      setReels(prev => prev.filter(r => r.id !== targetId));
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (activeTab !== 'analytics' || !isOwn || !isPro || !currentUserId) return;
    setAnalyticsLoading(true);
    setAnalyticsError(null);
    Promise.all([getProfileAnalytics(currentUserId), getPostAnalytics(currentUserId, 30)])
      .then(([pa, pa2]) => { setProAnalytics(pa); setPostAnalytics(pa2); })
      .catch((e: any) => setAnalyticsError(e?.message ?? 'Could not load analytics.'))
      .finally(() => setAnalyticsLoading(false));
  }, [activeTab, isOwn, isPro, currentUserId]);

  const loadAIInsights = useCallback(async () => {
    if (aiInsightsLoading) return;
    setAiInsightsLoading(true);
    setAiInsightsError(null);
    try {
      const result = await getAIInsights(currentUserId);
      setAiInsights(result.insights);
      setAiOutlook(result.outlook);
      aiLoadedRef.current = true;
    } catch (e: any) {
      setAiInsightsError(e?.message ?? 'AI insights unavailable.');
    } finally {
      setAiInsightsLoading(false);
    }
  }, [currentUserId, aiInsightsLoading]);

  useEffect(() => {
    if (activeTab !== 'analytics' || !isOwn || !isPro || aiLoadedRef.current) return;
    loadAIInsights();
  }, [activeTab, isOwn, isPro]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const toggleFollow = async () => {
    if (!profile) return;
    const next = !isFollowingUser;
    setIsFollowingUser(next);
    SocialSync.emit('FOLLOW_CHANGE', { targetId: profile.id, isActive: next });
    setProfile((p: any) => ({ ...p, followers_count: next ? p.followers_count + 1 : p.followers_count - 1 }));
    try {
      if (next) await followUser(currentUserId, profile.id);
      else await unfollowUser(currentUserId, profile.id);
      await medium();
    } catch (e: any) {
      const isSchemaError = e.message?.includes('relation') || 
                          e.message?.includes('not found') || 
                          e.message?.includes('schema cache') ||
                          e.code === 'PGRST205';
      if (isSchemaError) return;

      showPopup({
        title: 'Follow Failed',
        message: 'There was a problem updating your follow status. Please check your connection.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      setIsFollowingUser(!next);
      SocialSync.emit('FOLLOW_CHANGE', { targetId: profile.id, isActive: !next });
      setProfile((p: any) => ({ ...p, followers_count: !next ? p.followers_count + 1 : p.followers_count - 1 }));
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
      showPopup({
        title: 'Upload Failed',
        message: e.message,
        icon: 'cloud-offline-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    }
  };

  const openEdit = () => {
    medium();
    setShowEdit(true);
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
      setPosts(prev => prev.map(p => p.id === focusedPost.id ? { ...p, caption: editPostCaption } : p));
      setFocusedPost((prev: any) => ({ ...prev, caption: editPostCaption }));
      setShowEditPost(false);
      showToast('Caption updated', 'success');
    } catch (e: any) {
      showToast(e.message || 'Failed to update post', 'error');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = useCallback(({ item }: { item: any }) => {
    if (activeTab === 'threads') {
      return (
        <FeedPost
          post={item}
          currentUserId={currentUserId}
          isLiked={likedIds.has(item.id)}
          isMuted={true}
          setIsMuted={() => {}}
          onUserPress={(p) => DeviceEventEmitter.emit('NAVIGATE_PROFILE', { userId: p.id })}
        />
      );
    }

    if (activeTab === 'reels') {
      return (
        <TouchableOpacity key={item.id} style={styles.gridItem} activeOpacity={0.9} onPress={() => setFocusedPost(item)}>
          {item.thumbnail_url ? (
            <CachedImage uri={item.thumbnail_url} style={styles.gridImg} resizeMode="cover" />
          ) : (
            <View style={[styles.gridImg, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="film-outline" size={32} color="#333" />
            </View>
          )}
          <View style={styles.gridOverlay}>
            <Ionicons name="play" size={12} color="#fff" />
            <Text style={styles.gridStatText}>{item.views_count ?? 0}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    // Grid for posts, tagged, saved
    return (
      <TouchableOpacity key={item.id} style={styles.gridBtn} onPress={() => setFocusedPost(item)}>
        <CachedImage uri={item.media_url || item.media_urls?.[0]} style={styles.gridImg} resizeMode="cover" />
        {item.media_urls?.length > 1 && <View style={styles.mediaBadge}><Ionicons name="layers" size={12} color="#fff" /></View>}
        {item.type === 'video' && <View style={styles.mediaBadge}><Ionicons name="play" size={12} color="#fff" /></View>}
      </TouchableOpacity>
    );
  }, [activeTab, currentUserId, likedIds]);

  const listData = useMemo(() => {
    switch (activeTab) {
      case 'posts': return posts.filter(p => p.type !== 'thread');
      case 'reels': return reels;
      case 'tagged': return taggedPosts;
      case 'saved': return savedPosts;
      case 'threads': return posts.filter(p => p.type === 'thread');
      case 'analytics': return [];
      default: return [];
    }
  }, [activeTab, posts, reels, taggedPosts, savedPosts]);

  if (loading) return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ProfileHeaderSkeleton />
      <ProfilePostsSkeleton colSize={COL} />
    </View>
  );

  const Header = () => (
    <>
      {/* Cover & Header Section */}
      <View style={styles.coverSection}>
        <CachedImage uri={profile?.cover_url || 'https://images.unsplash.com/photo-1557683316-973673baf926?auto=format&fit=crop&q=80&w=1000'} style={styles.cover} />
        <View style={styles.coverOverlay} />
        <View style={[styles.headerTop, { top: insets.top + 10 }]}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
          )}
          {isOwn && (
            <TouchableOpacity 
              style={styles.headerInfo} 
              onPress={() => { selection(); setShowAccountSwitcher(true); }}
            >
              <Text style={styles.headerUsername}>@{profile?.username}</Text>
              <Ionicons name="chevron-down" size={14} color="#fff" />
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
            <View style={[styles.avatarRing, { borderColor: colors.bg, backgroundColor: colors.bg2 }, profile?.is_verified && { borderColor: '#818cf8' }]}>
              <TouchableOpacity
                onPress={() => profile?.avatar_url && setShowPicViewer(true)}
                activeOpacity={0.88}
                disabled={!profile?.avatar_url}
              >
                <CachedImage uri={profile?.avatar_url} style={styles.avatar} />
              </TouchableOpacity>
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
                  <TouchableOpacity style={[styles.editBtn, { backgroundColor: colors.bg2, borderColor: colors.border }]} onPress={openEdit}>
                    <Text style={[styles.btnText, { color: colors.text }]}>Edit Profile</Text>
                  </TouchableOpacity>
                  {!profile?.is_verified ? (
                    <TouchableOpacity style={styles.verifyBtn} onPress={() => setShowVerification(true)}>
                      <Ionicons name="shield-checkmark" size={16} color="#fff" />
                      <Text style={styles.verifyText}>Get Verified</Text>
                    </TouchableOpacity>
                  ) : !isPro ? (
                    <TouchableOpacity style={styles.proBtn} onPress={() => setShowProSheet(true)}>
                      <Ionicons name="flash" size={14} color="#fff" />
                      <Text style={styles.proText}>Go Pro</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <>
                  <TouchableOpacity 
                    style={[
                      styles.followBtn, 
                      isFollowingUser ? [styles.followingBtn, { backgroundColor: colors.bg2, borderColor: colors.border }] : { backgroundColor: '#6366f1' }
                    ]} 
                    onPress={toggleFollow}
                  >
                    <Text style={[styles.followBtnText, isFollowingUser && { color: colors.text }]}>
                      {isFollowingUser ? 'Following' : 'Follow'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.msgBtn, { backgroundColor: colors.bg2, borderColor: colors.border }]} onPress={() => {/* message logic */}}>
                    <Ionicons name="chatbubble-outline" size={18} color={colors.text} />
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>

        <View style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={[styles.nameText, { color: colors.text }]}>{profile?.full_name}</Text>
            {isOwn && isPro && (
              <View style={styles.proBadge}>
                <Ionicons name="flash" size={11} color="#fff" />
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
          <Text style={[styles.usernameText, { color: colors.textMuted }]}>@{profile?.username}</Text>
          {profile?.bio && <Text style={[styles.bioText, { color: colors.textSub }]}>{profile.bio}</Text>}
          <View style={styles.metaRow}>
            {profile?.major && (
              <View style={styles.majorTag}>
                <Text style={styles.majorTagText}>{profile.major}</Text>
              </View>
            )}
            {profile?.university && <Text style={[styles.metaLabel, { color: colors.textMuted }]}>{profile.university}</Text>}
          </View>
        </View>

        <View style={[styles.statsRow, { borderColor: colors.border }]}>
          <View style={styles.statItem}><Text style={[styles.statVal, { color: colors.text }]}>{posts.length}</Text><Text style={[styles.statLab, { color: colors.textMuted }]}>Posts</Text></View>
          <TouchableOpacity style={styles.statItem} onPress={() => setShowFollowersSheet(true)} activeOpacity={0.7}>
            <Text style={[styles.statVal, { color: colors.text }]}>{profile?.followers_count || 0}</Text>
            <Text style={[styles.statLab, { color: colors.textMuted }]}>Followers</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.statItem} onPress={() => setShowFollowingSheet(true)} activeOpacity={0.7}>
            <Text style={[styles.statVal, { color: colors.text }]}>{profile?.following_count || 0}</Text>
            <Text style={[styles.statLab, { color: colors.textMuted }]}>Following</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.tabHeader, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
        <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('posts'); }}>
          <Ionicons name={activeTab === 'posts' ? 'apps' : 'apps-outline'} size={22} color={activeTab === 'posts' ? colors.text : colors.textMuted} />
          {activeTab === 'posts' && <View style={[styles.tabActiveBar, { backgroundColor: colors.text }]} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('reels'); }}>
          <Ionicons name={activeTab === 'reels' ? 'film' : 'film-outline'} size={22} color={activeTab === 'reels' ? colors.text : colors.textMuted} />
          {activeTab === 'reels' && <View style={[styles.tabActiveBar, { backgroundColor: colors.text }]} />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('threads'); }}>
          <Ionicons name={activeTab === 'threads' ? 'chatbubbles' : 'chatbubbles-outline'} size={22} color={activeTab === 'threads' ? colors.text : colors.textMuted} />
          {activeTab === 'threads' && <View style={[styles.tabActiveBar, { backgroundColor: colors.text }]} />}
        </TouchableOpacity>
        {isOwn && (
          <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('saved'); }}>
            <Ionicons name={activeTab === 'saved' ? 'bookmark' : 'bookmark-outline'} size={22} color={activeTab === 'saved' ? colors.text : colors.textMuted} />
            {activeTab === 'saved' && <View style={[styles.tabActiveBar, { backgroundColor: colors.text }]} />}
          </TouchableOpacity>
        )}
        {isOwn && (
          <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('tagged'); }}>
            <Ionicons name={activeTab === 'tagged' ? 'person-add' : 'person-add-outline'} size={22} color={activeTab === 'tagged' ? colors.text : colors.textMuted} />
            {activeTab === 'tagged' && <View style={[styles.tabActiveBar, { backgroundColor: colors.text }]} />}
          </TouchableOpacity>
        )}
        {isOwn && isPro && (
          <TouchableOpacity style={styles.tabBtn} onPress={() => { selection(); setActiveTab('analytics'); }}>
            <Ionicons name={activeTab === 'analytics' ? 'bar-chart' : 'bar-chart-outline'} size={22} color={activeTab === 'analytics' ? '#6366f1' : colors.textMuted} />
            {activeTab === 'analytics' && <View style={[styles.tabActiveBar, { backgroundColor: '#6366f1' }]} />}
          </TouchableOpacity>
        )}
      </View>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <FlatList
        key={activeTab === 'threads' || activeTab === 'analytics' ? 'list-view' : 'grid-list'}
        data={listData}
        renderItem={renderItem}
        keyExtractor={(item: any) => item.id}
        numColumns={activeTab === 'threads' || activeTab === 'analytics' ? 1 : 3}
        ListHeaderComponent={Header}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
        removeClippedSubviews={Platform.OS === 'android'}
        maxToRenderPerBatch={activeTab === 'threads' ? 5 : 12}
        windowSize={activeTab === 'threads' ? 5 : 11}
        ListEmptyComponent={!loading ? (
          activeTab === 'analytics' ? (
            <AnalyticsDashboard
              pa={proAnalytics}
              posts={postAnalytics}
              loading={analyticsLoading}
              error={analyticsError}
              colors={colors}
              onRetry={() => { setProAnalytics(null); setAnalyticsError(null); setActiveTab('posts'); setTimeout(() => setActiveTab('analytics'), 50); }}
              aiInsights={aiInsights}
              aiOutlook={aiOutlook}
              aiLoading={aiInsightsLoading}
              aiError={aiInsightsError}
              onLoadAI={loadAIInsights}
            />
          ) : (
            <View style={{ alignItems: 'center', marginTop: 60, paddingHorizontal: 40 }}>
              <Ionicons name="images-outline" size={48} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: 'center' }}>No {activeTab} yet</Text>
            </View>
          )
        ) : null}
        ListFooterComponent={isSuspended ? (
          <View style={styles.suspendedOverlay}>
            <View style={styles.suspendedCard}>
              <Ionicons name="ban" size={48} color="#f59e0b" />
              <Text style={styles.suspendedTitle}>Account Suspended</Text>
              <Text style={styles.suspendedSub}>
                This account has been temporarily suspended for violating campus community guidelines. Posts are hidden during this period.
              </Text>
            </View>
          </View>
        ) : null}
      />

      {/* Admin Dashboard Modal */}
      <Modal visible={showAdmin} animationType="slide" onRequestClose={() => setShowAdmin(false)}>
        <AdminScreen onBack={() => setShowAdmin(false)} adminId={currentUserId} />
      </Modal>

      {/* Focus Modal */}
      <Modal visible={!!focusedPost} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFocusedPost(null)}>
        {focusedPost && (
          <PostDetailModal
            post={focusedPost}
            currentUserId={currentUserId}
            isLiked={likedIds.has(focusedPost.id)}
            onClose={() => setFocusedPost(null)}
          />
        )}
      </Modal>

      {/* Edit Post Caption Modal */}
      <Modal visible={showEditPost} transparent animationType="slide">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.editPostContainer}>
           <View style={[styles.editPostContent, { backgroundColor: colors.bg2 }]}>
              <View style={styles.editPostHeader}>
                <TouchableOpacity onPress={() => setShowEditPost(false)}><Text style={{ color: colors.text }}>Cancel</Text></TouchableOpacity>
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>Edit Caption</Text>
                <TouchableOpacity onPress={handlePostUpdate} disabled={saving}>
                  <Text style={{ color: colors.accent, fontWeight: 'bold' }}>{saving ? '...' : 'Done'}</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={[styles.editPostInput, { color: colors.text, backgroundColor: colors.bg }]}
                value={editPostCaption}
                onChangeText={setEditPostCaption}
                multiline
                autoFocus
              />
           </View>
        </KeyboardAvoidingView>
      </Modal>

      <EditProfileModal 
        visible={showEdit} 
        profile={profile} 
        onClose={() => setShowEdit(false)} 
        onSaved={(updated) => { 
          setProfile(updated); 
          setShowEdit(false); 
          success();
        }} 
      />
      <SettingsScreen 
        visible={showSettings} 
        profile={profile} 
        onClose={() => setShowSettings(false)} 
        onProfileUpdated={setProfile} 
        onAdminPress={() => { setShowSettings(false); setShowAdmin(true); }}
        onShowPrivacy={onShowPrivacy}
        onShowTerms={onShowTerms}
        onShowGuidelines={onShowGuidelines}
      />
      <VerificationScreen visible={showVerification} onClose={() => setShowVerification(false)} />
      
      <AccountSwitcherModal 
        visible={showAccountSwitcher} 
        onClose={() => setShowAccountSwitcher(false)} 
        accounts={activeAccounts}
        currentUserId={currentUserId}
        onSwitch={async (id: string) => {
          setShowAccountSwitcher(false);
          setLoading(true);
          try {
            await AccountService.switchAccount(id);
            await success();
          } catch (e: any) {
            showPopup({
              title: 'Switch Failed',
              message: e.message,
              icon: 'lock-closed-outline',
              buttons: [{ text: 'OK', onPress: () => {} }]
            });
            setLoading(false);
          }
        }}
        onAddAccount={async () => {
          setShowAccountSwitcher(false);
          // Standard login flow for new account
          await supabase.auth.signOut();
        }}
      />

      <ProfilePicViewer
        visible={showPicViewer}
        uri={profile?.avatar_url}
        username={profile?.username}
        onClose={() => setShowPicViewer(false)}
      />

      <ProSheet
        visible={showProSheet}
        onClose={() => setShowProSheet(false)}
        onSuccess={() => {
          // Optimistic update so the UI responds immediately
          setProfile((p: any) => p ? { ...p, is_pro: true, pro_disabled: false, pro_expires_at: new Date(Date.now() + 30 * 86400000).toISOString() } : p);
          showToast('Welcome to UniGram Pro!', 'success');
          // Re-fetch from DB to confirm the subscription persisted
          load();
        }}
      />

      <UsersListSheet
        visible={showFollowersSheet}
        title="Followers"
        users={followers}
        onClose={() => setShowFollowersSheet(false)}
        onUserPress={(profile) => {
          setShowFollowersSheet(false);
          DeviceEventEmitter.emit('NAVIGATE_PROFILE', { userId: profile.id });
        }}
      />
      <UsersListSheet
        visible={showFollowingSheet}
        title="Following"
        users={following}
        onClose={() => setShowFollowingSheet(false)}
        onUserPress={(profile) => {
          setShowFollowingSheet(false);
          DeviceEventEmitter.emit('NAVIGATE_PROFILE', { userId: profile.id });
        }}
      />
    </View>
  );
});

// ── Analytics helpers ─────────────────────────────────────────────────────────

function fmtNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

const OUTLOOK_CONFIG = {
  positive: { label: 'Growing', color: '#22c55e', bg: 'rgba(34,197,94,0.12)', icon: 'trending-up' as const },
  neutral:  { label: 'Steady',  color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: 'remove' as const },
  needs_work: { label: 'Needs Work', color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: 'trending-down' as const },
};

const TrendChip = ({ curr, prev }: { curr: number; prev: number }) => {
  const delta = pctChange(curr, prev);
  if (delta === null) return null;
  const up = delta >= 0;
  const color = up ? '#22c55e' : '#ef4444';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: up ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', borderRadius: 20, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <Ionicons name={up ? 'trending-up' : 'trending-down'} size={11} color={color} />
      <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{up ? '+' : ''}{delta}%</Text>
    </View>
  );
};

const HeroCard = ({ label, sub, value, prev, accentColor }: { label: string; sub: string; value: number; prev: number; accentColor: string }) => {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg2, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: accentColor + '28' }}>
      <Text style={{ color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>{label}</Text>
      <Text style={{ color: accentColor, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>{fmtNum(value)}</Text>
      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2, marginBottom: 8 }}>{sub}</Text>
      <TrendChip curr={value} prev={prev} />
    </View>
  );
};

const MiniCard = ({ label, value, accent, sub }: { label: string; value: string; accent?: string; sub?: string }) => {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg2, borderRadius: 14, padding: 12 }}>
      <Text style={{ color: colors.textMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 }}>{label}</Text>
      <Text style={{ color: accent ?? colors.text, fontSize: 20, fontWeight: '800' }}>{value}</Text>
      {sub ? <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 3 }}>{sub}</Text> : null}
    </View>
  );
};

interface AnalyticsDashboardProps {
  pa: any;
  posts: any[];
  loading: boolean;
  error: string | null;
  colors: any;
  onRetry: () => void;
  aiInsights: string[] | null;
  aiOutlook: 'positive' | 'neutral' | 'needs_work' | null;
  aiLoading: boolean;
  aiError: string | null;
  onLoadAI: () => void;
}

const AnalyticsDashboard = ({ pa, posts, loading, error, colors, onRetry, aiInsights, aiOutlook, aiLoading, aiError, onLoadAI }: AnalyticsDashboardProps) => {
  if (loading) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 60, gap: 14 }}>
        <ActivityIndicator color="#6366f1" size="large" />
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>Loading analytics…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 32, gap: 14 }}>
        <Ionicons name="alert-circle-outline" size={44} color="#ef4444" />
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16, textAlign: 'center' }}>Analytics unavailable</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19 }}>{error}</Text>
        <TouchableOpacity
          onPress={onRetry}
          style={{ backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 4 }}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Try Again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!pa) return null;

  const engRate = pa.total_views_30d > 0
    ? (((pa.likes_30d ?? 0) + (pa.comments_30d ?? 0)) / pa.total_views_30d * 100).toFixed(1)
    : '0.0';

  const maxViews = posts.length > 0 ? Math.max(...posts.map((p: any) => p.views ?? 0), 1) : 1;
  const outlook = aiOutlook ? OUTLOOK_CONFIG[aiOutlook] : null;

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 60 }}>

      {/* ── Period label */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 18, letterSpacing: -0.3 }}>Your Analytics</Text>
        <View style={{ backgroundColor: 'rgba(99,102,241,0.12)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
          <Text style={{ color: '#818cf8', fontSize: 11, fontWeight: '700' }}>Last 30 days</Text>
        </View>
      </View>

      {/* ── Hero metrics */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
        <HeroCard
          label="Profile Views"
          sub="last 7 days"
          value={pa.profile_views_7d ?? 0}
          prev={pa.profile_views_prev_7d ?? 0}
          accentColor="#818cf8"
        />
        <HeroCard
          label="Post Impressions"
          sub="last 30 days"
          value={pa.total_views_30d ?? 0}
          prev={pa.total_views_prev_30d ?? 0}
          accentColor="#0ea5e9"
        />
      </View>

      {/* ── Secondary metrics */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        <MiniCard label="Followers" value={fmtNum(pa.followers ?? 0)} />
        <MiniCard label="Engagement" value={`${engRate}%`} accent="#818cf8" sub="likes + comments / views" />
        <MiniCard label="Total Likes" value={fmtNum(pa.total_likes ?? 0)} />
      </View>

      {/* ── AI Insights card */}
      <LinearGradient
        colors={['#6366f1', '#a855f7', '#ec4899']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ borderRadius: 18, padding: 1.5, marginBottom: 24 }}
      >
        <View style={{ backgroundColor: colors.bg2, borderRadius: 17, padding: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(168,85,247,0.15)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="bulb" size={18} color="#a855f7" />
              </View>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>AI Insights</Text>
            </View>
            {outlook && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: outlook.bg, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Ionicons name={outlook.icon} size={12} color={outlook.color} />
                <Text style={{ color: outlook.color, fontSize: 11, fontWeight: '700' }}>{outlook.label}</Text>
              </View>
            )}
          </View>

          {aiLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 20, gap: 10 }}>
              <ActivityIndicator color="#a855f7" />
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Analysing your performance…</Text>
            </View>
          ) : aiError ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>{aiError}</Text>
              <TouchableOpacity
                onPress={onLoadAI}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(168,85,247,0.12)', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)' }}
              >
                <Ionicons name="refresh" size={14} color="#a855f7" />
                <Text style={{ color: '#a855f7', fontWeight: '700', fontSize: 13 }}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : aiInsights && aiInsights.length > 0 ? (
            <View style={{ gap: 10 }}>
              {aiInsights.map((insight, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(99,102,241,0.15)', alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 }}>
                    <Text style={{ color: '#818cf8', fontSize: 11, fontWeight: '800' }}>{i + 1}</Text>
                  </View>
                  <Text style={{ color: colors.textSub, fontSize: 13, lineHeight: 20, flex: 1 }}>{insight}</Text>
                </View>
              ))}
              <TouchableOpacity
                onPress={onLoadAI}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-end' }}
              >
                <Ionicons name="refresh" size={12} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 11 }}>Regenerate</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19 }}>
                Get a personalised AI breakdown of your content performance — what's working, what isn't, and how to grow.
              </Text>
              <TouchableOpacity
                onPress={onLoadAI}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: '#a855f7', borderRadius: 12, paddingVertical: 11 }}
              >
                <Ionicons name="sparkles" size={15} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Generate Insights</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* ── Post performance */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, letterSpacing: -0.2 }}>Post Performance</Text>
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{posts.length} posts · 30d</Text>
      </View>

      {posts.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 32, gap: 10 }}>
          <Ionicons name="bar-chart-outline" size={38} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 }}>
            No posts in the last 30 days.{'\n'}Post something to see data here.
          </Text>
        </View>
      ) : posts.map((p: any) => {
        const barWidth = maxViews > 0 ? Math.max(4, Math.round(((p.views ?? 0) / maxViews) * 100)) : 4;
        return (
          <View key={p.post_id} style={{ backgroundColor: colors.bg2, borderRadius: 16, padding: 14, marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
              {p.media_url ? (
                <CachedImage uri={p.media_url} style={{ width: 48, height: 48, borderRadius: 10 }} resizeMode="cover" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="document-text-outline" size={20} color={colors.textMuted} />
                </View>
              )}
              <Text style={{ color: colors.text, fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 19 }} numberOfLines={2}>
                {p.caption || '(no caption)'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 16, marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="eye-outline" size={13} color="#818cf8" />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{fmtNum(p.views ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="people-outline" size={13} color="#0ea5e9" />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{fmtNum(p.reach ?? 0)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 10 }}>reach</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="heart-outline" size={13} color="#f43f5e" />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{fmtNum(p.likes_count ?? 0)}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="chatbubble-outline" size={13} color="#22c55e" />
                <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>{fmtNum(p.comments_count ?? 0)}</Text>
              </View>
            </View>
            {/* Relative performance bar */}
            <View style={{ height: 4, backgroundColor: colors.bg, borderRadius: 2, overflow: 'hidden' }}>
              <LinearGradient
                colors={['#6366f1', '#818cf8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={{ height: '100%', width: `${barWidth}%`, borderRadius: 2 }}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
};

const AccountSwitcherModal = ({ visible, onClose, accounts, currentUserId, onSwitch, onAddAccount }: any) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.switcherOverlay} activeOpacity={1} onPress={onClose}>
        <View style={[styles.switcherContent, { backgroundColor: colors.bg2, paddingBottom: insets.bottom + 20 }]}>
          <View style={[styles.switcherHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.switcherTitle, { color: colors.text }]}>Accounts</Text>
          
          <ScrollView style={styles.accountsList} bounces={false}>
            {accounts.map((acc: any) => (
              <TouchableOpacity 
                key={acc.userId} 
                style={styles.accountItem}
                onPress={() => {
                  if (acc.userId === currentUserId) onClose();
                  else onSwitch(acc.userId);
                }}
              >
                <CachedImage uri={acc.avatarUrl} style={styles.accAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.accName, { color: colors.text }]}>{acc.fullName || acc.username}</Text>
                  <Text style={[styles.accUser, { color: colors.textMuted }]}>@{acc.username}</Text>
                </View>
                {acc.userId === currentUserId && (
                   <Ionicons name="checkmark-circle" size={24} color={colors.accent} />
                )}
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity style={styles.addAccountBtn} onPress={onAddAccount}>
              <View style={[styles.addIconWrap, { backgroundColor: colors.bg }]}>
                <Ionicons name="add" size={24} color={colors.text} />
              </View>
              <Text style={[styles.addAccountText, { color: colors.text }]}>Add Account</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  coverSection: { height: 160, position: 'relative' },
  cover: { width: '100%', height: '100%' },
  coverOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)' },
  headerTop: { position: 'absolute', top: 10, left: 16, right: 16, flexDirection: 'row', alignItems: 'center' },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  
  infoSection: { marginTop: -40, paddingHorizontal: 16 },
  avatarRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  avatarContainer: { position: 'relative' },
  avatarRing: { 
    width: 86, height: 86, borderRadius: 43, 
    borderWidth: 3, overflow: 'hidden',
    backgroundColor: '#1a1a1a',
  },
  avatar: { width: '100%', height: '100%' },
  avatarEditOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  verifiedBadgeRow: {
    position: 'absolute',
    bottom: 5,
    right: 5,
  },
  
  profileActions: { alignItems: 'center', marginBottom: 6 },
  actionRow: { flexDirection: 'row', gap: 8 },
  editBtn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
  verifyBtn: { backgroundColor: 'rgba(129, 140, 248, 0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: 'rgba(129, 140, 248, 0.3)' },
  verifyText: { color: '#818cf8', fontWeight: '600', fontSize: 13 },
  proBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 5 },
  proText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  proBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#6366f1', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  proBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  btnText: { fontSize: 13, fontWeight: '600' },
  followBtn: { backgroundColor: '#6366f1', borderRadius: 10, paddingHorizontal: 24, paddingVertical: 8 },
  followingBtn: { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  followBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  msgBtn: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },

  nameText: { fontSize: 20, fontWeight: '800' },
  usernameText: { fontSize: 14, marginTop: 2 },
  bioText: { marginTop: 10, lineHeight: 20, fontSize: 14 },
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
    width: '100%',
  },
  statItem: { alignItems: 'center' },
  statVal: { fontSize: 18, fontWeight: 'bold' },
  statLab: { fontSize: 11, marginTop: 2 },

  tabHeader: {
    flexDirection: 'row',
    width: '100%',
    borderTopWidth: 1,
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
    borderRadius: 1,
  },
  tabContent: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  gridBtn: { width: COL, height: COL, margin: 0.33, position: 'relative' },
  gridItem: { width: COL, height: COL * 1.6, margin: 0.33, position: 'relative' },
  gridImg: { width: '100%', height: '100%' },
  gridOverlay: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  gridStatText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  mediaBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, padding: 3 },
  reelMeta: { position: 'absolute', bottom: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  reelMetaText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // Suspended gallery overlay
  suspendedOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    minHeight: 260,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
    paddingHorizontal: 32,
  },
  suspendedCard: {
    alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 20, paddingHorizontal: 24, paddingVertical: 32,
    width: '100%',
  },
  suspendedTitle: {
    fontSize: 18, fontWeight: '800', color: '#f59e0b', textAlign: 'center',
  },
  suspendedSub: {
    fontSize: 13, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 20,
  },

  focusContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  focusContent: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  focusHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1 },
  focusTitle: { fontSize: 16, fontWeight: 'bold' },
  editPostContainer: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  editPostContent: { padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  editPostHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  editPostInput: { fontSize: 15, borderRadius: 10, padding: 12, height: 120, textAlignVertical: 'top' },

  headerInfo: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  headerUsername: { color: '#fff', fontSize: 14, fontWeight: '700' },

  switcherOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  switcherContent: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: height * 0.7 },
  switcherHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  switcherTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 20 },
  accountsList: { marginBottom: 10 },
  accountItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  accAvatar: { width: 50, height: 50, borderRadius: 25 },
  accName: { fontSize: 15, fontWeight: '700' },
  accUser: { fontSize: 13, marginTop: 2 },
  addAccountBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, marginTop: 8 },
  addIconWrap: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  addAccountText: { fontSize: 15, fontWeight: '600' },
});
