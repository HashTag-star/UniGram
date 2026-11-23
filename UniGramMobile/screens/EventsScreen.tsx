import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Modal, TextInput, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { fx } from '../lib/feedback';
import { friendlyError } from '../lib/friendlyError';
import { supabase } from '../lib/supabase';
import { uploadFile } from '../services/upload';
import { CachedImage } from '../components/CachedImage';
import { EmptyState } from '../components/EmptyState';
import { getUpcomingEvents, setRsvp, createEvent, deleteEvent, CampusEvent } from '../services/events';

interface Props {
  onClose?: () => void;
  university?: string | null;
}

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} - ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

/** Parses "YYYY-MM-DD" + "HH:MM" (24h) into an ISO string, or null. */
function parseWhen(date: string, time: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim() || '18:00');
  if (!m || !t) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export default function EventsScreen({ onClose, university }: Props) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<CampusEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await getUpcomingEvents(university);
      setEvents(res.events); setUnavailable(res.unavailable);
    } catch { setUnavailable(true); }
    setLoading(false); setRefreshing(false);
  }, [university]);

  useEffect(() => { load(); supabase.auth.getUser().then(({ data }) => setUid(data.user?.id ?? null)); }, [load]);

  const rsvp = async (ev: CampusEvent, status: 'going' | 'interested') => {
    const next = ev.my_rsvp === status ? null : status;
    fx.select();
    const prev = events;
    setEvents(list => list.map(e => e.id !== ev.id ? e : {
      ...e, my_rsvp: next,
      going_count: e.going_count + (next === 'going' ? 1 : 0) - (e.my_rsvp === 'going' ? 1 : 0),
      interested_count: e.interested_count + (next === 'interested' ? 1 : 0) - (e.my_rsvp === 'interested' ? 1 : 0),
    }));
    try { await setRsvp(ev.id, next); } catch (e) { setEvents(prev); showToast(friendlyError(e), 'error'); }
  };

  const remove = (ev: CampusEvent) => {
    Alert.alert('Delete event?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteEvent(ev.id); setEvents(l => l.filter(e => e.id !== ev.id)); fx.success(); }
        catch (e) { showToast(friendlyError(e), 'error'); }
      } },
    ]);
  };

  const Chip = ({ active, label, icon, onPress }: any) => (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: active ? colors.accent : colors.card, borderWidth: 1, borderColor: active ? colors.accent : colors.border }}>
      <Ionicons name={icon} size={14} color={active ? '#fff' : colors.textSub} />
      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.rowBorder }}>
        {!!onClose && (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Close events" style={{ marginRight: 12 }}>
            <Ionicons name="chevron-down" size={26} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={{ flex: 1, color: colors.text, fontSize: 20, fontWeight: '800' }}>Campus Events</Text>
        <TouchableOpacity onPress={() => { fx.tap(); setCreating(true); }} accessibilityRole="button" accessibilityLabel="Create event" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>New</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.accent} /> : (
        <FlatList
          data={events}
          keyExtractor={e => e.id}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
          ListEmptyComponent={unavailable
            ? <EmptyState icon="calendar-outline" title="Events are coming soon" subtitle="We are still setting this up for your campus. Check back shortly." actionLabel="Try again" onAction={() => load()} />
            : <EmptyState icon="calendar-outline" title="No upcoming events" subtitle="Be the first to organise something on campus." actionLabel="Create an event" onAction={() => setCreating(true)} />}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.card, borderRadius: 18, borderWidth: 1, borderColor: colors.border, marginBottom: 14, overflow: 'hidden' }}>
              {!!item.image_url && <CachedImage uri={item.image_url} style={{ width: '100%', height: 150 }} />}
              <View style={{ padding: 14 }}>
                <Text style={{ color: colors.accentLight, fontSize: 12, fontWeight: '700' }}>{fmt(item.starts_at)}</Text>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 4 }}>{item.title}</Text>
                {!!item.location && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                    <Ionicons name="location-outline" size={14} color={colors.textSub} />
                    <Text style={{ color: colors.textSub, fontSize: 13, marginLeft: 4 }}>{item.location}</Text>
                  </View>
                )}
                {!!item.description && <Text numberOfLines={3} style={{ color: colors.textSub, fontSize: 13, marginTop: 8, lineHeight: 18 }}>{item.description}</Text>}
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>{item.going_count} going - {item.interested_count} interested</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' }}>
                  <Chip active={item.my_rsvp === 'going'} label="Going" icon="checkmark-circle-outline" onPress={() => rsvp(item, 'going')} />
                  <Chip active={item.my_rsvp === 'interested'} label="Interested" icon="star-outline" onPress={() => rsvp(item, 'interested')} />
                  <View style={{ flex: 1 }} />
                  {item.creator_id === uid && (
                    <TouchableOpacity onPress={() => remove(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Delete event">
                      <Ionicons name="trash-outline" size={20} color="#ef4444" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        />
      )}

      <CreateEventModal visible={creating} onClose={() => setCreating(false)} university={university}
        onCreated={() => { setCreating(false); fx.success(); showToast('Event created', 'success'); load(); }} />
    </View>
  );
}

