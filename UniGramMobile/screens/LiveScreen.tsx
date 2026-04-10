import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  FlatList, Animated, Image, KeyboardAvoidingView, Platform,
  TextInput,
  ActivityIndicator,
  Alert
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useHaptics } from '../hooks/useHaptics';
import { LiveService, LiveComment } from '../services/live';
import { supabase } from '../lib/supabase';
import { SocialSync } from '../services/social_sync'; // Verified path

const { width, height } = Dimensions.get('window');

const MOCK_COMMENTS = [
  { id: '1', user: 'alex_campus', text: 'LETS GOOO! 🔥' },
  { id: '2', user: 'sarah_j', text: 'Where is this??' },
  { id: '3', user: 'mike_t', text: 'Unigram live is sick' },
  { id: '4', user: 'prof_oak', text: 'Study hard everyone!' },
  { id: '5', user: 'lucy_sky', text: 'See you there! 🙌' },
];

export const LiveScreen: React.FC<{ 
  onClose: () => void;
  viewerSessionId?: string;
}> = ({ onClose, viewerSessionId }) => {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const [comments, setComments] = useState<LiveComment[]>([]);
  const [viewers, setViewers] = useState(0);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('front');
  const [commentText, setCommentText] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [isEnded, setIsEnded] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const heartsAnim = useRef(new Animated.Value(0)).current;

  const unsubscribeRef = useRef<(() => void) | null>(null);

  const setupSubscription = (id: string) => {
    if (unsubscribeRef.current) unsubscribeRef.current();
    
    unsubscribeRef.current = LiveService.subscribeToLive(
      id,
      (comment) => setComments(prev => [...prev.slice(-15), comment]),
      (update) => {
        if (update.viewer_count !== undefined) setViewers(update.viewer_count);
        if (update.status === 'ended') setIsEnded(true);
      },
      (emoji) => haptics.selection()
    );
  };

  useEffect(() => {
    const init = async () => {
      console.log('[Live] Initializing...');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn('[Live] No user found in session');
        return;
      }
      console.log('[Live] Found user:', user.id);
      setCurrentUserId(user.id);
      
      if (viewerSessionId) {
        console.log('[Live] Joining as viewer for session:', viewerSessionId);
        setSessionId(viewerSessionId);
        setIsLive(true);
        LiveService.joinLive(viewerSessionId);
        setupSubscription(viewerSessionId);
      } else {
        console.log('[Live] Preparing as broadcaster');
        if (!permission?.granted) {
          await requestPermission();
        }
      }
    };
    
    init();

    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
      if (viewerSessionId) {
        LiveService.leaveLive(viewerSessionId);
      }
    };
  }, []);

  const handleStartLive = async () => {
    haptics.selection(); // Immediate feedback
    console.log('[Live] Button tapped');
    
    // Ensure we have a user, try one last check if null
    let uid = currentUserId;
    if (!uid) {
      console.log('[Live] currentUserId null, retrying auth.getUser()...');
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        uid = data.user.id;
        setCurrentUserId(uid);
      }
    }

    if (!uid) {
      console.warn('[Live] Cannot start: currentUserId is null');
      Alert.alert('Session Error', 'Please log in again to start a live stream.');
      return;
    }
    if (isStarting) return;
    setIsStarting(true);
    console.log('[Live] Starting live session for user:', uid);
    try {
      const id = await LiveService.startLive(uid);
      console.log('[Live] Session created with ID:', id);
      setSessionId(id);
      setIsLive(true);
      SocialSync.emit('LIVE_STARTED', { id, targetId: uid });
      setupSubscription(id);
      haptics.success();
    } catch (err: any) {
      console.error('[Live] Failed to start live:', err);
      Alert.alert('Streaming Error', err.message || 'Could not start live session. Please check your connection.');
    } finally {
      setIsStarting(false);
    }
  };

  const handleEndLive = async () => {
    if (viewerSessionId) {
      onClose();
      return;
    }
    if (sessionId) {
      await LiveService.endLive(sessionId);
      SocialSync.emit('LIVE_ENDED', { id: sessionId });
      onClose();
    }
  };

  const handleSendComment = async () => {
    if (!commentText.trim() || !sessionId || !currentUserId) return;
    try {
      await LiveService.sendComment(sessionId, currentUserId, commentText);
      setCommentText('');
    } catch (err) {
      console.error('Send comment failed', err);
    }
  };

  const spawnHearts = () => {
    haptics.selection();
    if (sessionId) {
      LiveService.sendReaction(sessionId, '❤️');
    }
  };

  if (!permission) {
    return <View style={styles.container} />; // Loading
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="camera-reverse-outline" size={64} color="#333" />
        <Text style={{ color: '#fff', marginTop: 16 }}>Camera permission is required to go live.</Text>
        <TouchableOpacity 
          style={{ marginTop: 24, backgroundColor: '#007AFF', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 }}
          onPress={requestPermission}
        >
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity style={{ marginTop: 20 }} onPress={onClose}>
          <Text style={{ color: '#666' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!viewerSessionId ? (
        <CameraView style={StyleSheet.absoluteFill} facing={cameraFacing} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#111', alignItems: 'center', justifyContent: 'center' }]}>
           <Image 
             source={{ uri: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30' }} 
             style={[StyleSheet.absoluteFill, { opacity: 0.3 }]} 
             blurRadius={10}
           />
           <Ionicons name="videocam-outline" size={60} color="#6366f1" />
           <Text style={{ color: '#fff', marginTop: 16, fontWeight: '700' }}>Joining live stream...</Text>
        </View>
      )}

      {/* Ended State Overlay */}
      {isEnded && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }]}>
          <Ionicons name="videocam-off-outline" size={64} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginTop: 16 }}>Live video has ended</Text>
          <TouchableOpacity 
            style={{ marginTop: 24, backgroundColor: '#fff', paddingHorizontal: 30, paddingVertical: 12, borderRadius: 25 }}
            onPress={onClose}
          >
            <Text style={{ color: '#000', fontWeight: 'bold' }}>Done</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Broadcaster Pre-Live Overlay */}
      {!isLive && !viewerSessionId && (
        <View style={styles.preLiveOverlay}>
          <View style={[styles.preLiveHeader, { marginTop: insets.top + 10 }]}>
            <TouchableOpacity onPress={onClose} style={styles.pillBtn}>
               <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCameraFacing(f => f === 'front' ? 'back' : 'front')} style={styles.pillBtn}>
               <Ionicons name="camera-reverse-outline" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          
          <TouchableOpacity 
            style={[styles.goLiveBtn, { marginBottom: insets.bottom + 40 }, isStarting && { opacity: 0.7 }]} 
            onPress={handleStartLive}
            disabled={isStarting}
          >
             <LinearGradient colors={['#ff3b30', '#ff2d55']} style={styles.goLiveGradient}>
               {isStarting ? (
                 <ActivityIndicator color="#fff" />
               ) : (
                 <Text style={styles.goLiveText}>GO LIVE</Text>
               )}
             </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
      
      {/* Live HUD Layer */}
      {isLive && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={[styles.topBar, { paddingTop: insets.top + 10 }]}
        >
          <View style={styles.leftHeader}>
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            <View style={styles.viewerBadge}>
              <Ionicons name="eye-outline" size={14} color="#fff" />
              <Text style={styles.viewerText}>{viewers}</Text>
            </View>
          </View>
          
          <View style={styles.rightHeader}>
            {!viewerSessionId && (
              <>
                <TouchableOpacity onPress={() => setCameraFacing(f => f === 'front' ? 'back' : 'front')} style={styles.iconBtn}>
                  <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsMuted(!isMuted)} style={styles.iconBtn}>
                  <Ionicons name={isMuted ? "mic-off-outline" : "mic-outline"} size={22} color="#fff" />
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={handleEndLive} style={styles.closeBtn}>
               <Ionicons name="close" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
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
                  <Text style={styles.commentUser}>{item.profiles?.username ?? 'user'}</Text>
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
                value={commentText}
                onChangeText={setCommentText}
                onSubmitEditing={handleSendComment}
                returnKeyType="send"
              />
            </View>
            
            <TouchableOpacity onPress={spawnHearts} style={styles.heartBtn}>
               <Ionicons name="heart" size={30} color="#ff3b30" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={handleSendComment}>
               <Ionicons name="paper-plane-outline" size={26} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
        </View>
      )}
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
  leftHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rightHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBtn: { padding: 4 },
  
  preLiveOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'space-between' },
  preLiveHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20 },
  pillBtn: { backgroundColor: 'rgba(0,0,0,0.5)', padding: 12, borderRadius: 30 },
  goLiveBtn: { alignSelf: 'center', width: width * 0.5, height: 60, zIndex: 1000 },
  goLiveGradient: { flex: 1, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  goLiveText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 1.5 },

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
