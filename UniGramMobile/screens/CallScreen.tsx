import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  StatusBar, Vibration, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
  mediaDevices,
  MediaStream,
  RTCView,
} from '../lib/webrtc-shim';
import {
  answerCall, declineCall, endCall,
  sendIceCandidate, subscribeToCall, subscribeToIceCandidates,
  CallRecord, CallType,
} from '../services/calls';

import { useHaptics } from '../hooks/useHaptics';

const { width, height } = Dimensions.get('window');

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

interface Props {
  call: CallRecord;
  currentUserId: string;
  isIncoming: boolean;
  onCallEnd: () => void;
}

export const CallScreen: React.FC<Props> = ({ call, currentUserId, isIncoming, onCallEnd }) => {
  const insets = useSafeAreaInsets();
  const [callState, setCallState] = useState<'ringing' | 'connecting' | 'active' | 'ended'>(
    isIncoming ? 'ringing' : 'connecting',
  );
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(!isIncoming);
  const [cameraOn, setCameraOn] = useState(call.type === 'video');
  const [cameraFront, setCameraFront] = useState(true);
  const [showControls, setShowControls] = useState(true);
  
  const pcRef = useRef<any>(null);
  const localStreamRef = useRef<any>(null);
  const remoteStreamRef = useRef<any>(null);
  const [localStream, setLocalStream] = useState<any>(null);
  const [remoteStream, setRemoteStream] = useState<any>(null);
  const callChannelRef = useRef<any>(null);
  const iceChannelRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const controlsTimerRef = useRef<any>(null);
  
  const { medium: hapticMedium, success: hapticSuccess, heavy: hapticHeavy } = useHaptics();

  const isVideo = call.type === 'video';
  const otherProfile = isIncoming ? call.caller_profile : null;

  const fmtDuration = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Duration timer
  useEffect(() => {
    if (callState === 'active') {
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [callState]);

  // Auto-hide controls for video calls
  useEffect(() => {
    if (isVideo && callState === 'active') {
      resetControlsTimer();
    }
    return () => { if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current); };
  }, [isVideo, callState]);

  const resetControlsTimer = () => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    setShowControls(true);
    controlsTimerRef.current = setTimeout(() => {
      if (callState === 'active') setShowControls(false);
    }, 4000);
  };

  const handleContainerPress = () => {
    if (isVideo && callState === 'active') {
      if (showControls) setShowControls(false);
      else resetControlsTimer();
    }
  };

  // Vibrate on incoming ring
  useEffect(() => {
    if (isIncoming && callState === 'ringing') {
      const pattern = [0, 1000, 800, 1000, 800, 1000];
      Vibration.vibrate(pattern, true);
    }
    return () => Vibration.cancel();
  }, [isIncoming, callState]);

  const setupPeerConnection = useCallback(async () => {
    const pc = new (RTCPeerConnection as any)({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // Get local media
    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: isVideo ? { facingMode: cameraFront ? 'user' : 'environment' } : false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      stream.getTracks().forEach((track: any) => pc.addTrack(track, stream));
    } catch (e) {
      console.error('getUserMedia failed:', e);
    }

    // Remote stream
    pc.ontrack = (event: any) => {
      if (event.streams?.[0]) {
        remoteStreamRef.current = event.streams[0];
        setRemoteStream(event.streams[0]);
      }
    };

    // ICE candidates
    pc.onicecandidate = (event: any) => {
      if (event.candidate) {
        sendIceCandidate(call.id, currentUserId, event.candidate.toJSON()).catch(console.error);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') setCallState('active');
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        handleHangup();
      }
    };

    return pc;
  }, [call.id, currentUserId, isVideo, cameraFront]);

  // Outgoing call: create offer
  useEffect(() => {
    if (isIncoming) return;

    let cancelled = false;
    (async () => {
      const pc = await setupPeerConnection();
      if (cancelled) return;

      // Offer already created before initiating — set it locally
      if (call.offer) {
        await pc.setRemoteDescription(new (RTCSessionDescription as any)(call.offer as any));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
      }

      // Subscribe to answer + ICE
      callChannelRef.current = subscribeToCall(call.id, async (updated) => {
        if (cancelled) return;
        if (updated.status === 'declined' || updated.status === 'ended' || updated.status === 'missed') {
          setCallState('ended');
          setTimeout(onCallEnd, 1200);
          return;
        }
        if (updated.status === 'active' && updated.answer && pc.signalingState !== 'stable') {
          try {
            await pc.setRemoteDescription(new (RTCSessionDescription as any)(updated.answer as any));
          } catch (e) { console.error('setRemoteDescription failed:', e); }
        }
      });

      iceChannelRef.current = subscribeToIceCandidates(call.id, currentUserId, async (candidate) => {
        if (pc.remoteDescription) {
          try { await pc.addIceCandidate(new (RTCIceCandidate as any)(candidate)); } catch {}
        }
      });
    })();

    return () => { cancelled = true; };
  }, []);

  // Incoming call: wait for accept
  const handleAccept = useCallback(async () => {
    hapticSuccess();
    Vibration.cancel();
    setCallState('connecting');

    const pc = await setupPeerConnection();
    await pc.setRemoteDescription(new (RTCSessionDescription as any)(call.offer as any));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await answerCall(call.id, answer);

    iceChannelRef.current = subscribeToIceCandidates(call.id, currentUserId, async (candidate) => {
      try { await pc.addIceCandidate(new (RTCIceCandidate as any)(candidate)); } catch {}
    });

    callChannelRef.current = subscribeToCall(call.id, (updated) => {
      if (updated.status === 'ended' || updated.status === 'declined') {
        setCallState('ended');
        setTimeout(onCallEnd, 1200);
      }
    });
  }, [call, currentUserId, setupPeerConnection, onCallEnd, hapticSuccess]);

  const handleDecline = useCallback(async () => {
    hapticHeavy();
    Vibration.cancel();
    await declineCall(call.id).catch(console.error);
    setCallState('ended');
    setTimeout(onCallEnd, 800);
  }, [call.id, onCallEnd, hapticHeavy]);

  const handleHangup = useCallback(async () => {
    hapticHeavy();
    clearInterval(timerRef.current);
    Vibration.cancel();

    localStreamRef.current?.getTracks().forEach((t: any) => t.stop());
    pcRef.current?.close();
    callChannelRef.current?.unsubscribe();
    iceChannelRef.current?.unsubscribe();

    await endCall(call.id).catch(console.error);
    setCallState('ended');
    setTimeout(onCallEnd, 800);
  }, [call.id, onCallEnd, hapticHeavy]);

  const toggleMute = useCallback(() => {
    hapticMedium();
    localStreamRef.current?.getAudioTracks().forEach((t: any) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((m) => !m);
    resetControlsTimer();
  }, [hapticMedium]);

  const toggleCamera = useCallback(() => {
    hapticMedium();
    localStreamRef.current?.getVideoTracks().forEach((t: any) => {
      t.enabled = !t.enabled;
    });
    setCameraOn((c) => !c);
    resetControlsTimer();
  }, [hapticMedium]);

  const flipCamera = useCallback(() => {
    hapticMedium();
    localStreamRef.current?.getVideoTracks().forEach((t: any) => {
      t._switchCamera?.();
    });
    setCameraFront((f) => !f);
    resetControlsTimer();
  }, [hapticMedium]);

  // ── Ringing (incoming) ──────────────────────────────────────────────────────
  if (callState === 'ringing' && isIncoming) {
    return (
      <View style={[styles.container, styles.ringingBg]}>
        <StatusBar barStyle="light-content" />
        
        {/* Immersive background simulation */}
        <View style={StyleSheet.absoluteFill}>
          {otherProfile?.avatar_url && (
            <Image source={{ uri: otherProfile.avatar_url }} style={[StyleSheet.absoluteFill, { opacity: 0.3 }]} blurRadius={60} />
          )}
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)' }]} />
        </View>

        <View style={[styles.ringingTop, { paddingTop: insets.top + 60 }]}>
          <Text style={styles.incomingLabel}>
            UniGram {call.type === 'video' ? 'Video' : 'Voice'} Call
          </Text>
          <View style={styles.avatarGlowContainer}>
             {otherProfile?.avatar_url ? (
               <Image source={{ uri: otherProfile.avatar_url }} style={styles.callerAvatarImmersive} />
             ) : (
               <View style={[styles.callerAvatarImmersive, styles.callerAvatarPlaceholder]}>
                 <Ionicons name="person" size={52} color="rgba(255,255,255,0.4)" />
               </View>
             )}
          </View>
          <Text style={styles.callerNameImmersive}>
            {otherProfile?.full_name || otherProfile?.username || 'Unknown'}
          </Text>
          <Text style={styles.callerUsername}>@{otherProfile?.username}</Text>
        </View>

        <View style={[styles.ringingActions, { paddingBottom: insets.bottom + 60 }]}>
          <View style={styles.ringingBtn}>
            <TouchableOpacity style={[styles.callActionCircle, styles.declineCircle]} onPress={handleDecline}>
              <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </TouchableOpacity>
            <Text style={styles.callActionLabel}>Decline</Text>
          </View>
          <View style={styles.ringingBtn}>
            <TouchableOpacity style={[styles.callActionCircle, styles.acceptCircle]} onPress={handleAccept}>
              <Ionicons name="call" size={32} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.callActionLabel}>Accept</Text>
          </View>
        </View>
      </View>
    );
  }

  // ── Active / Connecting ─────────────────────────────────────────────────────
  return (
    <TouchableOpacity 
      style={styles.container} 
      activeOpacity={1} 
      onPress={handleContainerPress}
    >
      <StatusBar barStyle="light-content" />

      {/* Video streams */}
      {isVideo && remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={StyleSheet.absoluteFill}
          objectFit="cover"
          mirror={false}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.audioBg]}>
           <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
             {otherProfile?.avatar_url ? (
                <Image source={{ uri: otherProfile.avatar_url }} style={styles.activeCallAvatar} />
             ) : (
                <View style={[styles.activeCallAvatar, { backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }]}>
                  <Ionicons name="person" size={60} color="rgba(255,255,255,0.2)" />
                </View>
             )}
             <Text style={styles.activeCallName}>{otherProfile?.full_name || otherProfile?.username}</Text>
             <Text style={styles.callStateLabel}>
               {callState === 'connecting' ? 'Connecting…' : fmtDuration(duration)}
             </Text>
           </View>
        </View>
      )}

      {/* Local preview (video only) */}
      {isVideo && localStream && cameraOn && (
        <RTCView
          streamURL={localStream.toURL()}
          style={[styles.localPreview, !showControls && { top: insets.top + 16 }]}
          objectFit="cover"
          mirror={cameraFront}
          zOrder={1}
        />
      )}

      {/* Top overlay */}
      {showControls && (
        <View style={[styles.topOverlay, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.callerNameActive}>
            {otherProfile?.full_name || otherProfile?.username || 'User'}
          </Text>
          <Text style={styles.callStateLabel}>
            {callState === 'connecting' ? 'Connecting…' :
             callState === 'ended' ? 'Call ended' :
             fmtDuration(duration)}
          </Text>
        </View>
      )}

      {/* Bottom controls */}
      {showControls && (
        <View style={[styles.controls, { paddingBottom: insets.bottom + 32 }]}>
          <View style={styles.controlRow}>
            <View style={styles.controlItem}>
              <TouchableOpacity
                style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
                onPress={toggleMute}
              >
                <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={26} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>{isMuted ? 'Unmute' : 'Mute'}</Text>
            </View>

            {isVideo && (
              <>
                <View style={styles.controlItem}>
                  <TouchableOpacity
                    style={[styles.controlBtn, !cameraOn && styles.controlBtnActive]}
                    onPress={toggleCamera}
                  >
                    <Ionicons name={cameraOn ? 'videocam' : 'videocam-off'} size={26} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.controlLabel}>{cameraOn ? 'Camera' : 'Camera off'}</Text>
                </View>

                <View style={styles.controlItem}>
                  <TouchableOpacity style={styles.controlBtn} onPress={flipCamera}>
                    <Ionicons name="camera-reverse" size={26} color="#fff" />
                  </TouchableOpacity>
                  <Text style={styles.controlLabel}>Flip</Text>
                </View>
              </>
            )}

            {!isVideo && (
              <View style={styles.controlItem}>
                <TouchableOpacity
                  style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]}
                  onPress={() => { setIsSpeaker(s => !s); hapticMedium(); }}
                >
                  <Ionicons name={isSpeaker ? 'volume-high' : 'volume-low'} size={26} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.controlLabel}>Speaker</Text>
              </View>
            )}

            <View style={styles.controlItem}>
              <TouchableOpacity style={[styles.controlBtn, styles.hangupBtn]} onPress={handleHangup}>
                <Ionicons name="call" size={28} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
              </TouchableOpacity>
              <Text style={styles.controlLabel}>End</Text>
            </View>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },

  // Ringing
  ringingBg: { backgroundColor: '#0d0d1a' },
  ringingTop: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  incomingLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 14, letterSpacing: 0.5 },
  callerAvatar: { width: 110, height: 110, borderRadius: 55, marginVertical: 8 },
  callerAvatarPlaceholder: { backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  callerName: { color: '#fff', fontSize: 28, fontWeight: 'bold', textAlign: 'center' },
  callerUsername: { color: 'rgba(255,255,255,0.45)', fontSize: 15 },
  ringingActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40,
  },
  ringingBtn: { alignItems: 'center', gap: 12 },
  callActionCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptCircle: { backgroundColor: '#22c55e' },
  declineCircle: { backgroundColor: '#ef4444' },
  callActionLabel: { color: '#fff', fontSize: 13, fontWeight: '500' },

  // Active call
  audioBg: { backgroundColor: '#111827' },
  localPreview: {
    position: 'absolute',
    top: 100,
    right: 16,
    width: 100,
    height: 150,
    borderRadius: 12,
    overflow: 'hidden',
    zIndex: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  callerNameActive: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  callStateLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 14 },
  controls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingTop: 20,
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  controlItem: { alignItems: 'center', gap: 8 },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  hangupBtn: { backgroundColor: '#ef4444' },
  controlLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },

  // Immersive additions
  avatarGlowContainer: {
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 20,
  },
  callerAvatarImmersive: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  callerNameImmersive: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 20,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 10,
  },
  activeCallAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
  },
  activeCallName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
});
