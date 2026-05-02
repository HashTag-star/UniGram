import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  FlatList, Animated, KeyboardAvoidingView, Platform,
  TextInput, ActivityIndicator, BackHandler,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useHaptics } from '../hooks/useHaptics';
import { LiveService, LiveComment } from '../services/live';
import { supabase } from '../lib/supabase';
import { SocialSync } from '../services/social_sync';
import { usePopup } from '../context/PopupContext';
import { CachedImage } from '../components/CachedImage';

// Lazy-load WebRTC — static import crashes in Expo Go where native module is absent
let RTCPeerConnection: any;
let RTCIceCandidate: any;
let RTCSessionDescription: any;
let mediaDevices: any;
let RTCView: any;
let webRTCAvailable = false;

try {
  const W = require('react-native-webrtc');
  RTCPeerConnection = W.RTCPeerConnection;
  RTCIceCandidate = W.RTCIceCandidate;
  RTCSessionDescription = W.RTCSessionDescription;
  mediaDevices = W.mediaDevices;
  RTCView = W.RTCView;
  webRTCAvailable = true;
} catch {
  webRTCAvailable = false;
}

const { width } = Dimensions.get('window');

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

// ─── Floating Heart ───────────────────────────────────────────────────────────
const HEART_COLORS = ['#ff3b30', '#ff2d55', '#ff6b9d', '#ff9f1c', '#e040fb', '#ff6b6b'];

const FloatingHeart: React.FC<{ id: number; onDone: (id: number) => void }> = ({ id, onDone }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value((Math.random() - 0.5) * 50)).current;
  const size = 24 + (id % 3) * 10;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, tension: 60, friction: 5, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -(140 + Math.random() * 80), duration: 1400, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(700),
        Animated.timing(opacity, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    ]).start(() => onDone(id));
  }, []);

  return (
    <Animated.View style={{
      position: 'absolute', bottom: 130, right: 20 + (id % 6) * 10,
      transform: [{ translateY }, { translateX }, { scale }], opacity, zIndex: 999,
    }}>
      <Ionicons name="heart" size={size} color={HEART_COLORS[id % HEART_COLORS.length]} />
    </Animated.View>
  );
};

