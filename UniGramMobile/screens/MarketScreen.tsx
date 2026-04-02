import React, { useState } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, Dimensions, FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MOCK_MARKET } from '../data/mockData';
import { MarketItem } from '../data/types';
import { VerifiedBadge } from '../components/VerifiedBadge';

const { width } = Dimensions.get('window');
const CARD_W = (width - 36) / 2;

type Category = 'all' | 'books' | 'gadgets' | 'housing' | 'notes' | 'furniture' | 'clothing';

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: 'all', label: 'All', icon: '🛍️' },
  { id: 'books', label: 'Books', icon: '📚' },
  { id: 'gadgets', label: 'Gadgets', icon: '💻' },
  { id: 'housing', label: 'Housing', icon: '🏠' },
  { id: 'notes', label: 'Notes', icon: '📝' },
  { id: 'furniture', label: 'Furniture', icon: '🪑' },
  { id: 'clothing', label: 'Clothing', icon: '👕' },
];

const conditionColor: Record<string, string> = {
  new: '#22c55e',
  'like-new': '#3b82f6',
  good: '#f59e0b',
  fair: '#ef4444',
};

export const MarketScreen: React.FC = () => {
  const [category, setCategory] = useState<Category>('all');
  const [saved, setSaved] = useState<Set<string>>(new Set());

  const filtered = category === 'all' ? MOCK_MARKET : MOCK_MARKET.filter(m => m.category === category);

  const toggleSave = (id: string) => setSaved(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 80 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Campus Market</Text>
          <TouchableOpacity style={styles.sellBtn}>
            <Ionicons name="add" size={16} color="#fff" />
            <Text style={styles.sellBtnText}>Sell</Text>
          </TouchableOpacity>
        </View>

        {/* Categories */}
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

        {/* Items grid */}
        <View style={styles.grid}>
          {filtered.map(item => (
            <View key={item.id} style={[styles.card, { width: CARD_W }]}>
              <View style={styles.imageWrap}>
                <Image source={{ uri: item.image }} style={styles.itemImage} />
                <TouchableOpacity style={styles.saveBtn} onPress={() => toggleSave(item.id)}>
                  <Ionicons name={saved.has(item.id) ? 'bookmark' : 'bookmark-outline'} size={18} color={saved.has(item.id) ? '#fbbf24' : '#fff'} />
                </TouchableOpacity>
                {item.condition && (
                  <View style={[styles.conditionBadge, { backgroundColor: conditionColor[item.condition] + '30', borderColor: conditionColor[item.condition] + '60' }]}>
                    <Text style={[styles.conditionText, { color: conditionColor[item.condition] }]}>{item.condition}</Text>
                  </View>
                )}
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.itemPrice}>${item.price.toLocaleString()}</Text>
                {item.description && <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>}
                <View style={styles.sellerRow}>
                  <Image source={{ uri: item.seller.avatar }} style={styles.sellerAvatar} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={styles.sellerName}>{item.seller.username}</Text>
                      {item.seller.verified && <VerifiedBadge type={item.seller.verificationType} size="sm" />}
                    </View>
                    <Text style={styles.postedAt}>{item.postedAt}</Text>
                  </View>
                </View>
                <TouchableOpacity style={styles.contactBtn}>
                  <Ionicons name="chatbubble-outline" size={13} color="#fff" />
                  <Text style={styles.contactBtnText}>Message</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 },
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
});
