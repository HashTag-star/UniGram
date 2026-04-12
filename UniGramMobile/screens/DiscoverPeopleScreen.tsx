import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, FlatList,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '../components/CachedImage';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { useTheme } from '../context/ThemeContext';
import { useHaptics } from '../hooks/useHaptics';
import { supabase } from '../lib/supabase';
import { getFollowSuggestions } from '../services/algorithm';
import { followUser, unfollowUser } from '../services/profiles';
import { useSocialFollow } from '../hooks/useSocialSync';
import { SocialSync } from '../services/social_sync';
import * as Contacts from 'expo-contacts';
import { searchUsers, matchContactsByEmail } from '../services/profiles';
import { Skeleton } from '../components/Skeleton';

const { width } = Dimensions.get('window');

// ─── Shared Interest Card ──────────────────────────────────────────────────
const InterestUserCard: React.FC<{ user: any; currentUserId: string; onUserPress?: (u: any) => void }> = ({ user, currentUserId, onUserPress }) => {
  const { colors } = useTheme();
  const { selection } = useHaptics();
  const [following, setFollowing] = useSocialFollow(user.id, false);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const next = !following;
    setFollowing(next);
    selection();
    SocialSync.emit('FOLLOW_CHANGE', { targetId: user.id, isActive: next });
    try {
      setLoading(true);
      if (next) await followUser(currentUserId, user.id);
      else await unfollowUser(currentUserId, user.id);
    } catch {
      setFollowing(!next);
      SocialSync.emit('FOLLOW_CHANGE', { targetId: user.id, isActive: !next });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity 
      style={[styles.interestCard, { backgroundColor: colors.bg2, borderColor: colors.border }]}
      onPress={() => onUserPress?.(user)}
      activeOpacity={0.9}
    >
      <View style={styles.interestAvatarWrap}>
        {user.avatar_url ? (
          <CachedImage uri={user.avatar_url} style={styles.interestAvatar} />
        ) : (
          <View style={[styles.interestAvatar, { backgroundColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="person" size={24} color={colors.textMuted} />
          </View>
        )}
        <View style={[styles.interestBadge, { backgroundColor: colors.accent }]}>
          <Ionicons name="sparkles" size={10} color="#fff" />
        </View>
      </View>

      <View style={{ alignItems: 'center', marginTop: 8, paddingHorizontal: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={[styles.interestName, { color: colors.text }]} numberOfLines={1}>{user.username}</Text>
          {user.is_verified && <VerifiedBadge type={user.verification_type} size="sm" />}
        </View>
        <Text style={[styles.interestMeta, { color: colors.textMuted }]} numberOfLines={1}>
          Matches your interests
        </Text>
      </View>

      <TouchableOpacity 
        style={[styles.interestFollowBtn, { backgroundColor: following ? colors.bg : colors.accent }]}
        onPress={handleToggle}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color={following ? colors.accent : "#fff"} />
        ) : (
          <Text style={[styles.interestFollowBtnText, { color: following ? colors.text : '#fff' }]}>
            {following ? 'Following' : 'Follow'}
          </Text>
        )}
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

// ─── Contact Row ───────────────────────────────────────────────────────────
const ContactRow: React.FC<{ 
  icon: string; 
  title: string; 
  subtitle: string; 
  iconColor: string;
  onPress?: () => void;
  loading?: boolean;
}> = ({ icon, title, subtitle, iconColor, onPress, loading }) => {
  const { colors } = useTheme();
  return (
    <TouchableOpacity 
      style={[styles.contactRow, { backgroundColor: colors.bg2, borderColor: colors.border }]}
      onPress={onPress}
      disabled={loading}
    >
      <View style={[styles.contactIconWrap, { backgroundColor: iconColor + '20' }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={[styles.contactTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.contactSub, { color: colors.textMuted }]}>{subtitle}</Text>
      </View>
      <TouchableOpacity 
        style={[styles.contactBtn, { backgroundColor: colors.accent }]}
        onPress={onPress}
        disabled={loading}
      >
        {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.contactBtnText}>Connect</Text>}
      </TouchableOpacity>
    </TouchableOpacity>
  );
};

// ─── Loading Skeleton ──────────────────────────────────────────────────────
const DiscoverSkeleton = () => (
  <View style={{ flex: 1, paddingHorizontal: 16 }}>
    {/* Header Skeleton handled by main component above the loader conditional */}
    
    {/* Contacts Section Skeleton */}
    <View style={{ marginTop: 24, gap: 12 }}>
      <Skeleton width={100} height={12} style={{ marginBottom: 4 }} />
      <Skeleton width={'100%' as any} height={64} borderRadius={16} />
      <Skeleton width={'100%' as any} height={64} borderRadius={16} />
    </View>

    {/* Interests Section Skeleton */}
    <View style={{ marginTop: 32, gap: 12 }}>
      <Skeleton width={120} height={12} style={{ marginBottom: 4 }} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {[1, 2, 3].map(i => (
          <View key={i} style={{ width: 140, padding: 12, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', alignItems: 'center', gap: 10 }}>
            <Skeleton width={60} height={60} borderRadius={30} />
            <Skeleton width={80} height={12} />
            <Skeleton width={'100%' as any} height={32} borderRadius={12} />
          </View>
        ))}
      </View>
    </View>

    {/* People You May Know Skeleton */}
    <View style={{ marginTop: 32, gap: 12 }}>
      <Skeleton width={140} height={12} style={{ marginBottom: 4 }} />
      {[1, 2, 3].map(i => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Skeleton width={44} height={44} borderRadius={15} />
          <View style={{ flex: 1, gap: 8 }}>
            <Skeleton width={'60%' as any} height={14} />
            <Skeleton width={'40%' as any} height={10} />
          </View>
          <Skeleton width={80} height={32} borderRadius={10} />
        </View>
      ))}
    </View>
  </View>
);

// ─── User Row ──────────────────────────────────────────────────────────────
// Must be a component (not a render function) so hooks are called legally.
const UserRow: React.FC<{ user: any; currentUserId: string; onUserPress?: (u: any) => void }> = React.memo(({ user, currentUserId, onUserPress }) => {
  const { colors } = useTheme();
  const [following, setFollowing] = useSocialFollow(user.id, false);

  const handleToggle = async () => {
    const next = !following;
    setFollowing(next);
    SocialSync.emit('FOLLOW_CHANGE', { targetId: user.id, isActive: next });
    try {
      if (next) await followUser(currentUserId, user.id);
      else await unfollowUser(currentUserId, user.id);
    } catch {
      setFollowing(!next);
      SocialSync.emit('FOLLOW_CHANGE', { targetId: user.id, isActive: !next });
    }
  };

  return (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => onUserPress?.(user)}
      activeOpacity={0.7}
    >
      <View style={styles.avatarWrap}>
        {user.avatar_url ? (
          <CachedImage uri={user.avatar_url} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.bg2, alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="person" size={20} color={colors.textMuted} />
          </View>
        )}
      </View>
      <View style={styles.userInfo}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={[styles.userName, { color: colors.text }]}>{user.username}</Text>
          {user.is_verified && <VerifiedBadge type={user.verification_type} />}
        </View>
        <Text style={[styles.userMeta, { color: colors.textMuted }]} numberOfLines={1}>
          {user.reason || user.full_name}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.rowFollowBtn, { backgroundColor: following ? colors.bg : colors.accent, borderColor: following ? colors.border : 'transparent', borderWidth: following ? 1 : 0 }]}
        onPress={handleToggle}
      >
        <Text style={[styles.rowFollowText, { color: following ? colors.text : '#fff' }]}>
          {following ? 'Following' : 'Follow'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

interface Props {
  onClose: () => void;
  onUserPress?: (profile: any) => void;
}

export const DiscoverPeopleScreen: React.FC<Props> = ({ onClose, onUserPress }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState('');
  const [peopleYouMayKnow, setPeopleYouMayKnow] = useState<any[]>([]);
  const [sharedInterests, setSharedInterests] = useState<any[]>([]);
  const [campusTrending, setCampusTrending] = useState<any[]>([]);
  const [contactUsers, setContactUsers] = useState<any[]>([]);
  const [isSyncingContacts, setIsSyncingContacts] = useState(false);
  const { selection, success, error, warning } = useHaptics();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      // Single call — slice into sections to avoid 3× the DB round-trips
      const all = await getFollowSuggestions(user.id, 15);

      setPeopleYouMayKnow(all.slice(0, 8));
      // Interest-matched users are those with a reason that mentions shared interests
      const interest = all.filter((u: any) => u.reason?.toLowerCase().includes('interest'));
      setSharedInterests(interest.length ? interest : all.slice(0, 5));
      setCampusTrending(all.filter((u: any) => u.reason === 'Goes to your university').slice(0, 5));
    } catch (err) {
      console.warn('Discover load fail', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncContacts = async () => {
    setIsSyncingContacts(true);
    selection();
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status === 'granted') {
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.FirstName, Contacts.Fields.LastName, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
        });

        if (data.length > 0) {
          // Flatten all emails from all contacts
          const emails = data.flatMap(c => c.emails?.map(e => e.email?.toLowerCase()).filter(Boolean) || []).filter(Boolean) as string[];
          
          if (emails.length > 0) {
            const matches = await matchContactsByEmail(emails);
            setContactUsers(matches.map((u: any) => ({
              ...u,
              reason: 'In your contacts'
            })));
          } else {
            // Fallback for demo if no emails found: search for some users
            const matches = await searchUsers('a');
            setContactUsers(matches.slice(0, 3).map(u => ({ ...u, reason: 'Suggestions for you' })));
          }
          success();
        }
      } else {
        success(); // no matches, but sync succeeded
      }
    } catch (err) {
      console.warn('Sync failed', err);
      error();
    } finally {
      setIsSyncingContacts(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Discover People</Text>
          <Text style={[styles.headerSub, { color: colors.textMuted }]}>Build your campus network</Text>
        </View>
      </View>

      {loading ? (
        <DiscoverSkeleton />
      ) : (
        <ScrollView 
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 60 }}
        >
          {/* Contacts Section */}
          <View style={styles.section}>
            <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>FAST CONNECT</Text>
            <ContactRow 
              icon="call-outline" 
              title="Sync Contacts" 
              subtitle="Find your phone contacts on UniGram" 
              iconColor="#10b981" 
              onPress={handleSyncContacts}
              loading={isSyncingContacts}
            />
            <ContactRow 
              icon="logo-facebook" 
              title="Facebook Friends" 
              subtitle="Connect your Facebook account" 
              iconColor="#3b82f6" 
              onPress={() => warning()}
            />
          </View>

          {/* New: From Contacts Section */}
          {contactUsers.length > 0 && (
            <View style={styles.section}>
               <View style={styles.sectionHeader}>
                  <View>
                    <Text style={[styles.sectionHeading, { color: colors.textMuted, marginBottom: 2 }]}>FROM YOUR CONTACTS</Text>
                    <Text style={[styles.sectionSub, { color: colors.textMuted }]}>{contactUsers.length} friends already on UniGram</Text>
                  </View>
                </View>
                <View style={[styles.listCard, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
                  {contactUsers.map(u => <UserRow key={u.id} user={u} currentUserId={currentUserId} onUserPress={onUserPress} />)}
                </View>
            </View>
          )}

          {/* Shared Interests - Horizontal */}
          {sharedInterests.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <View>
                  <Text style={[styles.sectionHeading, { color: colors.textMuted, marginBottom: 2 }]}>SHARED INTERESTS</Text>
                  <Text style={[styles.sectionSub, { color: colors.textMuted }]}>People who share your vibe</Text>
                </View>
                <TouchableOpacity>
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 13 }}>See all</Text>
                </TouchableOpacity>
              </View>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12, paddingRight: 20 }}
              >
                {sharedInterests.map(user => (
                  <InterestUserCard 
                    key={user.id} 
                    user={user} 
                    currentUserId={currentUserId}
                    onUserPress={onUserPress}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* People You May Know - Vertical List */}
          <View style={styles.section}>
             <View style={styles.sectionHeader}>
                <View>
                  <Text style={[styles.sectionHeading, { color: colors.textMuted, marginBottom: 2 }]}>PEOPLE YOU MAY KNOW</Text>
                  <Text style={[styles.sectionSub, { color: colors.textMuted }]}>Based on mutual follows and campus</Text>
                </View>
              </View>
              <View style={[styles.listCard, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
                {peopleYouMayKnow.map(u => <UserRow key={u.id} user={u} currentUserId={currentUserId} onUserPress={onUserPress} />)}
                <TouchableOpacity style={[styles.viewAllBtn, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                  <Text style={{ color: colors.accent, fontWeight: '700', fontSize: 14 }}>View More Suggestions</Text>
                </TouchableOpacity>
              </View>
          </View>

          {/* Campus Trending */}
          {campusTrending.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionHeading, { color: colors.textMuted }]}>CAMPUS STARS</Text>
              <View style={[styles.trendingCard, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
                 {campusTrending.map(u => <UserRow key={u.id} user={u} currentUserId={currentUserId} onUserPress={onUserPress} />)}
              </View>
            </View>
          )}

          {/* Algorithm Promo */}
          <LinearGradient
            colors={['#8b5cf6', '#6366f1']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.promoCard}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.promoTitle}>Invite Friends</Text>
              <Text style={styles.promoText}>Grow your community and make UniGram even better together.</Text>
              <TouchableOpacity style={styles.promoBtn}>
                <Text style={styles.promoBtnText}>Share Link</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.promoIconWrap}>
              <MaterialCommunityIcons name="party-popper" size={60} color="rgba(255,255,255,0.3)" />
            </View>
          </LinearGradient>
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { marginRight: 16 },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  headerSub: { fontSize: 13, marginTop: 2, opacity: 0.8 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  section: { marginTop: 24, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 },
  sectionHeading: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  sectionSub: { fontSize: 12, marginTop: 2 },
  
  // Interest Card
  interestCard: {
    width: 140,
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  interestAvatarWrap: { position: 'relative' },
  interestAvatar: { width: 60, height: 60, borderRadius: 30 },
  interestBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  interestName: { fontSize: 13, fontWeight: '800' },
  interestMeta: { fontSize: 10, marginTop: 2, textAlign: 'center' },
  interestFollowBtn: {
    marginTop: 12,
    width: '100%',
    paddingVertical: 7,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interestFollowBtnText: { fontSize: 12, fontWeight: '800' },

  // Contact Row
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 8,
  },
  contactIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  contactTitle: { fontSize: 14, fontWeight: '700' },
  contactSub: { fontSize: 11, marginTop: 2 },
  contactBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  contactBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  // User List
  listCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  trendingCard: { borderRadius: 20, borderWidth: 1, overflow: 'hidden' },
  userRow: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  avatarWrap: { marginRight: 12 },
  avatar: { width: 44, height: 44, borderRadius: 15 },
  userInfo: { flex: 1 },
  userName: { fontSize: 14, fontWeight: '800' },
  userMeta: { fontSize: 12, marginTop: 2 },
  rowFollowBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 },
  rowFollowText: { fontSize: 12, fontWeight: '800' },
  viewAllBtn: { paddingVertical: 14, alignItems: 'center' },

  // Promo
  promoCard: {
    margin: 16,
    padding: 20,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
  },
  promoTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
  promoText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4, lineHeight: 18 },
  promoBtn: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  promoBtnText: { color: '#6366f1', fontSize: 13, fontWeight: '800' },
  promoIconWrap: { marginLeft: 16 },
});
