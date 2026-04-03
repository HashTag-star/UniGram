import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, Alert, ActivityIndicator,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MarketSkeleton } from '../components/Skeleton';
import { Ionicons } from '@expo/vector-icons';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { getMarketItems, createMarketItem } from '../services/market';
import { createDirectConversation } from '../services/messages';
import { supabase } from '../lib/supabase';
import * as ImagePicker from 'expo-image-picker';

const { width } = Dimensions.get('window');
const CARD_W = (width - 36) / 2;

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
];

const conditionColor: Record<string, string> = {
  new: '#22c55e', like_new: '#3b82f6', good: '#f59e0b', fair: '#ef4444',
};

export const MarketScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [category, setCategory] = useState('all');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [currentUserId, setCurrentUserId] = useState('');
  const [showSellModal, setShowSellModal] = useState(false);

  // Sell form state
  const [sellTitle, setSellTitle] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellDesc, setSellDesc] = useState('');
  const [sellCat, setSellCat] = useState('books');
  const [sellCond, setSellCond] = useState('good');
  const [sellImageUri, setSellImageUri] = useState<string | undefined>();
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getMarketItems(category === 'all' ? undefined : category);
      setItems(data);
    } catch { } finally { setLoading(false); }
  }, [category]);

  useEffect(() => { load(); }, [load]);

  const toggleSave = (id: string) => setSaved(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaType.Images,
      allowsEditing: true, quality: 0.8,
    });
    if (!result.canceled && result.assets?.[0]) setSellImageUri(result.assets[0].uri);
  };

  const handlePost = async () => {
    if (!sellTitle.trim() || !sellPrice) {
      Alert.alert('Missing fields', 'Please fill in title and price.');
      return;
    }
    setPosting(true);
    try {
      await createMarketItem(currentUserId, {
        title: sellTitle.trim(),
        description: sellDesc.trim(),
        price: parseFloat(sellPrice),
        category: sellCat,
        condition: sellCond,
        imageUri: sellImageUri,
      });
      setShowSellModal(false);
      setSellTitle(''); setSellPrice(''); setSellDesc(''); setSellImageUri(undefined);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to post item.');
    } finally { setPosting(false); }
  };

  const handleMessage = async (sellerId: string) => {
    if (!currentUserId || sellerId === currentUserId) return;
    try {
      await createDirectConversation(currentUserId, sellerId);
      Alert.alert('Message started', 'Go to Messages to chat with the seller.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.title}>Campus Market</Text>
          <TouchableOpacity style={styles.sellBtn} onPress={() => setShowSellModal(true)}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.sellBtnText}>Sell</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}>
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

        {loading ? (
          <MarketSkeleton cardWidth={CARD_W} />
        ) : items.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60 }}>
            <Ionicons name="bag-outline" size={48} color="#333" />
            <Text style={{ color: '#555', marginTop: 12, fontSize: 15 }}>No items in this category yet</Text>
            <TouchableOpacity style={[styles.sellBtn, { marginTop: 16 }]} onPress={() => setShowSellModal(true)}>
              <Text style={styles.sellBtnText}>Be the first to sell!</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.grid}>
            {items.map(item => {
              const seller = item.profiles;
              return (
                <View key={item.id} style={[styles.card, { width: CARD_W }]}>
                  <View style={styles.imageWrap}>
                    {item.image_url
                      ? <Image source={{ uri: item.image_url }} style={styles.itemImage} />
                      : <View style={[styles.itemImage, { backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' }]}>
                          <Ionicons name="image-outline" size={32} color="#333" />
                        </View>
                    }
                    <TouchableOpacity style={styles.saveBtn} onPress={() => toggleSave(item.id)}>
                      <Ionicons name={saved.has(item.id) ? 'bookmark' : 'bookmark-outline'} size={18} color={saved.has(item.id) ? '#fbbf24' : '#fff'} />
                    </TouchableOpacity>
                    {item.condition && (
                      <View style={[styles.conditionBadge, { backgroundColor: (conditionColor[item.condition] ?? '#888') + '30', borderColor: (conditionColor[item.condition] ?? '#888') + '60' }]}>
                        <Text style={[styles.conditionText, { color: conditionColor[item.condition] ?? '#888' }]}>{item.condition.replace('_', ' ')}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.cardInfo}>
                    <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                    <Text style={styles.itemPrice}>${Number(item.price).toLocaleString()}</Text>
                    {item.description && <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>}
                    <View style={styles.sellerRow}>
                      {seller?.avatar_url
                        ? <Image source={{ uri: seller.avatar_url }} style={styles.sellerAvatar} />
                        : <View style={[styles.sellerAvatar, { backgroundColor: '#222' }]} />
                      }
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Text style={styles.sellerName}>{seller?.username ?? 'user'}</Text>
                          {seller?.is_verified && <VerifiedBadge type={seller.verification_type} size="sm" />}
                        </View>
                        <Text style={styles.postedAt}>{timeAgo(item.created_at)}</Text>
                      </View>
                    </View>
                    {seller?.id !== currentUserId && (
                      <TouchableOpacity style={styles.contactBtn} onPress={() => handleMessage(seller?.id)}>
                        <Ionicons name="chatbubble-outline" size={13} color="#fff" />
                        <Text style={styles.contactBtnText}>Message</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Sell Modal */}
      <Modal visible={showSellModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={styles.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowSellModal(false)}>
              <Text style={{ color: '#818cf8', fontSize: 15 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Listing</Text>
            <TouchableOpacity onPress={handlePost} disabled={posting}>
              {posting ? <ActivityIndicator color="#818cf8" /> : <Text style={{ color: '#818cf8', fontSize: 15, fontWeight: '700' }}>Post</Text>}
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
              {sellImageUri
                ? <Image source={{ uri: sellImageUri }} style={{ width: '100%', height: 180, borderRadius: 12 }} />
                : <View style={{ alignItems: 'center', gap: 8 }}>
                    <Ionicons name="camera-outline" size={32} color="#555" />
                    <Text style={{ color: '#555' }}>Add photo</Text>
                  </View>
              }
            </TouchableOpacity>
            {[
              { placeholder: 'Title', value: sellTitle, onChange: setSellTitle },
              { placeholder: 'Price (e.g. 25.00)', value: sellPrice, onChange: setSellPrice, keyboard: 'decimal-pad' as any },
              { placeholder: 'Description (optional)', value: sellDesc, onChange: setSellDesc },
            ].map(({ placeholder, value, onChange, keyboard }) => (
              <TextInput
                key={placeholder}
                style={styles.modalInput}
                placeholder={placeholder}
                placeholderTextColor="#555"
                value={value}
                onChangeText={onChange}
                keyboardType={keyboard}
              />
            ))}
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
            <Text style={styles.modalLabel}>Condition</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {['new', 'like_new', 'good', 'fair'].map(c => (
                <TouchableOpacity
                  key={c}
                  style={[styles.condBtn, sellCond === c && { borderColor: conditionColor[c], backgroundColor: conditionColor[c] + '20' }]}
                  onPress={() => setSellCond(c)}
                >
                  <Text style={[styles.condBtnText, sellCond === c && { color: conditionColor[c] }]}>{c.replace('_', ' ')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  sellBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  sellBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  catBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  catBtnActive: { backgroundColor: 'rgba(99,102,241,0.2)', borderColor: 'rgba(99,102,241,0.4)' },
  catEmoji: { fontSize: 14 },
  catLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500' },
  catLabelActive: { color: '#818cf8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 10, gap: 8, justifyContent: 'space-between' },
  card: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  imageWrap: { position: 'relative' },
  itemImage: { width: '100%', height: CARD_W, backgroundColor: '#111' },
  saveBtn: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 14, padding: 5 },
  conditionBadge: { position: 'absolute', bottom: 8, left: 8, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  conditionText: { fontSize: 9, fontWeight: 'bold', textTransform: 'capitalize' },
  cardInfo: { padding: 10 },
  itemTitle: { fontSize: 12, fontWeight: '600', color: '#fff', marginBottom: 4, lineHeight: 16 },
  itemPrice: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 3 },
  itemDesc: { fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 8 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sellerAvatar: { width: 22, height: 22, borderRadius: 11 },
  sellerName: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  postedAt: { fontSize: 9, color: 'rgba(255,255,255,0.3)' },
  contactBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingVertical: 7 },
  contactBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  modal: { flex: 1, backgroundColor: '#0a0a0a' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  imagePicker: { height: 180, backgroundColor: '#111', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#222', overflow: 'hidden' },
  modalInput: { backgroundColor: '#111', borderRadius: 12, borderWidth: 1, borderColor: '#222', paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 15 },
  modalLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  condBtn: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#333' },
  condBtnText: { color: '#888', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
});
