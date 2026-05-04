import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, ActivityIndicator, Image, Modal,
  Animated, Platform, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

interface MusicPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (track: any, startTime: number) => void;
}

export const MusicPicker: React.FC<MusicPickerProps> = ({ visible, onClose, onSelect }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTrack, setSelectedTrack] = useState<any>(null);
  const [trimMode, setTrimMode] = useState(false);
  
  const [startPoint, setStartPoint] = useState(0); 
  const [isPlaying, setIsPlaying] = useState(false);
  const player = useAudioPlayer(selectedTrack?.previewUrl ?? '');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible && !query) {
      searchMusic('popular hits');
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(20);
    }
  }, [visible]);

  const searchMusic = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=30`);
      const json = await res.json();
      setTracks(json.results || []);
    } catch (e) {
      setTracks([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTrackSelect = (track: any) => {
    Keyboard.dismiss();
    setSelectedTrack(track);
    setTrimMode(true);
    setIsPlaying(true);
  };

  const handleConfirm = () => {
    onSelect(selectedTrack, startPoint);
    player.pause();
    setTrimMode(false);
    onClose();
  };

  useEffect(() => {
    if (trimMode && player && selectedTrack) {
      if (isPlaying) {
        player.play();
        player.loop = true;
      } else {
        player.pause();
      }
    } else {
      player?.pause();
    }
  }, [trimMode, selectedTrack, visible, isPlaying]);

  const togglePlayback = () => {
    setIsPlaying(!isPlaying);
  };

  const renderTrimmer = () => {
    if (!selectedTrack) return null;

    return (
      <View style={styles.trimContainer}>
        <View style={styles.trimHeader}>
          <TouchableOpacity onPress={() => { setTrimMode(false); player.pause(); setIsPlaying(false); }}>
            <Ionicons name="arrow-back" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.trimTitle, { color: colors.text }]}>Trim Music</Text>
          <TouchableOpacity onPress={handleConfirm} style={[styles.doneBtn, { backgroundColor: colors.accent }]}>
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.selectedHero}>
          <Image source={{ uri: selectedTrack.artworkUrl100?.replace('100x100', '400x400') }} style={styles.heroArt} />
          <Text style={[styles.heroName, { color: colors.text }]} numberOfLines={1}>{selectedTrack.trackName}</Text>
          <Text style={[styles.heroArtist, { color: colors.textMuted }]} numberOfLines={1}>{selectedTrack.artistName}</Text>
        </View>

        <View style={styles.trimmerSection}>
          <View style={styles.timeInfo}>
            <Text style={[styles.timeLabel, { color: colors.text }]}>
              {Math.floor(startPoint)}s — {Math.floor(startPoint + 15)}s
            </Text>
            <TouchableOpacity onPress={togglePlayback} style={styles.playToggle}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.accent} />
            </TouchableOpacity>
          </View>

          <View style={styles.waveformContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={20}
              onScroll={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                const newStart = (x / (width * 1.5)) * 30;
                const clamped = Math.max(0, Math.min(15, newStart));
                if (Math.abs(clamped - startPoint) > 0.5) {
                   setStartPoint(clamped);
                   player.seekTo(clamped * 1000);
                }
              }}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: width / 2 }}
            >
              <View style={[styles.waveBarContainer, { width: width * 1.5 }]}>
                {[...Array(50)].map((_, i) => (
                  <View 
                    key={i} 
                    style={[
                      styles.waveBar, 
                      { 
                        height: 15 + Math.random() * 35, 
                        backgroundColor: (i / 50) * 30 >= startPoint && (i / 50) * 30 <= startPoint + 15 
                          ? colors.accent 
                          : 'rgba(255,255,255,0.1)'
                      }
                    ]} 
                  />
                ))}
              </View>
            </ScrollView>
            
            <View style={[styles.selectionWindow, { borderColor: colors.accent }]} pointerEvents="none">
              <View style={[styles.indicatorLine, { backgroundColor: colors.accent }]} />
            </View>
          </View>
          <Text style={[styles.caption, { color: colors.textMuted }]}>Drag to choose your 15s clip</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <Animated.View 
            style={[
              styles.sheet, 
              { 
                backgroundColor: colors.bg, 
                paddingBottom: Math.max(insets.bottom, 20),
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }]
              }
            ]}
          >
            <View style={styles.handle} />
            
            {!trimMode ? (
              <View style={styles.searchContainer}>
                <View style={styles.header}>
                  <Text style={[styles.title, { color: colors.text }]}>Choose Music</Text>
                  <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Ionicons name="close" size={28} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.searchBar, { backgroundColor: colors.bg2 }]}>
                  <Ionicons name="search" size={20} color={colors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Search for a song..."
                    placeholderTextColor={colors.textMuted}
                    value={query}
                    onChangeText={(t) => {
                      setQuery(t);
                      if (t.length > 2) searchMusic(t);
                    }}
                    autoFocus
                    returnKeyType="search"
                    onSubmitEditing={() => searchMusic(query)}
                  />
                </View>

                <ScrollView style={styles.trackList} keyboardShouldPersistTaps="handled">
                  {loading && <ActivityIndicator style={{ marginTop: 20 }} color={colors.accent} />}
                  {tracks.map((track) => (
                    <TouchableOpacity 
                      key={track.trackId} 
                      style={styles.trackRow}
                      onPress={() => handleTrackSelect(track)}
                    >
                      <Image source={{ uri: track.artworkUrl60 }} style={styles.artwork} />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.trackName, { color: colors.text }]} numberOfLines={1}>{track.trackName}</Text>
                        <Text style={[styles.artistName, { color: colors.textMuted }]} numberOfLines={1}>{track.artistName}</Text>
                      </View>
                      <View style={[styles.playBtn, { backgroundColor: colors.bg2 }]}>
                         <Ionicons name="play" size={14} color={colors.accent} />
                      </View>
                    </TouchableOpacity>
                  ))}
                  <View style={{ height: 40 }} />
                </ScrollView>
              </View>
            ) : renderTrimmer()}
          </Animated.View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { 
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32, 
    height: height * 0.8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 20,
  },
  handle: { width: 36, height: 5, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 3, alignSelf: 'center', marginVertical: 12 },
  searchContainer: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '900', letterSpacing: -0.5 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, paddingHorizontal: 16, borderRadius: 16, height: 48, marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 16, fontWeight: '500' },
  trackList: { paddingHorizontal: 20 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  artwork: { width: 52, height: 52, borderRadius: 10 },
  trackName: { fontSize: 16, fontWeight: '700' },
  artistName: { fontSize: 14, marginTop: 3 },
  playBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingLeft: 2 },
  
  trimContainer: { flex: 1, padding: 20 },
  trimHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 30 },
  trimTitle: { fontSize: 18, fontWeight: '800' },
  doneBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24 },
  doneText: { color: '#fff', fontWeight: '900', fontSize: 15 },
  
  selectedHero: { alignItems: 'center', marginBottom: 40 },
  heroArt: { width: 160, height: 160, borderRadius: 20, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 15 },
  heroName: { fontSize: 22, fontWeight: '900', textAlign: 'center', paddingHorizontal: 20 },
  heroArtist: { fontSize: 16, marginTop: 6, fontWeight: '500' },
  
  trimmerSection: { width: '100%', alignItems: 'center' },
  timeInfo: { flexDirection: 'row', alignItems: 'center', gap: 15, marginBottom: 20 },
  timeLabel: { fontSize: 15, fontWeight: '800', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  playToggle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  
  waveformContainer: { width: '100%', height: 100, alignItems: 'center', justifyContent: 'center' },
  waveBarContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 100 },
  waveBar: { width: 4, borderRadius: 2, minHeight: 10 },
  selectionWindow: { 
    position: 'absolute', 
    width: width * 0.5, 
    height: 110, 
    borderWidth: 2, 
    borderRadius: 16,
    zIndex: 10,
    alignItems: 'center',
  },
  indicatorLine: { width: 2, height: '100%', opacity: 0.5 },
  caption: { fontSize: 14, marginTop: 30, textAlign: 'center', fontWeight: '500' },
});
