import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  memo,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Modal,
  TextInput,
  Platform,
  ScrollView,
  RefreshControl,
  Share,
  Image,
} from 'react-native';
import { FlashList as _FlashList } from '@shopify/flash-list';
const FlashList = _FlashList as React.ComponentType<any>;
import { Image as ExpoImage } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { CachedImage } from '../components/CachedImage';
import { MarketSkeleton } from '../components/Skeleton';
import { supabase } from '../lib/supabase';
import {
  getMarketItems,
  getMyListings,
  getSavedItems,
  getSavedItemIds,
  createMarketItem,
  updateMarketItem,
  deleteMarketItem,
  markItemSold,
  toggleSaveItem,
  incrementViewCount,
  MarketItem,
  UpdateItemPayload,
} from '../services/market';
import { createDirectConversation } from '../services/messages';
import { BoostSheet } from '../components/BoostSheet';
import { type BoostType, BOOST_TIERS } from '../services/payments';
import { useTheme } from '../context/ThemeContext';
import { usePopup } from '../context/PopupContext';
import { useToast } from '../context/ToastContext';
import { getActiveAdsForPlacement, adFrequencyInterval, recordCampusAdImpression } from '../services/campusAds';
import { SponsoredAdCard } from '../components/SponsoredAdCard';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width } = Dimensions.get('window');
const CARD_GAP = 10;
const H_PAD = 14;
const CARD_W = (width - H_PAD * 2 - CARD_GAP) / 2;
const PAGE_SIZE = 20;
const MARKET_TTL = 3 * 60 * 1000;

let _cachedItems: any[] = [];
let _cachedSavedIds: Set<string> = new Set();
let _lastLoaded = 0;

function clearMarketCache() {
  _cachedItems = [];
  _cachedSavedIds = new Set();
  _lastLoaded = 0;
}

const BOOST_RANK: Record<string, number> = { featured: 3, spotlight: 2, urgent: 1, none: 0 };

function sortByBoost(items: MarketItem[]): MarketItem[] {
  const now = Date.now();
  return [...items].sort((a, b) => {
    const aExp = a.boost_expires_at && new Date(a.boost_expires_at).getTime() < now;
    const bExp = b.boost_expires_at && new Date(b.boost_expires_at).getTime() < now;
    const aRank = aExp ? 0 : (BOOST_RANK[a.boost_type] ?? 0);
    const bRank = bExp ? 0 : (BOOST_RANK[b.boost_type] ?? 0);
    return bRank - aRank;
  });
}

const CATEGORIES = [
  { id: 'all',       label: 'All',       icon: '🛍️' },
  { id: 'books',     label: 'Books',     icon: '📚' },
  { id: 'gadgets',   label: 'Gadgets',   icon: '💻' },
  { id: 'housing',   label: 'Housing',   icon: '🏠' },
  { id: 'notes',     label: 'Notes',     icon: '📝' },
  { id: 'furniture', label: 'Furniture', icon: '🪑' },
  { id: 'clothing',  label: 'Clothing',  icon: '👕' },
  { id: 'services',  label: 'Services',  icon: '🔧' },
  { id: 'other',     label: 'Other',     icon: '📦' },
] as const;

const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
type Condition = typeof CONDITIONS[number];

const CONDITION_LABEL: Record<string, string> = {
  new: 'New', like_new: 'Like New', good: 'Good', fair: 'Fair',
};

const CONDITION_COLOR: Record<string, string> = {
  new: '#22c55e', like_new: '#3b82f6', good: '#f59e0b', fair: '#ef4444',
};

type Tab = 'browse' | 'saved' | 'mine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const secs = (Date.now() - new Date(ts).getTime()) / 1000;
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

