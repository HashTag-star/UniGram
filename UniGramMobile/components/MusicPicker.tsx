import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Dimensions, ActivityIndicator, Image, Modal,
  Animated, Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useTheme } from '../context/ThemeContext';

const { width, height } = Dimensions.get('window');

// Length of the chosen clip — matches the share/post music duration.
const CLIP_LENGTH_S = 15;
// Visible width of the scrollable waveform. The full track maps across this
// width so 1 px ≈ (duration / SCROLL_TRACK_WIDTH) seconds.
const SCROLL_TRACK_WIDTH = width * 1.8;
const WAVE_BAR_COUNT = 64;

function formatSeconds(s: number): string {
  const safe = Math.max(0, s);
  const m = Math.floor(safe / 60);
  const sec = Math.floor(safe % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

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
  const status = useAudioPlayerStatus(player);

  // Refs that mirror the latest state — used by the loop watcher so it can
  // see fresh values without re-subscribing to status on every tick (the old
  // code put status?.currentTime in the deps and tore down the interval ~30
  // times/sec, effectively never letting it fire).
  const startPointRef = useRef(0);
  const isPlayingRef  = useRef(false);
  useEffect(() => { startPointRef.current = startPoint; }, [startPoint]);
  useEffect(() => { isPlayingRef.current  = isPlaying;  }, [isPlaying]);

  // Live playhead position in seconds for the playhead overlay.
  const playheadS = status?.currentTime ?? 0;

  // Real preview duration in seconds. iTunes returns the FULL track length in
  // `trackTimeMillis` but the previewUrl itself is only ~30s, so we cap there.
  // Fallback to 30s when neither field is present.
  const previewDurationS = useMemo(() => {
    if (status?.duration && status.duration > 0) return status.duration;
    const tt = selectedTrack?.trackTimeMillis;
    return tt ? Math.min(30, tt / 1000) : 30;
  }, [status?.duration, selectedTrack?.trackTimeMillis]);

  // Max valid start: can't pick a window that runs past the end of the preview.
  const maxStartS = Math.max(0, previewDurationS - CLIP_LENGTH_S);

  // Stable waveform — heights derived deterministically from the track id so
  // the bars don't shimmer on every re-render (the old version called
  // Math.random() inside the JSX).
  const waveformHeights = useMemo(() => {
    const seedSource = String(selectedTrack?.trackId ?? 'x');
    let h = 0;
    for (let i = 0; i < seedSource.length; i++) h = ((h << 5) - h + seedSource.charCodeAt(i)) | 0;
    let rng = Math.abs(h) || 1;
    return Array.from({ length: WAVE_BAR_COUNT }, () => {
      rng = (rng * 9301 + 49297) % 233280;
      return 12 + (rng / 233280) * 42;
    });
  }, [selectedTrack?.trackId]);

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

  const waveformScrollRef = useRef<ScrollView>(null);

  const handleTrackSelect = (track: any) => {
    Keyboard.dismiss();
    setSelectedTrack(track);
    setStartPoint(0);
    setTrimMode(true);
    setIsPlaying(true);
    // Snap the waveform back to the start when switching tracks; otherwise
    // the previous scroll position lingers and the start time disagrees with
    // the visible selection.
    requestAnimationFrame(() => {
      waveformScrollRef.current?.scrollTo({ x: 0, animated: false });
    });
  };

  const handleConfirm = () => {
    onSelect(selectedTrack, startPoint);
    player.pause();
    setTrimMode(false);
    onClose();
  };

  // Play / pause control. We do NOT use native loop — instead the loop is
  // confined to the selected window by the watcher effect below, so the user
  // hears the actual clip they're choosing repeat seamlessly.
  useEffect(() => {
    if (!player) return;
    if (trimMode && selectedTrack && isPlaying) {
      player.loop = false;
      // Make sure playback starts at the chosen start point, not wherever the
      // player happened to be paused.
      try { player.seekTo(startPoint); } catch {}
      player.play();
    } else {
      player.pause();
    }
    // Intentionally omit `startPoint` from deps — handleScroll already calls
    // seekTo() on drag, and including it here would restart playback on every
    // pixel of drag, killing audio continuity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimMode, selectedTrack?.trackId, isPlaying]);

  // Loop within the selected clip window. Reads from refs so it doesn't
  // tear down + rebuild on every status tick (the previous version had
  // status?.currentTime in deps and rebuilt the interval ~30 times/sec,
  // so it effectively never fired and the loop didn't work).
  useEffect(() => {
    if (!player || !trimMode) return;
    const id = setInterval(() => {
      if (!isPlayingRef.current) return;
      const t = player.currentTime ?? 0;
      const sp = startPointRef.current;
      if (t >= sp + CLIP_LENGTH_S || t < sp - 0.3) {
        try { player.seekTo(sp); } catch {}
      }
    }, 150);
    return () => clearInterval(id);
  }, [player, trimMode]);

  // Stop & reset when leaving trim mode or unmounting.
  useEffect(() => {
    if (!trimMode) {
      player?.pause();
      setIsPlaying(false);
    }
  }, [trimMode, player]);

  const togglePlayback = () => {
    setIsPlaying(p => !p);
  };

  // Map seconds → x offset on the waveform scrollview (and vice versa).
  const secondsToX  = (s: number) => (s / previewDurationS) * SCROLL_TRACK_WIDTH;
  const xToSeconds  = (x: number) => (x / SCROLL_TRACK_WIDTH) * previewDurationS;

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
              {formatSeconds(startPoint)} — {formatSeconds(Math.min(previewDurationS, startPoint + CLIP_LENGTH_S))}
            </Text>
            <TouchableOpacity onPress={togglePlayback} style={styles.playToggle}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={24} color={colors.accent} />
            </TouchableOpacity>
          </View>

          <View style={styles.waveformContainer}>
            <ScrollView
              ref={waveformScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              // Update the start-point preview (label + colored bars + playhead
              // bounds) on every scroll frame, but DON'T call player.seekTo()
              // 60×/sec — expo-audio chokes on rapid-fire seeks during an
              // active drag and pins playback wherever it was, which is the
              // "only plays one part of the song no matter where I drag" bug.
              onScroll={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                const clamped = Math.max(0, Math.min(maxStartS, xToSeconds(x)));
                if (Math.abs(clamped - startPoint) > 0.1) {
                  setStartPoint(clamped);
                }
              }}
              // Commit the seek when the finger lifts (or momentum settles).
              // expo-audio's seekTo takes seconds and is reliable when called
              // once on settle — the old code called it ~60×/sec on every
              // scroll frame and silently failed.
              onScrollEndDrag={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                const clamped = Math.max(0, Math.min(maxStartS, xToSeconds(x)));
                setStartPoint(clamped);
                try { player.seekTo(clamped); } catch {}
              }}
              onMomentumScrollEnd={(e) => {
                const x = e.nativeEvent.contentOffset.x;
                const clamped = Math.max(0, Math.min(maxStartS, xToSeconds(x)));
                setStartPoint(clamped);
                try { player.seekTo(clamped); } catch {}
              }}
              scrollEventThrottle={32}
              contentContainerStyle={{ paddingHorizontal: width / 2 }}
            >
              <View style={[styles.waveBarContainer, { width: SCROLL_TRACK_WIDTH }]}>
                {waveformHeights.map((h, i) => {
                  const barTimeS = (i / WAVE_BAR_COUNT) * previewDurationS;
                  const inSelection = barTimeS >= startPoint && barTimeS <= startPoint + CLIP_LENGTH_S;
                  return (
                    <View
                      key={i}
                      style={[
                        styles.waveBar,
                        {
                          height: h,
                          backgroundColor: inSelection ? colors.accent : 'rgba(255,255,255,0.18)',
                        },
                      ]}
                    />
                  );
                })}
              </View>
            </ScrollView>

            {/* Fixed selection window centered over the waveform */}
            <View style={[styles.selectionWindow, { borderColor: colors.accent }]} pointerEvents="none" />

            {/* Live playhead — moves with playback position INSIDE the window */}
            {isPlaying && playheadS >= startPoint && playheadS <= startPoint + CLIP_LENGTH_S && (
              <View
                pointerEvents="none"
                style={[
                  styles.playhead,
                  {
                    left: (width / 2) - (width * 0.5 / 2)
                          + ((playheadS - startPoint) / CLIP_LENGTH_S) * (width * 0.5),
                    backgroundColor: '#fff',
                  },
                ]}
              />
            )}
          </View>
          <Text style={[styles.caption, { color: colors.textMuted }]}>
            Drag the waveform to scrub. Tap play to preview the {CLIP_LENGTH_S}s clip.
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        {/* Backdrop — ONLY this layer closes the modal. The old version
            wrapped the entire sheet in a single TouchableOpacity, so every
            tap inside the trimmer (play button, waveform, Done button…)
            bubbled to onClose and the modal dismissed itself. */}
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.bg,
              paddingBottom: Math.max(insets.bottom, 20),
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
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
      </View>
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
  },
  playhead: {
    position: 'absolute',
    top: -4,
    width: 2,
    height: 118,
    borderRadius: 1,
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 3,
  },
  caption: { fontSize: 14, marginTop: 30, textAlign: 'center', fontWeight: '500' },
});
