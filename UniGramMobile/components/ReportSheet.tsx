import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';
import { fx } from '../lib/feedback';
import { friendlyError } from '../lib/friendlyError';
import { supabase } from '../lib/supabase';
import { reportContent } from '../services/posts';

export type ReportTargetType = 'user' | 'post' | 'reel' | 'comment' | 'market_item' | 'story' | 'live' | 'message' | 'confession';

const REASONS = [
  'Spam or scam',
  'Harassment or bullying',
  'Hate speech',
  'Nudity or sexual content',
  'Violence or threats',
  'Fake account or impersonation',
  'Selling something illegal',
  'Something else',
];

interface Props {
  visible: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string | null | undefined;
  /** Short noun shown in the title, e.g. "listing", "user". */
  label?: string;
  onDone?: (ok: boolean) => void;
  /** Optional toast hook; falls back to inline status text. */
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const NATIVE_TYPES = ['post', 'user', 'reel', 'market_item'];

export const ReportSheet: React.FC<Props> = ({ visible, onClose, targetType, targetId, label, onDone, showToast }) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => { if (visible) { setBusy(false); setError(null); setSent(false); } }, [visible]);

  const submit = async (reason: string) => {
    if (!targetId || busy) return;
    fx.tap();
    setBusy(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (NATIVE_TYPES.includes(targetType)) {
        await reportContent(user.id, targetType as any, targetId, reason);
      } else {
        const { error: e } = await supabase.from('reports').insert({
          reporter_id: user.id, target_type: targetType, target_id: targetId, reason,
        });
        if (e) throw e;
      }
      fx.success();
      setSent(true);
      showToast?.('Thanks, we will review this report.', 'success');
      onDone?.(true);
    } catch (e) {
      fx.error();
      setError(friendlyError(e));
      onDone?.(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose} accessibilityLabel="Close report sheet">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
          <TouchableWithoutFeedback>
            <View style={{ backgroundColor: colors.bg2, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: insets.bottom + 12, maxHeight: '80%' }}>
              <View style={{ alignItems: 'center', paddingTop: 10 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>
              {sent ? (
                <View style={{ alignItems: 'center', padding: 28 }}>
                  <Ionicons name="checkmark-circle" size={48} color="#22c55e" />
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginTop: 12 }}>Report sent</Text>
                  <Text style={{ color: colors.textSub, fontSize: 13, textAlign: 'center', marginTop: 6 }}>Thanks for helping keep UniGram safe.</Text>
                  <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Done" style={{ marginTop: 18, minHeight: 44, paddingHorizontal: 28, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Done</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'center', marginTop: 12 }}>Report {label ?? targetType.replace('_', ' ')}</Text>
                  <Text style={{ color: colors.textSub, fontSize: 13, textAlign: 'center', marginTop: 4, marginBottom: 8 }}>Why are you reporting this?</Text>
                  {!!error && <Text style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', paddingHorizontal: 20, marginBottom: 6 }}>{error}</Text>}
                  <ScrollView>
                    {REASONS.map(r => (
                      <TouchableOpacity key={r} disabled={busy} onPress={() => submit(r)} accessibilityRole="button" accessibilityLabel={r}
                        style={{ minHeight: 52, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.rowBorder }}>
                        <Text style={{ color: colors.text, fontSize: 15 }}>{r}</Text>
                        {busy ? <ActivityIndicator size="small" color={colors.textMuted} /> : <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel" style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.rowBorder }}>
                    <Text style={{ color: colors.textSub, fontWeight: '600' }}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default ReportSheet;
