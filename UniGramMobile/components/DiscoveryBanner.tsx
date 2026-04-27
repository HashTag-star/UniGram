import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';

interface Props {
  university: string;
  followCount: number;
  onFindPeople: () => void;
}

const MAX_FOLLOWS_FOR_DISCOVERY = 5;

export function DiscoveryBanner({ university, followCount, onFindPeople }: Props) {
  const { colors } = useTheme();
  if (followCount >= MAX_FOLLOWS_FOR_DISCOVERY) return null;

  const remaining = MAX_FOLLOWS_FOR_DISCOVERY - followCount;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
      <View style={styles.top}>
        <View style={[styles.iconWrap, { backgroundColor: '#4F46E510' }]}>
          <Ionicons name="school-outline" size={18} color="#818CF8" />
        </View>
        <View style={styles.textWrap}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            Welcome to {university || 'your campus'}
          </Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>
            {followCount === 0
              ? 'Your feed fills up as you connect with classmates'
              : `Follow ${remaining} more ${remaining === 1 ? 'person' : 'people'} to personalise your feed`}
          </Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
        <View
          style={[
            styles.progressFill,
            { width: `${(followCount / MAX_FOLLOWS_FOR_DISCOVERY) * 100}%` },
          ]}
        />
      </View>
      <Text style={[styles.progressLabel, { color: colors.textMuted }]}>
        {followCount} / {MAX_FOLLOWS_FOR_DISCOVERY} follows
      </Text>

      <TouchableOpacity
        style={[styles.cta, { backgroundColor: '#4F46E5' }]}
        onPress={onFindPeople}
        activeOpacity={0.8}
      >
        <Ionicons name="people-outline" size={15} color="#fff" />
        <Text style={styles.ctaText}>Find people at {university || 'your campus'}</Text>
        <Ionicons name="arrow-forward" size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  textWrap: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700', letterSpacing: -0.2 },
  sub: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  progressTrack: {
    height: 4,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 4,
    backgroundColor: '#818CF8',
  },
  progressLabel: {
    fontSize: 11,
    marginTop: -4,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 12,
  },
  ctaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
});
