import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Animated, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { INTERESTS, INTEREST_CATEGORIES } from '../../../data/interests';
import { saveUserInterests } from '../../../services/onboarding';
import { useHaptics } from '../../../hooks/useHaptics';

const MIN_INTERESTS = 3;

interface Props {
  userId: string;
  onNext: () => void;
  onBack: () => void;
}

export function InterestsStep({ userId, onNext, onBack }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeCategory, setActiveCategory] = useState('All');
  const [loading, setLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const { selection, success } = useHaptics();

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, []);

  const categories = ['All', ...INTEREST_CATEGORIES];
  const filtered = activeCategory === 'All'
    ? INTERESTS
    : INTERESTS.filter(i => i.category === activeCategory);

  const toggle = (id: string) => {
    selection();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleNext = async () => {
    if (selected.size < MIN_INTERESTS) {
      Alert.alert('Pick more interests', `Select at least ${MIN_INTERESTS} interests to personalize your feed.`);
      return;
    }
    setLoading(true);
    try {
      const selectedInterests = INTERESTS
        .filter(i => selected.has(i.id))
        .map(i => i.label);
      await saveUserInterests(userId, selectedInterests);
      await success();
      onNext();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="rgba(255,255,255,0.6)" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepLabel}>Step 3 of 5</Text>
          <Text style={styles.title}>What are you into?</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={[styles.countText, selected.size >= MIN_INTERESTS && { color: '#818cf8' }]}>
            {selected.size}/{MIN_INTERESTS}+
          </Text>
        </View>
      </View>

      <Text style={styles.subtitle}>
        Pick at least {MIN_INTERESTS} interests to personalize your feed. Add as many as you like!
      </Text>

      {/* Category filter */}
      <ScrollView
        horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingBottom: 4 }}
        style={{ flexGrow: 0, marginBottom: 16 }}
      >
        {categories.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.catChip, activeCategory === cat && styles.catChipActive]}
            onPress={() => { setActiveCategory(cat); selection(); }}
          >
            <Text style={[styles.catChipText, activeCategory === cat && styles.catChipTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Interest grid */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.grid}
      >
        {filtered.map(interest => {
          const isSelected = selected.has(interest.id);
          return (
            <TouchableOpacity
              key={interest.id}
              style={[styles.interestCard, isSelected && styles.interestCardActive]}
              onPress={() => toggle(interest.id)}
              activeOpacity={0.75}
            >
              <Text style={styles.emoji}>{interest.emoji}</Text>
              <Text style={[styles.interestLabel, isSelected && styles.interestLabelActive]} numberOfLines={2}>
                {interest.label}
              </Text>
              {isSelected && (
                <View style={styles.checkmark}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={[styles.btn, selected.size < MIN_INTERESTS && styles.btnDisabled]}
          onPress={handleNext}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <>
              <Text style={styles.btnText}>
                {selected.size < MIN_INTERESTS
                  ? `Select ${MIN_INTERESTS - selected.size} more`
                  : `Continue with ${selected.size} interests`}
              </Text>
              {selected.size >= MIN_INTERESTS && <Ionicons name="arrow-forward" size={18} color="#fff" />}
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 4 },
  backBtn: { padding: 4, marginBottom: 2 },
  stepLabel: { fontSize: 11, color: '#4f46e5', fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 26, fontWeight: '800', color: '#fff', marginTop: 2 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: '#111', borderWidth: 1, borderColor: '#222', marginBottom: 2 },
  countText: { fontSize: 12, color: '#555', fontWeight: '700' },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.4)', paddingHorizontal: 24, marginBottom: 16, lineHeight: 18 },
  catChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#1e1e1e', backgroundColor: '#0d0d0d' },
  catChipActive: { backgroundColor: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.4)' },
  catChipText: { color: '#666', fontSize: 12, fontWeight: '600' },
  catChipTextActive: { color: '#818cf8' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, paddingBottom: 16 },
  interestCard: {
    width: '30%', aspectRatio: 1, backgroundColor: '#0d0d0d', borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1a1a1a',
    padding: 8, position: 'relative',
  },
  interestCardActive: { backgroundColor: 'rgba(99,102,241,0.15)', borderColor: 'rgba(99,102,241,0.5)' },
  emoji: { fontSize: 26, marginBottom: 6 },
  interestLabel: { fontSize: 11, color: '#666', textAlign: 'center', fontWeight: '500', lineHeight: 14 },
  interestLabelActive: { color: '#818cf8' },
  checkmark: { position: 'absolute', top: 6, right: 6, width: 16, height: 16, borderRadius: 8, backgroundColor: '#4f46e5', alignItems: 'center', justifyContent: 'center' },
  bottom: { paddingHorizontal: 24, paddingBottom: 32 },
  btn: { backgroundColor: '#4f46e5', borderRadius: 14, height: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnDisabled: { backgroundColor: '#1a1a2e' },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
