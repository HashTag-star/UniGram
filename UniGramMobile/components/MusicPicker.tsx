import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, ActivityIndicator, Image, Modal,
  Animated, PanResponder, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer } from 'expo-audio';
import { useTheme } from '../context/ThemeContext';
import { SafeModules } from '../lib/SafeModules';

const { width, height } = Dimensions.get('window');

const SafeBlur = ({ intensity, tint, style, children }: any) => {
  if (SafeModules.hasBlur()) {
    const { BlurView } = require('expo-blur');
    return <BlurView intensity={intensity} tint={tint} style={style}>{children}</BlurView>;
  }
  return <View style={[style, { backgroundColor: tint === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)' }]}>{children}</View>;
};

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
  
  // Trimmer state
  const [startPoint, setStartPoint] = useState(0); // 0 to 15 (assuming 15s clip from 30s preview)
  const player = useAudioPlayer(selectedTrack?.previewUrl ?? '');

  useEffect(() => {
    if (visible && !query) searchMusic('popular hits');
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
    setSelectedTrack(track);
    setTrimMode(true);
  };

  const handleConfirm = () => {
    onSelect(selectedTrack, startPoint);
    setTrimMode(false);
    onClose();
  };

  useEffect(() => {
    if (trimMode && player && selectedTrack) {
      player.play();
      player.loop = true;
    } else {
      player?.pause();
    }
  }, [trimMode, selectedTrack, visible]); // Removed startPoint to prevent stuttering

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        style={{ flex: 1 }}
      >
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity 
            activeOpacity={1} 
            style={[styles.sheet, { backgroundColor: colors.bg, paddingBottom: insets.bottom + 20 }]}
          >
            <View style={styles.handle} />
            
            {!trimMode ? (
              <>
                <View style={styles.header}>
                  <Text style={[styles.title, { color: colors.text }]}>Music</Text>
                  <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                    <Ionicons name="close" size={24} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <View style={[styles.searchBar, { backgroundColor: colors.bg2 }]}>
                  <Ionicons name="search" size={20} color={colors.textMuted} />
                  <TextInput
                    style={[styles.searchInput, { color: colors.text }]}
                    placeholder="Search songs..."
                    placeholderTextColor={colors.textMuted}
                    value={query}
                    onChangeText={(t) => {
                      setQuery(t);
                      if (t.length > 2) searchMusic(t);
                    }}
                    autoFocus
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
                      <Ionicons name="play-circle-outline" size={24} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            ) : (
              <View style={styles.trimContainer}>
                 <View style={styles.trimHeader}>
                   <TouchableOpacity onPress={() => { setTrimMode(false); player.pause(); }}>
                     <Ionicons name="arrow-back" size={24} color={colors.text} />
                   </TouchableOpacity>
                   <Text style={[styles.trimTitle, { color: colors.text }]}>Choose segment</Text>
                   <TouchableOpacity onPress={handleConfirm} style={[styles.doneBtn, { backgroundColor: colors.accent }]}>
                     <Text style={styles.doneText}>Done</Text>
                   </TouchableOpacity>
                 </View>

                 <View style={styles.selectedHero}>
                   <Image source={{ uri: selectedTrack.artworkUrl100 }} style={styles.heroArt} />
                   <Text style={[styles.heroName, { color: colors.text }]}>{selectedTrack.trackName}</Text>
                   <Text style={[styles.heroArtist, { color: colors.textMuted }]}>{selectedTrack.artistName}</Text>
                 </View>

                    {/* Waveform Trimmer with Range Window */}
                  <View style={styles.waveformContainer}>
                    <View style={styles.timeDisplay}>
                      <Text style={[styles.timeLabel, { color: colors.text }]}>
                        Selected: {Math.floor(startPoint)}:00 — {Math.floor(startPoint + 15)}:00
                      </Text>
                    </View>
                    
                    <View style={styles.trimmerWrapper}>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        snapToInterval={40} // Snap to 1-second intervals (1200 / 30 = 40)
                        decelerationRate="fast"
                        onScroll={(e) => {
                          const x = e.nativeEvent.contentOffset.x;
                          const newStart = (x / 1200) * 30;
                          setStartPoint(Math.max(0, Math.min(15, newStart)));
                        }}
                        onScrollEndDrag={() => {
                          if (player) {
                            player.seekTo(startPoint * 1000);
                            player.play();
                          }
                        }}
                        onMomentumScrollEnd={() => {
                          if (player) {
                            player.seekTo(startPoint * 1000);
                            player.play();
                          }
                        }}
                        scrollEventThrottle={32}
                        contentContainerStyle={{ paddingHorizontal: width / 2 - (600 / 2) }} // Center the 15s window (600px)
                      >
                        <View style={[styles.waveBarContainer, { width: 1200 }]}>
                           {[...Array(60)].map((_, i) => (
                             <View 
                               key={i} 
                               style={[
                                 styles.waveBar, 
                                 { 
                                   height: 20 + Math.sin(i * 0.5) * 20 + Math.random() * 10, 
                                   backgroundColor: (i / 60) * 30 >= startPoint && (i / 60) * 30 <= startPoint + 15 
                                      ? colors.accent 
                                      : colors.textMuted + '40'
                                 }
                               ]} 
                             />
                           ))}
                        </View>
                      </ScrollView>
                      
                      {/* Range Box Overaly (Fixed in center) */}
                      <View style={[styles.rangeWindow, { borderColor: colors.accent, width: (15/30) * 1200 }]} pointerEvents="none">
                         <View style={[styles.rangeEdge, { backgroundColor: colors.accent }]} />
                         <View style={{ flex: 1 }} />
                         <View style={[styles.rangeEdge, { backgroundColor: colors.accent }]} />
                      </View>
                    </View>
                  </View>
                  <Text style={[styles.caption, { color: colors.textMuted }]}>Slide the music to pick your 15s clip</Text>
              </View>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: height * 0.72 },
  handle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginVertical: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '800' },
  closeBtn: { padding: 4 },
  searchBar: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, paddingHorizontal: 12, borderRadius: 12, height: 44, marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  trackList: { paddingHorizontal: 16 },
  trackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  artwork: { width: 48, height: 48, borderRadius: 6 },
  trackName: { fontSize: 15, fontWeight: '700' },
  artistName: { fontSize: 13, marginTop: 2 },
  
  trimContainer: { padding: 16, alignItems: 'center' },
  trimHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 30 },
  trimTitle: { fontSize: 16, fontWeight: '700' },
  doneBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  doneText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  
  selectedHero: { alignItems: 'center', marginBottom: 40 },
  heroArt: { width: 120, height: 120, borderRadius: 12, marginBottom: 16 },
  heroName: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  heroArtist: { fontSize: 14, marginTop: 4 },
  
  waveformContainer: { width: '100%', alignItems: 'center', marginTop: 10 },
  timeDisplay: { marginBottom: 15 },
  timeLabel: { fontSize: 13, fontWeight: '700' },
  trimmerWrapper: { width: '100%', height: 80, alignItems: 'center', justifyContent: 'center' },
  waveBarContainer: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 80 },
  waveBar: { width: 5, borderRadius: 2.5 },
  rangeWindow: { 
    position: 'absolute', 
    width: width * 0.45, // Target window size visually
    height: 70, 
    borderWidth: 2, 
    borderRadius: 8,
    flexDirection: 'row',
    zIndex: 10
  },
  rangeEdge: { width: 4, height: '100%', borderRadius: 2 },
  caption: { fontSize: 13, marginTop: 25, textAlign: 'center' },
});
