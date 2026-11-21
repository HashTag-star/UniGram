import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

type Tier = 'fast' | 'smart' | 'vision';

const TIERS: Array<{ key: Tier; setting: string; title: string; blurb: string; icon: string; color: string; models: string[] }> = [
  {
    key: 'fast', setting: 'ai_model_fast', title: 'Fast', icon: 'flash', color: '#22c55e',
    blurb: 'Quick, cheap jobs: comment summaries, analytics insights.',
    models: ['meta/llama-3.1-8b-instruct', 'meta/llama-3.2-3b-instruct', 'mistralai/mistral-7b-instruct-v0.3', 'microsoft/phi-3.5-mini-instruct'],
  },
  {
    key: 'smart', setting: 'ai_model_smart', title: 'Smart', icon: 'bulb', color: '#8b5cf6',
    blurb: 'Reasoning jobs: the admin agent, moderation scans, tool use.',
    models: ['meta/llama-3.3-70b-instruct', 'nvidia/llama-3.1-nemotron-70b-instruct', 'meta/llama-3.1-70b-instruct', 'meta/llama-3.1-405b-instruct', 'mistralai/mixtral-8x22b-instruct-v0.1'],
  },
  {
    key: 'vision', setting: 'ai_model_vision', title: 'Vision', icon: 'eye', color: '#0ea5e9',
    blurb: 'Reads images: post context on fliers, caption assistant.',
    models: ['meta/llama-3.2-11b-vision-instruct', 'meta/llama-3.2-90b-vision-instruct', 'microsoft/phi-3.5-vision-instruct'],
  },
];

const DEFAULTS: Record<Tier, string> = {
  fast: 'meta/llama-3.1-8b-instruct',
  smart: 'meta/llama-3.3-70b-instruct',
  vision: 'meta/llama-3.2-11b-vision-instruct',
};

type TestState = { status: 'idle' | 'running' | 'ok' | 'fail'; msg?: string };

