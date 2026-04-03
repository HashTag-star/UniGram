import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, Alert, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform,
  ScrollView, RefreshControl, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/VerifiedBadge';
import * as ImagePicker from 'expo-image-picker';
import {
  getMarketItems, createMarketItem, markItemSold, deleteMarketItem,
  getSavedItemIds, saveMarketItem, unsaveMarketItem, getMyListings,
} from '../services/market';
import { createDirectConversation } from '../services/messages';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const CARD_W = (width - 38) / 2;

function timeAgo(ts: string) {
  const d = (Date.now() - new Date(ts).getTime()) / 1000;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '🛍️' },
  { id: 'books', label: 'Books', icon: '📚' },
  { id: 'gadgets', label: 'Gadgets', icon: '💻' },
  { id: 'housing', label: 'Housing', icon: '🏠' },
  { id: 'notes', label: 'Notes', icon: '📝' },
  { id: 'furniture', label: 'Furniture', icon: '🪑' },
  { id: 'clothing', label: 'Clothing', icon: '👕' },
  { id: 'other', label: 'Other', icon: '📦' },
];

const CONDITIONS = ['new', 'like_new', 'good', 'fair'];
const conditionLabel: Record<string, string> = { new: 'New', like_new: 'Like New', good: 'Good', fair: 'Fair' };
const conditionColor: Record<string, string> = { new: '#22c55e', like_new: '#3b82f6', good: '#f59e0b', fair: '#ef4444' };

type Tab = 'browse' | 'saved' | 'mine';

