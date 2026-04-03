import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, ActivityIndicator, TextInput, Alert,
  RefreshControl, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AdminStats {
  totalUsers: number;
  totalPosts: number;
  totalMarketItems: number;
  activeReports: number;
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
  verification_type: string | null;
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
  created_at: string;
  profiles: { username: string } | null;
}

type AdminTab = 'overview' | 'users' | 'posts' | 'market' | 'reports';
type PostFilter = 'all' | 'flagged';

// ─── Helper ───────────────────────────────────────────────────────────────────

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

const OverviewTab: React.FC<{ stats: AdminStats | null; loading: boolean; onRefresh: () => void }> = ({
  stats, loading, onRefresh,
}) => {
  const cards = stats
    ? [
        { label: 'Total Users', value: stats.totalUsers, icon: 'people', color: '#6366f1' },
        { label: 'Total Posts', value: stats.totalPosts, icon: 'images', color: '#22c55e' },
        { label: 'Market Items', value: stats.totalMarketItems, icon: 'storefront', color: '#f59e0b' },
        { label: 'Active Reports', value: stats.activeReports, icon: 'flag', color: '#ef4444' },
        { label: 'DAU Estimate', value: stats.dauEstimate, icon: 'pulse', color: '#3b82f6' },
      ]
    : [];

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <View style={styles.overviewHeader}>
        <Text style={styles.sectionTitle}>App Overview</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color="#6366f1" />
            : <Ionicons name="refresh" size={20} color="#6366f1" />
          }
        </TouchableOpacity>
      </View>

      {loading && !stats ? (
        <ActivityIndicator color="#6366f1" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.statsGrid}>
          {cards.map(card => (
            <View key={card.label} style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: card.color + '22' }]}>
                <Ionicons name={card.icon as any} size={22} color={card.color} />
              </View>
              <Text style={styles.statValue}>{card.value.toLocaleString()}</Text>
              <Text style={styles.statLabel}>{card.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color="rgba(255,255,255,0.4)" />
        <Text style={styles.infoText}>
          DAU estimate is based on profiles updated in the last 24 hours. Stats refresh on demand.
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

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, full_name, avatar_url, university, is_verified, is_admin, is_banned, verification_type')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setUsers((data as AdminUser[]) ?? []);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to load users');
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
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setActioning(null);
    }
  };

  const handleBan = async (userId: string, ban: boolean) => {
    Alert.alert(
      ban ? 'Ban User' : 'Unban User',
      ban ? 'This will prevent the user from accessing the app.' : 'This will restore access for the user.',
      [
        { text: 'Cancel', style: 'cancel' },
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
            } catch (e: any) {
              Alert.alert('Error', e.message);
            } finally {
              setActioning(null);
            }
          },
        },
      ]
    );
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
    <View style={[styles.userRow, u.is_banned && styles.userRowBanned]}>
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

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('posts')
        .select('id, caption, media_url, type, likes_count, created_at, profiles(username)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setPosts((data as AdminPost[]) ?? []);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to load posts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (postId: string) => {
    Alert.alert('Delete Post', 'Permanently delete this post? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
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
            Alert.alert('Error', e.message);
          } finally {
            setDeleting(null);
          }
        },
      },
    ]);
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

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('market_items')
        .select('id, title, price, image_urls, is_sold, created_at, profiles(username)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setItems((data as AdminMarketItem[]) ?? []);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to load market items');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = (itemId: string) => {
    Alert.alert('Delete Listing', 'Permanently delete this market listing?', [
      { text: 'Cancel', style: 'cancel' },
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
            Alert.alert('Error', e.message);
          } finally {
            setActioning(null);
          }
        },
      },
    ]);
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
      Alert.alert('Error', e.message);
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

const ReportsTab: React.FC = () => (
  <View style={[styles.tabContent, styles.centered]}>
    <Ionicons name="flag-outline" size={52} color="rgba(255,255,255,0.15)" />
    <Text style={styles.comingSoonTitle}>Reports coming soon</Text>
    <Text style={styles.comingSoonSub}>
      Run the SQL migration to create the reports table, then this tab will display flagged content.
    </Text>
  </View>
);

// ─── Main AdminScreen ─────────────────────────────────────────────────────────

interface Props {
  onBack: () => void;
}

export const AdminScreen: React.FC<Props> = ({ onBack }) => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const [
        { count: totalUsers },
        { count: totalPosts },
        { count: totalMarketItems },
        { count: activeReports },
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
          .from('profiles')
          .select('*', { count: 'exact', head: true })
          .gte('updated_at', new Date(Date.now() - 86400000).toISOString()),
      ]);

      setStats({
        totalUsers: totalUsers ?? 0,
        totalPosts: totalPosts ?? 0,
        totalMarketItems: totalMarketItems ?? 0,
        activeReports: activeReports ?? 0,
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
          dauEstimate: dauEstimate ?? 0,
        });
      } catch {
        Alert.alert('Stats Error', 'Could not load dashboard stats.');
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
    { key: 'reports', label: 'Reports', icon: 'flag' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
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
          <OverviewTab stats={stats} loading={statsLoading} onRefresh={loadStats} />
        )}
        {activeTab === 'users' && <UsersTab />}
        {activeTab === 'posts' && <PostsTab />}
        {activeTab === 'market' && <MarketTab />}
        {activeTab === 'reports' && <ReportsTab />}
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

  // Reports
  comingSoonTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    marginTop: 16,
    marginBottom: 8,
  },
  comingSoonSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    paddingHorizontal: 32,
    lineHeight: 20,
  },
});
