import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  Platform, StatusBar, Animated, Alert, Image
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../hooks/useHaptics';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

interface QuickCaptureScreenProps {
  isVisible: boolean;
  onClose?: () => void;
  onCapture: (media: { uri: string; type: 'image' | 'video' }) => void;
}

type Mode = 'POST' | 'REEL' | 'STORY';

export const QuickCaptureScreen: React.FC<QuickCaptureScreenProps> = ({ isVisible, onClose, onCapture }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flash, setFlash] = useState<'off' | 'on' | 'auto'>('off');
  const [mode, setMode] = useState<Mode>('POST');
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  
  const cameraRef = useRef<CameraView>(null);
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  // Animation for shutter button
  const shutterScale = useRef(new Animated.Value(1)).current;
  const timerInterval = useRef<any>(null);

  useEffect(() => {
    if (isVisible && !permission?.granted) {
      requestPermission();
    }
  }, [isVisible, permission]);

  useEffect(() => {
    if (recording) {
      timerInterval.current = setInterval(() => {
        setElapsed(e => e + 1);
      }, 1000);
    } else {
      clearInterval(timerInterval.current);
      setElapsed(0);
    }
    return () => clearInterval(timerInterval.current);
  }, [recording]);

  const snap = async () => {
    if (!cameraRef.current) return;
    haptics.medium();
    
    Animated.sequence([
      Animated.timing(shutterScale, { toValue: 0.9, duration: 100, useNativeDriver: true }),
      Animated.timing(shutterScale, { toValue: 1, duration: 100, useNativeDriver: true })
    ]).start();

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: false,
        exif: false,
      });
      if (photo) {
        onCapture({ uri: photo.uri, type: 'image' });
      }
    } catch (e) {
      Alert.alert('Error', 'Could not take photo');
    }
  };

  const startRecord = async () => {
    if (!cameraRef.current || recording) return;
    haptics.success();
    setRecording(true);
    try {
      // Note: recordAsync might need additional config depending on expo-camera version
      const video = await (cameraRef.current as any).recordAsync({
        maxDuration: 60,
        quality: '720p',
      });
      if (video) {
        onCapture({ uri: video.uri, type: 'video' });
      }
    } catch (e) {
      setRecording(false);
      Alert.alert('Error', 'Recording failed');
    }
  };

  const stopRecord = async () => {
    if (!cameraRef.current || !recording) return;
    setRecording(false);
    (cameraRef.current as any).stopRecording();
  };

  const pickGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: mode === 'POST' ? 'images' : 'videos',
      allowsEditing: true,
      quality: 0.85,
    });
    if (!res.canceled && res.assets?.[0]) {
      onCapture({ 
        uri: res.assets[0].uri, 
        type: res.assets[0].type === 'video' ? 'video' : 'image' 
      });
    }
  };

  const fmtTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isVisible) return <View style={{ flex: 1, backgroundColor: '#000' }} />;
  if (!permission?.granted) return (
    <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
       <Text style={{ color: '#fff' }}>No Camera Permission</Text>
       <TouchableOpacity onPress={requestPermission} style={{ marginTop: 20, padding: 10, backgroundColor: '#4f46e5', borderRadius: 8 }}>
         <Text style={{ color: '#fff' }}>Grant Access</Text>
       </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        onMountError={(e) => console.error('Camera Mount error', e)}
      />

      {/* Transparent overlay for controls */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={[styles.topControls, { top: insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
          
          {recording && (
            <View style={styles.timerBadge}>
              <View style={styles.timerDot} />
              <Text style={styles.timerText}>{fmtTime(elapsed)}</Text>
            </View>
          )}

          <TouchableOpacity 
            onPress={() => setFlash(f => f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off')} 
            style={styles.iconBtn}
          >
            <Ionicons 
              name={flash === 'off' ? 'flash-off' : flash === 'on' ? 'flash' : 'flash-outline'} 
              size={24} color="#fff" 
            />
          </TouchableOpacity>
        </View>

        <View style={styles.bottomControls}>
          <View style={styles.modeSelector}>
            {['POST', 'STORY', 'REEL'].map((m) => (
              <TouchableOpacity 
                key={m} 
                onPress={() => { setMode(m as Mode); haptics.selection(); }}
                style={styles.modeBtn}
              >
                <Text style={[styles.modeText, mode === m && styles.modeTextActive]}>{m}</Text>
                {mode === m && <View style={styles.modeIndicator} />}
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.shutterRow}>
            <TouchableOpacity onPress={pickGallery} style={styles.sideBtn}>
               <Ionicons name="images-outline" size={28} color="#fff" />
            </TouchableOpacity>

            <TouchableOpacity 
              onLongPress={mode === 'POST' ? undefined : startRecord}
              onPressOut={mode === 'POST' ? undefined : stopRecord}
              onPress={mode === 'POST' ? snap : undefined}
              activeOpacity={0.8}
            >
              <Animated.View style={[
                styles.shutterOuter, 
                recording && styles.shutterOuterRecording,
                { transform: [{ scale: shutterScale }] }
              ]}>
                <View style={[styles.shutterInner, recording && styles.shutterInnerRecording]} />
              </Animated.View>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setFacing(f => f === 'back' ? 'front' : 'back')} style={styles.sideBtn}>
              <Ionicons name="camera-reverse-outline" size={30} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={{ height: insets.bottom + 20 }} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topControls: { 
    position: 'absolute', left: 20, right: 20, 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    zIndex: 10 
  },
  iconBtn: { padding: 8 },
  timerBadge: { 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: 'rgba(255,0,0,0.8)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, gap: 6 
  },
  timerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  timerText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  bottomControls: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  modeSelector: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginBottom: 20 },
  modeBtn: { alignItems: 'center', paddingVertical: 4 },
  modeText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  modeTextActive: { color: '#fff' },
  modeIndicator: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#fff', marginTop: 4 },
  shutterRow: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  shutterOuter: { 
    width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', 
    alignItems: 'center', justifyContent: 'center' 
  },
  shutterOuterRecording: { borderColor: 'rgba(255,255,255,0.3)' },
  shutterInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#fff' },
  shutterInnerRecording: { backgroundColor: '#ff3b30', borderRadius: 4, width: 30, height: 30 },
  sideBtn: { 
    width: 50, height: 50, borderRadius: 25, 
    backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' 
  },
});
