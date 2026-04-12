import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Modal, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { submitVerificationRequest } from '../services/verification';
import { supabase } from '../lib/supabase';
import { usePopup } from '../context/PopupContext';
type VerificationType = 'student' | 'professor' | 'club' | 'influencer' | 'staff' | 'alumni';

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Step = 'select' | 'form' | 'success';

const TIERS: Array<{
  type: VerificationType;
  title: string;
  subtitle: string;
  color: string;
  icon: string;
  requirements: string[];
}> = [
  {
    type: 'student',
    title: 'Verified Student',
    subtitle: 'For enrolled students',
    color: '#6366f1',
    icon: '🎓',
    requirements: ['Valid .edu email', 'Student ID or enrollment proof', 'University matches profile'],
  },
  {
    type: 'alumni',
    title: 'Verified Alumni',
    subtitle: 'For graduates',
    color: '#14b8a6',
    icon: '🏛️',
    requirements: ['Graduation certificate or transcript', 'Alumni email (if available)', 'Degree details on profile'],
  },
  {
    type: 'professor',
    title: 'Verified Faculty',
    subtitle: 'For professors',
    color: '#eab308',
    icon: '📚',
    requirements: ['Faculty email', 'Faculty ID or appointment letter', 'Department on profile'],
  },
  {
    type: 'staff',
    title: 'Verified Staff',
    subtitle: 'For university employees',
    color: '#22c55e',
    icon: '🆔',
    requirements: ['Valid .edu email', 'Staff ID or employment proof', 'University matches profile'],
  },
  {
    type: 'club',
    title: 'Verified Organization',
    subtitle: 'For clubs & societies',
    color: '#a855f7',
    icon: '🏢',
    requirements: ['University recognition letter', 'Official org status', '10+ active members'],
  },
  {
    type: 'influencer',
    title: 'Notable Account',
    subtitle: 'For campus creators',
    color: '#1d4ed8',
    icon: '⭐',
    requirements: ['1,000+ followers', 'Consistent posting', 'Campus presence'],
  },
];

