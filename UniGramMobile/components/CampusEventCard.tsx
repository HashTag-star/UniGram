import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import type { CampusEvent } from '../services/campusContent';

function formatEventDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function CampusEventCard({ event }: { event: CampusEvent }) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.bg2, borderColor: colors.border }]}>
      <View style={styles.badgeRow}>
        <View style={[styles.badge, { backgroundColor: '#4F46E512' }]}>
          <Ionicons name="megaphone-outline" size={11} color="#818CF8" />
          <Text style={styles.badgeText}>Campus</Text>
        </View>
        {event.event_date && (
          <Text style={[styles.dateText, { color: colors.textMuted }]}>
            {formatEventDate(event.event_date)}
          </Text>
        )}
      </View>

      <Text style={[styles.title, { color: colors.text }]}>{event.title}</Text>

      {!!event.body && (
        <Text style={[styles.body, { color: colors.textMuted }]} numberOfLines={3}>
          {event.body}
        </Text>
      )}

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Ionicons name="school-outline" size={13} color={colors.textMuted} />
        <Text style={[styles.footerText, { color: colors.textMuted }]} numberOfLines={1}>
          {event.university}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: '#6366F1',
    padding: 14,
    gap: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#818CF8',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  dateText: { fontSize: 11, fontWeight: '600' },
  title: { fontSize: 15, fontWeight: '700', lineHeight: 21, letterSpacing: -0.2 },
  body: { fontSize: 13, lineHeight: 19 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 8,
    borderTopWidth: 1,
    marginTop: 2,
  },
  footerText: { fontSize: 12 },
});
