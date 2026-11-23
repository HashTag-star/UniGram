import React, { useState, useEffect } from 'react';
import { View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { fx } from '../lib/feedback';
import { friendlyError } from '../lib/friendlyError';
import { blockUser } from '../services/profiles';
import { muteUser } from '../services/mutes';

interface Props {
  visible: boolean;
  onClose: () => void;
  userId: string | null | undefined;
  username?: string | null;
  /** 'block' (default) or 'mute' */
  mode?: 'block' | 'mute';
  onDone?: () => void;
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

/** Confirmation dialog for blocking or muting an account. Also used as the Mute sheet. */
export const BlockSheet: React.FC<Props> = ({ visible, onClose, userId, username, mode = 'block', onDone, showToast }) => {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (visible) { setBusy(false); setError(null); } }, [visible]);

  const isBlock = mode === 'block';
  const name = username ? `@${username}` : 'this user';

  const confirm = async () => {
    if (!userId || busy) return;
    setBusy(true); setError(null);
    try {
      if (isBlock) await blockUser(userId); else await muteUser(userId);
      fx.success();
      showToast?.(isBlock ? `Blocked ${name}` : `Muted ${name}`, 'success');
      onDone?.();
      onClose();
    } catch (e) {
      fx.error();
      const msg = friendlyError(e);
      setError(msg);
      showToast?.(msg, 'error');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <TouchableWithoutFeedback>
            <View style={{ width: '100%', maxWidth: 360, backgroundColor: colors.bg2, borderRadius: 20, padding: 22, borderWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>{isBlock ? `Block ${name}?` : `Mute ${name}?`}</Text>
              <Text style={{ color: colors.textSub, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 }}>
                {isBlock
                  ? 'They will not be able to find your profile, see your posts or message you. They will not be told you blocked them.'
                  : 'Their posts and stories will be hidden from your feed. They will not be told, and you can unmute anytime.'}
              </Text>
              {!!error && <Text style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', marginTop: 10 }}>{error}</Text>}
              <TouchableOpacity onPress={confirm} disabled={busy} accessibilityRole="button" accessibilityLabel={isBlock ? 'Block' : 'Mute'}
                style={{ marginTop: 18, minHeight: 46, borderRadius: 23, backgroundColor: isBlock ? '#ef4444' : colors.accent, alignItems: 'center', justifyContent: 'center' }}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>{isBlock ? 'Block' : 'Mute'}</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel" style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
                <Text style={{ color: colors.textSub, fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default BlockSheet;