export const VerificationScreen: React.FC<Props> = ({ visible, onClose }) => {
  const [step, setStep] = useState<Step>('select');
  const [selected, setSelected] = useState<typeof TIERS[0] | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [reason, setReason] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [university, setUniversity] = useState('');
  const [loading, setLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentPicker.DocumentPickerAsset[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [sheerIdCleared, setSheerIdCleared] = useState(false);
  const { showPopup } = usePopup();

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from('profiles').select('university').eq('id', user.id).single();
        if (data) {
          setProfile(data);
          if (data.university) {
            setUniversity(data.university);
          }
        }
      }
    };
    if (visible) loadProfile();
  }, [visible]);

  const reset = () => { 
    setStep('select'); 
    setSelected(null); 
    setName(''); 
    setEmail(''); 
    setReason(''); 
    setAgreed(false); 
    setDocuments([]); 
    setSheerIdCleared(false);
    // Do NOT reset university if it was loaded from profile
    if (profile?.university) {
       setUniversity(profile.university);
    } else {
       setUniversity('');
    }
  };
  const handleClose = () => { reset(); onClose(); };

  const pickDocuments = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        multiple: true,
      });

      if (!res.canceled) {
        setDocuments(prev => [...prev, ...res.assets]);
      }
    } catch (e) {
      showPopup({
        title: 'Selection Error',
        message: 'There was a problem choosing your documents. Please try again.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    }
  };
  const uploadFile = async (asset: DocumentPicker.DocumentPickerAsset, userId: string) => {
    const ext = asset.name.split('.').pop();
    const fileName = `${userId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const path = fileName;

    const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: 'base64' });
    const { error } = await supabase.storage.from('verifications').upload(path, decode(base64), {
      contentType: asset.mimeType ?? 'application/octet-stream',
    });

    if (error) throw error;

    const { data } = supabase.storage.from('verifications').getPublicUrl(path);
    return data.publicUrl;
  };

  const isEmailValid = (email: string, type: VerificationType) => {
    const isEDU = email.toLowerCase().trim().endsWith('.edu');
    const needsEDU = type === 'student' || type === 'professor' || type === 'staff';
    return !needsEDU || isEDU;
  };

  const submit = async () => {
    if (!selected) return;
    if (!name.trim() || !email.trim()) {
      showPopup({
        title: 'Details Required',
        message: 'Please provide your full legal name and university email.',
        icon: 'information-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }

    const isEdu = email.toLowerCase().endsWith('.edu') || email.includes('.ac.');
    if (['student', 'professor', 'staff'].includes(selected.type) && !isEdu) {
      showPopup({
        title: 'Invalid Email',
        message: 'Educational verification requires a valid .edu or academic email address.',
        icon: 'mail-outline',
        iconColor: '#ef4444',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }

    if ((selected.type === 'student' || selected.type === 'professor' || selected.type === 'staff' || selected.type === 'alumni') && !university.trim()) {
      showPopup({
        title: 'University Required',
        message: 'Please specify the university you are affiliated with.',
        icon: 'business-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }

    if (documents.length === 0 && !sheerIdCleared) {
      showPopup({
        title: 'Documents Required',
        message: 'Please attach supporting documents (e.g. ID) or complete SheerID verification.',
        icon: 'document-text-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Refetch profile to be absolutely sure about the university matching
      const { data: latestProfile } = await supabase.from('profiles').select('university').eq('id', user.id).single();
      
      if (latestProfile?.university && latestProfile.university.trim() !== university.trim()) {
        showPopup({
          title: 'University Mismatch',
          message: `Your profile indicates you are at "${latestProfile.university}". Your verification must align with your profile.`,
          icon: 'shield-outline',
          iconColor: '#ef4444',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
        setLoading(false);
        return;
      }

      // 1. Upload files
      const documentUrls = await Promise.all(
        documents.map(doc => uploadFile(doc, user.id))
      );

      // 2. Submit request
      await submitVerificationRequest(user.id, selected.type, name, email.trim(), university.trim(), reason, documentUrls, sheerIdCleared);

      // 3. Sync university to profile if it was missing
      if (!latestProfile?.university && university.trim()) {
         await supabase.from('profiles').update({ university: university.trim() }).eq('id', user.id);
      }

      setStep('success');
    } catch (e: any) {
      showPopup({
        title: 'Submission Failed',
        message: e.message ?? 'There was a problem submitting your request. Please check your connection.',
        icon: 'cloud-offline-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setLoading(false);
    }
  };

  const universityLocked = !!profile?.university;
  const eduRequired = selected?.type === 'student' || selected?.type === 'professor' || selected?.type === 'staff';
  const canSubmit = name.trim() && 
                    email.trim() && 
                    agreed && 
                    (documents.length > 0 || sheerIdCleared) && 
                    !loading && 
                    isEmailValid(email, selected?.type || 'student') &&
                    (!((selected?.type === 'student' || selected?.type === 'professor' || selected?.type === 'staff' || selected?.type === 'alumni')) || university.trim());

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={step === 'form' ? () => setStep('select') : handleClose} style={styles.headerBtn}>
            <Ionicons name={step === 'form' ? 'arrow-back' : 'close'} size={22} color="#fff" />
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="shield-checkmark-outline" size={18} color="#818cf8" />
            <Text style={styles.headerTitle}>Get Verified</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        {step === 'select' && (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.subtitle}>Choose the verification that applies to you. Each comes with a unique badge on your profile and posts.</Text>
            {TIERS.map(tier => (
              <TouchableOpacity
                key={tier.type}
                onPress={() => { setSelected(tier); setStep('form'); }}
                style={styles.tierCard}
              >
                <View style={[styles.tierIcon, { backgroundColor: tier.color + '20' }]}>
                  <Text style={{ fontSize: 24 }}>{tier.icon}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.tierTitle}>{tier.title}</Text>
                    <View style={[styles.badgePreview, { backgroundColor: tier.color }]}>
                      <Text style={{ color: '#fff', fontSize: 8, fontWeight: 'bold' }}>✓</Text>
                    </View>
                  </View>
                  <Text style={styles.tierSubtitle}>{tier.subtitle}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {step === 'form' && selected && (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {/* Selected tier */}
            <View style={[styles.selectedTier, { borderColor: selected.color + '40' }]}>
              <Text style={{ fontSize: 22 }}>{selected.icon}</Text>
              <View>
                <Text style={styles.tierTitle}>{selected.title}</Text>
                <Text style={styles.tierSubtitle}>{selected.subtitle}</Text>
              </View>
            </View>

            {/* Requirements */}
            <View style={styles.reqBox}>
              <Text style={styles.reqTitle}>REQUIREMENTS</Text>
              {selected.requirements.map((r, i) => (
                <View key={i} style={styles.reqRow}>
                  <Ionicons name="checkmark-circle" size={14} color="#22c55e" />
                  <Text style={styles.reqText}>{r}</Text>
                </View>
              ))}
            </View>

            {/* Form */}
            <Text style={styles.formLabel}>Full Legal Name *</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor="rgba(255,255,255,0.25)" />

            {(selected.type === 'student' || selected.type === 'professor' || selected.type === 'staff' || selected.type === 'alumni') && (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.formLabel}>University / College Name *</Text>
                  {universityLocked && (
                    <Text style={{ fontSize: 10, color: '#818cf8', fontWeight: '600' }}>LINKED TO PROFILE</Text>
                  )}
                </View>
                <TextInput 
                  style={[styles.input, universityLocked && { opacity: 0.6, backgroundColor: 'rgba(255,255,255,0.02)' }]} 
                  value={university} 
                  onChangeText={setUniversity} 
                  editable={!universityLocked}
                  placeholder="e.g. Stanford University" 
                  placeholderTextColor="rgba(255,255,255,0.25)" 
                />
              </>
            )}

            <Text style={styles.formLabel}>University Email {eduRequired ? '(.edu) ' : ''}*</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder={selected.type === 'club' ? "Official org email" : "you@university.edu"} placeholderTextColor="rgba(255,255,255,0.25)" keyboardType="email-address" autoCapitalize="none" />

            {eduRequired && (
              <View style={styles.sheerIdBox}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                  <View style={[styles.sheerIdIcon, sheerIdCleared && {backgroundColor: 'rgba(34,197,94,0.1)'}]}>
                    <Ionicons name={sheerIdCleared ? "shield-checkmark" : "shield-half"} size={20} color={sheerIdCleared ? "#22c55e" : "#818cf8"} />
                  </View>
                  <View style={{flex: 1}}>
                    <Text style={styles.sheerIdTitle}>{sheerIdCleared ? "Verified via SheerID" : "Instant Student Verification"}</Text>
                    <Text style={styles.sheerIdDesc}>
                      {sheerIdCleared ? 'Your identity has been confirmed. Document upload is now optional.' : 'Instantly verify your student status to bypass manual document review.'}
                    </Text>
                  </View>
                </View>
                {!sheerIdCleared && (
                  <TouchableOpacity 
                    style={styles.sheerIdBtn}
                    onPress={() => {
                      showPopup({
                        title: 'SheerID Portal',
                        message: 'Simulating SheerID verification success... (In production this would open a secure browser portal)',
                        buttons: [{ 
                          text: 'Simulate Success', 
                          onPress: () => {
                            setSheerIdCleared(true);
                          } 
                        }]
                      });
                    }}
                  >
                    <Text style={styles.sheerIdBtnText}>Verify with SheerID</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={styles.formLabel}>Why should you be verified?</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={reason}
              onChangeText={setReason}
              placeholder="Tell us why..."
              placeholderTextColor="rgba(255,255,255,0.25)"
              multiline
              numberOfLines={3}
            />

            <Text style={styles.formLabel}>Supporting Documents {sheerIdCleared ? '(Optional)' : '*'}</Text>
            {documents.length > 0 && (
              <View style={styles.docList}>
                {documents.map((doc, i) => (
                  <View key={i} style={styles.docListItem}>
                    <Ionicons 
                      name={doc.mimeType?.includes('pdf') ? "document-text" : "image"} 
                      size={16} 
                      color="rgba(255,255,255,0.4)" 
                    />
                    <Text style={styles.docName} numberOfLines={1}>{doc.name}</Text>
                    <TouchableOpacity onPress={() => setDocuments(prev => prev.filter((_, idx) => idx !== i))}>
                      <Ionicons name="close-circle" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
            <TouchableOpacity 
              style={[styles.uploadBtn, documents.length > 0 && { borderColor: '#818cf8', backgroundColor: '#818cf810' }]} 
              onPress={pickDocuments}
            >
              <Ionicons 
                name="cloud-upload-outline" 
                size={18} 
                color="rgba(255,255,255,0.4)" 
              />
              <Text style={styles.uploadText}>
                {documents.length > 0 ? 'Add More Documents' : 'Upload ID / Proof (Images or PDF)'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.agreeRow} onPress={() => setAgreed(p => !p)}>
              <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
                {agreed && <Ionicons name="checkmark" size={12} color="#fff" />}
              </View>
              <Text style={styles.agreeText}>I confirm all information is accurate. False claims may result in account suspension.</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={submit}
              disabled={!canSubmit}
              style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            >
              <Text style={[styles.submitBtnText, !canSubmit && { color: 'rgba(255,255,255,0.3)' }]}>
                {loading ? 'Submitting...' : 'Submit Verification Request'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {step === 'success' && (
          <View style={styles.successContainer}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={64} color="#22c55e" />
            </View>
            <Text style={styles.successTitle}>Application Submitted!</Text>
            <Text style={styles.successSubtitle}>Your {selected?.title} verification request has been submitted. We'll review and notify you within 3–5 business days.</Text>
            <TouchableOpacity style={styles.doneBtn} onPress={handleClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d0d0d' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: 'bold', color: '#fff' },
  content: { padding: 20 },
  subtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, lineHeight: 18, marginBottom: 20, textAlign: 'center' },
  tierCard: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 16, marginBottom: 10 },
  tierIcon: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  tierTitle: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  tierSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 1 },
  badgePreview: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  selectedTier: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderRadius: 14, marginBottom: 16 },
  reqBox: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: 12, marginBottom: 20 },
  reqTitle: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 'bold', letterSpacing: 1.5, marginBottom: 8 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  reqText: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  formLabel: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.45)', marginBottom: 6 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: '#fff', fontSize: 14, marginBottom: 14 },
  textarea: { height: 80, textAlignVertical: 'top' },
  docList: { marginBottom: 12 },
  docListItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  docName: { flex: 1, color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16 },
  uploadText: { color: 'rgba(255,255,255,0.35)', fontSize: 13 },
  agreeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 24 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxChecked: { backgroundColor: '#4f46e5', borderColor: '#4f46e5' },
  agreeText: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 17 },
  submitBtn: { backgroundColor: '#4f46e5', borderRadius: 20, paddingVertical: 14, alignItems: 'center' },
  submitBtnDisabled: { backgroundColor: 'rgba(255,255,255,0.08)' },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(34,197,94,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginBottom: 10 },
  successSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  doneBtn: { backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 40, paddingVertical: 14 },
  doneBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  sheerIdBox: { backgroundColor: 'rgba(99,102,241,0.05)', borderWidth: 1, borderColor: 'rgba(99,102,241,0.2)', borderRadius: 12, padding: 16, marginBottom: 16 },
  sheerIdIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(99,102,241,0.15)', alignItems: 'center', justifyContent: 'center' },
  sheerIdTitle: { fontSize: 14, fontWeight: 'bold', color: '#fff' },
  sheerIdDesc: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2, lineHeight: 16 },
  sheerIdBtn: { backgroundColor: '#4f46e5', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 12 },
  sheerIdBtnText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
});