function formatPrice(price: number): string {
  return `GHS ${Number(price).toLocaleString('en-GH', {
    minimumFractionDigits: price % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─── Condition Badge ──────────────────────────────────────────────────────────

const ConditionBadge: React.FC<{ condition: string; style?: object }> = ({ condition, style }) => {
  const color = CONDITION_COLOR[condition] ?? '#888';
  return (
    <View style={[{
      backgroundColor: color + '28',
      borderColor: color + '55',
      borderWidth: 1,
      borderRadius: 7,
      paddingHorizontal: 6,
      paddingVertical: 2,
    }, style]}>
      <Text style={{ color, fontSize: 9, fontWeight: '700', textTransform: 'capitalize' }}>
        {CONDITION_LABEL[condition] ?? condition}
      </Text>
    </View>
  );
};

// ─── Item Card ────────────────────────────────────────────────────────────────

interface CardProps {
  item: MarketItem;
  currentUserId: string;
  isSaved: boolean;
  isOwn?: boolean;
  onToggleSave: (id: string) => void;
  onPress: (item: MarketItem) => void;
  onMarkSold?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (item: MarketItem) => void;
}

const ItemCard = memo<CardProps>(({
  item, currentUserId, isSaved, isOwn = false,
  onToggleSave, onPress, onMarkSold, onDelete, onEdit,
}) => {
  const { colors, isDark } = useTheme();
  const seller = item.profiles;

  const activeTier = (() => {
    if (!item.boost_type || item.boost_type === 'none') return null;
    const exp = item.boost_expires_at;
    if (exp && new Date(exp).getTime() < Date.now()) return null;
    return BOOST_TIERS.find(t => t.type === item.boost_type) ?? null;
  })();

  return (
    <TouchableOpacity
      style={[
        card.wrap,
        {
          width: CARD_W,
          backgroundColor: colors.bg2,
          borderColor: activeTier ? activeTier.color + '50' : colors.border,
          borderWidth: activeTier ? 1.5 : 1,
        },
      ]}
      onPress={() => onPress(item)}
      activeOpacity={0.88}
    >
      {/* Image area */}
      <View style={card.imgWrap}>
        {item.image_url ? (
          <CachedImage uri={item.image_url} style={card.img} resizeMode="cover" />
        ) : (
          <View style={[card.img, card.imgPlaceholder, { backgroundColor: isDark ? '#1a1a1a' : '#e5e5e5' }]}>
            <Ionicons name="image-outline" size={28} color={colors.textMuted} />
          </View>
        )}

        {item.is_sold && (
          <View style={card.soldOverlay}>
            <Text style={card.soldText}>SOLD</Text>
          </View>
        )}

        {!isOwn && (
          <TouchableOpacity
            style={[card.bookmarkBtn, { backgroundColor: isSaved ? 'rgba(251,191,36,0.18)' : 'rgba(0,0,0,0.5)' }]}
            onPress={() => onToggleSave(item.id)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={15}
              color={isSaved ? '#fbbf24' : '#fff'}
            />
          </TouchableOpacity>
        )}

        {activeTier && (
          <View style={[card.boostBadge, { backgroundColor: activeTier.color }]}>
            <Ionicons name={activeTier.icon as any} size={9} color="#fff" />
            <Text style={card.boostText}>{activeTier.label}</Text>
          </View>
        )}

        {item.condition && (
          <ConditionBadge
            condition={item.condition}
            style={{ position: 'absolute', bottom: 7, left: 7 }}
          />
        )}
      </View>

      {/* Info */}
      <View style={card.info}>
        <Text style={[card.title, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[card.price, { color: colors.text }]}>{formatPrice(item.price)}</Text>

        <View style={card.sellerRow}>
          {seller?.avatar_url
            ? <CachedImage uri={seller.avatar_url} style={card.avatar} />
            : <View style={[card.avatar, { backgroundColor: isDark ? '#222' : '#ddd' }]} />
          }
          <Text style={[card.sellerName, { color: colors.textSub }]} numberOfLines={1}>
            {seller?.username ?? 'user'}
          </Text>
          <Text style={[card.dot, { color: colors.textMuted }]}>·</Text>
          <Text style={[card.age, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
        </View>

        {isOwn && (
          <View style={card.ownerActions}>
            <TouchableOpacity
              style={[card.ownerBtn, { borderColor: colors.border }]}
              onPress={() => onEdit?.(item)}
            >
              <Ionicons name="pencil-outline" size={11} color="#818cf8" />
              <Text style={[card.ownerBtnText, { color: '#818cf8' }]}>Edit</Text>
            </TouchableOpacity>
            {!item.is_sold && (
              <TouchableOpacity
                style={[card.ownerBtn, { borderColor: '#22c55e30' }]}
                onPress={() => onMarkSold?.(item.id)}
              >
                <Ionicons name="checkmark-circle-outline" size={11} color="#22c55e" />
                <Text style={[card.ownerBtnText, { color: '#22c55e' }]}>Sold</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[card.ownerBtn, { borderColor: '#ef444430' }]}
              onPress={() => onDelete?.(item.id)}
            >
              <Ionicons name="trash-outline" size={11} color="#ef4444" />
              <Text style={[card.ownerBtnText, { color: '#ef4444' }]}>Del</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ─── Item Detail Modal ────────────────────────────────────────────────────────

interface DetailModalProps {
  item: MarketItem;
  currentUserId: string;
  isSaved: boolean;
  onToggleSave: (id: string) => void;
  onClose: () => void;
  onSold: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (item: MarketItem) => void;
  onMessage: (sellerId: string) => void;
}

const ItemDetailModal: React.FC<DetailModalProps> = ({
  item, currentUserId, isSaved, onToggleSave,
  onClose, onSold, onDelete, onEdit, onMessage,
}) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const isOwn = item.seller_id === currentUserId;
  const [marking, setMarking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showBoost, setShowBoost] = useState(false);
  const [activeBoost, setActiveBoost] = useState<string>(item.boost_type ?? 'none');
  const { showPopup } = usePopup();
  const seller = item.profiles;

  useEffect(() => { incrementViewCount(item.id); }, [item.id]);

  const handleMarkSold = useCallback(async () => {
    setMarking(true);
    try {
      await markItemSold(item.id, currentUserId);
      onSold(item.id);
    } catch (e: any) {
      showPopup({ title: 'Error', message: e.message ?? 'Failed to mark as sold.', icon: 'alert-circle-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
    } finally { setMarking(false); }
  }, [item.id, currentUserId, onSold]);

  const handleDelete = useCallback(() => {
    showPopup({
      title: 'Delete Listing',
      message: 'Remove this listing permanently from the campus market?',
      icon: 'trash-outline',
      iconColor: '#ef4444',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        {
          text: 'Delete Permanently',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteMarketItem(item.id, currentUserId);
              onDelete(item.id);
            } catch (e: any) {
              showPopup({ title: 'Error', message: e.message ?? 'Failed to delete.', icon: 'alert-circle-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
              setDeleting(false);
            }
          },
        },
      ],
    });
  }, [item.id, currentUserId, onDelete, showPopup]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        title: item.title,
        message: `Check out "${item.title}" for ${formatPrice(item.price)} on UniGram Campus Market!`,
      });
    } catch { /* cancelled */ }
  }, [item.title, item.price]);

  // Overlay top inset: pageSheet on iOS handles it natively; Android full-screen needs manual
  const overlayTop = Platform.OS === 'android' ? insets.top + 8 : 8;
  const sheetBg = isDark ? '#0c0c0e' : '#ffffff';

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[dtl.container, { backgroundColor: sheetBg, paddingBottom: insets.bottom }]}>
        {/* Hero */}
        <View style={dtl.heroWrap}>
          {item.image_url ? (
            <CachedImage uri={item.image_url} style={dtl.heroImg} resizeMode="cover" />
          ) : (
            <View style={[dtl.heroImg, { backgroundColor: isDark ? '#141416' : '#e9e9ef', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="image-outline" size={56} color={colors.textMuted} />
            </View>
          )}

          {item.is_sold && (
            <View style={dtl.soldOverlay}>
              <Text style={dtl.soldText}>SOLD</Text>
            </View>
          )}

          {/* Overlay actions */}
          <View style={[dtl.overlayRow, { top: overlayTop }]}>
            <TouchableOpacity style={dtl.overlayBtn} onPress={onClose}>
              <Ionicons name="chevron-down" size={20} color="#fff" />
            </TouchableOpacity>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={dtl.overlayBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={19} color="#fff" />
              </TouchableOpacity>
              {!isOwn && (
                <TouchableOpacity style={dtl.overlayBtn} onPress={() => onToggleSave(item.id)}>
                  <Ionicons
                    name={isSaved ? 'bookmark' : 'bookmark-outline'}
                    size={19}
                    color={isSaved ? '#fbbf24' : '#fff'}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {item.condition && (
            <ConditionBadge condition={item.condition} style={{ position: 'absolute', bottom: 14, left: 14 }} />
          )}
        </View>

        {/* Scrollable body */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={dtl.scrollBody}
          showsVerticalScrollIndicator={false}
        >
          {/* Title + Price */}
          <View style={dtl.titleRow}>
            <Text style={[dtl.title, { color: colors.text }]} numberOfLines={3}>{item.title}</Text>
            <Text style={[dtl.price, { color: colors.text }]}>{formatPrice(item.price)}</Text>
          </View>

          {/* Meta chips */}
          <View style={dtl.metaRow}>
            <View style={[dtl.chip, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
              <Text style={[dtl.chipText, { color: colors.textSub }]}>
                {CATEGORIES.find(c => c.id === item.category)?.icon ?? '📦'} {CATEGORIES.find(c => c.id === item.category)?.label ?? item.category}
              </Text>
            </View>
            <Text style={[dtl.metaSmall, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
            {item.views_count > 0 && (
              <>
                <Text style={[dtl.metaSmall, { color: colors.textMuted }]}>·</Text>
                <Ionicons name="eye-outline" size={12} color={colors.textMuted} />
                <Text style={[dtl.metaSmall, { color: colors.textMuted }]}>{item.views_count}</Text>
              </>
            )}
          </View>

          {/* Divider */}
          <View style={[dtl.divider, { backgroundColor: colors.border }]} />

          {/* Description */}
          {!!item.description && (
            <View style={dtl.section}>
              <Text style={[dtl.sectionLabel, { color: colors.textMuted }]}>Description</Text>
              <Text style={[dtl.description, { color: colors.textSub }]}>{item.description}</Text>
            </View>
          )}

          {/* Seller card */}
          <View style={dtl.section}>
            <Text style={[dtl.sectionLabel, { color: colors.textMuted }]}>Seller</Text>
            <View style={[dtl.sellerCard, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
              {seller?.avatar_url
                ? <CachedImage uri={seller.avatar_url} style={dtl.sellerAvatar} />
                : (
                  <View style={[dtl.sellerAvatar, dtl.sellerAvatarFb, { backgroundColor: isDark ? '#222' : '#ddd' }]}>
                    <Ionicons name="person" size={18} color={colors.textMuted} />
                  </View>
                )
              }
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text style={[dtl.sellerName, { color: colors.text }]}>
                    {seller?.full_name ?? seller?.username ?? 'Unknown'}
                  </Text>
                  {seller?.is_verified && (
                    <VerifiedBadge type={seller.verification_type as any} size="sm" />
                  )}
                </View>
                <Text style={[dtl.sellerHandle, { color: colors.textMuted }]}>
                  @{seller?.username}{seller?.university ? ` · ${seller.university}` : ''}
                </Text>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={{ gap: 10, marginTop: 4 }}>
            {!isOwn && !item.is_sold && (
              <TouchableOpacity
                style={[dtl.actionBtn, { backgroundColor: '#4f46e5' }]}
                onPress={() => onMessage(seller?.id ?? item.seller_id)}
              >
                <Ionicons name="chatbubble-outline" size={17} color="#fff" />
                <Text style={dtl.actionBtnText}>Message Seller</Text>
              </TouchableOpacity>
            )}

            {isOwn && (
              <>
                <TouchableOpacity
                  style={[dtl.actionBtn, dtl.actionBtnOutline, { borderColor: '#4f46e5' }]}
                  onPress={() => { onClose(); onEdit(item); }}
                >
                  <Ionicons name="pencil-outline" size={17} color="#818cf8" />
                  <Text style={[dtl.actionBtnText, { color: '#818cf8' }]}>Edit Listing</Text>
                </TouchableOpacity>

                {!item.is_sold && (
                  <TouchableOpacity
                    style={[dtl.actionBtn, dtl.actionBtnOutline, { borderColor: '#22c55e' }]}
                    onPress={handleMarkSold}
                    disabled={marking}
                  >
                    {marking
                      ? <ActivityIndicator size="small" color="#22c55e" />
                      : <>
                          <Ionicons name="checkmark-circle-outline" size={17} color="#22c55e" />
                          <Text style={[dtl.actionBtnText, { color: '#22c55e' }]}>Mark as Sold</Text>
                        </>
                    }
                  </TouchableOpacity>
                )}

                {!item.is_sold && (
                  <TouchableOpacity
                    style={[dtl.actionBtn, dtl.actionBtnOutline, { borderColor: '#f59e0b' }]}
                    onPress={() => setShowBoost(true)}
                  >
                    <Ionicons name="rocket-outline" size={17} color="#f59e0b" />
                    <Text style={[dtl.actionBtnText, { color: '#f59e0b' }]}>
                      {activeBoost !== 'none'
                        ? `Boosted · ${BOOST_TIERS.find(t => t.type === activeBoost)?.label}`
                        : 'Boost Listing'}
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[dtl.actionBtn, dtl.actionBtnOutline, { borderColor: '#ef4444' }]}
                  onPress={handleDelete}
                  disabled={deleting}
                >
                  {deleting
                    ? <ActivityIndicator size="small" color="#ef4444" />
                    : <>
                        <Ionicons name="trash-outline" size={17} color="#ef4444" />
                        <Text style={[dtl.actionBtnText, { color: '#ef4444' }]}>Delete Listing</Text>
                      </>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>

        <BoostSheet
          visible={showBoost}
          onClose={() => setShowBoost(false)}
          itemId={item.id}
          currentBoostType={activeBoost}
          onSuccess={(bt) => setActiveBoost(bt)}
        />
      </View>
    </Modal>
  );
};

// ─── Sell / Edit Modal ────────────────────────────────────────────────────────

interface SellModalProps {
  visible: boolean;
  currentUserId: string;
  editItem?: MarketItem | null;
  isSuspended?: boolean;
  onClose: () => void;
  onPosted: (item: MarketItem) => void;
  onUpdated: (item: MarketItem) => void;
}

const SellModal: React.FC<SellModalProps> = ({
  visible, currentUserId, editItem, onClose, onPosted, onUpdated,
  isSuspended: propIsSuspended,
}) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const isEdit = !!editItem;

  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('books');
  const [condition, setCondition] = useState<Condition>('good');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isBanned, setIsBanned] = useState(false);
  const [isSuspended, setIsSuspended] = useState(propIsSuspended ?? false);
  const { showPopup } = usePopup();

  useEffect(() => {
    if (propIsSuspended !== undefined) setIsSuspended(propIsSuspended);
  }, [propIsSuspended]);

  useEffect(() => {
    if (visible && currentUserId) {
      supabase.from('profiles').select('is_banned, is_suspended').eq('id', currentUserId).single()
        .then(({ data }) => {
          setIsBanned(!!data?.is_banned);
          setIsSuspended(!!data?.is_suspended);
        });
    }
  }, [visible, currentUserId]);

  useEffect(() => {
    if (editItem) {
      setTitle(editItem.title ?? '');
      setPrice(String(editItem.price ?? ''));
      setDescription(editItem.description ?? '');
      setCategory(editItem.category ?? 'books');
      setCondition((editItem.condition as Condition) ?? 'good');
      setImageUri(editItem.image_url ?? null);
    } else {
      setTitle(''); setPrice(''); setDescription('');
      setCategory('books'); setCondition('good'); setImageUri(null);
    }
  }, [editItem, visible]);

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showPopup({ title: 'Permission needed', message: 'Allow photo access to add images.', icon: 'image-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.length > 0) setImageUri(result.assets[0].uri);
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    const parsedPrice = parseFloat(price);
    if (!trimmedTitle) {
      showPopup({ title: 'Missing title', message: 'Please enter a title for your listing.', icon: 'text-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
      return;
    }
    if (!price || isNaN(parsedPrice) || parsedPrice < 0) {
      showPopup({ title: 'Invalid price', message: 'Please enter a valid price.', icon: 'cash-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && editItem) {
        const updates: UpdateItemPayload = {
          title: trimmedTitle,
          description: description.trim(),
          price: parsedPrice,
          category,
          condition,
          imageUri: imageUri || undefined,
        };
        const updated = await updateMarketItem(editItem.id, currentUserId, updates);
        onUpdated(updated);
      } else {
        const item = await createMarketItem(currentUserId, {
          title: trimmedTitle, description: description.trim(),
          price: parsedPrice, category, condition,
          imageUris: imageUri ? [imageUri] : [],
        });
        onPosted(item);
      }
    } catch (e: any) {
      showPopup({ title: 'Error', message: e.message ?? 'Something went wrong.', icon: 'alert-circle-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
    } finally { setSubmitting(false); }
  }, [title, price, description, category, condition, imageUri, isEdit, editItem, currentUserId, onPosted, onUpdated]);

  const sheetBg = isDark ? '#0c0c0e' : '#ffffff';
  // pageSheet on iOS starts below status bar; Android needs top inset
  const headerTopPad = Platform.OS === 'android' ? insets.top : 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: sheetBg }}>
        {/* Header */}
        <View style={[sell.header, {
          backgroundColor: sheetBg,
          borderBottomColor: colors.border,
          paddingTop: headerTopPad + 14,
        }]}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[sell.cancelText, { color: colors.accent }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[sell.headerTitle, { color: colors.text }]}>
            {isEdit ? 'Edit Listing' : 'New Listing'}
          </Text>
          <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
            {submitting
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={[sell.postText, { color: colors.accent }]}>{isEdit ? 'Update' : 'Post'}</Text>
            }
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={[sell.body, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          {(isBanned || isSuspended) ? (
            <View style={[sell.bannedCard, { borderColor: 'rgba(239,68,68,0.15)', backgroundColor: 'rgba(239,68,68,0.04)' }]}>
              <Ionicons name="alert-circle" size={42} color="#ef4444" />
              <Text style={[sell.bannedTitle, { color: colors.text }]}>{isBanned ? 'Market Banned' : 'Market Restricted'}</Text>
              <Text style={[sell.bannedSub, { color: colors.textMuted }]}>
                {isBanned
                  ? 'Your account is permanently banned from creating marketplace listings.'
                  : 'Your account is temporarily restricted. You can still browse and message sellers.'}
              </Text>
            </View>
          ) : (
            <>
              {/* Image picker */}
              <TouchableOpacity
                style={[sell.imgPicker, { borderColor: colors.border, backgroundColor: colors.bg2 }]}
                onPress={pickImage}
                activeOpacity={0.75}
              >
                {imageUri ? (
                  <>
                    <Image source={{ uri: imageUri }} style={sell.imgPreview as any} resizeMode="cover" />
                    <View style={sell.imgOverlay}>
                      <Ionicons name="camera" size={22} color="#fff" />
                      <Text style={sell.imgOverlayText}>Change photo</Text>
                    </View>
                  </>
                ) : (
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <View style={[sell.imgIconWrap, { backgroundColor: isDark ? '#1e1e22' : '#f0f0f4' }]}>
                      <Ionicons name="camera-outline" size={28} color={colors.textMuted} />
                    </View>
                    <Text style={[sell.imgEmptyText, { color: colors.textMuted }]}>Tap to add a photo</Text>
                    <Text style={[{ fontSize: 11, color: colors.textMuted }]}>Optional but gets more views</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Title */}
              <View>
                <Text style={[sell.fieldLabel, { color: colors.textMuted }]}>Title *</Text>
                <TextInput
                  style={[sell.input, { backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]}
                  placeholder="e.g. Engineering Textbook 300 Level"
                  placeholderTextColor={colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  maxLength={120}
                />
              </View>

              {/* Price */}
              <View>
                <Text style={[sell.fieldLabel, { color: colors.textMuted }]}>Price (GHS) *</Text>
                <TextInput
                  style={[sell.input, { backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]}
                  placeholder="e.g. 80"
                  placeholderTextColor={colors.textMuted}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                />
              </View>

              {/* Description */}
              <View>
                <Text style={[sell.fieldLabel, { color: colors.textMuted }]}>Description</Text>
                <TextInput
                  style={[sell.input, sell.textArea, { backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]}
                  placeholder="Describe your item — condition details, why you're selling, etc."
                  placeholderTextColor={colors.textMuted}
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  textAlignVertical="top"
                  maxLength={1000}
                />
              </View>

              {/* Category */}
              <View>
                <Text style={[sell.fieldLabel, { color: colors.textMuted }]}>Category</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
                  {CATEGORIES.filter(c => c.id !== 'all').map(cat => {
                    const active = category === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[
                          sell.chip,
                          {
                            backgroundColor: active ? colors.accent + '18' : colors.bg2,
                            borderColor: active ? colors.accent : colors.border,
                          },
                        ]}
                        onPress={() => setCategory(cat.id)}
                      >
                        <Text style={sell.chipEmoji}>{cat.icon}</Text>
                        <Text style={[sell.chipLabel, { color: active ? colors.accent : colors.textMuted, fontWeight: active ? '700' : '500' }]}>
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Condition */}
              <View>
                <Text style={[sell.fieldLabel, { color: colors.textMuted }]}>Condition</Text>
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {CONDITIONS.map(c => {
                    const clr = CONDITION_COLOR[c];
                    const active = condition === c;
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[
                          sell.condChip,
                          {
                            backgroundColor: active ? clr + '18' : colors.bg2,
                            borderColor: active ? clr : colors.border,
                            flex: 1,
                            minWidth: '45%',
                            alignItems: 'center',
                          },
                        ]}
                        onPress={() => setCondition(c)}
                      >
                        <Text style={[sell.condChipText, { color: active ? clr : colors.textSub }]}>
                          {CONDITION_LABEL[c]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface MarketScreenProps {
  onMessagePress?: (convId: string, otherProfile: any) => void;
  isVisible?: boolean;
  isSuspended?: boolean;
}

export const MarketScreen = React.memo(({ onMessagePress, isVisible, isSuspended }: MarketScreenProps) => {
  const { colors, isDark } = useTheme();
  const { showPopup } = usePopup();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();

  const [currentUserId, setCurrentUserId] = useState('');
  const [marketAds, setMarketAds] = useState<any[]>([]);
  const adImpressionsRef = useRef(new Set<string>());
  const [activeTab, setActiveTab] = useState<Tab>('browse');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const [browseItems, setBrowseItems] = useState<MarketItem[]>(_cachedItems);
  const [browseOffset, setBrowseOffset] = useState(_cachedItems.length || 0);
  const [browseHasMore, setBrowseHasMore] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(_cachedItems.length === 0);

  const [savedItems, setSavedItems] = useState<MarketItem[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [myItems, setMyItems] = useState<MarketItem[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  const [savedIds, setSavedIds] = useState<Set<string>>(_cachedSavedIds);
  const [refreshing, setRefreshing] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [editItem, setEditItem] = useState<MarketItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);

  // ── Auth ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) setCurrentUserId(data.user.id); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clearMarketCache();
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Search debounce ──
  const handleSearchChange = useCallback((q: string) => {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(q), 400);
  }, []);

  // ── Data loaders ──
  const loadBrowse = useCallback(async (hard = false) => {
    if (!currentUserId) return;
    setBrowseLoading(true);
    try {
      const cat = category === 'all' ? undefined : category;
      const [raw, profData] = await Promise.all([
        getMarketItems(cat, debouncedSearch, PAGE_SIZE, 0),
        supabase.from('profiles').select('university').eq('id', currentUserId).single().then(r => r.data),
      ]);
      const data = sortByBoost(raw);
      setBrowseItems(data);
      setBrowseOffset(raw.length);
      setBrowseHasMore(raw.length === PAGE_SIZE);
      _cachedItems = data;
      _lastLoaded = Date.now();
      if (hard) {
        const savedData = await getSavedItemIds(currentUserId);
        const savedSet = new Set<string>(savedData);
        setSavedIds(savedSet);
        _cachedSavedIds = savedSet;
      }
      getActiveAdsForPlacement('market', profData?.university ?? null, currentUserId).then(setMarketAds).catch(() => {});
    } catch (e: any) {
      showToast(e?.message || 'Failed to load market.', 'error');
    } finally {
      setBrowseLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId, category, debouncedSearch]);

  const loadMoreBrowse = useCallback(async () => {
    if (!currentUserId || browseLoading || !browseHasMore) return;
    setBrowseLoading(true);
    try {
      const cat = category === 'all' ? undefined : category;
      const data = await getMarketItems(cat, debouncedSearch, PAGE_SIZE, browseOffset);
      setBrowseItems(prev => [...prev, ...data]);
      setBrowseOffset(prev => prev + data.length);
      setBrowseHasMore(data.length === PAGE_SIZE);
    } catch (e) { /* silent */ }
    finally { setBrowseLoading(false); }
  }, [currentUserId, browseLoading, browseHasMore, browseOffset, category, debouncedSearch]);

  const loadSaved = useCallback(async () => {
    if (!currentUserId) return;
    setSavedLoading(true);
    try {
      setSavedItems(await getSavedItems(currentUserId));
    } catch { /* silent */ }
    finally { setSavedLoading(false); setRefreshing(false); }
  }, [currentUserId]);

  const loadMine = useCallback(async () => {
    if (!currentUserId) return;
    setMyLoading(true);
    try {
      setMyItems(await getMyListings(currentUserId));
    } catch { /* silent */ }
    finally { setMyLoading(false); setRefreshing(false); }
  }, [currentUserId]);

  // ── Initial + reactivity ──
  useEffect(() => {
    if (!currentUserId) return;
    if (_cachedItems.length > 0 && Date.now() - _lastLoaded < MARKET_TTL) { setBrowseLoading(false); return; }
    loadBrowse(true); loadSaved(); loadMine();
  }, [currentUserId]); // eslint-disable-line

  useEffect(() => {
    if (isVisible && currentUserId && _lastLoaded > 0 && Date.now() - _lastLoaded > MARKET_TTL) loadBrowse(true);
  }, [isVisible]); // eslint-disable-line

  useEffect(() => { if (currentUserId) loadBrowse(false); }, [category, debouncedSearch]); // eslint-disable-line

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (activeTab === 'browse') loadBrowse(true);
    else if (activeTab === 'saved') loadSaved();
    else loadMine();
  }, [activeTab, loadBrowse, loadSaved, loadMine]);

  // ── Toggle save ──
  const handleToggleSave = useCallback(async (itemId: string) => {
    if (!currentUserId) return;
    const wasSaved = savedIds.has(itemId);
    setSavedIds(prev => { const n = new Set(prev); wasSaved ? n.delete(itemId) : n.add(itemId); return n; });
    if (wasSaved) setSavedItems(prev => prev.filter(i => i.id !== itemId));
    try {
      await toggleSaveItem(currentUserId, itemId);
      if (!wasSaved) loadSaved();
    } catch {
      setSavedIds(prev => { const n = new Set(prev); wasSaved ? n.add(itemId) : n.delete(itemId); return n; });
    }
  }, [currentUserId, savedIds, loadSaved]);

  // ── Message seller ──
  const handleMessage = useCallback(async (sellerId: string, sellerProfile?: any) => {
    if (!currentUserId || sellerId === currentUserId) return;
    try {
      const convId = await createDirectConversation(currentUserId, sellerId);
      
      let profile = sellerProfile;
      if (!profile) {
        const item = [...browseItems, ...savedItems, ...myItems].find(i => i.seller_id === sellerId);
        profile = {
          id: sellerId,
          full_name: item?.profiles?.full_name ?? 'Seller',
          username: item?.profiles?.username ?? 'seller',
          avatar_url: item?.profiles?.avatar_url ?? null,
          is_verified: item?.profiles?.is_verified ?? false,
        };
      }

      onMessagePress?.(convId, profile);
    } catch (e: any) {
      showPopup({ title: 'Connection Failed', message: e.message ?? 'Could not start a conversation.', icon: 'chatbubble-ellipses-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
    }
  }, [currentUserId, onMessagePress, browseItems, savedItems, myItems]);

  // ── Sold / Delete / Edit ──
  const applyToAll = (id: string, fn: (item: MarketItem) => MarketItem) => {
    setBrowseItems(p => p.map(fn));
    setSavedItems(p => p.map(fn));
    setMyItems(p => p.map(fn));
    setSelectedItem(p => p?.id === id ? fn(p) : p);
  };

  const handleSoldFromDetail = useCallback((id: string) => {
    applyToAll(id, item => item.id === id ? { ...item, is_sold: true } : item);
  }, []);

  const handleSoldFromCard = useCallback(async (itemId: string) => {
    try {
      await markItemSold(itemId, currentUserId);
      handleSoldFromDetail(itemId);
    } catch (e: any) {
      showPopup({ title: 'Update Failed', message: e.message ?? 'Could not mark as sold.', icon: 'alert-circle-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
    }
  }, [currentUserId, handleSoldFromDetail, showPopup]);

  const handleDeleteFromDetail = useCallback((id: string) => {
    setBrowseItems(p => p.filter(i => i.id !== id));
    setSavedItems(p => p.filter(i => i.id !== id));
    setMyItems(p => p.filter(i => i.id !== id));
    setSelectedItem(null);
  }, []);

  const handleDeleteFromCard = useCallback((itemId: string) => {
    showPopup({
      title: 'Delete Listing',
      message: 'Remove this listing permanently?',
      icon: 'trash-outline', iconColor: '#ef4444',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          try {
            await deleteMarketItem(itemId, currentUserId);
            handleDeleteFromDetail(itemId);
          } catch (e: any) {
            showPopup({ title: 'Error', message: e.message ?? 'Failed.', icon: 'alert-circle-outline', buttons: [{ text: 'OK', onPress: () => {} }] });
          }
        }},
      ],
    });
  }, [currentUserId, handleDeleteFromDetail, showPopup]);

  const handleOpenEdit = useCallback((item: MarketItem) => {
    setSelectedItem(null); setEditItem(item); setShowSell(true);
  }, []);

  const handleUpdated = useCallback((updated: MarketItem) => {
    const replace = (item: MarketItem) => item.id === updated.id ? updated : item;
    setBrowseItems(p => p.map(replace));
    setSavedItems(p => p.map(replace));
    setMyItems(p => p.map(replace));
    setEditItem(null); setShowSell(false);
  }, []);

  const handlePosted = useCallback((item: MarketItem) => {
    setShowSell(false); setEditItem(null);
    setBrowseItems(p => [item, ...p]);
    setMyItems(p => [item, ...p]);
    setActiveTab('mine');
  }, []);

  // ── Render cards ──
  const renderBrowseCard = useCallback(({ item }: { item: any }) => {
    if (item._type === 'sponsored_ad') {
      return (
        <View style={{ 
          width: '100%', 
          borderRadius: 16, 
          overflow: 'hidden', 
          backgroundColor: colors.bg2, 
          borderWidth: 1, 
          borderColor: colors.border,
          marginBottom: 2 
        }}>
          <SponsoredAdCard
            ad={item.ad}
            onImpression={(adId) => {
              if (!adImpressionsRef.current.has(adId)) {
                adImpressionsRef.current.add(adId);
                recordCampusAdImpression(adId).catch(() => {});
              }
            }}
          />
        </View>
      );
    }
    return (
      <ItemCard item={item} currentUserId={currentUserId} isSaved={savedIds.has(item.id)}
        onToggleSave={handleToggleSave} onPress={setSelectedItem} />
    );
  }, [currentUserId, savedIds, handleToggleSave, colors]);

  const renderSavedCard = useCallback(({ item }: { item: MarketItem }) => (
    <ItemCard item={item} currentUserId={currentUserId} isSaved
      onToggleSave={handleToggleSave} onPress={setSelectedItem} />
  ), [currentUserId, handleToggleSave]);

  const renderMyCard = useCallback(({ item }: { item: MarketItem }) => (
    <ItemCard item={item} currentUserId={currentUserId} isSaved={savedIds.has(item.id)} isOwn
      onToggleSave={handleToggleSave} onPress={setSelectedItem}
      onMarkSold={handleSoldFromCard} onDelete={handleDeleteFromCard} onEdit={handleOpenEdit} />
  ), [currentUserId, savedIds, handleToggleSave, handleSoldFromCard, handleDeleteFromCard, handleOpenEdit]);

  // Inject sponsored ads into the browse grid (every N items, first at index 4)
  const mixedBrowseItems = React.useMemo(() => {
    if (!marketAds.length || activeTab !== 'browse') return browseItems;
    const interval = adFrequencyInterval(marketAds[0]?.budget ?? 60);
    const result: any[] = [];
    let adIdx = 0;
    browseItems.forEach((item, i) => {
      result.push(item);
      // Inject ads based on frequency, but ALWAYS force the first ad to appear after the first item for testing
      const isTestAdPos = (i === 0 && adIdx === 0);
      const isIntervalAdPos = (i === 3 || (i > 3 && (i - 3) % interval === 0));

      if (isTestAdPos || isIntervalAdPos) {
        const ad = marketAds[adIdx % marketAds.length];
        adIdx++;
        result.push({ id: `__market_ad_${ad.id}_pos${i}__`, _type: 'sponsored_ad', ad });
      }
    });
    return result;
  }, [browseItems, marketAds, activeTab]);

  const activeData   = activeTab === 'browse' ? mixedBrowseItems : activeTab === 'saved' ? savedItems : myItems;
  const activeRender = activeTab === 'browse' ? renderBrowseCard : activeTab === 'saved' ? renderSavedCard : renderMyCard;
  const isInitialLoading =
    (activeTab === 'browse' && browseLoading && browseItems.length === 0) ||
    (activeTab === 'saved'  && savedLoading  && savedItems.length === 0) ||
    (activeTab === 'mine'   && myLoading     && myItems.length === 0);

  const STUB_CARD_W = CARD_W;

  const openSell = useCallback(() => {
    if (isSuspended) {
      showPopup({ 
        title: 'Account Restricted', 
        message: 'Your account cannot create new listings at this time.', 
        icon: 'lock-closed-outline', 
        iconColor: '#ef4444', 
        buttons: [{ text: 'OK', onPress: () => {} }] 
      });
      return;
    }
    setEditItem(null); setShowSell(true);
  }, [isSuspended, showPopup]);

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      const lastVisible = viewableItems[viewableItems.length - 1];
      const startIdx = (lastVisible.index ?? 0) + 1;
      const urls: string[] = [];
      const items = activeData;
      for (let i = startIdx; i < Math.min(startIdx + 10, items.length); i++) {
        const it = items[i];
        if (it?.image_url) urls.push(it.image_url);
      }
      if (urls.length) ExpoImage.prefetch(urls, 'memory-disk').catch(() => {});
    }
  }, [activeData]);

  return (
    <View style={[scr.root, { paddingTop: insets.top, backgroundColor: colors.bg }]}>

      {/* ── Header ── */}
      <View style={[scr.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[scr.headerTitle, { color: colors.text }]}>Campus Market</Text>
          <Text style={[scr.headerSub, { color: colors.textMuted }]}>Buy &amp; sell within your campus</Text>
        </View>
        <TouchableOpacity style={scr.sellBtn} onPress={openSell} activeOpacity={0.85}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={scr.sellBtnText}>Sell</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab bar ── */}
      <View style={scr.tabBar}>
        {([
          { id: 'browse', label: 'Browse',      icon: 'storefront-outline' },
          { id: 'saved',  label: 'Saved',        icon: 'bookmark-outline' },
          { id: 'mine',   label: 'My Listings',  icon: 'person-outline' },
        ] as const).map(tab => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={[
                scr.tabBtn,
                {
                  backgroundColor: active ? colors.accent + '18' : 'transparent',
                  borderColor: active ? colors.accent + '55' : 'transparent',
                },
              ]}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.7}
            >
              <Ionicons name={tab.icon} size={13} color={active ? colors.accent : colors.textMuted} />
              <Text style={[scr.tabLabel, { color: active ? colors.accent : colors.textMuted, fontWeight: active ? '700' : '500' }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Category chips (Browse) ── */}
      {activeTab === 'browse' && (
        <View style={scr.catScrollWrap}>
          <ScrollView
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={scr.catScroll}
            contentContainerStyle={scr.catScrollContent}
          >
            {CATEGORIES.map(cat => {
              const active = category === cat.id;
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[
                    scr.catChip,
                    {
                      backgroundColor: active ? colors.accent + '18' : colors.bg2,
                      borderColor: active ? colors.accent + '55' : colors.border,
                    },
                  ]}
                  onPress={() => setCategory(cat.id)}
                >
                  <Text style={scr.catChipEmoji}>{cat.icon}</Text>
                  <Text style={[scr.catChipLabel, { color: active ? colors.accent : colors.textMuted, fontWeight: active ? '700' : '500' }]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Search bar (Browse) ── */}
      {activeTab === 'browse' && (
        <View style={[scr.searchWrap, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
          <TextInput
            style={[scr.searchInput, { color: colors.text }]}
            placeholder="Search listings…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Content ── */}
      {isInitialLoading ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={scr.listPad}>
          <MarketSkeleton key="skeleton-1" cardWidth={STUB_CARD_W} />
          <MarketSkeleton key="skeleton-2" cardWidth={STUB_CARD_W} />
        </ScrollView>
      ) : (
        <FlashList
          key={activeTab}
          data={activeData}
          keyExtractor={(item: any) => item.id}
          numColumns={2}
          overrideItemLayout={(layout: any, item: any) => {
            if (item._type === 'sponsored_ad') layout.span = 2;
          }}
          columnWrapperStyle={scr.colWrapper}
          contentContainerStyle={[scr.listPad, { paddingBottom: insets.bottom + 90 }]}
          estimatedItemSize={250}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366f1" colors={['#6366f1']} />
          }
          renderItem={activeRender}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          onEndReached={activeTab === 'browse' ? loadMoreBrowse : undefined}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            activeTab === 'browse' && browseLoading && browseItems.length > 0
              ? <View style={{ paddingVertical: 20, alignItems: 'center' }}><ActivityIndicator color="#6366f1" /></View>
              : null
          }
          ListEmptyComponent={
            <View style={scr.empty}>
              <Ionicons
                name={activeTab === 'saved' ? 'bookmark-outline' : activeTab === 'mine' ? 'storefront-outline' : 'bag-outline'}
                size={52} color={colors.textMuted}
              />
              <Text style={[scr.emptyTitle, { color: colors.textSub }]}>
                {activeTab === 'saved' ? 'Nothing saved yet'
                  : activeTab === 'mine' ? "You haven't listed anything"
                  : 'No items found'}
              </Text>
              <Text style={[scr.emptyHint, { color: colors.textMuted }]}>
                {activeTab === 'saved' ? 'Bookmark items to find them here'
                  : activeTab === 'mine' ? 'Start selling to your campus'
                  : 'Try a different search or category'}
              </Text>
              {(activeTab === 'browse' || activeTab === 'mine') && (
                <TouchableOpacity style={[scr.sellBtn, { marginTop: 20 }]} onPress={openSell}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={scr.sellBtnText}>
                    {activeTab === 'mine' ? 'Create Listing' : 'Be the first to sell'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* Modals */}
      <SellModal
        visible={showSell}
        currentUserId={currentUserId}
        editItem={editItem}
        onClose={() => { setShowSell(false); setEditItem(null); }}
        onPosted={handlePosted}
        onUpdated={handleUpdated}
        isSuspended={isSuspended}
      />

      {selectedItem && (
        <ItemDetailModal
          item={selectedItem}
          currentUserId={currentUserId}
          isSaved={savedIds.has(selectedItem.id)}
          onToggleSave={handleToggleSave}
          onClose={() => setSelectedItem(null)}
          onSold={handleSoldFromDetail}
          onDelete={handleDeleteFromDetail}
          onEdit={handleOpenEdit}
          onMessage={sellerId => { setSelectedItem(null); handleMessage(sellerId); }}
        />
      )}
    </View>
  );
});

// ─── Styles ───────────────────────────────────────────────────────────────────

// Main screen
const scr = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: H_PAD,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  headerSub: { fontSize: 12, marginTop: 1 },

  sellBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#4f46e5',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 8,
  },
  sellBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: H_PAD,
    paddingVertical: 10,
    gap: 6,
  },
  tabBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 20, borderWidth: 1,
  },
  tabLabel: { fontSize: 12 },

  catScrollWrap: {
    height: 48,
    justifyContent: 'center',
  },
  catScroll: {
    flexGrow: 0,
    marginBottom: 4,
  },
  catScrollContent: {
    paddingHorizontal: H_PAD,
    gap: 7,
    alignItems: 'center',
    paddingVertical: 4,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    height: 32,
  },
  catChipEmoji: { fontSize: 13 },
  catChipLabel: { fontSize: 13 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: H_PAD, marginBottom: 10,
    borderRadius: 13, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 9,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },

  colWrapper: { gap: CARD_GAP },
  listPad: { paddingTop: 6, gap: CARD_GAP, paddingHorizontal: H_PAD },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginTop: 14 },
  emptyHint: { fontSize: 13, textAlign: 'center', marginTop: 6, lineHeight: 19 },
});

// Item card
const card = StyleSheet.create({
  wrap: { borderRadius: 16, overflow: 'hidden' },
  imgWrap: { position: 'relative' },
  img: { width: '100%', aspectRatio: 1 },
  imgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  soldText: { color: '#ef4444', fontWeight: '900', fontSize: 15, letterSpacing: 3 },
  bookmarkBtn: {
    position: 'absolute', top: 8, right: 8,
    borderRadius: 14, padding: 5,
  },
  boostBadge: {
    position: 'absolute', top: 8, left: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3,
  },
  boostText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  info: { padding: 10 },
  title: { fontSize: 12, fontWeight: '600', marginBottom: 4, lineHeight: 16 },
  price: { fontSize: 15, fontWeight: '800', marginBottom: 6 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatar: { width: 17, height: 17, borderRadius: 9 },
  sellerName: { fontSize: 10, fontWeight: '600', flex: 1 },
  dot: { fontSize: 10 },
  age: { fontSize: 9 },
  ownerActions: { flexDirection: 'row', gap: 5, marginTop: 8, flexWrap: 'wrap' },
  ownerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: 7, borderWidth: 1,
    paddingHorizontal: 7, paddingVertical: 4,
  },
  ownerBtnText: { fontSize: 10, fontWeight: '600' },
});

// Detail modal
const dtl = StyleSheet.create({
  container: { flex: 1 },
  heroWrap: { position: 'relative' },
  heroImg: { width, aspectRatio: 1.2, backgroundColor: '#111' },
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center',
  },
  soldText: { color: '#ef4444', fontSize: 28, fontWeight: '900', letterSpacing: 4 },
  overlayRow: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14,
  },
  overlayBtn: {
    backgroundColor: 'rgba(0,0,0,0.52)',
    borderRadius: 20, padding: 9,
  },
  scrollBody: { padding: 16, paddingBottom: 32 },
  titleRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 12, marginBottom: 10,
  },
  title: { fontSize: 20, fontWeight: '800', flex: 1, lineHeight: 27, letterSpacing: -0.3 },
  price: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  metaRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 14, flexWrap: 'wrap',
  },
  chip: { borderRadius: 9, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  chipText: { fontSize: 12, textTransform: 'capitalize' },
  metaSmall: { fontSize: 12 },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: 16 },
  section: { marginBottom: 16 },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 1.2,
    textTransform: 'uppercase', marginBottom: 8,
  },
  description: { fontSize: 14, lineHeight: 22 },
  sellerCard: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 14, padding: 12, borderWidth: 1,
  },
  sellerAvatar: { width: 46, height: 46, borderRadius: 23 },
  sellerAvatarFb: { alignItems: 'center', justifyContent: 'center' },
  sellerName: { fontSize: 15, fontWeight: '700' },
  sellerHandle: { fontSize: 12, marginTop: 2 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 14, paddingVertical: 14,
  },
  actionBtnOutline: {
    backgroundColor: 'transparent', borderWidth: 1.5,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

// Sell modal
const sell = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  cancelText: { fontSize: 15 },
  postText: { fontSize: 15, fontWeight: '700' },
  body: { padding: 16, gap: 16 },

  imgPicker: {
    width: '100%', height: 180,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 1, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  imgPreview: { width: '100%', height: '100%', position: 'absolute' },
  imgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  imgOverlayText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  imgIconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  imgEmptyText: { fontSize: 14, fontWeight: '600' },

  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 },
  input: {
    borderRadius: 13, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
  },
  textArea: { minHeight: 90, textAlignVertical: 'top' },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  chipEmoji: { fontSize: 13 },
  chipLabel: { fontSize: 13 },

  condChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 11, borderWidth: 1 },
  condChipText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },

  bannedCard: {
    borderRadius: 20, padding: 32,
    alignItems: 'center', borderWidth: 1,
    marginTop: 40,
  },
  bannedTitle: { fontSize: 20, fontWeight: '700', marginTop: 16 },
  bannedSub: { fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20 },
});