import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  FlatList, Animated, Image, KeyboardAvoidingView, Platform,
  TextInput
} from 'react-native';
import { CameraView } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useHaptics } from '../hooks/useHaptics';

const { width, height } = Dimensions.get('window');

const MOCK_COMMENTS = [
  { id: '1', user: 'alex_campus', text: 'LETS GOOO! 🔥' },
  { id: '2', user: 'sarah_j', text: 'Where is this??' },
  { id: '3', user: 'mike_t', text: 'Unigram live is sick' },
  { id: '4', user: 'prof_oak', text: 'Study hard everyone!' },
  { id: '5', user: 'lucy_sky', text: 'See you there! 🙌' },
];

export const LiveScreen: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const [comments, setComments] = useState<any[]>([]);
  const [viewers, setViewers] = useState(124);
  const [isFinishing, setIsFinishing] = useState(false);
  const heartsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Simulate incoming comments
    let count = 0;
    const interval = setInterval(() => {
      const idx = count % MOCK_COMMENTS.length;
      setComments(prev => [...prev.slice(-10), { ...MOCK_COMMENTS[idx], id: Date.now().toString() }]);
      count++;
      setViewers(v => v + Math.floor(Math.random() * 5) - 1);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const spawnHearts = () => {
    haptics.selection();
    // Simulate heart animation burst logic theoretically 
    // Simplified: we'll just show the UI for now
  };

  return (
    <View style={styles.container}>
      <CameraView style={StyleSheet.absoluteFill} facing="front" />
      
      {/* HUD Layer */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={[styles.topBar, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.liveBadgeRow}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <View style={styles.viewerBadge}>
              <Ionicons name="eye" size={12} color="#fff" />
              <Text style={styles.viewerText}>{viewers}</Text>
            </View>
          </View>

          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </LinearGradient>

        <View style={styles.bottomArea}>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.6)']}
            style={styles.commentGradient}
          >
            <FlatList
              data={comments}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <Text style={styles.commentUser}>{item.user}</Text>
                  <Text style={styles.commentText}>{item.text}</Text>
                </View>
              )}
              contentContainerStyle={styles.commentList}
            />
          </LinearGradient>

          <View style={[styles.inputRow, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.inputWrap}>
              <TextInput
                placeholder="Comment..."
                placeholderTextColor="rgba(255,255,255,0.7)"
                style={styles.input}
              />
            </View>
            
            <TouchableOpacity onPress={spawnHearts} style={styles.heartBtn}>
               <Ionicons name="heart" size={30} color="#ff3b30" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn}>
               <Ionicons name="paper-plane-outline" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    paddingHorizontal: 20, flexDirection: 'row', 
    justifyContent: 'space-between', alignItems: 'center',
    height: 120,
  },
  liveBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveBadge: { backgroundColor: '#ff3b30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  liveText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  viewerBadge: { backgroundColor: 'rgba(0,0,0,0.5)', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  viewerText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  closeBtn: { padding: 4 },

  bottomArea: { flex: 1, justifyContent: 'flex-end' },
  commentGradient: { height: 250, paddingBottom: 10 },
  commentList: { paddingHorizontal: 20, paddingBottom: 10 },
  commentItem: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  commentUser: { color: '#fff', fontWeight: '800', fontSize: 14 },
  commentText: { color: '#fff', fontSize: 14, flex: 1 },

  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 12 },
  inputWrap: { 
    flex: 1, height: 44, borderRadius: 22, 
    backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.3)', paddingHorizontal: 16,
    justifyContent: 'center'
  },
  input: { color: '#fff', fontSize: 14 },
  heartBtn: { padding: 4 },
  actionBtn: { padding: 4 },
});
