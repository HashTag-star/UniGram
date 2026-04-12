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
  FlatList,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  RefreshControl,
  Share,
} from 'react-native';
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
import { useTheme } from '../context/ThemeContext';
import { usePopup } from '../context/PopupContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width } = Dimensions.get('window');
const CARD_W = (width - 38) / 2;
const PAGE_SIZE = 20;
const MARKET_TTL = 3 * 60 * 1000; // 3 minutes

// Module-level memory cache (survives tab switches)
let _cachedItems: any[] = [];
let _cachedSavedIds: Set<string> = new Set();
let _lastLoaded = 0;

function clearMarketCache() {
  _cachedItems = [];
  _cachedSavedIds = new Set();
  _lastLoaded = 0;
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: '🛍️' },
  { id: 'books', label: 'Books', icon: '📚' },
  { id: 'gadgets', label: 'Gadgets', icon: '💻' },
  { id: 'housing', label: 'Housing', icon: '🏠' },
  { id: 'notes', label: 'Notes', icon: '📝' },
  { id: 'furniture', label: 'Furniture', icon: '🪑' },
  { id: 'clothing', label: 'Clothing', icon: '👕' },
  { id: 'services', label: 'Services', icon: '🔧' },
  { id: 'other', label: 'Other', icon: '📦' },
] as const;

const CONDITIONS = ['new', 'like_new', 'good', 'fair'] as const;
type Condition = typeof CONDITIONS[number];

const CONDITION_LABEL: Record<string, string> = {
  new: 'New',
  like_new: 'Like New',
  good: 'Good',
  fair: 'Fair',
};

