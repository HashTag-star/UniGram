import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Animated, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { INTERESTS, INTEREST_CATEGORIES } from '../../../data/interests';
import { saveUserInterests } from '../../../services/onboarding';
import { useHaptics } from '../../../hooks/useHaptics';
import { usePopup } from '../../../context/PopupContext';

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
  const { showPopup } = usePopup();
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
      showPopup({
        title: 'Pick more interests',
        message: `Select at least ${MIN_INTERESTS} interests to personalize your feed.`,
        icon: 'sparkles-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
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
      showPopup({
        title: 'Error',
        message: e.message ?? 'Failed to save interests',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
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
          <Text style={[styles.countText, selected.size >= MIN_INTERESTS && { color: '#a855f7' }]}>
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
        contentContainerStyle={{ paddingHorizontal: 28, gap: 12, paddingBottom: 4 }}
        style={{ flexGrow: 0, flexShrink: 0, marginBottom: 20 }}
        nestedScrollEnabled
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
        style={{ flex: 1 }}
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
                  <Ionicons name="checkmark" size={12} color="#fff" />
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
  container: { flex: 1, backgroundColor: '#09090b' },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, paddingHorizontal: 28, paddingTop: 16, paddingBottom: 8 },
  backBtn: { padding: 4, marginBottom: 2 },
  stepLabel: { fontSize: 12, color: '#8b5cf6', fontWeight: '800', letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontSize: 28, fontWeight: '900', color: '#fff', marginTop: 4, letterSpacing: -0.5 },
  countBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a', marginBottom: 2 },
  countText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: '700' },
  subtitle: { fontSize: 15, color: 'rgba(255,255,255,0.5)', paddingHorizontal: 28, marginBottom: 24, lineHeight: 22, marginTop: 4 },
  catChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, borderWidth: 1, borderColor: '#27272a', backgroundColor: '#18181b' },
  catChipActive: { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: '#8b5cf6' },
  catChipText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  catChipTextActive: { color: '#a855f7' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 22, gap: 14, paddingBottom: 24 },
  interestCard: {
    width: '30%', aspectRatio: 1, backgroundColor: '#18181b', borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#27272a',
    padding: 10, position: 'relative', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8
  },
  interestCardActive: { backgroundColor: 'rgba(139,92,246,0.15)', borderColor: 'rgba(139,92,246,0.6)' },
  emoji: { fontSize: 32, marginBottom: 8 },
  interestLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontWeight: '600', lineHeight: 16 },
  interestLabelActive: { color: '#c084fc' },
  checkmark: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: '#8b5cf6', alignItems: 'center', justifyContent: 'center', shadowColor: '#8b5cf6', shadowOffset: { width:0, height:2 }, shadowOpacity: 0.5, shadowRadius: 4 },
  bottom: { paddingHorizontal: 28, paddingBottom: 36, paddingTop: 10 },
  btn: { backgroundColor: '#8b5cf6', borderRadius: 20, height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: '#8b5cf6', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 12 },
  btnDisabled: { backgroundColor: '#27272a', shadowOpacity: 0, elevation: 0 },
  btnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
});