// ─── Item Detail Modal ────────────────────────────────────────────────────────
const ItemDetailModal: React.FC<{
  item: any;
  currentUserId: string;
  isSaved: boolean;
  onToggleSave: () => void;
  onClose: () => void;
  onSold: (id: string) => void;
  onDelete: (id: string) => void;
  onMessage: (sellerId: string) => void;
}> = ({ item, currentUserId, isSaved, onToggleSave, onClose, onSold, onDelete, onMessage }) => {
  const insets = useSafeAreaInsets();
  const isOwn = item.seller_id === currentUserId || item.profiles?.id === currentUserId;
  const [imageIdx, setImageIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [marking, setMarking] = useState(false);
  const seller = item.profiles;
  const images: string[] = [
    ...(item.image_url ? [item.image_url] : []),
    ...(item.image_urls?.filter((u: string) => u !== item.image_url) ?? []),
  ].filter(Boolean);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[dtl.container, { paddingBottom: insets.bottom }]}>
        {/* Image gallery */}
        <View style={dtl.gallery}>
          {images.length > 0 ? (
            <>
              <ScrollView
                horizontal pagingEnabled showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={e => setImageIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
              >
                {images.map((uri, i) => (
                  <Image key={i} source={{ uri }} style={dtl.mainImage} resizeMode="cover" />
                ))}
              </ScrollView>
              {images.length > 1 && (
                <View style={dtl.dotRow}>
                  {images.map((_, i) => (
                    <View key={i} style={[dtl.dot, i === imageIdx && dtl.dotActive]} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={[dtl.mainImage, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' }]}>
              <Ionicons name="image-outline" size={48} color="#333" />
            </View>
          )}
          {/* Overlay buttons */}
          <TouchableOpacity style={dtl.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>
          {!isOwn && (
            <TouchableOpacity style={dtl.saveBtn} onPress={onToggleSave}>
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={20} color={isSaved ? '#fbbf24' : '#fff'} />
            </TouchableOpacity>
          )}
          {item.is_sold && (
            <View style={dtl.soldOverlay}>
              <Text style={dtl.soldText}>SOLD</Text>
            </View>
          )}
          {item.condition && (
            <View style={[dtl.condBadge, { backgroundColor: (conditionColor[item.condition] ?? '#888') + '30', borderColor: (conditionColor[item.condition] ?? '#888') + '80' }]}>
              <Text style={[dtl.condText, { color: conditionColor[item.condition] ?? '#888' }]}>
                {conditionLabel[item.condition] ?? item.condition}
              </Text>
            </View>
          )}
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {/* Title & Price */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <Text style={dtl.title}>{item.title}</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={dtl.price}>${Number(item.price).toLocaleString()}</Text>
              {item.is_negotiable && <Text style={dtl.negotiable}>Negotiable</Text>}
            </View>
          </View>

          {/* Category & Date */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 12 }}>
            <View style={dtl.catBadge}>
              <Text style={dtl.catBadgeText}>
                {CATEGORIES.find(c => c.id === item.category)?.icon ?? '📦'} {item.category}
              </Text>
            </View>
            <Text style={dtl.meta}>{timeAgo(item.created_at)}</Text>
          </View>

          {/* Description */}
          {item.description ? (
            <>
              <Text style={dtl.sectionLabel}>Description</Text>
              <Text style={dtl.description}>{item.description}</Text>
            </>
          ) : null}

          {/* Seller */}
          <Text style={[dtl.sectionLabel, { marginTop: 14 }]}>Seller</Text>
          <View style={dtl.sellerCard}>
            {seller?.avatar_url
              ? <Image source={{ uri: seller.avatar_url }} style={dtl.sellerAvatar} />
              : <View style={[dtl.sellerAvatar, { backgroundColor: '#222', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={18} color="#555" />
                </View>}
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={dtl.sellerName}>{seller?.full_name ?? seller?.username ?? 'Unknown'}</Text>
                {seller?.is_verified && <VerifiedBadge type={seller.verification_type} size="sm" />}
              </View>
              <Text style={dtl.sellerMeta}>@{seller?.username} · {seller?.university ?? 'Campus'}</Text>
            </View>
          </View>

          {/* CTA */}
          {!isOwn && !item.is_sold && (
            <TouchableOpacity style={dtl.msgBtn} onPress={() => onMessage(seller?.id ?? item.seller_id)}>
              <Ionicons name="chatbubble-outline" size={18} color="#fff" />
              <Text style={dtl.msgBtnText}>Message Seller</Text>
            </TouchableOpacity>
          )}

          {isOwn && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              {!item.is_sold && (
                <TouchableOpacity
                  style={[dtl.ownerBtn, { backgroundColor: '#22c55e20', borderColor: '#22c55e50' }]}
                  onPress={async () => {
                    setMarking(true);
                    try { await markItemSold(item.id); onSold(item.id); } catch { }
                    setMarking(false);
                  }}
                  disabled={marking}
                >
                  {marking ? <ActivityIndicator size="small" color="#22c55e" /> : (
                    <><Ionicons name="checkmark-circle-outline" size={16} color="#22c55e" /><Text style={[dtl.ownerBtnText, { color: '#22c55e' }]}>Mark Sold</Text></>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[dtl.ownerBtn, { flex: item.is_sold ? 1 : undefined, backgroundColor: '#ef444420', borderColor: '#ef444450' }]}
                onPress={() => Alert.alert('Delete Listing', 'Remove this listing?', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => {
                    setDeleting(true);
                    try { await deleteMarketItem(item.id); onDelete(item.id); } catch { setDeleting(false); }
                  }},
                ])}
                disabled={deleting}
              >
                {deleting ? <ActivityIndicator size="small" color="#ef4444" /> : (
                  <><Ionicons name="trash-outline" size={16} color="#ef4444" /><Text style={[dtl.ownerBtnText, { color: '#ef4444' }]}>Delete</Text></>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

// ─── Item Card ────────────────────────────────────────────────────────────────
const ItemCard: React.FC<{
  item: any;
  currentUserId: string;
  isSaved: boolean;
  onToggleSave: () => void;
  onPress: () => void;
}> = ({ item, isSaved, onToggleSave, onPress }) => {
  const seller = item.profiles;
  return (
    <TouchableOpacity style={[styles.card, { width: CARD_W }]} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageWrap}>
        {item.image_url
          ? <Image source={{ uri: item.image_url }} style={styles.itemImage} resizeMode="cover" />
          : <View style={[styles.itemImage, { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="image-outline" size={32} color="#333" />
            </View>}
        {item.is_sold && (
          <View style={styles.soldBadge}><Text style={styles.soldBadgeText}>SOLD</Text></View>
        )}
        <TouchableOpacity style={styles.saveBtn} onPress={onToggleSave}>
          <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={17} color={isSaved ? '#fbbf24' : '#fff'} />
        </TouchableOpacity>
        {item.condition && (
          <View style={[styles.conditionBadge, { backgroundColor: (conditionColor[item.condition] ?? '#888') + '30', borderColor: (conditionColor[item.condition] ?? '#888') + '60' }]}>
            <Text style={[styles.conditionText, { color: conditionColor[item.condition] ?? '#888' }]}>
              {conditionLabel[item.condition] ?? item.condition}
            </Text>
          </View>
        )}
        {item.image_urls?.length > 1 && (
          <View style={styles.multiImgBadge}>
            <Ionicons name="layers-outline" size={10} color="#fff" />
            <Text style={styles.multiImgText}>{item.image_urls.length}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={styles.itemPrice}>${Number(item.price).toLocaleString()}</Text>
          {item.is_negotiable && <Text style={styles.negotiableTag}>neg.</Text>}
        </View>
        <View style={styles.sellerRow}>
          {seller?.avatar_url
            ? <Image source={{ uri: seller.avatar_url }} style={styles.sellerAvatar} />
            : <View style={[styles.sellerAvatar, { backgroundColor: '#222' }]} />}
          <Text style={styles.sellerName} numberOfLines={1}>{seller?.username ?? 'user'}</Text>
          <Text style={styles.dot}>·</Text>
          <Text style={styles.postedAt}>{timeAgo(item.created_at)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

// ─── Sell Modal ───────────────────────────────────────────────────────────────
const SellModal: React.FC<{
  visible: boolean;
  currentUserId: string;
  onClose: () => void;
  onPosted: (item: any) => void;
}> = ({ visible, currentUserId, onClose, onPosted }) => {
  const [sellTitle, setSellTitle] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellDesc, setSellDesc] = useState('');
  const [sellCat, setSellCat] = useState('books');
  const [sellCond, setSellCond] = useState('good');
  const [images, setImages] = useState<string[]>([]);
  const [isNegotiable, setIsNegotiable] = useState(false);
  const [posting, setPosting] = useState(false);

  const reset = () => {
    setSellTitle(''); setSellPrice(''); setSellDesc('');
    setSellCat('books'); setSellCond('good'); setImages([]);
    setIsNegotiable(false);
  };

  const pickImages = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      selectionLimit: 4 - images.length,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 4));
    }
  };

  const handlePost = async () => {
    if (!sellTitle.trim() || !sellPrice) {
      Alert.alert('Missing fields', 'Please fill in title and price.');
      return;
    }
    setPosting(true);
    try {
      const item = await createMarketItem(currentUserId, {
        title: sellTitle.trim(),
        description: sellDesc.trim(),
        price: parseFloat(sellPrice),
        category: sellCat,
        condition: sellCond,
        imageUri: images[0],
        extraImageUris: images.slice(1),
        isNegotiable,
      });
      reset();
      onPosted(item);
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to post item.');
    } finally { setPosting(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { reset(); onClose(); }}>
            <Text style={{ color: '#818cf8', fontSize: 15 }}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>New Listing</Text>
          <TouchableOpacity onPress={handlePost} disabled={posting}>
            {posting ? <ActivityIndicator color="#818cf8" /> : <Text style={{ color: '#818cf8', fontSize: 15, fontWeight: '700' }}>Post</Text>}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
          {/* Images */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {images.map((uri, i) => (
              <View key={i} style={{ position: 'relative' }}>
                <Image source={{ uri }} style={{ width: 100, height: 100, borderRadius: 12 }} resizeMode="cover" />
                <TouchableOpacity
                  style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10, padding: 2 }}
                  onPress={() => setImages(prev => prev.filter((_, idx) => idx !== i))}
                >
                  <Ionicons name="close" size={14} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            {images.length < 4 && (
              <TouchableOpacity style={styles.imagePicker} onPress={pickImages}>
                <Ionicons name="camera-outline" size={28} color="#555" />
                <Text style={{ color: '#555', fontSize: 11, marginTop: 4 }}>Add Photo</Text>
                <Text style={{ color: '#444', fontSize: 10 }}>{images.length}/4</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Title */}
          <TextInput
            style={styles.modalInput}
            placeholder="Title"
            placeholderTextColor="#555"
            value={sellTitle}
            onChangeText={setSellTitle}
          />

          {/* Price + Negotiable */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput
              style={[styles.modalInput, { flex: 1 }]}
              placeholder="Price (e.g. 25.00)"
              placeholderTextColor="#555"
              value={sellPrice}
              onChangeText={setSellPrice}
              keyboardType="decimal-pad"
            />
            <TouchableOpacity
              style={[styles.modalInput, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, gap: 4, flexDirection: 'row' }]}
              onPress={() => setIsNegotiable(p => !p)}
            >
              <Ionicons name={isNegotiable ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={isNegotiable ? '#818cf8' : '#555'} />
              <Text style={{ color: isNegotiable ? '#818cf8' : '#555', fontSize: 12 }}>Nego.</Text>
            </TouchableOpacity>
          </View>

          {/* Description */}
          <TextInput
            style={[styles.modalInput, { minHeight: 80, textAlignVertical: 'top' }]}
            placeholder="Description (optional)"
            placeholderTextColor="#555"
            value={sellDesc}
            onChangeText={setSellDesc}
            multiline
          />

          {/* Category */}
          <Text style={styles.modalLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
              <TouchableOpacity
                key={cat.id}
                style={[styles.catBtn, sellCat === cat.id && styles.catBtnActive]}
                onPress={() => setSellCat(cat.id)}
              >
                <Text style={styles.catEmoji}>{cat.icon}</Text>
                <Text style={[styles.catLabel, sellCat === cat.id && styles.catLabelActive]}>{cat.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Condition */}
          <Text style={styles.modalLabel}>Condition</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {CONDITIONS.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.condBtn, sellCond === c && { borderColor: conditionColor[c], backgroundColor: conditionColor[c] + '20' }]}
                onPress={() => setSellCond(c)}
              >
                <Text style={[styles.condBtnText, sellCond === c && { color: conditionColor[c] }]}>
                  {conditionLabel[c]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
export const MarketScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [myItems, setMyItems] = useState<any[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState('');
  const [showSell, setShowSell] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  const load = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const [itemsData, myData, savedData] = await Promise.all([
        getMarketItems(category === 'all' ? undefined : category, search),
        getMyListings(currentUserId),
        getSavedItemIds(currentUserId),
      ]);
      setItems(itemsData);
      setMyItems(myData);
      setSavedIds(new Set(savedData));
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  }, [category, search, currentUserId]);

  useEffect(() => {
    if (currentUserId) load();
  }, [load, currentUserId]);

  // Debounced search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearch = (q: string) => {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(), 400);
  };

  const toggleSave = async (itemId: string) => {
    const isSaved = savedIds.has(itemId);
    setSavedIds(prev => {
      const next = new Set(prev);
      isSaved ? next.delete(itemId) : next.add(itemId);
      return next;
    });
    try {
      if (isSaved) await unsaveMarketItem(currentUserId, itemId);
      else await saveMarketItem(currentUserId, itemId);
    } catch {
      setSavedIds(prev => {
        const next = new Set(prev);
        isSaved ? next.add(itemId) : next.delete(itemId);
        return next;
      });
    }
  };

  const handleMessage = async (sellerId: string) => {
    if (!currentUserId || sellerId === currentUserId) return;
    try {
      await createDirectConversation(currentUserId, sellerId);
      Alert.alert('💬 Chat started', 'Head to Messages to continue the conversation.');
    } catch (e: any) { Alert.alert('Error', e.message); }
  };

  const handleSold = (id: string) => {
    setMyItems(prev => prev.map(m => m.id === id ? { ...m, is_sold: true } : m));
    setSelectedItem(null);
  };

  const handleDelete = (id: string) => {
    setMyItems(prev => prev.filter(m => m.id !== id));
    setItems(prev => prev.filter(m => m.id !== id));
    setSelectedItem(null);
  };

  const displayItems = activeTab === 'mine' ? myItems
    : activeTab === 'saved' ? items.filter(i => savedIds.has(i.id))
    : items;

  const renderItem = ({ item }: { item: any }) => (
    <ItemCard
      item={item}
      currentUserId={currentUserId}
      isSaved={savedIds.has(item.id)}
      onToggleSave={() => toggleSave(item.id)}
      onPress={() => setSelectedItem(item)}
    />
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.title}>Campus Market</Text>
        <TouchableOpacity style={styles.sellBtn} onPress={() => setShowSell(true)}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.sellBtnText}>Sell</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={15} color="rgba(255,255,255,0.4)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search listings…"
          placeholderTextColor="rgba(255,255,255,0.3)"
          value={search}
          onChangeText={handleSearch}
          returnKeyType="search"
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {([
          { id: 'browse', label: 'Browse', icon: 'storefront-outline' },
          { id: 'saved', label: 'Saved', icon: 'bookmark-outline' },
          { id: 'mine', label: 'My Listings', icon: 'person-outline' },
        ] as const).map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabBtn, activeTab === tab.id && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons name={tab.icon as any} size={14} color={activeTab === tab.id ? '#818cf8' : 'rgba(255,255,255,0.4)'} />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category pills (browse only) */}
      {activeTab === 'browse' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              onPress={() => setCategory(cat.id)}
              style={[styles.catBtn, category === cat.id && styles.catBtnActive]}
            >
              <Text style={styles.catEmoji}>{cat.icon}</Text>
              <Text style={[styles.catLabel, category === cat.id && styles.catLabelActive]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Grid */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#6366f1" size="large" />
        </View>
      ) : (
        <FlatList
          data={displayItems}
          keyExtractor={i => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 8, paddingHorizontal: 11 }}
          contentContainerStyle={{ paddingBottom: 100, paddingTop: 4, gap: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor="#6366f1" />
          }
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingVertical: 70 }}>
              <Ionicons name={activeTab === 'saved' ? 'bookmark-outline' : activeTab === 'mine' ? 'storefront-outline' : 'bag-outline'} size={48} color="#333" />
              <Text style={{ color: '#555', marginTop: 14, fontSize: 15 }}>
                {activeTab === 'saved' ? 'Nothing saved yet' : activeTab === 'mine' ? 'You have no listings yet' : 'No items found'}
              </Text>
              {activeTab !== 'saved' && (
                <TouchableOpacity style={[styles.sellBtn, { marginTop: 18 }]} onPress={() => setShowSell(true)}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.sellBtnText}>
                    {activeTab === 'mine' ? 'Create Listing' : 'Be the first to sell!'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Sell Modal */}
      <SellModal
        visible={showSell}
        currentUserId={currentUserId}
        onClose={() => setShowSell(false)}
        onPosted={item => {
          setShowSell(false);
          setMyItems(prev => [item, ...prev]);
          setItems(prev => [item, ...prev]);
          setActiveTab('mine');
        }}
      />

      {/* Item Detail */}
      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          currentUserId={currentUserId}
          isSaved={savedIds.has(selectedItem.id)}
          onToggleSave={() => toggleSave(selectedItem.id)}
          onClose={() => setSelectedItem(null)}
          onSold={handleSold}
          onDelete={handleDelete}
          onMessage={sellerId => { setSelectedItem(null); handleMessage(sellerId); }}
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  sellBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  sellBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, marginHorizontal: 14, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 14 },
  tabRow: { flexDirection: 'row', marginHorizontal: 14, marginBottom: 10, gap: 8 },
  tabBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  tabBtnActive: { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: 'rgba(99,102,241,0.4)' },
  tabLabel: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '500' },
  tabLabelActive: { color: '#818cf8', fontWeight: '600' },
  catBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  catBtnActive: { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: 'rgba(99,102,241,0.4)' },
  catEmoji: { fontSize: 13 },
  catLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  catLabelActive: { color: '#818cf8' },
  card: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  imageWrap: { position: 'relative' },
  itemImage: { width: '100%', height: CARD_W, backgroundColor: '#111' },
  saveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14, padding: 5 },
  conditionBadge: { position: 'absolute', bottom: 8, left: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  conditionText: { fontSize: 9, fontWeight: 'bold', textTransform: 'capitalize' },
  soldBadge: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  soldBadgeText: { color: '#ef4444', fontWeight: 'bold', fontSize: 16, letterSpacing: 2 },
  multiImgBadge: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 2 },
  multiImgText: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
  cardInfo: { padding: 10 },
  itemTitle: { fontSize: 12, fontWeight: '600', color: '#fff', marginBottom: 4, lineHeight: 16 },
  itemPrice: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  negotiableTag: { fontSize: 9, color: '#818cf8', fontWeight: '600', backgroundColor: 'rgba(99,102,241,0.2)', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  sellerAvatar: { width: 18, height: 18, borderRadius: 9 },
  sellerName: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.5)', flex: 1 },
  dot: { color: 'rgba(255,255,255,0.25)', fontSize: 10 },
  postedAt: { fontSize: 9, color: 'rgba(255,255,255,0.3)' },
  modal: { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  imagePicker: { width: 100, height: 100, backgroundColor: '#111', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#222' },
  modalInput: { backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#222', paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15 },
  modalLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  condBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  condBtnText: { color: '#888', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
});

const dtl = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  gallery: { position: 'relative' },
  mainImage: { width, height: width * 0.85 },
  dotRow: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' },
  dotActive: { backgroundColor: '#fff', width: 18 },
  closeBtn: { position: 'absolute', top: 16, left: 14, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: 7 },
  saveBtn: { position: 'absolute', top: 16, right: 14, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 20, padding: 7 },
  soldOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' } as any,
  soldText: { color: '#ef4444', fontSize: 24, fontWeight: 'bold', letterSpacing: 3 },
  condBadge: { position: 'absolute', bottom: 14, left: 14, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  condText: { fontSize: 11, fontWeight: 'bold', textTransform: 'capitalize' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#fff', flex: 1 },
  price: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  negotiable: { fontSize: 11, color: '#818cf8', fontWeight: '600' },
  catBadge: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  catBadgeText: { fontSize: 12, color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize' },
  meta: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },
  sectionLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  description: { fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 22 },
  sellerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sellerAvatar: { width: 44, height: 44, borderRadius: 22 },
  sellerName: { fontSize: 15, fontWeight: '600', color: '#fff' },
  sellerMeta: { fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  msgBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#4f46e5', borderRadius: 14, paddingVertical: 14, marginTop: 14 },
  msgBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  ownerBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 11, marginTop: 12 },
  ownerBtnText: { fontSize: 13, fontWeight: '600' },
});