const CONDITION_COLOR: Record<string, string> = {
  new: '#22c55e',
  like_new: '#3b82f6',
  good: '#f59e0b',
  fair: '#ef4444',
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
  return `$${Number(price).toLocaleString('en-US', {
    minimumFractionDigits: price % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

// ─── Condition Badge ──────────────────────────────────────────────────────────

const ConditionBadge: React.FC<{ condition: string; style?: object }> = ({
  condition,
  style,
}) => {
  const color = CONDITION_COLOR[condition] ?? '#888';
  return (
    <View
      style={[
        { backgroundColor: color + '30', borderColor: color + '60', borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
        style,
      ]}
    >
      <Text style={{ color, fontSize: 9, fontWeight: 'bold', textTransform: 'capitalize' }}>
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
  item,
  currentUserId,
  isSaved,
  isOwn = false,
  onToggleSave,
  onPress,
  onMarkSold,
  onDelete,
  onEdit,
}) => {
  const { colors } = useTheme();
  const seller = item.profiles;

  const handleSavePress = useCallback(() => {
    onToggleSave(item.id);
  }, [item.id, onToggleSave]);

  const handlePress = useCallback(() => {
    onPress(item);
  }, [item, onPress]);

  return (
    <TouchableOpacity
      style={[styles.card, { width: CARD_W, backgroundColor: colors.bg2, borderColor: colors.border }]}
      onPress={handlePress}
      activeOpacity={0.85}
    >
      {/* Image */}
      <View style={styles.imageWrap}>
        {item.image_url ? (
          <CachedImage uri={item.image_url} style={styles.itemImage} resizeMode="cover" />
        ) : (
          <View style={[styles.itemImage, styles.imagePlaceholder, { backgroundColor: colors.bg }]}>
            <Ionicons name="image-outline" size={32} color={colors.textMuted} />
          </View>
        )}

        {/* Sold overlay */}
        {item.is_sold && (
          <View style={styles.soldOverlay}>
            <Text style={styles.soldOverlayText}>SOLD</Text>
          </View>
        )}

        {/* Bookmark (hide on own items in Browse/Saved) */}
        {!isOwn && (
          <TouchableOpacity style={styles.bookmarkBtn} onPress={handleSavePress}>
            <Ionicons
              name={isSaved ? 'bookmark' : 'bookmark-outline'}
              size={17}
              color={isSaved ? '#fbbf24' : '#fff'}
            />
          </TouchableOpacity>
        )}

        {/* Condition badge */}
        {item.condition && (
          <ConditionBadge
            condition={item.condition}
            style={{ position: 'absolute', bottom: 8, left: 8 }}
          />
        )}
      </View>

      {/* Info */}
      <View style={styles.cardInfo}>
        <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={2}>
          {item.title}
        </Text>
        <Text style={[styles.itemPrice, { color: colors.text }]}>{formatPrice(item.price)}</Text>

        <View style={styles.sellerRow}>
          {seller?.avatar_url ? (
            <CachedImage uri={seller.avatar_url} style={styles.sellerAvatar} />
          ) : (
            <View style={[styles.sellerAvatar, { backgroundColor: colors.bg }]} />
          )}
          <Text style={[styles.sellerName, { color: colors.textSub }]} numberOfLines={1}>
            {seller?.username ?? 'user'}
          </Text>
          <Text style={[styles.dot, { color: colors.textMuted }]}>·</Text>
          <Text style={[styles.postedAt, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
        </View>

        {/* Owner actions */}
        {isOwn && (
          <View style={styles.ownerActions}>
            <TouchableOpacity
              style={styles.ownerActionBtn}
              onPress={() => onEdit?.(item)}
            >
              <Ionicons name="pencil-outline" size={12} color="#818cf8" />
              <Text style={[styles.ownerActionText, { color: '#818cf8' }]}>Edit</Text>
            </TouchableOpacity>

            {!item.is_sold && (
              <TouchableOpacity
                style={[styles.ownerActionBtn, { borderColor: '#22c55e40' }]}
                onPress={() => onMarkSold?.(item.id)}
              >
                <Ionicons name="checkmark-circle-outline" size={12} color="#22c55e" />
                <Text style={[styles.ownerActionText, { color: '#22c55e' }]}>Sold</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.ownerActionBtn, { borderColor: '#ef444440' }]}
              onPress={() => onDelete?.(item.id)}
            >
              <Ionicons name="trash-outline" size={12} color="#ef4444" />
              <Text style={[styles.ownerActionText, { color: '#ef4444' }]}>Del</Text>
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
  item,
  currentUserId,
  isSaved,
  onToggleSave,
  onClose,
  onSold,
  onDelete,
  onEdit,
  onMessage,
}) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isOwn = item.seller_id === currentUserId;
  const [marking, setMarking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { showPopup } = usePopup();
  const seller = item.profiles;

  useEffect(() => {
    incrementViewCount(item.id);
  }, [item.id]);

  const handleMarkSold = useCallback(async () => {
    setMarking(true);
    try {
      await markItemSold(item.id, currentUserId);
      onSold(item.id);
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Failed to mark the item as sold.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setMarking(false);
    }
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
              showPopup({
                title: 'Error',
                message: e.message ?? 'Failed to delete listing.',
                icon: 'alert-circle-outline',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
              setDeleting(false);
            }
          }
        }
      ]
    });
  }, [item.id, currentUserId, onDelete, showPopup]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        title: item.title,
        message: `Check out "${item.title}" for ${formatPrice(item.price)} on UniGram Campus Market!`,
      });
    } catch {
      // User cancelled or share failed
    }
  }, [item.title, item.price]);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[dtl.container, { paddingBottom: insets.bottom, backgroundColor: colors.bg }]}>
        {/* Hero Image */}
        <View style={dtl.heroWrap}>
          {item.image_url ? (
            <CachedImage uri={item.image_url} style={dtl.heroImage} resizeMode="cover" />
          ) : (
            <View style={[dtl.heroImage, dtl.heroPlaceholder]}>
              <Ionicons name="image-outline" size={56} color="#333" />
            </View>
          )}

          {/* Sold overlay */}
          {item.is_sold && (
            <View style={dtl.soldOverlay}>
              <Text style={dtl.soldText}>SOLD</Text>
            </View>
          )}

          {/* Overlay buttons row */}
          <View style={[dtl.overlayRow, { paddingTop: insets.top + 8 }]}>
            <TouchableOpacity style={dtl.overlayBtn} onPress={onClose}>
              <Ionicons name="close" size={20} color="#fff" />
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={dtl.overlayBtn} onPress={handleShare}>
                <Ionicons name="share-outline" size={20} color="#fff" />
              </TouchableOpacity>

              {!isOwn && (
                <TouchableOpacity
                  style={dtl.overlayBtn}
                  onPress={() => onToggleSave(item.id)}
                >
                  <Ionicons
                    name={isSaved ? 'bookmark' : 'bookmark-outline'}
                    size={20}
                    color={isSaved ? '#fbbf24' : '#fff'}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Condition badge on image */}
          {item.condition && (
            <ConditionBadge
              condition={item.condition}
              style={{ position: 'absolute', bottom: 14, left: 14 }}
            />
          )}
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Title + Price */}
          <View style={dtl.titleRow}>
            <Text style={[dtl.title, { color: colors.text }]} numberOfLines={3}>
              {item.title}
            </Text>
            <Text style={[dtl.price, { color: colors.text }]}>{formatPrice(item.price)}</Text>
          </View>

          {/* Meta row */}
          <View style={dtl.metaRow}>
            <View style={[dtl.catBadge, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
              <Text style={[dtl.catBadgeText, { color: colors.textSub }]}>
                {CATEGORIES.find(c => c.id === item.category)?.icon ?? '📦'}{' '}
                {item.category}
              </Text>
            </View>
            <Text style={[dtl.metaText, { color: colors.textMuted }]}>{timeAgo(item.created_at)}</Text>
            {item.views_count > 0 && (
              <>
                <Text style={[dtl.metaText, { color: colors.textMuted }]}>·</Text>
                <Ionicons name="eye-outline" size={13} color={colors.textMuted} />
                <Text style={[dtl.metaText, { color: colors.textMuted }]}>{item.views_count}</Text>
              </>
            )}
          </View>

          {/* Description */}
          {!!item.description && (
            <>
              <Text style={[dtl.sectionLabel, { color: colors.textMuted }]}>Description</Text>
              <Text style={[dtl.description, { color: colors.textSub }]}>{item.description}</Text>
            </>
          )}

          {/* Seller */}
          <Text style={[dtl.sectionLabel, { marginTop: 18, color: colors.textMuted }]}>Seller</Text>
          <View style={[dtl.sellerCard, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
            {seller?.avatar_url ? (
              <CachedImage uri={seller.avatar_url} style={dtl.sellerAvatar} />
            ) : (
              <View style={[dtl.sellerAvatar, dtl.sellerAvatarFallback, { backgroundColor: colors.bg }]}>
                <Ionicons name="person" size={20} color={colors.textMuted} />
              </View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[dtl.sellerName, { color: colors.text }]}>
                  {seller?.full_name ?? seller?.username ?? 'Unknown'}
                </Text>
                {seller?.is_verified && (
                  <VerifiedBadge type={seller.verification_type as any} size="sm" />
                )}
              </View>
              <Text style={[dtl.sellerMeta, { color: colors.textMuted }]}>
                @{seller?.username}
                {seller?.university ? ` · ${seller.university}` : ''}
              </Text>
            </View>
          </View>

          {/* CTA — non-owner */}
          {!isOwn && !item.is_sold && (
            <TouchableOpacity
              style={dtl.primaryBtn}
              onPress={() => onMessage(seller?.id ?? item.seller_id)}
            >
              <Ionicons name="chatbubble-outline" size={18} color="#fff" />
              <Text style={dtl.primaryBtnText}>Message Seller</Text>
            </TouchableOpacity>
          )}

          {/* CTA — owner */}
          {isOwn && (
            <View style={{ gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={[dtl.primaryBtn, { backgroundColor: '#1e1b4b', borderWidth: 1, borderColor: '#4f46e5' }]}
                onPress={() => { onClose(); onEdit(item); }}
              >
                <Ionicons name="pencil-outline" size={18} color="#818cf8" />
                <Text style={[dtl.primaryBtnText, { color: '#818cf8' }]}>Edit Listing</Text>
              </TouchableOpacity>

              {!item.is_sold && (
                <TouchableOpacity
                  style={[dtl.primaryBtn, { backgroundColor: '#052e16', borderWidth: 1, borderColor: '#22c55e' }]}
                  onPress={handleMarkSold}
                  disabled={marking}
                >
                  {marking ? (
                    <ActivityIndicator size="small" color="#22c55e" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#22c55e" />
                      <Text style={[dtl.primaryBtnText, { color: '#22c55e' }]}>Mark as Sold</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[dtl.primaryBtn, { backgroundColor: '#450a0a', borderWidth: 1, borderColor: '#ef4444' }]}
                onPress={handleDelete}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#ef4444" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    <Text style={[dtl.primaryBtnText, { color: '#ef4444' }]}>Delete Listing</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
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
  visible,
  currentUserId,
  editItem,
  onClose,
  onPosted,
  onUpdated,
  isSuspended: propIsSuspended,
}) => {
  const { colors } = useTheme();
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
    if (propIsSuspended !== undefined) {
      setIsSuspended(propIsSuspended);
    }
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

  // Pre-fill when editing
  useEffect(() => {
    if (editItem) {
      setTitle(editItem.title ?? '');
      setPrice(String(editItem.price ?? ''));
      setDescription(editItem.description ?? '');
      setCategory(editItem.category ?? 'books');
      setCondition((editItem.condition as Condition) ?? 'good');
      setImageUri(editItem.image_url ?? null);
    } else {
      setTitle('');
      setPrice('');
      setDescription('');
      setCategory('books');
      setCondition('good');
      setImageUri(null);
    }
  }, [editItem, visible]);

  const pickImage = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      showPopup({
        title: 'Permission needed',
        message: 'Allow photo access to add images to your listing.',
        icon: 'image-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmedTitle = title.trim();
    const parsedPrice = parseFloat(price);

    if (!trimmedTitle) {
      showPopup({
        title: 'Missing title',
        message: 'Please enter a title for your listing.',
        icon: 'text-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }
    if (!price || isNaN(parsedPrice) || parsedPrice < 0) {
      showPopup({
        title: 'Invalid price',
        message: 'Please enter a valid price for your listing.',
        icon: 'cash-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
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
        };
        const updated = await updateMarketItem(editItem.id, currentUserId, updates);
        onUpdated(updated);
      } else {
        const item = await createMarketItem(currentUserId, {
          title: trimmedTitle,
          description: description.trim(),
          price: parsedPrice,
          category,
          condition,
          imageUris: imageUri ? [imageUri] : [],
        });
        onPosted(item);
      }
    } catch (e: any) {
      showPopup({
        title: 'Error',
        message: e.message ?? 'Something went wrong. Please try again.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setSubmitting(false);
    }
  }, [
    title, price, description, category, condition, imageUri,
    isEdit, editItem, currentUserId, onPosted, onUpdated,
  ]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={[sell.container, { backgroundColor: colors.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={[sell.header, { backgroundColor: colors.bg, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={handleClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={sell.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[sell.headerTitle, { color: colors.text }]}>
            {isEdit ? 'Edit Listing' : 'New Listing'}
          </Text>
          <TouchableOpacity onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={sell.postText}>
                {isEdit ? 'Update' : 'Post'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={sell.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {(isBanned || isSuspended) ? (
            <View style={sell.bannedCard}>
              <Ionicons name="alert-circle" size={42} color="#ef4444" />
              <Text style={sell.bannedTitle}>{isBanned ? 'Market Banned' : 'Market Restricted'}</Text>
              <Text style={sell.bannedSub}>
                {isBanned 
                  ? 'Your account is permanently banned from creating marketplace listings due to community policy violations.'
                  : 'Your account is temporarily restricted from creating marketplace listings due to community policy violations. You can still browse and message sellers.'}
              </Text>
            </View>
          ) : (
            <>
              {/* Image picker */}
              <TouchableOpacity style={sell.imagePicker} onPress={pickImage} activeOpacity={0.75}>
                {imageUri ? (
                  <>
                    <Image source={{ uri: imageUri }} style={sell.imagePreview as any} resizeMode="cover" />
                    <View style={sell.imageChangeOverlay}>
                      <Ionicons name="camera" size={22} color="#fff" />
                      <Text style={sell.imageChangeText}>Change</Text>
                    </View>
                  </>
                ) : (
                  <View style={[sell.imageEmpty, { backgroundColor: colors.bg2 }]}>
                    <Ionicons name="camera-outline" size={36} color={colors.textMuted} />
                    <Text style={[sell.imageEmptyText, { color: colors.textMuted }]}>Tap to add photo</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Title */}
              <TextInput
                style={[sell.input, { backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]}
                placeholder="Title *"
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={setTitle}
                maxLength={120}
                returnKeyType="next"
              />

              {/* Price */}
              <TextInput
                style={[sell.input, { backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]}
                placeholder="Price (e.g. 25.00) *"
                placeholderTextColor={colors.textMuted}
                value={price}
                onChangeText={setPrice}
                keyboardType="decimal-pad"
              />

              {/* Description */}
              <TextInput
                style={[sell.input, sell.textArea, { backgroundColor: colors.bg2, borderColor: colors.border, color: colors.text }]}
                placeholder="Description (optional)"
                placeholderTextColor={colors.textMuted}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                maxLength={1000}
              />

              {/* Category */}
              <Text style={[sell.sectionLabel, { color: colors.textMuted }]}>Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingVertical: 4 }}
              >
                {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[sell.chip, { backgroundColor: category === cat.id ? colors.accent + '20' : colors.bg2, borderColor: category === cat.id ? colors.accent : colors.border }, category === cat.id && sell.chipActive]}
                    onPress={() => setCategory(cat.id)}
                  >
                    <Text style={sell.chipEmoji}>{cat.icon}</Text>
                    <Text style={[sell.chipLabel, { color: category === cat.id ? colors.accent : colors.textMuted }, category === cat.id && sell.chipLabelActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Condition */}
              <Text style={[sell.sectionLabel, { color: colors.textMuted }]}>Condition</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {CONDITIONS.map(c => {
                  const color = CONDITION_COLOR[c];
                  const active = condition === c;
                  return (
                    <TouchableOpacity
                      key={c}
                      style={[
                        sell.condChip,
                        { 
                          backgroundColor: active ? color + '20' : colors.bg2, 
                          borderColor: active ? color : colors.border,
                          flex: 1,
                          minWidth: '45%',
                          alignItems: 'center'
                        }
                      ]}
                      onPress={() => setCondition(c)}
                    >
                      <Text style={[sell.condChipText, { color: active ? color : colors.textSub }]}>
                        {CONDITION_LABEL[c]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

interface MarketScreenProps {
  onMessagePress?: (convId: string, otherProfile: any) => void;
  isVisible?: boolean;
  isSuspended?: boolean;
}

export const MarketScreen: React.FC<MarketScreenProps> = ({ onMessagePress, isVisible, isSuspended }) => {
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const insets = useSafeAreaInsets();

  // Auth
  const [currentUserId, setCurrentUserId] = useState('');

  // Navigation
  const [activeTab, setActiveTab] = useState<Tab>('browse');

  // Filters
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Browse data (initialize from module cache for instant display)
  const [browseItems, setBrowseItems] = useState<MarketItem[]>(_cachedItems);
  const [browseOffset, setBrowseOffset] = useState(_cachedItems.length || 0);
  const [browseHasMore, setBrowseHasMore] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(_cachedItems.length === 0);

  // Saved data
  const [savedItems, setSavedItems] = useState<MarketItem[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);

  // My Listings data
  const [myItems, setMyItems] = useState<MarketItem[]>([]);
  const [myLoading, setMyLoading] = useState(false);

  // Saved IDs for optimistic bookmark state
  const [savedIds, setSavedIds] = useState<Set<string>>(_cachedSavedIds);

  // UI state
  const [refreshing, setRefreshing] = useState(false);
  const [showSell, setShowSell] = useState(false);
  const [editItem, setEditItem] = useState<MarketItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<MarketItem | null>(null);

  // ── Auth init ──
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clearMarketCache();
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Debounced search ──
  const handleSearchChange = useCallback((q: string) => {
    setSearch(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(q);
    }, 400);
  }, []);

  // ── Load browse items (first page or refresh) ──
  const loadBrowse = useCallback(
    async (hard = false) => {
      if (!currentUserId) return;
      setBrowseLoading(true);
      try {
        const cat = category === 'all' ? undefined : category;
        const data = await getMarketItems(cat, debouncedSearch, PAGE_SIZE, 0);
        setBrowseItems(data);
        setBrowseOffset(data.length);
        setBrowseHasMore(data.length === PAGE_SIZE);
        _cachedItems = data;
        _lastLoaded = Date.now();
        if (hard) {
          const savedData = await getSavedItemIds(currentUserId);
          const savedSet = new Set<string>(savedData);
          setSavedIds(savedSet);
          _cachedSavedIds = savedSet;
        }
      } catch (e) {
        console.error('loadBrowse', e);
      } finally {
        setBrowseLoading(false);
        setRefreshing(false);
      }
    },
    [currentUserId, category, debouncedSearch],
  );

  // ── Load next page ──
  const loadMoreBrowse = useCallback(async () => {
    if (!currentUserId || browseLoading || !browseHasMore) return;
    setBrowseLoading(true);
    try {
      const cat = category === 'all' ? undefined : category;
      const data = await getMarketItems(cat, debouncedSearch, PAGE_SIZE, browseOffset);
      setBrowseItems(prev => [...prev, ...data]);
      setBrowseOffset(prev => prev + data.length);
      setBrowseHasMore(data.length === PAGE_SIZE);
    } catch (e) {
      console.error('loadMoreBrowse', e);
    } finally {
      setBrowseLoading(false);
    }
  }, [currentUserId, browseLoading, browseHasMore, browseOffset, category, debouncedSearch]);

  // ── Load saved tab ──
  const loadSaved = useCallback(async () => {
    if (!currentUserId) return;
    setSavedLoading(true);
    try {
      const data = await getSavedItems(currentUserId);
      setSavedItems(data);
    } catch (e) {
      console.error('loadSaved', e);
    } finally {
      setSavedLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId]);

  // ── Load my listings tab ──
  const loadMine = useCallback(async () => {
    if (!currentUserId) return;
    setMyLoading(true);
    try {
      const data = await getMyListings(currentUserId);
      setMyItems(data);
    } catch (e) {
      console.error('loadMine', e);
    } finally {
      setMyLoading(false);
      setRefreshing(false);
    }
  }, [currentUserId]);

  // ── Initial load ──
  useEffect(() => {
    if (!currentUserId) return;
    // If we have fresh cache, skip the spinner and just background-refresh
    if (_cachedItems.length > 0 && Date.now() - _lastLoaded < MARKET_TTL) {
      setBrowseLoading(false);
      return;
    }
    loadBrowse(true);
    loadSaved();
    loadMine();
  }, [currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Visibility-based background refresh ──
  useEffect(() => {
    if (isVisible && currentUserId && _lastLoaded > 0) {
      const stale = Date.now() - _lastLoaded > MARKET_TTL;
      if (stale) loadBrowse(true);
    }
  }, [isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload browse when filters change ──
  useEffect(() => {
    if (!currentUserId) return;
    loadBrowse(false);
  }, [category, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Pull-to-refresh ──
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (activeTab === 'browse') loadBrowse(true);
    else if (activeTab === 'saved') loadSaved();
    else loadMine();
  }, [activeTab, loadBrowse, loadSaved, loadMine]);

  // ── Toggle save (optimistic + DB) ──
  const handleToggleSave = useCallback(
    async (itemId: string) => {
      if (!currentUserId) return;
      const wasSaved = savedIds.has(itemId);

      // Optimistic update
      setSavedIds(prev => {
        const next = new Set(prev);
        wasSaved ? next.delete(itemId) : next.add(itemId);
        return next;
      });

      // Update saved items list optimistically
      if (wasSaved) {
        setSavedItems(prev => prev.filter(i => i.id !== itemId));
      }

      try {
        await toggleSaveItem(currentUserId, itemId);
        // If we saved a new item, reload saved list so it appears
        if (!wasSaved) {
          loadSaved();
        }
      } catch (e) {
        // Rollback
        setSavedIds(prev => {
          const next = new Set(prev);
          wasSaved ? next.add(itemId) : next.delete(itemId);
          return next;
        });
      }
    },
    [currentUserId, savedIds, loadSaved],
  );

  // ── Message seller ──
  const handleMessage = useCallback(
    async (sellerId: string) => {
      if (!currentUserId || sellerId === currentUserId) return;
      try {
        const convId = await createDirectConversation(currentUserId, sellerId);
        // We need the seller's profile. MarketItem has seller_id but maybe not full profile?
        // Let's assume we can fetch it or just pass name if available.
        // Looking at getMarketItems, it usually includes seller details.
        const item = browseItems.find(i => i.seller_id === sellerId) || 
                     savedItems.find(i => i.seller_id === sellerId) ||
                     myItems.find(i => i.seller_id === sellerId);
        
        const sellerProfile = {
          id: sellerId,
          full_name: item?.profiles?.full_name ?? 'Seller',
          username: item?.profiles?.username ?? 'seller',
          avatar_url: item?.profiles?.avatar_url,
          is_verified: item?.profiles?.is_verified ?? false,
        };
        onMessagePress?.(convId, sellerProfile);
      } catch (e: any) {
        showPopup({
          title: 'Connection Failed',
          message: e.message ?? 'Could not start a conversation with the seller.',
          icon: 'chatbubble-ellipses-outline',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
      }
    },
    [currentUserId, onMessagePress, browseItems, savedItems, myItems],
  );

  // ── Mark sold handlers ──
  const handleSoldFromDetail = useCallback((id: string) => {
    const update = (item: MarketItem) =>
      item.id === id ? { ...item, is_sold: true } : item;
    setMyItems(prev => prev.map(update));
    setBrowseItems(prev => prev.map(update));
    setSavedItems(prev => prev.map(update));
    setSelectedItem(prev => (prev?.id === id ? { ...prev, is_sold: true } : prev));
  }, []);

  const handleSoldFromCard = useCallback(
    async (itemId: string) => {
      try {
        await markItemSold(itemId, currentUserId);
        handleSoldFromDetail(itemId);
      } catch (e: any) {
        showPopup({
          title: 'Update Failed',
          message: e.message ?? 'Could not mark the item as sold.',
          icon: 'alert-circle-outline',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
      }
    },
    [currentUserId, handleSoldFromDetail, showPopup],
  );

  // ── Delete handlers ──
  const handleDeleteFromDetail = useCallback((id: string) => {
    setMyItems(prev => prev.filter(i => i.id !== id));
    setBrowseItems(prev => prev.filter(i => i.id !== id));
    setSavedItems(prev => prev.filter(i => i.id !== id));
    setSelectedItem(null);
  }, []);

  const handleDeleteFromCard = useCallback(
    (itemId: string) => {
      showPopup({
        title: 'Delete Listing',
        message: 'Remove this listing permanently from the campus market?',
        icon: 'trash-outline',
        iconColor: '#ef4444',
        buttons: [
          { text: 'Cancel', style: 'cancel', onPress: () => {} },
          { 
            text: 'Delete', 
            style: 'destructive', 
            onPress: async () => {
              try {
                await deleteMarketItem(itemId, currentUserId);
                handleDeleteFromDetail(itemId);
              } catch (e: any) {
                showPopup({
                  title: 'Error',
                  message: e.message ?? 'Failed to delete listing.',
                  icon: 'alert-circle-outline',
                  buttons: [{ text: 'OK', onPress: () => {} }]
                });
              }
            }
          }
        ]
      });
    },
    [currentUserId, handleDeleteFromDetail, showPopup],
  );

  // ── Edit ──
  const handleOpenEdit = useCallback((item: MarketItem) => {
    setSelectedItem(null);
    setEditItem(item);
    setShowSell(true);
  }, []);

  const handleUpdated = useCallback((updated: MarketItem) => {
    const replace = (item: MarketItem) => (item.id === updated.id ? updated : item);
    setMyItems(prev => prev.map(replace));
    setBrowseItems(prev => prev.map(replace));
    setSavedItems(prev => prev.map(replace));
    setEditItem(null);
    setShowSell(false);
  }, []);

  // ── New listing posted ──
  const handlePosted = useCallback((item: MarketItem) => {
    setShowSell(false);
    setEditItem(null);
    setBrowseItems(prev => [item, ...prev]);
    setMyItems(prev => [item, ...prev]);
    setActiveTab('mine');
  }, []);

  // ── Close sell modal ──
  const handleCloseSell = useCallback(() => {
    setShowSell(false);
    setEditItem(null);
  }, []);

  // ── Card press ──
  const handleCardPress = useCallback((item: MarketItem) => {
    setSelectedItem(item);
  }, []);

  // ── Render card ──
  const renderBrowseCard = useCallback(
    ({ item }: { item: MarketItem }) => (
      <ItemCard
        item={item}
        currentUserId={currentUserId}
        isSaved={savedIds.has(item.id)}
        onToggleSave={handleToggleSave}
        onPress={handleCardPress}
      />
    ),
    [currentUserId, savedIds, handleToggleSave, handleCardPress],
  );

  const renderSavedCard = useCallback(
    ({ item }: { item: MarketItem }) => (
      <ItemCard
        item={item}
        currentUserId={currentUserId}
        isSaved={true}
        onToggleSave={handleToggleSave}
        onPress={handleCardPress}
      />
    ),
    [currentUserId, handleToggleSave, handleCardPress],
  );

  const renderMyCard = useCallback(
    ({ item }: { item: MarketItem }) => (
      <ItemCard
        item={item}
        currentUserId={currentUserId}
        isSaved={savedIds.has(item.id)}
        isOwn
        onToggleSave={handleToggleSave}
        onPress={handleCardPress}
        onMarkSold={handleSoldFromCard}
        onDelete={handleDeleteFromCard}
        onEdit={handleOpenEdit}
      />
    ),
    [currentUserId, savedIds, handleToggleSave, handleCardPress, handleSoldFromCard, handleDeleteFromCard, handleOpenEdit],
  );

  // ── Loading state (initial) ──
  const isInitialLoading =
    (activeTab === 'browse' && browseLoading && browseItems.length === 0) ||
    (activeTab === 'saved' && savedLoading && savedItems.length === 0) ||
    (activeTab === 'mine' && myLoading && myItems.length === 0);

  const CARD_WIDTH = (width - 28) / 2;

  // ── Active data + renderer ──
  const activeData =
    activeTab === 'browse' ? browseItems
    : activeTab === 'saved' ? savedItems
    : myItems;

  const activeRenderer =
    activeTab === 'browse' ? renderBrowseCard
    : activeTab === 'saved' ? renderSavedCard
    : renderMyCard;

  const emptyMessage =
    activeTab === 'saved'
      ? 'Nothing saved yet — bookmark items to find them here'
      : activeTab === 'mine'
      ? "You haven't listed anything yet"
      : 'No items found';

  const emptyIcon =
    activeTab === 'saved' ? 'bookmark-outline'
    : activeTab === 'mine' ? 'storefront-outline'
    : 'bag-outline';

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top, backgroundColor: colors.bg }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Campus Market</Text>
        <TouchableOpacity
          style={styles.sellBtn}
          onPress={() => { 
            if (isSuspended) {
              showPopup({
                title: 'Account Restricted',
                message: 'Your account is currently restricted and cannot create new marketplace listings.',
                icon: 'lock-closed-outline',
                iconColor: '#ef4444',
                buttons: [{ text: 'OK', onPress: () => {} }]
              });
              return;
            }
            setEditItem(null); 
            setShowSell(true); 
          }}
        >
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={styles.sellBtnText}>Sell</Text>
        </TouchableOpacity>
      </View>

      {/* ── Tab bar ── */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(
          [
            { id: 'browse', label: 'Browse', icon: 'storefront-outline' },
            { id: 'saved', label: 'Saved', icon: 'bookmark-outline' },
            { id: 'mine', label: 'My Listings', icon: 'person-outline' },
          ] as const
        ).map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tabBtn, { backgroundColor: activeTab === tab.id ? colors.accent + '20' : colors.bg2, borderColor: activeTab === tab.id ? colors.accent : colors.border }, activeTab === tab.id && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons
              name={tab.icon}
              size={14}
              color={activeTab === tab.id ? colors.accent : colors.textMuted}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === tab.id ? colors.accent : colors.textMuted },
                activeTab === tab.id && styles.tabLabelActive,
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Category chips (Browse only) ── */}
      {activeTab === 'browse' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryScroll}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}
        >
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.chip, { backgroundColor: category === cat.id ? colors.accent + '20' : colors.bg2, borderColor: category === cat.id ? colors.accent : colors.border }, category === cat.id && styles.chipActive]}
              onPress={() => setCategory(cat.id)}
            >
              <Text style={styles.chipEmoji}>{cat.icon}</Text>
              <Text style={[styles.chipLabel, { color: category === cat.id ? colors.accent : colors.textMuted }, category === cat.id && styles.chipLabelActive]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* ── Search bar (Browse only) ── */}
      {activeTab === 'browse' && (
        <View style={[styles.searchBar, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search title or description…"
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Content ── */}
      {isInitialLoading ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.listContent}>
          <MarketSkeleton cardWidth={CARD_WIDTH} />
          <MarketSkeleton cardWidth={CARD_WIDTH} />
        </ScrollView>
      ) : (
        <FlatList
          key={activeTab}
          data={activeData}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          windowSize={5}
          maxToRenderPerBatch={6}
          initialNumToRender={6}
          removeClippedSubviews={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#6366f1"
              colors={['#6366f1']}
            />
          }
          renderItem={activeRenderer}
          onEndReached={activeTab === 'browse' ? loadMoreBrowse : undefined}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            activeTab === 'browse' && browseLoading && browseItems.length > 0 ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator color="#6366f1" />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name={emptyIcon} size={52} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textSub }]}>{emptyMessage}</Text>
              {(activeTab === 'browse' || activeTab === 'mine') && (
                <TouchableOpacity
                  style={[styles.sellBtn, { marginTop: 20 }]}
                  onPress={() => { 
                    if (isSuspended) {
                      showPopup({
                        title: 'Account Restricted',
                        message: 'Your account is currently restricted and cannot create new marketplace listings.',
                        icon: 'lock-closed-outline',
                        iconColor: '#ef4444',
                        buttons: [{ text: 'OK', onPress: () => {} }]
                      });
                      return;
                    }
                    setEditItem(null); 
                    setShowSell(true); 
                  }}
                >
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.sellBtnText}>
                    {activeTab === 'mine' ? 'Create Listing' : 'Be first to sell'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* ── Sell / Edit Modal ── */}
      <SellModal
        visible={showSell}
        currentUserId={currentUserId}
        editItem={editItem}
        onClose={handleCloseSell}
        onPosted={handlePosted}
        onUpdated={handleUpdated}
        isSuspended={isSuspended}
      />

      {/* ── Item Detail Modal ── */}
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
          onMessage={sellerId => {
            setSelectedItem(null);
            handleMessage(sellerId);
          }}
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: -0.3,
  },
  sellBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#4f46e5',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  sellBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  // Tabs
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: 10,
    gap: 8,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabBtnActive: {
    backgroundColor: 'rgba(99,102,241,0.18)',
    borderColor: 'rgba(99,102,241,0.4)',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#818cf8',
    fontWeight: '700',
  },

  // Category scroll
  categoryScroll: {
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipActive: {
    backgroundColor: 'rgba(99,102,241,0.18)',
    borderColor: 'rgba(99,102,241,0.4)',
  },
  chipEmoji: {
    fontSize: 13,
  },
  chipLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  chipLabelActive: {
    color: '#818cf8',
    fontWeight: '600',
  },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },

  // List
  columnWrapper: {
    gap: 8,
    paddingHorizontal: 11,
  },
  listContent: {
    paddingBottom: 110,
    paddingTop: 4,
    gap: 8,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 22,
  },

  // Card
  card: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  imageWrap: {
    position: 'relative',
  },
  itemImage: {
    width: '100%',
    height: CARD_W,
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOverlayText: {
    color: '#ef4444',
    fontWeight: 'bold',
    fontSize: 16,
    letterSpacing: 3,
  },
  bookmarkBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
    padding: 5,
  },
  cardInfo: {
    padding: 10,
  },
  itemTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    lineHeight: 16,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sellerAvatar: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  sellerName: {
    fontSize: 10,
    fontWeight: '600',
    flex: 1,
  },
  dot: {
    fontSize: 10,
  },
  postedAt: {
    fontSize: 9,
  },

  // Owner actions row inside card
  ownerActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  ownerActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#818cf840',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  ownerActionText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#818cf8',
  },
});

// Detail Modal Styles
const dtl = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  heroWrap: {
    position: 'relative',
  },
  heroImage: {
    width,
    height: width * 0.78,
    backgroundColor: '#111',
  },
  heroPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldText: {
    color: '#ef4444',
    fontSize: 28,
    fontWeight: 'bold',
    letterSpacing: 4,
  },
  overlayRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
  },
  overlayBtn: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20,
    padding: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    lineHeight: 28,
  },
  price: {
    fontSize: 22,
    fontWeight: 'bold',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  catBadge: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  catBadgeText: {
    fontSize: 12,
    textTransform: 'capitalize',
  },
  metaText: {
    fontSize: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 4,
  },
  sellerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  sellerAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  sellerAvatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerName: {
    fontSize: 15,
    fontWeight: '700',
  },
  sellerMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#4f46e5',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 14,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});

// Sell Modal Styles
const sell = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cancelText: {
    color: '#818cf8',
    fontSize: 15,
  },
  postText: {
    color: '#818cf8',
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    padding: 16,
    gap: 14,
    paddingBottom: 60,
  },

  // Image picker
  imagePicker: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
  },
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  imageChangeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  imageChangeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  imageEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  imageEmptyText: {
    color: '#444',
    fontSize: 13,
  },

  // Inputs
  input: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
  },
  textArea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: -2,
  },

  // Chips (category)
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: {
    backgroundColor: 'rgba(99,102,241,0.18)',
    borderColor: '#4f46e5',
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  chipLabelActive: {
    color: '#818cf8',
    fontWeight: '700',
  },

  // Condition chips
  condChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  condChipText: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  bannedCard: { 
    backgroundColor: 'rgba(239, 68, 68, 0.05)', 
    borderRadius: 20, 
    padding: 32, 
    alignItems: 'center', 
    borderColor: 'rgba(239, 68, 68, 0.15)', 
    borderWidth: 1, 
    marginTop: 40,
    marginHorizontal: 16
  },
  bannedTitle: { fontSize: 20, fontWeight: 'bold', marginTop: 16 },
  bannedSub: { fontSize: 14, textAlign: 'center', marginTop: 10, lineHeight: 20 },
});
