import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, TextInput, Alert,
  RefreshControl, ScrollView, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { AdminReport, getReports, updateReportStatus, banUser as banUserAction, suspendUser as suspendUserAction, deleteReportedContent, getAuthorIdForReport } from '../services/reports';
import { sendAdminNotification } from '../services/notifications';
import { usePopup } from '../context/PopupContext';
import { useTheme } from '../context/ThemeContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
  totalUsers: number;
  totalPosts: number;
  totalMarketItems: number;
  activeReports: number;
  pendingVerifications: number;
  dauEstimate: number;
}

interface AdminUser {
  id: string;
  username: string;
  full_name: string;
  avatar_url: string | null;
  university: string | null;
  is_verified: boolean;
  is_admin: boolean;
  is_banned: boolean;
  is_suspended: boolean;
  verification_type: string | null;
}

interface AdminVerificationRequest {
  id: string;
  user_id: string;
  type: string;
  status: string;
  full_name: string;
  email: string;
  university: string | null;
  reason: string;
  document_urls: string[];
  submitted_at: string;
  rejection_reason: string | null;
  profiles: { username: string; avatar_url: string | null } | null;
}

interface AdminPost {
  id: string;
  caption: string | null;
  media_url: string | null;
  type: string;
  likes_count: number;
  created_at: string;
  profiles: { username: string } | null;
}

interface AdminMarketItem {
  id: string;
  title: string;
  price: number;
  image_urls: string[] | null;
  is_sold: boolean;
  user_id: string;
  created_at: string;
  profiles: { username: string } | null;
}

type AdminTab = 'overview' | 'users' | 'posts' | 'market' | 'reports' | 'verifications' | 'announce';
type PostFilter = 'all' | 'flagged';

// ─── Helper ───────────────────────────────────────────────────────────────────

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

// ─── Components ───────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ title: string; onSeeAll?: () => void; count?: number }> = ({ title, onSeeAll, count }) => (
  <View style={styles.sectionHeader}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {count !== undefined && (
        <View style={styles.countBadge}><Text style={styles.countBadgeText}>{count}</Text></View>
      )}
    </View>
    {onSeeAll && (
      <TouchableOpacity onPress={onSeeAll}>
        <Text style={styles.seeAllText}>See All</Text>
      </TouchableOpacity>
    )}
  </View>
);

const HorizontalItem: React.FC<{ 
  image?: string; 
  title: string; 
  subtitle: string; 
  onPress?: () => void;
  badge?: string;
  badgeColor?: string;
}> = ({ image, title, subtitle, onPress, badge, badgeColor }) => (
  <TouchableOpacity style={styles.hItem} onPress={onPress}>
    {image ? (
      <Image source={{ uri: image }} style={styles.hItemImage} />
    ) : (
      <View style={[styles.hItemImage, { backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="image-outline" size={20} color="rgba(255,255,255,0.2)" />
      </View>
    )}
    {badge && (
      <View style={[styles.hItemBadge, { backgroundColor: badgeColor || '#6366f1' }]}>
        <Text style={styles.hItemBadgeText}>{badge}</Text>
      </View>
    )}
    <View style={styles.hItemInfo}>
      <Text style={styles.hItemTitle} numberOfLines={1}>{title}</Text>
      <Text style={styles.hItemSub} numberOfLines={1}>{subtitle}</Text>
    </View>
  </TouchableOpacity>
);

// ─── Overview Tab ─────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ 
  stats: AdminStats | null; 
  loading: boolean; 
  onRefresh: () => void;
  setActiveTab: (tab: AdminTab) => void;
}> = ({ stats, loading, onRefresh, setActiveTab }) => {
  const [recentPosts, setRecentPosts] = useState<AdminPost[]>([]);
  const [recentMarket, setRecentMarket] = useState<AdminMarketItem[]>([]);
  const [pendingVerifs, setPendingVerifs] = useState<AdminVerificationRequest[]>([]);
  const { showPopup } = usePopup();

  useEffect(() => {
    const fetchData = async () => {
      const [p, m, v] = await Promise.all([
        supabase.from('posts').select('*, profiles(username)').order('created_at', { ascending: false }).limit(5),
        supabase.from('market_items').select('*, profiles(username)').order('created_at', { ascending: false }).limit(5),
        supabase.from('verification_requests').select('*, profiles(username, avatar_url)').eq('status', 'pending').order('submitted_at', { ascending: false }).limit(5)
      ]);
      setRecentPosts(((p.data || []).map(x => ({ ...x, profiles: Array.isArray(x.profiles) ? x.profiles[0] : x.profiles })) as any));
      setRecentMarket(((m.data || []).map(x => ({ ...x, profiles: Array.isArray(x.profiles) ? x.profiles[0] : x.profiles })) as any));
      setPendingVerifs(((v.data || []).map(x => ({ ...x, profiles: Array.isArray(x.profiles) ? x.profiles[0] : x.profiles })) as any));
    };
    fetchData();
  }, [loading]);

  const cards = stats
    ? [
        { label: 'Total Users', value: stats.totalUsers, icon: 'people', color: '#6366f1' },
        { label: 'Active Reports', value: stats.activeReports, icon: 'flag', color: '#ef4444' },
        { label: 'Pending Verifs', value: stats.pendingVerifications, icon: 'shield-checkmark', color: '#f59e0b' },
        { label: 'Market Items', value: stats.totalMarketItems, icon: 'storefront', color: '#22c55e' },
      ]
    : [];

  return (
    <ScrollView contentContainerStyle={[styles.tabContent, { paddingBottom: 100 }]}>
      <View style={styles.overviewHeader}>
        <Text style={styles.sectionTitle}>Dashboard Stats</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color="#6366f1" />
            : <Ionicons name="refresh" size={20} color="#6366f1" />
          }
        </TouchableOpacity>
      </View>

      <View style={styles.statsGrid}>
        {cards.map(card => (
          <View key={card.label} style={styles.statCard}>
            <View style={[styles.statIconWrap, { backgroundColor: card.color + '22' }]}>
              <Ionicons name={card.icon as any} size={22} color={card.color} />
            </View>
            <Text style={styles.statValue}>{(card.value ?? 0).toLocaleString()}</Text>
            <Text style={styles.statLabel}>{card.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ gap: 24, marginTop: 24 }}>
        {pendingVerifs.length > 0 && (
          <View>
            <SectionHeader title="Pending Verifications" onSeeAll={() => setActiveTab('verifications')} count={pendingVerifs.length} />
            <FlatList
              data={pendingVerifs}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
              renderItem={({ item }) => (
                <HorizontalItem 
                  image={item.profiles?.avatar_url || undefined}
                  title={`@${item.profiles?.username}`}
                  subtitle={item.type === 'influencer' ? 'Notable' : item.type.toUpperCase()}
                  badge={item.type === 'influencer' ? 'Notable' : item.type}
                  badgeColor={item.type === 'influencer' ? '#818cf8' : undefined}
                  onPress={() => setActiveTab('verifications')}
                />
              )}
            />
          </View>
        )}

        <View>
          <SectionHeader title="Recent Posts" onSeeAll={() => setActiveTab('posts')} />
          <FlatList
            data={recentPosts}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item }) => (
              <HorizontalItem 
                image={item.media_url || undefined}
                title={`@${item.profiles?.username}`}
                subtitle={item.caption || 'No caption'}
                onPress={() => setActiveTab('posts')}
              />
            )}
          />
        </View>

        <View>
          <SectionHeader title="Latest Market Items" onSeeAll={() => setActiveTab('market')} />
          <FlatList
            data={recentMarket}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item }) => (
              <HorizontalItem 
                image={item.image_urls?.[0]}
                title={item.title}
                subtitle={`$${item.price.toFixed(2)} · @${item.profiles?.username}`}
                onPress={() => setActiveTab('market')}
              />
            )}
          />
        </View>
      </View>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color="rgba(255,255,255,0.4)" />
        <Text style={styles.infoText}>
          Real-time insights across the UniGram platform. Click "See All" to manage items.
        </Text>
      </View>
    </ScrollView>
  );
};

