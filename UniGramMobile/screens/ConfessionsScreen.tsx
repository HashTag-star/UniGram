import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { fx } from '../lib/feedback';
import { friendlyError } from '../lib/friendlyError';
import { EmptyState } from '../components/EmptyState';
import { ReportSheet } from '../components/ReportSheet';
import { getConfessions, postConfession, toggleLike, deleteConfession, moderateConfession, Confession } from '../services/confessions';

interface Props {
  onClose?: () => void;
  university?: string | null;
}

const ago = (iso: string) => {
  const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

export default function ConfessionsScreen({ onClose, university }: Props) {
  const { colors } = useTheme();
  const { showToast } = useToast();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Confession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const r = await getConfessions(university);
      setItems(r.items); setUnavailable(r.unavailable);
    } catch { setUnavailable(true); }
    setLoading(false); setRefreshing(false);
  }, [university]);

  useEffect(() => { load(); }, [load]);

  const problem = text.trim() ? moderateConfession(text) : 'Write something';

  const submit = async () => {
    if (problem) { showToast(problem, 'error'); return; }
    setPosting(true);
    try {
      await postConfession(text, university);
      setText(''); fx.success(); showToast('Posted anonymously', 'success');
      load();
    } catch (e) { fx.error(); showToast(friendlyError(e), 'error'); }
    finally { setPosting(false); }
  };

  const like = async (c: Confession) => {
    fx.like();
    setItems(l => l.map(x => x.id !== c.id ? x : { ...x, liked_by_me: !c.liked_by_me, like_count: x.like_count + (c.liked_by_me ? -1 : 1) }));
    try { await toggleLike(c.id, c.liked_by_me); }
    catch (e) {
      setItems(l => l.map(x => x.id !== c.id ? x : c));
      showToast(friendlyError(e), 'error');
    }
  };

  const remove = (c: Confession) => {
    Alert.alert('Delete confession?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try { await deleteConfession(c.id); setItems(l => l.filter(x => x.id !== c.id)); }
        catch (e) { showToast(friendlyError(e), 'error'); }
      } },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.rowBorder }}>
        {!!onClose && (
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button" accessibilityLabel="Close confessions" style={{ marginRight: 12 }}>
            <Ionicons name="chevron-down" size={26} color={colors.text} />
          </TouchableOpacity>
        )}
        <Text style={{ flex: 1, color: colors.text, fontSize: 20, fontWeight: '800' }}>Confessions</Text>
        <Ionicons name="eye-off-outline" size={18} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 4 }}>Anonymous</Text>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 60 }} color={colors.accent} /> : (
        <FlatList
          data={items}
          keyExtractor={c => c.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ padding: 16, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />}
          ListEmptyComponent={unavailable
            ? <EmptyState icon="chatbubbles-outline" title="Confessions are coming soon" subtitle="We are still setting this up for your campus." actionLabel="Try again" onAction={() => load()} />
            : <EmptyState icon="chatbubbles-outline" title="No confessions yet" subtitle="Say what is on your mind. Nobody will know it was you." />}
          renderItem={({ item }) => (
            <View style={{ backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 12 }}>
              <Text style={{ color: colors.text, fontSize: 15, lineHeight: 21 }}>{item.body}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, flex: 1 }}>{ago(item.created_at)}</Text>
                <TouchableOpacity onPress={() => like(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={item.liked_by_me ? 'Unlike' : 'Like'}
                  style={{ flexDirection: 'row', alignItems: 'center', minHeight: 32, marginRight: 14 }}>
                  <Ionicons name={item.liked_by_me ? 'heart' : 'heart-outline'} size={20} color={item.liked_by_me ? '#ef4444' : colors.textSub} />
                  <Text style={{ color: colors.textSub, marginLeft: 4, fontSize: 13 }}>{item.like_count}</Text>
                </TouchableOpacity>
                {item.mine ? (
                  <TouchableOpacity onPress={() => remove(item)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Delete confession">
                    <Ionicons name="trash-outline" size={19} color="#ef4444" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={() => setReportId(item.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Report confession">
                    <Ionicons name="flag-outline" size={19} color={colors.textSub} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />
      )}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: colors.rowBorder, backgroundColor: colors.bg }}>
        <TextInput value={text} onChangeText={setText} placeholder="Confess anonymously..." placeholderTextColor={colors.textMuted} multiline maxLength={500}
          accessibilityLabel="Write a confession"
          style={{ flex: 1, maxHeight: 110, minHeight: 44, color: colors.text, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10 }} />
        <TouchableOpacity onPress={submit} disabled={posting} accessibilityRole="button" accessibilityLabel={problem ?? 'Post confession'}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: problem ? colors.card : colors.accent, alignItems: 'center', justifyContent: 'center' }}>
          {posting ? <ActivityIndicator color="#fff" /> : <Ionicons name="send" size={18} color={problem ? colors.textMuted : '#fff'} />}
        </TouchableOpacity>
      </View>

      <ReportSheet visible={!!reportId} onClose={() => setReportId(null)} targetType="confession" targetId={reportId} label="confession" showToast={showToast} />
    </KeyboardAvoidingView>
  );
}