export const AIModelsTab: React.FC<{ adminId: string }> = ({ adminId }) => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Record<Tier, string>>({ ...DEFAULTS });
  const [draft, setDraft] = useState<Record<Tier, string>>({ ...DEFAULTS });
  // API key (write-only: the app can never read it back, only learn that one is set)
  const [keyStatus, setKeyStatus] = useState<{ configured: boolean; last4?: string | null } | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const loadKeyStatus = useCallback(async () => {
    const { data } = await supabase.rpc('admin_ai_key_status');
    setKeyStatus((data as any) ?? { configured: false });
  }, []);
  const [tests, setTests] = useState<Record<Tier, TestState>>({ fast: { status: 'idle' }, smart: { status: 'idle' }, vision: { status: 'idle' } });

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('ai_settings').select('key, value');
    const next = { ...DEFAULTS };
    (data ?? []).forEach((r: any) => {
      const t = TIERS.find(x => x.setting === r.key);
      if (t && r.value) next[t.key] = r.value;
    });
    setSaved(next);
    setDraft(next);
    setLoading(false);
  }, []);

  useEffect(() => { load(); loadKeyStatus(); }, [load, loadKeyStatus]);

  const dirty = TIERS.some(t => draft[t.key].trim() !== saved[t.key]);

  const test = async (tier: Tier) => {
    const model = draft[tier].trim();
    setTests(p => ({ ...p, [tier]: { status: 'running' } }));
    try {
      const { data, error } = await supabase.functions.invoke('ai-model-test', { body: { model } });
      if (error) throw error;
      if (data?.ok) setTests(p => ({ ...p, [tier]: { status: 'ok', msg: `Works · ${data.ms} ms` } }));
      else setTests(p => ({ ...p, [tier]: { status: 'fail', msg: data?.error ?? 'Model did not respond' } }));
    } catch (e: any) {
      setTests(p => ({ ...p, [tier]: { status: 'fail', msg: e?.message ?? 'Test failed' } }));
    }
  };

  const saveKey = async () => {
    const k = keyInput.trim();
    if (k.length < 20) { showToast('That does not look like a valid API key.', 'error'); return; }
    setKeyBusy(true);
    const { error } = await supabase.rpc('admin_set_ai_key', { p_key: k });
    setKeyBusy(false);
    if (error) { showToast(error.message || 'Could not save the key', 'error'); return; }
    setKeyInput('');
    setShowKey(false);
    showToast('API key saved. Use “Test model” to verify it.', 'success');
    loadKeyStatus();
  };
  const clearKey = async () => {
    setKeyBusy(true);
    const { error } = await supabase.rpc('admin_clear_ai_key');
    setKeyBusy(false);
    if (error) { showToast(error.message || 'Could not remove the key', 'error'); return; }
    showToast('API key removed.', 'success');
    loadKeyStatus();
  };

  const save = async () => {
    const rows = TIERS.map(t => ({ key: t.setting, value: draft[t.key].trim() || DEFAULTS[t.key], updated_by: adminId, updated_at: new Date().toISOString() }));
    setSaving(true);
    const { error } = await supabase.from('ai_settings').upsert(rows, { onConflict: 'key' });
    setSaving(false);
    if (error) { showToast(error.message || 'Could not save', 'error'); return; }
    showToast('AI models updated. Live within a minute.', 'success');
    setSaved({ ...draft });
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#8b5cf6" /></View>;

  return (
    <ScrollView contentContainerStyle={s.wrap} showsVerticalScrollIndicator={false}>
      <View style={s.hero}>
        <Ionicons name="hardware-chip" size={22} color="#a78bfa" />
        <View style={{ flex: 1 }}>
          <Text style={s.heroTitle}>AI models · NVIDIA</Text>
          <Text style={s.heroSub}>
            Add your key, then pick which NVIDIA model powers each kind of AI feature. The key is kept on the server
            on the server and can’t be read back from the app. Groq/OpenAI/Gemini stay as automatic fallbacks.
          </Text>
        </View>
      </View>

      <View style={s.card}>
        <View style={s.cardHead}>
          <View style={[s.tierIcon, { backgroundColor: 'rgba(250,204,21,0.15)' }]}><Ionicons name="key" size={16} color="#facc15" /></View>
          <View style={{ flex: 1 }}>
            <Text style={s.tierTitle}>NVIDIA API key</Text>
            <Text style={s.tierBlurb}>
              {keyStatus?.configured ? `Key saved · ends in ${keyStatus.last4 ?? '••••'}` : 'No key saved yet — AI falls back to other providers.'}
            </Text>
          </View>
          {keyStatus?.configured ? <Ionicons name="checkmark-circle" size={20} color="#22c55e" /> : <Ionicons name="alert-circle" size={20} color="#f59e0b" />}
        </View>
        <Text style={s.label}>{keyStatus?.configured ? 'Replace key' : 'Paste your key (starts with nvapi-)'}</Text>
        <View style={s.keyRow}>
          <TextInput
            value={keyInput}
            onChangeText={setKeyInput}
            placeholder="nvapi-…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={!showKey}
            style={[s.input, { flex: 1 }]}
          />
          <TouchableOpacity onPress={() => setShowKey(v => !v)} hitSlop={8} style={{ padding: 8 }}>
            <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={19} color="rgba(255,255,255,0.6)" />
          </TouchableOpacity>
        </View>
        <View style={s.row}>
          <TouchableOpacity onPress={saveKey} disabled={keyBusy || keyInput.trim().length < 20} style={[s.keyBtn, (keyBusy || keyInput.trim().length < 20) && { opacity: 0.45 }]} activeOpacity={0.85}>
            {keyBusy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.keyBtnText}>Save key</Text>}
          </TouchableOpacity>
          {keyStatus?.configured ? (
            <TouchableOpacity onPress={clearKey} disabled={keyBusy} style={s.removeBtn} activeOpacity={0.8}>
              <Text style={s.removeText}>Remove</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={s.keyNote}>Write-only: once saved, the key can’t be viewed again here or anywhere in the app. Only the server uses it.</Text>
      </View>

      {TIERS.map(t => {
        const ts = tests[t.key];
        return (
          <View key={t.key} style={s.card}>
            <View style={s.cardHead}>
              <View style={[s.tierIcon, { backgroundColor: t.color + '22' }]}><Ionicons name={t.icon as any} size={16} color={t.color} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.tierTitle}>{t.title}</Text>
                <Text style={s.tierBlurb}>{t.blurb}</Text>
              </View>
            </View>

            <View style={s.chips}>
              {t.models.map(m => {
                const on = draft[t.key].trim() === m;
                return (
                  <TouchableOpacity key={m} onPress={() => setDraft(p => ({ ...p, [t.key]: m }))} style={[s.chip, on && { backgroundColor: t.color, borderColor: t.color }]} activeOpacity={0.8}>
                    <Text style={[s.chipText, on && { color: '#fff' }]} numberOfLines={1}>{m.split('/')[1]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.label}>Model ID (any model from build.nvidia.com)</Text>
            <TextInput
              value={draft[t.key]}
              onChangeText={v => setDraft(p => ({ ...p, [t.key]: v }))}
              placeholder="publisher/model-name"
              placeholderTextColor="rgba(255,255,255,0.3)"
              autoCapitalize="none"
              autoCorrect={false}
              style={s.input}
            />

            <View style={s.row}>
              <TouchableOpacity onPress={() => test(t.key)} disabled={ts.status === 'running'} style={s.testBtn} activeOpacity={0.8}>
                {ts.status === 'running'
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="pulse" size={14} color="#fff" /><Text style={s.testText}>Test model</Text></>}
              </TouchableOpacity>
              {ts.status === 'ok' ? <Text style={[s.result, { color: '#22c55e' }]}>{ts.msg}</Text> : null}
              {ts.status === 'fail' ? <Text style={[s.result, { color: '#f87171' }]} numberOfLines={3}>{ts.msg}</Text> : null}
            </View>
            {draft[t.key].trim() !== saved[t.key] ? <Text style={s.unsaved}>Unsaved · currently live: {saved[t.key]}</Text> : null}
          </View>
        );
      })}

      <TouchableOpacity onPress={save} disabled={!dirty || saving} style={[s.saveBtn, (!dirty || saving) && { opacity: 0.45 }]} activeOpacity={0.85}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveText}>{dirty ? 'Save changes' : 'All changes saved'}</Text>}
      </TouchableOpacity>

    </ScrollView>
  );
};

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  wrap: { padding: 16, paddingBottom: 60, gap: 14 },
  hero: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16, backgroundColor: 'rgba(139,92,246,0.10)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(139,92,246,0.35)' },
  heroTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.62)', fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  code: { color: '#c4b5fd', fontFamily: 'monospace', fontSize: 12 },
  card: { padding: 14, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.12)' },
  cardHead: { flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 12 },
  tierIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tierTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  tierBlurb: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', maxWidth: '100%' },
  chipText: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  label: { color: 'rgba(255,255,255,0.5)', fontSize: 11.5, fontWeight: '600', marginBottom: 6 },
  input: { color: '#fff', fontSize: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 },
  testBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', minWidth: 110, justifyContent: 'center' },
  testText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  result: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  unsaved: { color: '#fbbf24', fontSize: 11.5, marginTop: 8 },
  saveBtn: { backgroundColor: '#6366f1', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyBtn: { backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10, minWidth: 100, alignItems: 'center' },
  keyBtnText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  removeBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: 'rgba(239,68,68,0.14)' },
  removeText: { color: '#f87171', fontSize: 13.5, fontWeight: '700' },
  keyNote: { color: 'rgba(255,255,255,0.45)', fontSize: 11.5, lineHeight: 16, marginTop: 10 },
});