// ─── Users Tab ────────────────────────────────────────────────────────────────

const UsersTab: React.FC = () => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const { showPopup } = usePopup();
  const { colors } = useTheme();

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, university, is_verified, is_admin, is_banned, is_suspended, verification_type')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setUsers((data as AdminUser[]) ?? []);
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Failed to load users',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleVerify = async (userId: string) => {
    setActioning(userId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_verified: true })
        .eq('id', userId);
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_verified: true } : u));

      // Notify the user their account is now verified
      const { data: { user: adminUser } } = await supabase.auth.getUser();
      const adminId = adminUser?.id ?? adminId;
      sendAdminNotification(
        adminId,
        'Congratulations! Your account has been verified by the UniGram team.',
        'verification_approved',
        userId,
      ).catch(() => {});
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Failed to verify user',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setActioning(null);
    }
  };

  const handleBan = async (userId: string, ban: boolean) => {
    showPopup({
      title: ban ? 'Ban User' : 'Unban User',
      message: ban ? 'This will prevent the user from accessing the app.' : 'This will restore access for the user.',
      icon: ban ? 'ban-outline' : 'checkmark-circle-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        { 
          text: ban ? 'Ban' : 'Unban', 
          style: ban ? 'destructive' : 'default',
          onPress: async () => {
            setActioning(userId);
            try {
              const { error } = await supabase
                .from('profiles')
                .update({ is_banned: ban })
                .eq('id', userId);
              if (error) throw error;
              setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_banned: ban } : u));

              // Notify the user about the ban/unban
              const { data: { user: adminUser } } = await supabase.auth.getUser();
              const adminId = adminUser?.id ?? userId;
              const banMsg = ban
                ? 'Your account has been permanently banned from UniGram for violating campus community guidelines.'
                : 'Your account ban has been lifted. You can now access UniGram again.';
              sendAdminNotification(adminId, banMsg, 'admin_ban' as any, userId).catch(() => {});
            } catch (e: any) {
              showPopup({
                title: 'Error',
                message: e.message ?? 'Action failed',
                icon: 'alert-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
            } finally {
              setActioning(null);
            }
          }
        }
      ]
    });
  };

  const handleSuspend = async (userId: string, suspend: boolean) => {
    showPopup({
      title: suspend ? 'Suspend User' : 'Unsuspend User',
      message: suspend ? "This will temporarily restrict the user's ability to post or sell." : "This will restore full access for the user.",
      icon: suspend ? 'pause-circle-outline' : 'play-circle-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: suspend ? 'Suspend' : 'Unsuspend',
          style: suspend ? 'destructive' : 'default',
          onPress: async () => {
            setActioning(userId);
            try {
              await suspendUserAction(userId, suspend);
              setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_suspended: suspend } : u));

              const { data: { user: adminUser } } = await supabase.auth.getUser();
              const adminId = adminUser?.id ?? userId;
              const message = suspend
                ? 'Your account has been temporarily suspended for violating campus community guidelines. You can still browse, but posting and selling are restricted.'
                : 'Your account suspension has been lifted. You now have full access to post and sell on UniGram.';
              const notifType = suspend ? 'account_suspended' : 'account_unsuspended';

              await sendAdminNotification(adminId, message, notifType as any, userId);
            } catch (e: any) {
              showPopup({
                title: 'Error',
                message: e.message ?? 'Action failed',
                icon: 'alert-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
            } finally {
              setActioning(null);
            }
          }
        }
      ]
    });
  };

  const filtered = users.filter(u => {
    const q = search.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.full_name?.toLowerCase().includes(q) ||
      u.university?.toLowerCase().includes(q)
    );
  });

  const renderUser = ({ item: u }: { item: AdminUser }) => (
    <View style={[styles.userRow, (u.is_banned || u.is_suspended) && styles.userRowBanned]}>
      <View style={styles.userAvatarWrap}>
        {u.avatar_url
          ? <Image source={{ uri: u.avatar_url }} style={styles.userAvatar} />
          : (
            <View style={[styles.userAvatar, styles.userAvatarPlaceholder]}>
              <Ionicons name="person" size={18} color="#555" />
            </View>
          )
        }
      </View>
      <View style={styles.userInfo}>
        <View style={styles.userNameRow}>
          <Text style={styles.userName} numberOfLines={1}>{u.username}</Text>
          {u.is_verified && (
            <View style={[styles.badge, styles.badgeVerified]}>
              <Text style={styles.badgeText}>Verified</Text>
            </View>
          )}
          {u.is_admin && (
            <View style={[styles.badge, styles.badgeAdmin]}>
              <Text style={styles.badgeText}>Admin</Text>
            </View>
          )}
          {u.is_banned && (
            <View style={[styles.badge, styles.badgeBanned]}>
              <Text style={styles.badgeText}>Banned</Text>
            </View>
          )}
          {u.is_suspended && (
            <View style={[styles.badge, styles.badgeBanned, { backgroundColor: '#f59e0b' }]}>
              <Text style={styles.badgeText}>Suspended</Text>
            </View>
          )}
        </View>
        <Text style={styles.userMeta} numberOfLines={1}>
          {u.full_name}{u.university ? ` · ${u.university}` : ''}
        </Text>
      </View>
      <View style={styles.userActions}>
        {actioning === u.id ? (
          <ActivityIndicator size="small" color="#6366f1" />
        ) : (
          <>
            {!u.is_verified && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnVerify]}
                onPress={() => handleVerify(u.id)}
              >
                <Text style={styles.actionBtnText}>Verify</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, u.is_suspended ? styles.actionBtnUnban : styles.actionBtnBan, { backgroundColor: u.is_suspended ? '#4f46e5' : '#f59e0b' }]}
              onPress={() => handleSuspend(u.id, !u.is_suspended)}
            >
              <Text style={styles.actionBtnText}>{u.is_suspended ? 'Unsuspend' : 'Suspend'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, u.is_banned ? styles.actionBtnUnban : styles.actionBtnBan]}
              onPress={() => handleBan(u.id, !u.is_banned)}
            >
              <Text style={styles.actionBtnText}>{u.is_banned ? 'Unban' : 'Ban'}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.tabContent}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search users..."
          placeholderTextColor="rgba(255,255,255,0.25)"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.countLabel}>{filtered.length} users</Text>
      {loading ? (
        <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={u => u.id}
          renderItem={renderUser}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor="#6366f1"
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

// ─── Posts Tab ────────────────────────────────────────────────────────────────

const PostsTab: React.FC = () => {
  const [posts, setPosts] = useState<AdminPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<PostFilter>('all');
  const [deleting, setDeleting] = useState<string | null>(null);
  const { showPopup } = usePopup();
  const { colors } = useTheme();

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('id, caption, media_url, type, likes_count, created_at, profiles(username)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const formatted = (data as any[]).map(p => ({
        ...p,
        profiles: Array.isArray(p.profiles) ? p.profiles[0] : p.profiles
      })) as unknown as AdminPost[];
      setPosts(formatted);
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Failed to load posts',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (postId: string) => {
    showPopup({
      title: 'Delete Post',
      message: 'Permanently delete this post? This cannot be undone.',
      icon: 'trash-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(postId);
            try {
              const { error } = await supabase.from('posts').delete().eq('id', postId);
              if (error) throw error;
              setPosts(prev => prev.filter(p => p.id !== postId));
            } catch (e: any) {
              showPopup({
                title: 'Error',
                message: e.message ?? 'Delete failed',
                icon: 'alert-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    });
  };

  const filtered = filter === 'flagged'
    ? posts.filter(p => (p.likes_count ?? 0) < 0)
    : posts;

  const renderPost = ({ item: p }: { item: AdminPost }) => (
    <View style={styles.postRow}>
      {p.media_url ? (
        <Image source={{ uri: p.media_url }} style={styles.postThumb} />
      ) : (
        <View style={[styles.postThumb, styles.postThumbPlaceholder]}>
          <Ionicons name={p.type === 'thread' ? 'chatbubble-outline' : 'image-outline'} size={20} color="#444" />
        </View>
      )}
      <View style={styles.postInfo}>
        <Text style={styles.postUsername}>@{p.profiles?.username ?? 'unknown'}</Text>
        {p.caption ? (
          <Text style={styles.postCaption} numberOfLines={2}>{p.caption}</Text>
        ) : null}
        <View style={styles.postMeta}>
          <Ionicons name="heart" size={12} color="rgba(255,255,255,0.4)" />
          <Text style={styles.postMetaText}>{p.likes_count ?? 0}</Text>
          <Text style={styles.postMetaDot}>·</Text>
          <Text style={styles.postMetaText}>{timeAgo(p.created_at)}</Text>
          <View style={[styles.typePill]}>
            <Text style={styles.typePillText}>{p.type}</Text>
          </View>
        </View>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(p.id)}
        disabled={deleting === p.id}
      >
        {deleting === p.id
          ? <ActivityIndicator size="small" color="#ef4444" />
          : <Ionicons name="trash-outline" size={18} color="#ef4444" />
        }
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.tabContent}>
      <View style={styles.filterRow}>
        {(['all', 'flagged'] as PostFilter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterBtnText, filter === f && styles.filterBtnTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.countLabel}>{filtered.length} posts</Text>
      </View>
      {loading ? (
        <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={p => p.id}
          renderItem={renderPost}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor="#6366f1"
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="images-outline" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No posts found</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

// ─── Market Tab ───────────────────────────────────────────────────────────────

const MarketTab: React.FC = () => {
  const [items, setItems] = useState<AdminMarketItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const { showPopup } = usePopup();
  const { colors } = useTheme();

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('market_items')
        .select('id, title, price, image_urls, is_sold, created_at, profiles(username)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const formatted = (data as any[]).map(item => ({
        ...item,
        profiles: Array.isArray(item.profiles) ? item.profiles[0] : item.profiles
      })) as unknown as AdminMarketItem[];
      setItems(formatted);
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Failed to load market items',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (itemId: string) => {
    showPopup({
      title: 'Delete Listing',
      message: 'Permanently delete this market listing?',
      icon: 'trash-outline',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActioning(itemId);
            try {
              const { error } = await supabase.from('market_items').delete().eq('id', itemId);
              if (error) throw error;
              setItems(prev => prev.filter(i => i.id !== itemId));
            } catch (e: any) {
              showPopup({
                title: 'Error',
                message: e.message ?? 'Delete failed',
                icon: 'alert-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
            } finally {
              setActioning(null);
            }
          },
        },
      ]
    });
  };

  const handleMarkSold = async (itemId: string) => {
    setActioning(itemId);
    try {
      const { error } = await supabase
        .from('market_items')
        .update({ is_sold: true })
        .eq('id', itemId);
      if (error) throw error;
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, is_sold: true } : i));
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Action failed',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setActioning(null);
    }
  };

  const renderItem = ({ item: m }: { item: AdminMarketItem }) => {
    const thumb = m.image_urls?.[0] ?? null;
    const isActioning = actioning === m.id;

    return (
      <View style={styles.marketRow}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.marketThumb} />
        ) : (
          <View style={[styles.marketThumb, styles.postThumbPlaceholder]}>
            <Ionicons name="storefront-outline" size={20} color="#444" />
          </View>
        )}
        <View style={styles.marketInfo}>
          <Text style={styles.marketTitle} numberOfLines={1}>{m.title}</Text>
          <Text style={styles.marketSeller}>@{m.profiles?.username ?? 'unknown'}</Text>
          <View style={styles.marketMeta}>
            <Text style={styles.marketPrice}>${m.price.toFixed(2)}</Text>
            {m.is_sold && (
              <View style={styles.soldBadge}>
                <Text style={styles.soldBadgeText}>SOLD</Text>
              </View>
            )}
          </View>
        </View>
        {isActioning ? (
          <ActivityIndicator size="small" color="#6366f1" style={{ marginRight: 12 }} />
        ) : (
          <View style={styles.marketActions}>
            {!m.is_sold && (
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnVerify]}
                onPress={() => handleMarkSold(m.id)}
              >
                <Text style={styles.actionBtnText}>Sold</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnBan]}
              onPress={() => handleDelete(m.id)}
            >
              <Ionicons name="trash-outline" size={13} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.tabContent}>
      <Text style={styles.countLabel}>{items.length} listings</Text>
      {loading ? (
        <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor="#6366f1"
            />
          }
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="storefront-outline" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No market items found</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

// ─── Reports Tab ──────────────────────────────────────────────────────────────

const ReportsTab: React.FC = () => {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const { showPopup } = usePopup();
  const { colors } = useTheme();

  const load = useCallback(async () => {
    try {
      const data = await getReports();
      setReports(data.filter(r => r.status === 'pending'));
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Failed to load reports',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (report: AdminReport, action: 'resolve' | 'dismiss' | 'ban' | 'suspend' | 'delete') => {
    setActioning(report.id);
    try {
      if (action === 'delete') {
        await deleteReportedContent(report.target_id, report.target_type);
        await updateReportStatus(report.id, 'resolved');
        showPopup({
          title: 'Success',
          message: 'Content deleted and report resolved.',
          icon: 'checkmark-circle-outline',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
      } else if (action === 'suspend' || action === 'ban') {
        const authorId = await getAuthorIdForReport(report.target_id, report.target_type);
        if (!authorId) throw new Error('Could not identify the user responsible for this content.');
        
        if (action === 'ban') {
          await banUserAction(authorId);
          showPopup({
            title: 'Success',
            message: 'User has been banned.',
            icon: 'ban-outline',
            buttons: [{ text: 'OK', onPress: () => {} }]
          });
        } else {
          await suspendUserAction(authorId, true);
          showPopup({
            title: 'Success',
            message: 'User has been suspended.',
            icon: 'pause-circle-outline',
            buttons: [{ text: 'OK', onPress: () => {} }]
          });
        }
        await updateReportStatus(report.id, 'resolved');
      } else if (action === 'resolve') {
        await updateReportStatus(report.id, 'resolved');
        showPopup({
          title: 'Success',
          message: 'Report marked as resolved.',
          icon: 'checkmark-circle-outline',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
      } else {
        await updateReportStatus(report.id, 'dismissed');
        showPopup({
          title: 'Success',
          message: 'Report dismissed.',
          icon: 'close-circle-outline',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
      }
      setReports(prev => prev.filter(r => r.id !== report.id));
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Action failed',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setActioning(null);
    }
  };

  const renderReport = ({ item: r }: { item: AdminReport }) => (
    <View style={styles.reportCard}>
      <View style={styles.reportHeader}>
        <Image source={{ uri: r.reporter?.avatar_url || 'https://via.placeholder.com/40' }} style={styles.reportAvatar} />
        <View style={{ flex: 1 }}>
          <Text style={styles.reportReporter}>@{r.reporter?.username || 'unknown'} reported a {r.target_type}</Text>
          <Text style={styles.reportMeta}>{timeAgo(r.created_at)} · {r.reason}</Text>
        </View>
        <View style={[styles.badge, styles.badgeBanned]}>
          <Text style={styles.badgeText}>{r.status}</Text>
        </View>
      </View>

      <View style={styles.reportContent}>
        <Text style={styles.reportDetailLabel}>Reason:</Text>
        <Text style={styles.reportReasonText}>{r.reason}</Text>
        {r.details ? (
          <>
            <Text style={[styles.reportDetailLabel, { marginTop: 8 }]}>Additional Details:</Text>
            <Text style={styles.reportDetailsText}>{r.details}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.reportActions}>
        {actioning === r.id ? (
          <ActivityIndicator size="small" color="#6366f1" />
        ) : (
          <View style={{ flexDirection: 'column', gap: 8, width: '100%' }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDismiss, { flex: 1 }]} onPress={() => handleAction(r, 'dismiss')}>
                <Text style={styles.actionBtnText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnResolve, { flex: 1 }]} onPress={() => handleAction(r, 'resolve')}>
                <Text style={styles.actionBtnText}>Resolved</Text>
              </TouchableOpacity>
            </View>
            
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {r.target_type !== 'member' && (
                <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: '#f59e0b' }]} onPress={() => handleAction(r, 'delete')}>
                  <Text style={styles.actionBtnText}>Delete Content</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.actionBtn, { flex: 1, backgroundColor: '#ef4444' }]} onPress={() => handleAction(r, 'suspend')}>
                <Text style={styles.actionBtnText}>Suspend User</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnBan, { flex: 1 }]} onPress={() => handleAction(r, 'ban')}>
                <Text style={styles.actionBtnText}>Ban User</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={styles.tabContent}>
      <Text style={styles.countLabel}>{reports.length} pending reports</Text>
      {loading ? (
        <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={reports}
          keyExtractor={r => r.id}
          renderItem={renderReport}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#6366f1" />
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-done" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>No pending reports</Text>
            </View>
          }
        />
      )}
    </View>
  );
};

// ─── Verifications Tab ────────────────────────────────────────────────────────

type VerifFilter = 'pending' | 'approved' | 'rejected';

const VerificationsTab: React.FC = () => {
  const [allRequests, setAllRequests] = useState<AdminVerificationRequest[]>([]);
  const [filter, setFilter] = useState<VerifFilter>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actioning, setActioning] = useState<string | null>(null);
  const [rejectionModalVisible, setRejectionModalVisible] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedRequest, setSelectedRequest] = useState<AdminVerificationRequest | null>(null);
  const [docViewerVisible, setDocViewerVisible] = useState(false);
  const [viewingDocs, setViewingDocs] = useState<string[]>([]);
  const { showPopup } = usePopup();
  const { colors } = useTheme();

  // Derived list based on active filter
  const requests = React.useMemo(() => allRequests.filter(r => r.status === filter), [allRequests, filter]);

  const counts = {
    pending: allRequests.filter(r => r.status === 'pending').length,
    approved: allRequests.filter(r => r.status === 'approved').length,
    rejected: allRequests.filter(r => r.status === 'rejected').length,
  };

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('verification_requests')
        .select('*, profiles(username, avatar_url)')
        .order('submitted_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      const formatted = (data as any[]).map(req => ({
        ...req,
        profiles: Array.isArray(req.profiles) ? req.profiles[0] : req.profiles
      })) as unknown as AdminVerificationRequest[];
      
      console.log(`[Admin] Loaded ${formatted.length} verification requests. Filter: ${filter}`);
      if (formatted.some(r => r.type === 'influencer')) {
        console.log('[Admin] Found notable/influencer requests in fetch results.');
      }
      
      setAllRequests(formatted);
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Failed to load requests',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleAction = async (request: AdminVerificationRequest, approve: boolean) => {
    if (!approve) {
      setSelectedRequest(request);
      setRejectionReason('');
      setRejectionModalVisible(true);
      return;
    }

    setActioning(request.id);
    try {
      const { data: { user: admin } } = await supabase.auth.getUser();
      if (!admin) throw new Error('Not authenticated');

      // 1. Update request status → DB trigger handles profile update + in-app notification
      const { error: rErr } = await supabase
        .from('verification_requests')
        .update({ status: 'approved' })
        .eq('id', request.id);
      if (rErr) throw rErr;

      setAllRequests(prev => prev.map(r => r.id === request.id ? { ...r, status: 'approved' } : r));

      // 2. Send device push notification (the DB trigger already handled in-app notification)
      const typeLabel = request.type === 'influencer' ? 'Notable Account' : request.type;
      sendAdminNotification(
        admin.id,
        `Congratulations! Your ${typeLabel} verification has been approved. Your profile is now verified!`,
        'verification_approved',
        request.user_id,
      ).catch(e => console.error('Push notification failed:', e));

      showPopup({
        title: 'Approved',
        message: `${request.profiles?.username ?? 'User'} is now verified.`,
        icon: 'checkmark-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Action failed',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setActioning(null);
    }
  };

  const submitRejection = async () => {
    if (!selectedRequest || !rejectionReason.trim()) return;
    setActioning(selectedRequest.id);
    setRejectionModalVisible(false);

    try {
      const { data: { user: admin } } = await supabase.auth.getUser();
      if (!admin) throw new Error('Not authenticated');

      // Update request status + reason → DB trigger handles in-app notification
      const { error } = await supabase
        .from('verification_requests')
        .update({ status: 'rejected', rejection_reason: rejectionReason.trim() })
        .eq('id', selectedRequest.id);
      if (error) throw error;

      setAllRequests(prev => prev.map(r =>
        r.id === selectedRequest.id
          ? { ...r, status: 'rejected', rejection_reason: rejectionReason.trim() }
          : r,
      ));

      // Send device push notification
      sendAdminNotification(
        admin.id,
        `Your verification request was not approved. Reason: ${rejectionReason.trim()}`,
        'verification_rejected',
        selectedRequest.user_id,
      ).catch(e => console.error('Push notification failed:', e));

      showPopup({
        title: 'Rejected',
        message: 'Request rejected with reason sent to user.',
        icon: 'close-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Action failed',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setActioning(null);
      setSelectedRequest(null);
    }
  };

  const renderRequest = ({ item: r }: { item: AdminVerificationRequest }) => (
    <View style={styles.requestCard}>
      <View style={styles.requestHeader}>
        <View style={styles.userAvatarWrap}>
          {r.profiles?.avatar_url
            ? <Image source={{ uri: r.profiles.avatar_url }} style={styles.userAvatar} />
            : <View style={[styles.userAvatar, styles.userAvatarPlaceholder]}><Ionicons name="person" size={16} color="#555" /></View>
          }
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>@{r.profiles?.username ?? 'unknown'}</Text>
          <Text style={styles.userMeta}>{timeAgo(r.submitted_at)} · {r.type === 'influencer' ? 'NOTABLE' : r.type.toUpperCase()}</Text>
        </View>
        <View style={[styles.badge, styles.badgeAdmin, { backgroundColor: r.type === 'influencer' ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.05)' }]}>
          <Text style={[styles.badgeText, { color: r.type === 'influencer' ? '#818cf8' : 'rgba(255,255,255,0.4)' }]}>
            {r.type === 'influencer' ? 'Notable' : r.type}
          </Text>
        </View>
      </View>

      <View style={styles.requestDetails}>
        <Text style={styles.detailLabel}>Full Name: <Text style={styles.detailValue}>{r.full_name}</Text></Text>
        <Text style={styles.detailLabel}>Email: <Text style={styles.detailValue}>{r.email}</Text></Text>
        {r.university ? (
          <Text style={styles.detailLabel}>University: <Text style={styles.detailValue}>{r.university}</Text></Text>
        ) : null}
        <Text style={styles.detailLabel}>Reason:</Text>
        <Text style={styles.reasonText}>{r.reason}</Text>
      </View>

      {r.document_urls && r.document_urls.length > 0 && (
        <View style={styles.docWrapper}>
          <TouchableOpacity 
            style={styles.docRevealBtn}
            onPress={() => {
              setViewingDocs(r.document_urls);
              setDocViewerVisible(true);
            }}
          >
            <Ionicons name="document-text" size={18} color="#818cf8" />
            <Text style={styles.docRevealText}>View {r.document_urls.length} Submitted Document(s)</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(129, 140, 248, 0.5)" />
          </TouchableOpacity>
        </View>
      )}

      {r.status === 'approved' && (
        <View style={[styles.statusBanner, { backgroundColor: 'rgba(34,197,94,0.12)' }]}>
          <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
          <Text style={[styles.statusBannerText, { color: '#22c55e' }]}>Approved</Text>
        </View>
      )}
      {r.status === 'rejected' && (
        <View style={[styles.statusBanner, { backgroundColor: 'rgba(239,68,68,0.12)' }]}>
          <Ionicons name="close-circle" size={14} color="#ef4444" />
          <Text style={[styles.statusBannerText, { color: '#ef4444' }]}>
            Rejected{r.rejection_reason ? `: ${r.rejection_reason}` : ''}
          </Text>
        </View>
      )}

      {r.status === 'pending' && (
        <View style={styles.requestActions}>
          {actioning === r.id ? (
            <ActivityIndicator size="small" color="#6366f1" />
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnReject]}
                onPress={() => handleAction(r, false)}
              >
                <Text style={styles.actionBtnText}>Reject</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnApprove]}
                onPress={() => handleAction(r, true)}
              >
                <Text style={styles.actionBtnText}>Approve</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.tabContent}>
      {/* Status filter tabs */}
      <View style={styles.verifFilterRow}>
        {(['pending', 'approved', 'rejected'] as VerifFilter[]).map(f => {
          const isActive = filter === f;
          const color = f === 'approved' ? '#22c55e' : f === 'rejected' ? '#ef4444' : '#f59e0b';
          return (
            <TouchableOpacity
              key={f}
              style={[styles.verifFilterBtn, isActive && { borderColor: color, backgroundColor: color + '18' }]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.verifFilterText, isActive && { color }]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
                {counts[f] > 0 ? ` (${counts[f]})` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={r => r.id}
          renderItem={renderRequest}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor="#6366f1"
            />
          }
          contentContainerStyle={{ padding: 12, paddingBottom: 100 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={40} color="rgba(255,255,255,0.15)" />
              <Text style={styles.emptyText}>
                {filter === 'pending' ? 'All caught up!' : `No ${filter} requests`}
              </Text>
            </View>
          }
        />
      )}

      {/* Doc Viewer Modal */}
      <Modal visible={docViewerVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.docViewerContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Verification Documents</Text>
              <TouchableOpacity onPress={() => setDocViewerVisible(false)}>
                <Ionicons name="close" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={{ padding: 20 }}>
              {viewingDocs.map((url, idx) => {
                const isPdf = url.toLowerCase().endsWith('.pdf');
                return (
                  <View key={idx} style={styles.viewerItem}>
                    <View style={styles.viewerItemHeader}>
                      <Text style={styles.viewerItemTitle}>Document {idx + 1}</Text>
                      <TouchableOpacity onPress={() => {
                        const { Linking } = require('react-native');
                        Linking.openURL(url);
                      }}>
                        <Text style={styles.viewFullBtn}>OPEN ORIGINAL</Text>
                      </TouchableOpacity>
                    </View>
                    {isPdf ? (
                      <View style={styles.pdfPlaceholder}>
                        <Ionicons name="document-text" size={48} color="rgba(255,255,255,0.2)" />
                        <Text style={styles.pdfPlaceholderText}>PDF Document</Text>
                        <TouchableOpacity 
                          style={styles.pdfOpenBtn}
                          onPress={() => {
                            const { Linking } = require('react-native');
                            Linking.openURL(url);
                          }}
                        >
                          <Text style={styles.pdfOpenText}>Open PDF to View</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Image source={{ uri: url }} style={styles.viewerImage} resizeMode="contain" />
                    )}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Rejection Modal */}
      <Modal visible={rejectionModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.rejectionModal}>
            <View style={styles.rejectionHeader}>
              <Text style={styles.rejectionTitle}>Reject Request</Text>
              <TouchableOpacity onPress={() => setRejectionModalVisible(false)}>
                <Ionicons name="close" size={24} color="rgba(255,255,255,0.4)" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.rejectionSubtitle}>Please provide a reason for rejecting @{selectedRequest?.profiles?.username}'s request.</Text>
            
            <TextInput
              style={styles.rejectionInput}
              placeholder="e.g., Document not clear, requirements not met..."
              placeholderTextColor="rgba(255,255,255,0.2)"
              multiline
              autoFocus
              value={rejectionReason}
              onChangeText={setRejectionReason}
            />
            
            <View style={styles.rejectionActions}>
              <TouchableOpacity 
                style={[styles.rejectionBtn, styles.rejectionBtnCancel]} 
                onPress={() => setRejectionModalVisible(false)}
              >
                <Text style={styles.rejectionBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.rejectionBtn, styles.rejectionBtnSubmit, !rejectionReason.trim() && { opacity: 0.5 }]} 
                onPress={submitRejection}
                disabled={!rejectionReason.trim() || actioning !== null}
              >
                <Text style={[styles.rejectionBtnText, { color: '#fff' }]}>Submit Rejection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Announcements Tab ────────────────────────────────────────────────────────

const AnnouncementsTab: React.FC<{ adminId: string }> = ({ adminId }) => {
  const [message, setMessage] = useState('');
  const [targetUsername, setTargetUsername] = useState('');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const { showPopup } = usePopup();
  const { colors } = useTheme();

  // Load recent announcements sent by admin
  useEffect(() => {
    supabase
      .from('notifications')
      .select('*')
      .eq('actor_id', adminId)
      .in('type', ['announcement', 'verification_approved', 'verification_rejected'])
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => setHistory(data ?? []));
  }, [adminId]);

  const handleSend = async (broadcast: boolean) => {
    const msg = message.trim();
    if (!msg) return;
    setSending(true);
    try {
      let targetId: string | undefined;
      if (!broadcast) {
        if (!targetUsername.trim()) {
          showPopup({
            title: 'Error',
            message: 'Enter a username to send to a specific user.',
            icon: 'alert-circle-outline',
            buttons: [{ text: 'OK', onPress: () => {} }]
          });
          setSending(false);
          return;
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', targetUsername.trim().replace('@', ''))
          .maybeSingle();
        if (!profile) {
          showPopup({
            title: 'User not found',
            message: `@${targetUsername} does not exist.`,
            icon: 'at-outline',
            buttons: [{ text: 'OK', onPress: () => {} }]
          });
          setSending(false);
          return;
        }
        targetId = profile.id;
      }
      await sendAdminNotification(adminId, msg, 'announcement', targetId);
      // Add to local history optimistically
      setHistory(prev => [{
        id: 'temp-' + Date.now(),
        text: msg,
        type: 'announcement',
        created_at: new Date().toISOString(),
        user_id: targetId ?? null,
      }, ...prev]);
      setMessage('');
      setTargetUsername('');
      showPopup({
        title: 'Sent!',
        message: broadcast ? 'Announcement sent to all users.' : `Notification sent to @${targetUsername}.`,
        icon: 'send-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Failed to send.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.tabContent, { padding: 16, paddingBottom: 100 }]}>
      {/* Compose */}
      <View style={annoStyles.card}>
        <View style={annoStyles.cardHeader}>
          <Ionicons name="megaphone" size={18} color="#818cf8" />
          <Text style={annoStyles.cardTitle}>Send Notification</Text>
        </View>
        <TextInput
          style={annoStyles.input}
          placeholder="Write your message..."
          placeholderTextColor="rgba(255,255,255,0.2)"
          multiline
          value={message}
          onChangeText={setMessage}
        />
        <View style={annoStyles.targetRow}>
          <Ionicons name="at" size={16} color="rgba(255,255,255,0.3)" style={{ marginRight: 6 }} />
          <TextInput
            style={annoStyles.targetInput}
            placeholder="Username (leave blank to broadcast to all)"
            placeholderTextColor="rgba(255,255,255,0.2)"
            value={targetUsername}
            onChangeText={setTargetUsername}
            autoCapitalize="none"
          />
        </View>
        <View style={annoStyles.btnRow}>
          <TouchableOpacity
            style={[annoStyles.sendBtn, annoStyles.sendBtnUser, !message.trim() && { opacity: 0.4 }]}
            onPress={() => handleSend(false)}
            disabled={sending || !message.trim()}
          >
            <Ionicons name="person" size={14} color="#fff" />
            <Text style={annoStyles.sendBtnText}>Send to User</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[annoStyles.sendBtn, annoStyles.sendBtnAll, !message.trim() && { opacity: 0.4 }]}
            onPress={() => {
              showPopup({
                title: 'Broadcast to ALL users?',
                message: 'This will notify every user on the platform.',
                icon: 'megaphone-outline',
                buttons: [
                  { text: 'Cancel', style: 'cancel', onPress: () => {} },
                  { text: 'Send', style: 'destructive', onPress: () => handleSend(true) },
                ]
              });
            }}
            disabled={sending || !message.trim()}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="megaphone" size={14} color="#fff" />
                <Text style={annoStyles.sendBtnText}>Broadcast All</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Quick templates */}
      <Text style={annoStyles.sectionLabel}>QUICK TEMPLATES</Text>
      {[
        'Welcome to UniGram! Explore and connect with your campus.',
        'Reminder: Community guidelines must be followed. Stay respectful.',
        'New feature available! Update your app for the latest experience.',
      ].map(t => (
        <TouchableOpacity
          key={t}
          style={annoStyles.templateBtn}
          onPress={() => setMessage(t)}
        >
          <Ionicons name="document-text-outline" size={14} color="rgba(255,255,255,0.3)" />
          <Text style={annoStyles.templateText} numberOfLines={1}>{t}</Text>
        </TouchableOpacity>
      ))}

      {/* History */}
      {history.length > 0 && (
        <>
          <Text style={[annoStyles.sectionLabel, { marginTop: 24 }]}>RECENT NOTIFICATIONS</Text>
          {history.map(n => (
            <View key={n.id} style={annoStyles.historyItem}>
              <View style={{ flex: 1 }}>
                <Text style={annoStyles.historyText} numberOfLines={2}>{n.text}</Text>
                <Text style={annoStyles.historyMeta}>
                  {n.type} · {timeAgo(n.created_at)}
                  {n.user_id && ` · 1 user`}
                  {!n.user_id && ` · all users`}
                </Text>
              </View>
              <Ionicons name="checkmark-circle" size={16} color="#22c55e" />
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
};

const annoStyles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  targetInput: { flex: 1, color: '#fff', fontSize: 13 },
  btnRow: { flexDirection: 'row', gap: 10 },
  sendBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
  },
  sendBtnUser: { backgroundColor: 'rgba(99,102,241,0.3)', borderWidth: 1, borderColor: '#6366f1' },
  sendBtnAll: { backgroundColor: '#6366f1' },
  sendBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.3)',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  templateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  templateText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.5)' },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.15)',
  },
  historyText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 3 },
  historyMeta: { fontSize: 11, color: 'rgba(255,255,255,0.25)' },
});

// ─── Main AdminScreen ─────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
  adminId: string;
}

export const AdminScreen: React.FC<Props> = ({ onBack, adminId }) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const { showPopup } = usePopup();
  const { colors } = useTheme();

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [
        { count: totalUsers },
        { count: totalPosts },
        { count: totalMarketItems },
        { count: activeReports },
        { count: pendingVerifications },
        { count: dauEstimate },
      ] = await Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('posts').select('*', { count: 'exact', head: true }),
        supabase.from('market_items').select('*', { count: 'exact', head: true }),
        supabase
          .from('reports')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('verification_requests')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
        supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('updated_at', new Date(Date.now() - 86400000).toISOString()),
      ]);

      setStats({
        totalUsers: totalUsers ?? 0,
        totalPosts: totalPosts ?? 0,
        totalMarketItems: totalMarketItems ?? 0,
        activeReports: activeReports ?? 0,
        pendingVerifications: pendingVerifications ?? 0,
        dauEstimate: dauEstimate ?? 0,
      });
    } catch (e: any) {
      // Reports table may not exist yet — load partial stats gracefully
      try {
        const [
          { count: totalUsers },
          { count: totalPosts },
          { count: totalMarketItems },
          { count: dauEstimate },
        ] = await Promise.all([
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('posts').select('*', { count: 'exact', head: true }),
          supabase.from('market_items').select('*', { count: 'exact', head: true }),
          supabase
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .gte('updated_at', new Date(Date.now() - 86400000).toISOString()),
        ]);
        setStats({
          totalUsers: totalUsers ?? 0,
          totalPosts: totalPosts ?? 0,
          totalMarketItems: totalMarketItems ?? 0,
          activeReports: 0,
          pendingVerifications: 0,
          dauEstimate: dauEstimate ?? 0,
        });
      } catch {
        showPopup({
          title: 'Stats Error',
          message: 'Could not load dashboard stats.',
          icon: 'bar-chart-outline',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
      }
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const TABS: { key: AdminTab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Overview', icon: 'bar-chart' },
    { key: 'users', label: 'Users', icon: 'people' },
    { key: 'posts', label: 'Posts', icon: 'images' },
    { key: 'market', label: 'Market', icon: 'storefront' },
    { key: 'verifications', label: 'Verify', icon: 'shield-checkmark' },
    { key: 'reports', label: 'Reports', icon: 'flag' },
    { key: 'announce', label: 'Announce', icon: 'megaphone' },
  ];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Ionicons name="shield-checkmark" size={18} color="#6366f1" style={{ marginRight: 6 }} />
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Tab Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Ionicons
              name={tab.icon as any}
              size={14}
              color={activeTab === tab.key ? '#fff' : 'rgba(255,255,255,0.4)'}
              style={{ marginRight: 5 }}
            />
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'overview' && (
          <OverviewTab stats={stats} loading={statsLoading} onRefresh={loadStats} setActiveTab={setActiveTab} />
        )}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'posts' && <PostsTab />}
        {activeTab === 'market' && <MarketTab />}
        {activeTab === 'verifications' && <VerificationsTab />}
        {activeTab === 'reports' && <ReportsTab />}
        {activeTab === 'announce' && <AnnouncementsTab adminId={adminId} />}
      </View>
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  // Tab Bar
  tabBar: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    maxHeight: 44,
  },
  tabBarContent: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 4,
  },
  tabActive: { backgroundColor: 'rgba(99,102,241,0.18)' },
  tabText: { fontSize: 13, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  tabTextActive: { color: '#fff' },

  // Shared
  tabContent: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  countLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.35)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: 60 },
  emptyText: { color: 'rgba(255,255,255,0.3)', marginTop: 12, fontSize: 14 },

  // Verification filter
  verifFilterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  verifFilterBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  verifFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.35)',
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 8,
    borderRadius: 8,
  },
  statusBannerText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },

  // Overview
  overviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  refreshBtn: { padding: 6 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 10,
  },
  statCard: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'flex-start',
  },
  statIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  statValue: { fontSize: 26, fontWeight: '800', color: '#fff', marginBottom: 2 },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },

  // Section Header
  sectionHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    paddingHorizontal: 16,
    marginBottom: 12,
    marginTop: 10,
  },
  countBadge: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  countBadgeText: { color: '#818cf8', fontSize: 10, fontWeight: '700' },
  seeAllText: { color: '#6366f1', fontSize: 13, fontWeight: '600' },

  // Horizontal Items
  hItem: {
    width: 140,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  hItemImage: { width: '100%', height: 100 },
  hItemBadge: { 
    position: 'absolute', 
    top: 6, 
    right: 6, 
    paddingHorizontal: 6, 
    paddingVertical: 2, 
    borderRadius: 4 
  },
  hItemBadgeText: { color: '#fff', fontSize: 8, fontWeight: '800', textTransform: 'uppercase' },
  hItemInfo: { padding: 8 },
  hItemTitle: { color: '#fff', fontSize: 11, fontWeight: '700', marginBottom: 2 },
  hItemSub: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },

  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    margin: 16,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  infoText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 18 },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 15 },

  // Users
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  userRowBanned: { backgroundColor: 'rgba(239,68,68,0.05)' },
  userAvatarWrap: { marginRight: 10 },
  userAvatar: { width: 42, height: 42, borderRadius: 21 },
  userAvatarPlaceholder: { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  userInfo: { flex: 1, marginRight: 8 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  userName: { fontSize: 14, fontWeight: '700', color: '#fff' },
  userMeta: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  userActions: { flexDirection: 'column', gap: 5, alignItems: 'flex-end' },

  // Badges
  badge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeVerified: { backgroundColor: 'rgba(99,102,241,0.25)' },
  badgeAdmin: { backgroundColor: 'rgba(234,179,8,0.25)' },
  badgeBanned: { backgroundColor: 'rgba(239,68,68,0.25)' },
  badgeText: { fontSize: 9, fontWeight: '700', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Action Buttons
  actionBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  actionBtnVerify: { backgroundColor: 'rgba(99,102,241,0.3)' },
  actionBtnBan: { backgroundColor: 'rgba(239,68,68,0.3)' },
  actionBtnUnban: { backgroundColor: 'rgba(34,197,94,0.3)' },
  actionBtnText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Posts
  postRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  postThumb: { width: 52, height: 52, borderRadius: 8, marginRight: 10 },
  postThumbPlaceholder: { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' },
  postInfo: { flex: 1, marginRight: 8 },
  postUsername: { fontSize: 13, fontWeight: '700', color: '#818cf8', marginBottom: 2 },
  postCaption: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 17, marginBottom: 4 },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  postMetaText: { fontSize: 11, color: 'rgba(255,255,255,0.35)' },
  postMetaDot: { fontSize: 11, color: 'rgba(255,255,255,0.2)' },
  typePill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginLeft: 4,
  },
  typePillText: { fontSize: 9, color: 'rgba(255,255,255,0.4)', fontWeight: '600', textTransform: 'uppercase' },
  deleteBtn: { padding: 8 },

  // Filter
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  filterBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  filterBtnActive: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    borderColor: 'rgba(99,102,241,0.4)',
  },
  filterBtnText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: '600' },
  filterBtnTextActive: { color: '#fff' },

  // Market
  marketRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  marketThumb: { width: 52, height: 52, borderRadius: 8, marginRight: 10 },
  marketInfo: { flex: 1, marginRight: 8 },
  marketTitle: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
  marketSeller: { fontSize: 12, color: '#818cf8', marginBottom: 4 },
  marketMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  marketPrice: { fontSize: 14, fontWeight: '800', color: '#22c55e' },
  soldBadge: {
    backgroundColor: 'rgba(239,68,68,0.2)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  soldBadgeText: { fontSize: 9, fontWeight: '800', color: '#ef4444', textTransform: 'uppercase', letterSpacing: 0.5 },
  marketActions: { flexDirection: 'column', gap: 5, alignItems: 'flex-end' },

  // Verifications
  requestCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 12,
    padding: 14,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  requestDetails: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  detailLabel: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 2 },
  detailValue: { color: '#fff', fontWeight: '600' },
  reasonText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 4, lineHeight: 18 },
  docWrapper: { marginBottom: 12 },
  docPreview: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#111' },
  requestActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  actionBtnReject: { backgroundColor: 'rgba(239,68,68,0.15)', flex: 1, paddingVertical: 10 },
  actionBtnApprove: { backgroundColor: '#6366f1', flex: 1, paddingVertical: 10 },
  docRevealBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12, 
    backgroundColor: 'rgba(129,140,248,0.08)', 
    padding: 14, 
    borderRadius: 16, 
    borderWidth: 1, 
    borderColor: 'rgba(129,140,248,0.15)', 
    marginBottom: 12 
  },
  docRevealText: { flex: 1, color: '#818cf8', fontSize: 13, fontWeight: '700' },

  // Reports
  reportCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    marginBottom: 12,
    padding: 14,
  },
  reportHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  reportAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 10 },
  reportReporter: { fontSize: 13, fontWeight: '700', color: '#fff' },
  reportMeta: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  reportContent: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  reportDetailLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '600' },
  reportReasonText: { fontSize: 13, color: '#fff', marginTop: 4, fontWeight: '600' },
  reportDetailsText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, lineHeight: 18 },
  reportActions: { flexDirection: 'row', gap: 8 },
  actionBtnResolve: { backgroundColor: 'rgba(34,197,94,0.2)', flex: 1 },
  actionBtnDismiss: { backgroundColor: 'rgba(255,255,255,0.08)', flex: 1 },

  // Rejection Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  rejectionModal: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    width: '100%',
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  rejectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  rejectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  rejectionSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 16,
    lineHeight: 18,
  },
  rejectionInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    height: 100,
    textAlignVertical: 'top',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  rejectionActions: {
    flexDirection: 'row',
    gap: 12,
  },
  rejectionBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectionBtnCancel: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  rejectionBtnSubmit: {
    backgroundColor: '#ef4444',
  },
  rejectionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
  },
  docViewerContent: { backgroundColor: '#111', borderRadius: 24, width: '95%', height: '85%', maxHeight: 800, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  viewerItem: { marginBottom: 30 },
  viewerItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  viewerItemTitle: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  viewFullBtn: { color: '#818cf8', fontSize: 11, fontWeight: '700' },
  viewerImage: { width: '100%', height: 400, borderRadius: 16, backgroundColor: '#000' },
  pdfPlaceholder: { width: '100%', height: 180, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', borderStyle: 'dashed' },
  pdfPlaceholderText: { color: 'rgba(255,255,255,0.4)', fontSize: 14, marginTop: 12 },
  pdfOpenBtn: { marginTop: 16, backgroundColor: 'rgba(129, 140, 248, 0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  pdfOpenText: { color: '#818cf8', fontSize: 13, fontWeight: '600' },
});