function CreateEventModal({ visible, onClose, onCreated, university }: { visible: boolean; onClose: () => void; onCreated: () => void; university?: string | null }) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (!visible) { setTitle(''); setDescription(''); setLocation(''); setDate(''); setTime('18:00'); setImage(null); setBusy(false); } }, [visible]);

  const pick = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: true, aspect: [16, 9] });
    if (!r.canceled && r.assets[0]) setImage(r.assets[0].uri);
  };

  const iso = parseWhen(date, time);
  const missing = !title.trim() ? 'Add a title' : !iso ? 'Enter a date (YYYY-MM-DD)' : null;

  const submit = async () => {
    if (missing || !iso) { showToast(missing ?? 'Check the date', 'error'); return; }
    setBusy(true);
    try {
      let image_url: string | null = null;
      if (image) {
        const { data: { user } } = await supabase.auth.getUser();
        const ext = image.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
        image_url = await uploadFile('market-images', `${user?.id}/event_${Date.now()}.${ext}`, image);
      }
      await createEvent({ title, description, location, starts_at: iso, image_url, university });
      onCreated();
    } catch (e) { fx.error(); showToast(friendlyError(e), 'error'); }
    finally { setBusy(false); }
  };

  const input = { color: colors.text, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 12, paddingHorizontal: 14, minHeight: 46, marginBottom: 12 } as const;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ paddingTop: Platform.OS === 'android' ? insets.top : 0, flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.rowBorder }}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Close">
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', color: colors.text, fontWeight: '800', fontSize: 17 }}>New event</Text>
          <TouchableOpacity onPress={submit} disabled={busy} accessibilityRole="button" accessibilityLabel={missing ?? 'Publish event'} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            {busy ? <ActivityIndicator color={colors.accent} /> : <Text style={{ color: missing ? colors.textMuted : colors.accent, fontWeight: '800', fontSize: 15 }}>Post</Text>}
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <TouchableOpacity onPress={pick} accessibilityRole="button" accessibilityLabel="Choose event image"
            style={{ height: 140, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', marginBottom: 14, overflow: 'hidden' }}>
            {image ? <CachedImage uri={image} style={{ width: '100%', height: 140 }} /> : (<><Ionicons name="image-outline" size={26} color={colors.textMuted} /><Text style={{ color: colors.textSub, marginTop: 6 }}>Add a cover image</Text></>)}
          </TouchableOpacity>
          <TextInput value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor={colors.textMuted} maxLength={120} style={input} accessibilityLabel="Event title" />
          <TextInput value={description} onChangeText={setDescription} placeholder="Description" placeholderTextColor={colors.textMuted} multiline maxLength={1000} style={[input, { minHeight: 90, paddingTop: 12, textAlignVertical: 'top' }]} accessibilityLabel="Event description" />
          <TextInput value={location} onChangeText={setLocation} placeholder="Location (e.g. Main Auditorium)" placeholderTextColor={colors.textMuted} maxLength={160} style={input} accessibilityLabel="Event location" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TextInput value={date} onChangeText={setDate} placeholder="Date YYYY-MM-DD" placeholderTextColor={colors.textMuted} keyboardType="numbers-and-punctuation" style={[input, { flex: 2 }]} accessibilityLabel="Event date" />
            <TextInput value={time} onChangeText={setTime} placeholder="HH:MM" placeholderTextColor={colors.textMuted} keyboardType="numbers-and-punctuation" style={[input, { flex: 1 }]} accessibilityLabel="Event time, 24 hour" />
          </View>
          {!!missing && <Text style={{ color: colors.textMuted, fontSize: 12 }}>{missing} to post.</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}
