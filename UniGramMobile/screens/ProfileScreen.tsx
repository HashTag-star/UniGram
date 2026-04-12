import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, Modal, ActivityIndicator, Alert,
  TextInput, KeyboardAvoidingView, Platform, RefreshControl,
  DeviceEventEmitter,
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
import { FeedPost } from './FeedScreen';
import { supabase } from '../lib/supabase';
import { useHaptics } from '../hooks/useHaptics';
import { useSocialFollow } from '../hooks/useSocialSync';
import { SocialSync } from '../services/social_sync';
import { recordProfileView } from '../services/algorithm';
import { AccountService } from '../services/accounts';
import { useTheme } from '../context/ThemeContext';
import { usePopup } from '../context/PopupContext';

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
}

export const ProfileScreen: React.FC<Props> = ({
  userId: propUserId,
  isOwn: propIsOwn,
  isVisible,
  onVerifyPress,
  onBack,
  onMessagePress,
  onShowPrivacy,
  onShowTerms,
  onShowGuidelines,
}) => {
  const insets = useSafeAreaInsets();
  const { colors, theme } = useTheme();
  const { showPopup } = usePopup();
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
  const [activeTab, setActiveTab] = useState<'posts' | 'reels' | 'tagged' | 'saved' | 'threads'>('posts');
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState('');
  const [isOwn, setIsOwn] = useState(propIsOwn ?? false);
  const [focusedPost, setFocusedPost] = useState<any>(null);
  const [isSuspended, setIsSuspended] = useState(false);

  const [showEdit, setShowEdit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showEditPost, setShowEditPost] = useState(false);
  const [editPostCaption, setEditPostCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [activeAccounts, setActiveAccounts] = useState<any[]>([]);

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
      setIsSuspended(!!(prof as any)?.is_suspended);

      if (!own) {
        const following = await isFollowing(user.id, targetId);
        setIsFollowingUser(following);
        recordProfileView(user.id, targetId).catch(() => {});
      }
    } catch (e) {
      console.error('Profile load error', e);
    } finally {
      setLoading(false);
    }
  }, [propUserId, propIsOwn]);

  useEffect(() => { load(); }, [load]);

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
      setFocusedPost({ ...focusedPost, caption: editPostCaption });
      setPosts(prev => prev.map(p => p.id === focusedPost.id ? { ...p, caption: editPostCaption } : p));
      await success();
      setShowEditPost(false);
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message,
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ProfileHeaderSkeleton />
      <ProfilePostsSkeleton colSize={COL} />
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
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
                <CachedImage uri={profile?.avatar_url} style={styles.avatar} />
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
            <Text style={[styles.nameText, { color: colors.text }]}>{profile?.full_name}</Text>
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
            <View style={styles.statItem}><Text style={[styles.statVal, { color: colors.text }]}>{profile?.followers_count || 0}</Text><Text style={[styles.statLab, { color: colors.textMuted }]}>Followers</Text></View>
            <View style={styles.statItem}><Text style={[styles.statVal, { color: colors.text }]}>{profile?.following_count || 0}</Text><Text style={[styles.statLab, { color: colors.textMuted }]}>Following</Text></View>
          </View>
        </View>

        {/* Tabs — must be a plain View, direct child of ScrollView for stickyHeaderIndices to work */}
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
        </View>

        {/* Content Section */}
        <View style={styles.tabContent}>
          {activeTab === 'posts' && (
            <View style={styles.grid}>
              {posts.filter(p => p.type !== 'thread').map(post => (
                <TouchableOpacity key={post.id} style={styles.gridBtn} onPress={() => setFocusedPost(post)}>
                  <CachedImage uri={post.media_url || post.media_urls?.[0]} style={styles.gridImg} resizeMode="cover" />
                  {post.media_urls?.length > 1 && <View style={styles.mediaBadge}><Ionicons name="layers" size={12} color="#fff" /></View>}
                  {post.type === 'video' && <View style={styles.mediaBadge}><Ionicons name="play" size={12} color="#fff" /></View>}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeTab === 'reels' && (
            <View style={styles.grid}>
              {reels.map(reel => (
                <TouchableOpacity key={reel.id} style={styles.gridItem} activeOpacity={0.9} onPress={() => setFocusedPost(reel)}>
                  {reel.thumbnail_url ? (
                    <CachedImage uri={reel.thumbnail_url} style={styles.gridImg} resizeMode="cover" />
                  ) : (
                    <View style={[styles.gridImg, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
                      <Ionicons name="film-outline" size={32} color="#333" />
                    </View>
                  )}
                  <View style={styles.gridOverlay}>
                    <Ionicons name="play" size={12} color="#fff" />
                    <Text style={styles.gridStatText}>{reel.views_count ?? 0}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeTab === 'tagged' && (
            <View style={styles.grid}>
              {taggedPosts.map(post => (
                <TouchableOpacity key={post.id} style={styles.gridBtn} onPress={() => setFocusedPost(post)}>
                  <CachedImage uri={post.media_url || post.media_urls?.[0]} style={styles.gridImg} resizeMode="cover" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeTab === 'saved' && (
            <View style={styles.grid}>
              {savedPosts.map(post => (
                <TouchableOpacity key={post.id} style={styles.gridBtn} onPress={() => setFocusedPost(post)}>
                  <CachedImage uri={post.media_url || post.media_urls?.[0]} style={styles.gridImg} resizeMode="cover" />
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
                  isActive={!!isVisible}
                  isMuted={true}
                  setIsMuted={() => {}}
                />
              ))}
            </View>
          )}

          {/* Suspended notice - covers ONLY the gallery/content area */}
          {isSuspended && (
            <View style={styles.suspendedOverlay}>
              <View style={styles.suspendedCard}>
                <Ionicons name="ban" size={48} color="#f59e0b" />
                <Text style={styles.suspendedTitle}>Account Suspended</Text>
                <Text style={styles.suspendedSub}>
                  This account has been temporarily suspended for violating campus community guidelines. Posts are hidden during this period.
                </Text>
              </View>
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
          <View style={[styles.focusContent, { marginTop: insets.top + 10, backgroundColor: colors.bg }]}>
            <View style={[styles.focusHeader, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={() => setFocusedPost(null)}><Ionicons name="chevron-back" size={28} color={colors.text} /></TouchableOpacity>
              <Text style={[styles.focusTitle, { color: colors.text }]}>Post</Text>
              {focusedPost?.user_id === currentUserId ? (
                <TouchableOpacity onPress={initiateEditPost}>
                  <Text style={{ color: colors.accent, fontWeight: 'bold' }}>Edit</Text>
                </TouchableOpacity>
              ) : <View style={{ width: 28 }} />}
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              {focusedPost && (
                <FeedPost 
                  post={focusedPost} 
                  currentUserId={currentUserId} 
                  isLiked={likedIds.has(focusedPost.id)}
                  isActive={!!isVisible}
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