// ─── Comment Item ─────────────────────────────────────────────────────────────
const CommentRow: React.FC<{ item: LiveComment }> = React.memo(({ item }) => (
  <View style={s.commentRow}>
    {item.profiles?.avatar_url ? (
      <CachedImage uri={item.profiles.avatar_url} style={s.commentAvatar} />
    ) : (
      <View style={[s.commentAvatar, { backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' }]}>
        <Ionicons name="person" size={10} color="#555" />
      </View>
    )}
    <View style={s.commentBubble}>
      <Text style={s.commentUser}>{item.profiles?.username ?? 'user'}</Text>
      <Text style={s.commentText}> {item.text}</Text>
    </View>
  </View>
));

// ─── Main Screen ──────────────────────────────────────────────────────────────
export const LiveScreen: React.FC<{
  onClose: () => void;
  viewerSessionId?: string;
}> = ({ onClose, viewerSessionId }) => {
  const insets = useSafeAreaInsets();
  const { showPopup } = usePopup();
  const haptics = useHaptics();
  const isViewer = !!viewerSessionId;

  // ── Common state
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
  const [isEnding, setIsEnding] = useState(false);
  const [broadcasterProfile, setBroadcasterProfile] = useState<any>(null);
  const [hearts, setHearts] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [webrtcReady, setWebrtcReady] = useState(false);

  // ── WebRTC state
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);

  // ── Refs
  const heartIdRef = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const elapsedRef = useRef<any>(null);
  const sessionIdRef = useRef<string | null>(null);
  const currentUserIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<any>(null);

  // WebRTC refs
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map()); // broadcaster: viewerId → pc
  const viewerPcRef = useRef<RTCPeerConnection | null>(null); // viewer's single pc
  const signalingChannelRef = useRef<any>(null);
  const iceCandidateBufferRef = useRef<Map<string, any[]>>(new Map());

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.8)).current;
  const viewerBumpAnim = useRef(new Animated.Value(1)).current;
  const endedFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  // Pulsing ring
  useEffect(() => {
    const loop = Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.18, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(pulseOpacity, { toValue: 0.3, duration: 900, useNativeDriver: true }),
        Animated.timing(pulseOpacity, { toValue: 0.8, duration: 900, useNativeDriver: true }),
      ]),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);

  // Elapsed timer
  useEffect(() => {
    if (isLive && !isViewer) {
      elapsedRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [isLive, isViewer]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  // ── WebRTC helpers ────────────────────────────────────────────────────────

  const flushIceCandidates = useCallback(async (pc: RTCPeerConnection, peerId: string) => {
    const buf = iceCandidateBufferRef.current.get(peerId) ?? [];
    for (const c of buf) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    iceCandidateBufferRef.current.delete(peerId);
  }, []);

  const safeAddIceCandidate = useCallback(async (pc: RTCPeerConnection, peerId: string, candidate: any) => {
    if (pc.remoteDescription) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    } else {
      const buf = iceCandidateBufferRef.current.get(peerId) ?? [];
      buf.push(candidate);
      iceCandidateBufferRef.current.set(peerId, buf);
    }
  }, []);

  // Broadcaster: create a peer connection for one viewer
  const createPeerForViewer = useCallback(async (viewerId: string, stream: any, signalChannel: any) => {
    if (peerConnectionsRef.current.has(viewerId)) return;

    const pc = new RTCPeerConnection(ICE_SERVERS as any);
    peerConnectionsRef.current.set(viewerId, pc);

    // Add local tracks
    stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));

    // Send ICE candidates to this viewer
    (pc as any).onicecandidate = ({ candidate }: any) => {
      if (candidate) {
        signalChannel.send({
          type: 'broadcast', event: 'ice-bc',
          payload: { to: viewerId, candidate: candidate.toJSON() },
        });
      }
    };

    (pc as any).onconnectionstatechange = () => {
      if ((pc as any).connectionState === 'failed' || (pc as any).connectionState === 'closed') {
        peerConnectionsRef.current.delete(viewerId);
      }
    };

    // Create and send offer
    const offer = await pc.createOffer({});
    await pc.setLocalDescription(offer as any);
    signalChannel.send({
      type: 'broadcast', event: 'offer',
      payload: { to: viewerId, offer: { type: offer.type, sdp: offer.sdp } },
    });

    return pc;
  }, []);

  // Viewer: create peer connection to broadcaster
  const createViewerPeerConnection = useCallback((signalChannel: any) => {
    const pc = new RTCPeerConnection(ICE_SERVERS as any);
    viewerPcRef.current = pc;

    // Receive broadcaster's video/audio
    (pc as any).ontrack = (event: any) => {
      const streams = event.streams;
      if (streams?.[0]) setRemoteStream(streams[0]);
    };

    // Send ICE candidates to broadcaster
    (pc as any).onicecandidate = ({ candidate }: any) => {
      if (candidate) {
        signalChannel.send({
          type: 'broadcast', event: 'ice-vw',
          payload: { from: currentUserIdRef.current, candidate: candidate.toJSON() },
        });
      }
    };

    return pc;
  }, []);

  // ── Supabase live subscription (comments + session updates + reactions) ───

  const setupSubscription = useCallback((id: string) => {
    if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
    unsubscribeRef.current = LiveService.subscribeToLive(
      id,
      (comment) => {
        setComments(prev => [...prev.slice(-49), comment]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 80);
      },
      (update) => {
        if (update.viewer_count !== undefined) {
          setViewers(update.viewer_count);
          Animated.sequence([
            Animated.timing(viewerBumpAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
            Animated.timing(viewerBumpAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
          ]).start();
        }
        if (update.status === 'ended') {
          Animated.timing(endedFadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
          setIsEnded(true);
        }
      },
      () => { haptics.selection(); spawnHeart(); }
    );
  }, []);

  // ── Signaling channel (WebRTC) ────────────────────────────────────────────

  const setupBroadcasterSignaling = useCallback((sessionId: string, stream: any) => {
    const channel = supabase.channel(`live-signal-${sessionId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'viewer-join' }, async ({ payload }: any) => {
        const { viewerId } = payload;
        if (!viewerId) return;
        await createPeerForViewer(viewerId, stream, channel);
      })
      .on('broadcast', { event: 'answer' }, async ({ payload }: any) => {
        const { from: viewerId, answer } = payload;
        const pc = peerConnectionsRef.current.get(viewerId);
        if (!pc || pc.remoteDescription) return;
        await pc.setRemoteDescription(new RTCSessionDescription(answer) as any);
        await flushIceCandidates(pc, viewerId);
      })
      .on('broadcast', { event: 'ice-vw' }, async ({ payload }: any) => {
        const { from: viewerId, candidate } = payload;
        const pc = peerConnectionsRef.current.get(viewerId);
        if (pc) await safeAddIceCandidate(pc, viewerId, candidate);
      })
      .subscribe();

    signalingChannelRef.current = channel;
  }, [createPeerForViewer, flushIceCandidates, safeAddIceCandidate]);

  const setupViewerSignaling = useCallback((sessionId: string, uid: string) => {
    const channel = supabase.channel(`live-signal-${sessionId}`, {
      config: { broadcast: { self: false } },
    });

    const pc = createViewerPeerConnection(channel);

    channel
      .on('broadcast', { event: 'offer' }, async ({ payload }: any) => {
        const { to, offer } = payload;
        if (to !== uid) return;
        const currentPc = viewerPcRef.current;
        if (!currentPc || currentPc.remoteDescription) return;
        await currentPc.setRemoteDescription(new RTCSessionDescription(offer) as any);
        await flushIceCandidates(currentPc, 'broadcaster');
        const answer = await currentPc.createAnswer();
        await currentPc.setLocalDescription(answer as any);
        channel.send({
          type: 'broadcast', event: 'answer',
          payload: { from: uid, answer: { type: answer.type, sdp: answer.sdp } },
        });
      })
      .on('broadcast', { event: 'ice-bc' }, async ({ payload }: any) => {
        const { to, candidate } = payload;
        if (to !== uid) return;
        const currentPc = viewerPcRef.current;
        if (currentPc) await safeAddIceCandidate(currentPc, 'broadcaster', candidate);
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Announce presence after channel is ready
          setTimeout(() => {
            channel.send({
              type: 'broadcast', event: 'viewer-join',
              payload: { viewerId: uid },
            });
          }, 300);
        }
      });

    signalingChannelRef.current = channel;
  }, [createViewerPeerConnection, flushIceCandidates, safeAddIceCandidate]);

  // ── Get local camera stream (broadcaster) ────────────────────────────────

  const getLocalStream = useCallback(async (): Promise<any> => {
    return await mediaDevices.getUserMedia({
      audio: true,
      video: { width: 720, height: 1280, frameRate: 30, facingMode: 'user' },
    });
  }, []);

  // ── Camera flip ───────────────────────────────────────────────────────────

  const handleFlipCamera = useCallback(() => {
    setCameraFacing(prev => prev === 'front' ? 'back' : 'front');
    // react-native-webrtc native camera toggle — no new stream needed
    const videoTrack = (localStreamRef.current?.getVideoTracks()[0] as any);
    if (videoTrack?._switchCamera) videoTrack._switchCamera();
  }, []);

  // ── Mute ─────────────────────────────────────────────────────────────────

  const handleToggleMute = useCallback(() => {
    setIsMuted(prev => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach((t: any) => { t.enabled = !next; });
      return next;
    });
  }, []);

  // ── Cleanup all WebRTC ────────────────────────────────────────────────────

  const cleanupWebRTC = useCallback(() => {
    peerConnectionsRef.current.forEach((pc: any) => {
      try { pc.close(); } catch {}
    });
    peerConnectionsRef.current.clear();

    if (viewerPcRef.current) {
      try { (viewerPcRef.current as any).close(); } catch {}
      viewerPcRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());

    if (signalingChannelRef.current) {
      supabase.removeChannel(signalingChannelRef.current);
      signalingChannelRef.current = null;
    }

    iceCandidateBufferRef.current.clear();
    setLocalStream(null);
    setRemoteStream(null);
  }, []);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      if (isViewer && viewerSessionId) {
        setSessionId(viewerSessionId);
        setIsLive(true);
        LiveService.joinLive(viewerSessionId).catch(() => {});
        setupSubscription(viewerSessionId);

        const { data: ls } = await supabase
          .from('live_sessions')
          .select('*, profiles(id, username, avatar_url, is_verified)')
          .eq('id', viewerSessionId)
          .single();

        if (ls) {
          setBroadcasterProfile(ls.profiles);
          setViewers(ls.viewer_count ?? 0);
          if (ls.status === 'ended') {
            setIsEnded(true);
            return;
          }
        }

        try {
          const existing = await LiveService.getComments(viewerSessionId);
          setComments(existing);
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 200);
        } catch {}

        // Start WebRTC as viewer
        setupViewerSignaling(viewerSessionId, user.id);
      } else {
        // Broadcaster: get camera stream up-front so preview is immediate
        try {
          const stream = await getLocalStream();
          setLocalStream(stream);
          setWebrtcReady(true);
        } catch (e) {
          console.warn('Could not get camera:', e);
        }
      }
    };

    init();

    const backSub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExit();
      return true;
    });

    return () => {
      backSub.remove();
      if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
      if (isViewer && viewerSessionId) LiveService.leaveLive(viewerSessionId).catch(() => {});
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      cleanupWebRTC();
    };
  }, []);

  // ── Start live ────────────────────────────────────────────────────────────

  const handleStartLive = async () => {
    if (isStarting) return;
    setIsStarting(true);
    haptics.selection();

    let uid = currentUserId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data.user?.id ?? null;
      if (uid) setCurrentUserId(uid);
    }
    if (!uid) {
      setIsStarting(false);
      return;
    }

    try {
      // Get stream if not already ready
      let stream = localStreamRef.current;
      if (!stream) {
        stream = await getLocalStream();
        setLocalStream(stream);
      }

      const id = await LiveService.startLive(uid);
      setSessionId(id);
      setIsLive(true);
      SocialSync.emit('LIVE_STARTED', { id, targetId: uid });
      setupSubscription(id);
      setupBroadcasterSignaling(id, stream);
      haptics.success();
    } catch (err: any) {
      showPopup({
        title: 'Streaming Error',
        message: err.message || 'Could not start live session.',
        icon: 'videocam-off-outline',
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
    } finally {
      setIsStarting(false);
    }
  };

  const spawnHeart = useCallback(() => {
    const id = heartIdRef.current++;
    setHearts(prev => [...prev, id]);
  }, []);

  const removeHeart = useCallback((id: number) => {
    setHearts(prev => prev.filter(h => h !== id));
  }, []);

  const doEndLive = useCallback(async () => {
    const id = sessionIdRef.current;
    setIsEnding(true);
    if (unsubscribeRef.current) { unsubscribeRef.current(); unsubscribeRef.current = null; }
    if (elapsedRef.current) clearInterval(elapsedRef.current);
    if (id) {
      try { await LiveService.endLive(id); } catch {}
      SocialSync.emit('LIVE_ENDED', { id });
    }
    cleanupWebRTC();
    onClose();
  }, [onClose, cleanupWebRTC]);

  const handleExit = useCallback(() => {
    if (isViewer) {
      if (viewerSessionId) LiveService.leaveLive(viewerSessionId).catch(() => {});
      cleanupWebRTC();
      if (unsubscribeRef.current) { unsubscribeRef.current(); }
      onClose();
      return;
    }
    if (!isLive) {
      cleanupWebRTC();
      onClose();
      return;
    }
    showPopup({
      title: 'End Live Stream?',
      message: 'This will end the broadcast for everyone watching.',
      icon: 'videocam-off-outline',
      iconColor: '#ff453a',
      buttons: [
        { text: 'Cancel', style: 'cancel', onPress: () => {} },
        { text: 'End Live', style: 'destructive', onPress: doEndLive },
      ],
    });
  }, [isViewer, isLive, viewerSessionId, doEndLive, onClose, showPopup, cleanupWebRTC]);

  const handleSendComment = async () => {
    const text = commentText.trim();
    if (!text || !sessionId || !currentUserId) return;
    setCommentText('');
    try { await LiveService.sendComment(sessionId, currentUserId, text); } catch {}
  };

  const handleReaction = () => {
    haptics.selection();
    spawnHeart();
    if (sessionId) LiveService.sendReaction(sessionId, '❤️');
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // WebRTC native module not available (Expo Go) — show dev build gate
  if (!webRTCAvailable) {
    return (
      <View style={[s.container, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#05000f', padding: 32 }]}>
        <LinearGradient colors={['#130022', '#05000f', '#000']} style={StyleSheet.absoluteFill} />
        <Ionicons name="videocam-off-outline" size={52} color="#ef4444" style={{ marginBottom: 20 }} />
        <Text style={{ color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 10 }}>
          Live Streaming Unavailable
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
          Live streaming requires a development build.{'\n'}
          Run <Text style={{ color: '#818cf8', fontWeight: '700' }}>eas build</Text> or{' '}
          <Text style={{ color: '#818cf8', fontWeight: '700' }}>expo run:android</Text> to unlock this feature.
        </Text>
        <TouchableOpacity
          onPress={onClose}
          style={{ backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14 }}
          activeOpacity={0.8}
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>

      {/* ── Video background ── */}
      {!isViewer && localStream ? (
        // Broadcaster: live camera preview via WebRTC
        <RTCView
          streamURL={(localStream as any).toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          mirror={cameraFacing === 'front'}
          zOrder={0}
        />
      ) : isViewer && remoteStream ? (
        // Viewer: broadcaster's live video via WebRTC
        <RTCView
          streamURL={(remoteStream as any).toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          zOrder={0}
        />
      ) : (
        // Fallback: dark gradient while connecting
        <View style={StyleSheet.absoluteFill}>
          {broadcasterProfile?.avatar_url && (
            <CachedImage
              uri={broadcasterProfile.avatar_url}
              style={[StyleSheet.absoluteFill, { opacity: 0.12 }]}
            />
          )}
          <LinearGradient colors={['#130022', '#05000f', '#000']} style={StyleSheet.absoluteFill} />
        </View>
      )}

      {/* Scrim gradients */}
      <LinearGradient
        colors={['rgba(0,0,0,0.72)', 'transparent']}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 180 }}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.88)']}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 340 }}
        pointerEvents="none"
      />

      {/* Floating hearts */}
      {hearts.map(id => <FloatingHeart key={id} id={id} onDone={removeHeart} />)}

      {/* ── Live Ended Overlay ── */}
      {isEnded && (
        <Animated.View style={[s.endedOverlay, { opacity: endedFadeAnim }]}>
          <LinearGradient colors={['rgba(0,0,0,0.93)', 'rgba(0,0,0,0.98)']} style={StyleSheet.absoluteFill} />
          <View style={s.endedInner}>
            <View style={s.endedIconWrap}>
              <Ionicons name="videocam-off" size={40} color="#fff" />
            </View>
            <Text style={s.endedTitle}>Live Stream Ended</Text>
            <Text style={s.endedSub}>
              {broadcasterProfile?.username ? `@${broadcasterProfile.username}'s` : 'The'} live stream has ended
            </Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.85}>
              <LinearGradient colors={['#9333ea', '#6366f1']} style={s.endedBtn}>
                <Text style={s.endedBtnText}>Close</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      {/* ── Pre-Live (broadcaster) ── */}
      {!isLive && !isViewer && (
        <View style={StyleSheet.absoluteFill}>
          <View style={[s.preLiveTopRow, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity style={s.preLiveIconBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={s.preLiveIconBtn} onPress={handleFlipCamera}>
              <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          <View style={s.preLiveCenter}>
            <LinearGradient colors={['#ff3b30', '#ff2d55']} style={s.preLiveIconCircle}>
              <Ionicons name="radio-outline" size={34} color="#fff" />
            </LinearGradient>
            <Text style={s.preLiveTitle}>Ready to Go Live?</Text>
            <Text style={s.preLiveSub}>Your followers will be notified</Text>
          </View>

          <TouchableOpacity
            style={[s.goLiveWrap, { bottom: insets.bottom + 48 }, isStarting && { opacity: 0.6 }]}
            onPress={handleStartLive}
            disabled={isStarting}
            activeOpacity={0.85}
          >
            <LinearGradient colors={['#ff3b30', '#c0392b']} style={s.goLiveGrad}>
              {isStarting
                ? <ActivityIndicator color="#fff" size="small" />
                : <><Ionicons name="radio" size={19} color="#fff" /><Text style={s.goLiveText}>GO LIVE</Text></>
              }
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Live HUD ── */}
      {isLive && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">

          {/* Top bar */}
          <View style={[s.topBar, { paddingTop: insets.top + 8 }]}>
            <View style={s.topLeft}>
              {isViewer && broadcasterProfile ? (
                <TouchableOpacity style={s.broadcasterRow} activeOpacity={0.8}>
                  <View style={s.bcAvatarWrap}>
                    <Animated.View style={[s.bcPulseRing, { transform: [{ scale: pulseAnim }], opacity: pulseOpacity }]} />
                    {broadcasterProfile.avatar_url
                      ? <CachedImage uri={broadcasterProfile.avatar_url} style={s.bcAvatar} />
                      : <View style={[s.bcAvatar, { backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="person" size={14} color="#fff" /></View>
                    }
                  </View>
                  <View>
                    <Text style={s.bcName} numberOfLines={1}>@{broadcasterProfile.username}</Text>
                    <View style={s.livePill}>
                      <View style={s.liveDot} />
                      <Text style={s.livePillText}>LIVE</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                <View style={s.broadcasterRow}>
                  <View style={s.livePill}>
                    <View style={s.liveDot} />
                    <Text style={s.livePillText}>LIVE</Text>
                  </View>
                  <Text style={s.elapsedText}>{fmtTime(elapsed)}</Text>
                </View>
              )}
              <Animated.View style={[s.viewerPill, { transform: [{ scale: viewerBumpAnim }] }]}>
                <Ionicons name="eye" size={12} color="rgba(255,255,255,0.7)" />
                <Text style={s.viewerCountText}>{viewers}</Text>
              </Animated.View>
            </View>

            <View style={s.topRight}>
              {!isViewer && (
                <>
                  <TouchableOpacity style={s.ctrlBtn} onPress={handleFlipCamera}>
                    <Ionicons name="camera-reverse-outline" size={21} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.ctrlBtn} onPress={handleToggleMute}>
                    <Ionicons name={isMuted ? 'mic-off' : 'mic-outline'} size={21} color={isMuted ? '#ff3b30' : '#fff'} />
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={[s.exitPill, isViewer ? s.exitPillLeave : s.exitPillEnd, isEnding && { opacity: 0.55 }]}
                onPress={handleExit}
                disabled={isEnding}
                activeOpacity={0.8}
              >
                {isEnding
                  ? <ActivityIndicator size="small" color="#ff453a" style={{ width: 36 }} />
                  : <Text style={[s.exitPillText, !isViewer && { color: '#ff453a' }]}>{isViewer ? 'Leave' : 'End'}</Text>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Viewer connecting indicator — shown until video arrives */}
          {isViewer && !remoteStream && !isEnded && (
            <View style={s.connectingWrap} pointerEvents="none">
              <View style={s.viewerAvatarWrap}>
                <Animated.View style={[s.vcPulse1, { transform: [{ scale: pulseAnim }], opacity: pulseOpacity }]} />
                <View style={s.vcPulse2} />
                {broadcasterProfile?.avatar_url
                  ? <CachedImage uri={broadcasterProfile.avatar_url} style={s.vcAvatar} />
                  : <View style={[s.vcAvatar, { backgroundColor: '#1e1e2e', alignItems: 'center', justifyContent: 'center' }]}><Ionicons name="person" size={44} color="#555" /></View>
                }
              </View>
              <View style={s.vcLiveBadge}>
                <View style={s.liveDot} />
                <Text style={s.vcLiveText}>LIVE</Text>
              </View>
              <Text style={s.vcName}>{broadcasterProfile?.username ? `@${broadcasterProfile.username}` : ''}</Text>
              <ActivityIndicator color="rgba(255,255,255,0.4)" style={{ marginTop: 12 }} />
              <Text style={s.connectingText}>Connecting to stream…</Text>
            </View>
          )}

          {/* Bottom: comments + input */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.bottomArea}>
            <FlatList
              ref={flatListRef}
              data={comments}
              keyExtractor={item => item.id}
              style={s.commentList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => <CommentRow item={item} />}
              contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 8 }}
              removeClippedSubviews
              maxToRenderPerBatch={10}
              windowSize={5}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />

            <View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom + 12, 20) }]}>
              <View style={s.inputWrap}>
                <TextInput
                  placeholder="Comment…"
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  style={s.input}
                  value={commentText}
                  onChangeText={setCommentText}
                  onSubmitEditing={handleSendComment}
                  returnKeyType="send"
                  blurOnSubmit={false}
                />
                {commentText.trim().length > 0 && (
                  <TouchableOpacity onPress={handleSendComment} style={s.sendBtn}>
                    <LinearGradient colors={['#9333ea', '#6366f1']} style={s.sendBtnGrad}>
                      <Ionicons name="send" size={14} color="#fff" />
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={s.heartReactBtn} onPress={handleReaction} activeOpacity={0.7}>
                <Ionicons name="heart" size={28} color="#ff3b30" />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // Pre-live
  preLiveTopRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 18 },
  preLiveIconBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  preLiveCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  preLiveIconCircle: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  preLiveTitle: { color: '#fff', fontSize: 26, fontWeight: '900' },
  preLiveSub: { color: 'rgba(255,255,255,0.5)', fontSize: 15 },
  goLiveWrap: { position: 'absolute', alignSelf: 'center', width: width * 0.54, height: 56 },
  goLiveGrad: { flex: 1, borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#ff3b30', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 16, elevation: 10 },
  goLiveText: { color: '#fff', fontSize: 17, fontWeight: '900', letterSpacing: 1.5 },

  // Top bar
  topBar: { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 14, zIndex: 20 },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Live pill
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ff3b30', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  livePillText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  elapsedText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '600' },

  viewerPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  viewerCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  broadcasterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bcAvatarWrap: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  bcPulseRing: { position: 'absolute', width: 38, height: 38, borderRadius: 19, borderWidth: 2.5, borderColor: '#ff3b30' },
  bcAvatar: { width: 30, height: 30, borderRadius: 15 },
  bcName: { color: '#fff', fontSize: 12, fontWeight: '700', maxWidth: 90 },

  ctrlBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  exitPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 14, borderWidth: 1 },
  exitPillLeave: { backgroundColor: 'rgba(0,0,0,0.45)', borderColor: 'rgba(255,255,255,0.2)' },
  exitPillEnd: { backgroundColor: 'rgba(255,67,58,0.12)', borderColor: 'rgba(255,67,58,0.4)' },
  exitPillText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Viewer connecting state
  connectingWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 150, alignItems: 'center', justifyContent: 'center' },
  viewerAvatarWrap: { width: 128, height: 128, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  vcPulse1: { position: 'absolute', width: 128, height: 128, borderRadius: 64, borderWidth: 3, borderColor: '#ff3b30' },
  vcPulse2: { position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 1.5, borderColor: 'rgba(255,59,48,0.35)' },
  vcAvatar: { width: 94, height: 94, borderRadius: 47 },
  vcLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ff3b30', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, marginBottom: 10 },
  vcLiveText: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  vcName: { color: '#fff', fontSize: 19, fontWeight: '800' },
  connectingText: { color: 'rgba(255,255,255,0.35)', fontSize: 13, marginTop: 6 },

  // Comments
  bottomArea: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  commentList: { maxHeight: 210 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, marginBottom: 7 },
  commentAvatar: { width: 26, height: 26, borderRadius: 13 },
  commentBubble: { flexDirection: 'row', flexShrink: 1, backgroundColor: 'rgba(0,0,0,0.42)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, maxWidth: width * 0.72 },
  commentUser: { color: '#e0e0ff', fontWeight: '800', fontSize: 12 },
  commentText: { color: 'rgba(255,255,255,0.88)', fontSize: 12, flexShrink: 1 },

  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 },
  inputWrap: { flex: 1, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  input: { flex: 1, color: '#fff', fontSize: 14 },
  sendBtn: { marginLeft: 4 },
  sendBtnGrad: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heartReactBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,59,48,0.14)', alignItems: 'center', justifyContent: 'center' },

  // Ended overlay
  endedOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 2000, alignItems: 'center', justifyContent: 'center' },
  endedInner: { alignItems: 'center', paddingHorizontal: 32 },
  endedIconWrap: { width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  endedTitle: { color: '#fff', fontSize: 24, fontWeight: '900', marginBottom: 8 },
  endedSub: { color: 'rgba(255,255,255,0.45)', fontSize: 15, textAlign: 'center', marginBottom: 36 },
  endedBtn: { paddingHorizontal: 52, paddingVertical: 15, borderRadius: 28 },
  endedBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
