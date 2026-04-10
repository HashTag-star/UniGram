import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, Dimensions, TouchableOpacity,
  Image, ScrollView, TextInput, KeyboardAvoidingView,
  Platform, Animated, PanResponder, Alert, StatusBar
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHaptics } from '../hooks/useHaptics';
import { useTheme } from '../context/ThemeContext';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { SafeModules } from '../lib/SafeModules';
import { MusicPicker } from '../components/MusicPicker';
import { SafeBlur } from './CreatePostModal';

// Modern Expo Video safely imported but guarded
let VideoView: any = null;
let useVideoPlayer: any = null;
let BlurView: any = null;

try {
  if (SafeModules.hasVideo()) {
    const VideoPkg = require('expo-video');
    VideoView = VideoPkg.VideoView;
    useVideoPlayer = VideoPkg.useVideoPlayer;
  }
  if (SafeModules.hasBlur()) {
    BlurView = require('expo-blur').BlurView;
  }
} catch (e) {
  console.warn('Risk modules failed to load, using fallbacks');
}

const { width, height } = Dimensions.get('window');

interface MediaEditScreenProps {
  uri: string;
  type: 'image' | 'video';
  mode: 'POST' | 'STORY' | 'REEL';
  onNext: (editedMedia: { 
    uri: string; 
    filters?: string; 
    textOverlays?: any[]; 
    music?: any;
  }) => void;
  onCancel: () => void;
}

const FILTERS = [
  { id: 'normal', name: 'Normal', color: 'transparent', overlay: 'transparent' },
  { id: 'vivid', name: 'Vivid', color: 'rgba(255, 255, 255, 0.1)', overlay: 'rgba(255, 255, 255, 0.05)' },
  { id: 'warm', name: 'Valencia', color: 'rgba(255, 165, 0, 0.15)', overlay: 'rgba(255, 165, 0, 0.1)' },
  { id: 'cool', name: 'Hudson', color: 'rgba(0, 191, 255, 0.15)', overlay: 'rgba(0, 191, 255, 0.1)' },
  { id: 'mono', name: 'Inkwell', color: 'rgba(0, 0, 0, 0.5)', overlay: 'rgba(0, 0, 0, 0.3)' },
  { id: 'sepia', name: 'Earlybird', color: 'rgba(112, 66, 20, 0.25)', overlay: 'rgba(112, 66, 20, 0.15)' },
];

export const MediaEditScreen: React.FC<MediaEditScreenProps> = ({ uri, type, mode, onNext, onCancel }) => {
  const insets = useSafeAreaInsets();
  const haptics = useHaptics();
  const { colors } = useTheme();

  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);
  const [showFilters, setShowFilters] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [selectedMusic, setSelectedMusic] = useState<any>(null);
  const [textItems, setTextItems] = useState<any[]>([]);
  const [isAddingText, setIsAddingText] = useState(false);
  const [currentText, setCurrentText] = useState('');

  const handleAddText = () => {
    if (currentText.trim()) {
      setTextItems([...textItems, {
        id: Date.now().toString(),
        text: currentText,
        x: width / 2 - 50,
        y: height / 2 - 20,
        color: '#fff',
        fontSize: 24,
      }]);
      setCurrentText('');
      setIsAddingText(false);
      haptics.medium();
    } else {
      setIsAddingText(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      
      {/* Background Media */}
      <View style={styles.mediaContainer}>
        {type === 'image' ? (
          <Image source={{ uri }} style={styles.fullMedia} resizeMode="cover" />
        ) : (
          <VideoPreview uri={uri} />
        )}
        
        {/* Filter Overlay */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: activeFilter.overlay }]} pointerEvents="none" />
      </View>

      {/* Text Overlays */}
      {textItems.map((item) => (
        <DraggableText key={item.id} item={item} />
      ))}

      {/* Top Tools */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'transparent']}
        style={[styles.topBar, { paddingTop: insets.top + 10 }]}
      >
        <TouchableOpacity onPress={onCancel} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={styles.toolRow}>
          <TouchableOpacity onPress={() => setIsAddingText(true)} style={styles.iconBtn}>
            <Ionicons name="text" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Ionicons name="happy-outline" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={[styles.iconBtn, showFilters && styles.activeTool]}>
            <Ionicons name="color-filter" size={26} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.iconBtn, selectedMusic && { backgroundColor: colors.accent + '30' }]} 
            onPress={() => setShowMusicPicker(true)}
          >
            <Ionicons name="musical-notes" size={26} color={selectedMusic ? colors.accent : "#fff"} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Bottom Actions */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}
      >
        <TouchableOpacity style={styles.saveBtn}>
          <Ionicons name="download-outline" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.nextBtn} 
          onPress={() => onNext({ 
            uri, 
            filters: activeFilter.id, 
            textOverlays: textItems,
            music: selectedMusic
          })}
        >
          <Text style={styles.nextBtnText}>{mode === 'STORY' ? 'Your Story' : 'Next'}</Text>
          <Ionicons name="chevron-forward" size={20} color="#000" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Filter Selector */}
      {showFilters && (
        <Animated.View style={styles.filterSelector}>
          <SafeBlur intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {FILTERS.map((f) => (
              <TouchableOpacity
                key={f.id}
                onPress={() => { setActiveFilter(f); haptics.selection(); }}
                style={styles.filterItem}
              >
                <View style={[styles.filterPreview, { backgroundColor: f.color }]}>
                   <Image source={{ uri }} style={styles.filterPreviewImg} resizeMode="cover" />
                   <View style={[StyleSheet.absoluteFill, { backgroundColor: f.overlay }]} />
                </View>
                <Text style={[styles.filterName, activeFilter.id === f.id && styles.filterNameActive]}>
                  {f.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* Text Input Modal */}
      {isAddingText && (
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.textInputOverlay}
        >
          <TouchableOpacity 
            style={StyleSheet.absoluteFill} 
            onPress={handleAddText} 
            activeOpacity={1} 
          />
          <TextInput
            autoFocus
            style={styles.mainTextInput}
            value={currentText}
            onChangeText={setCurrentText}
            placeholder="Type something..."
            placeholderTextColor="rgba(255,255,255,0.5)"
            multiline
            textAlign="center"
          />
          <TouchableOpacity onPress={handleAddText} style={styles.doneBtn}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}

      <MusicPicker 
        visible={showMusicPicker} 
        onClose={() => setShowMusicPicker(false)} 
        onSelect={(music) => {
          setSelectedMusic(music);
          haptics.success();
        }}
      />
    </View>
  );
};

const VideoPreview = ({ uri }: { uri: string }) => {
  if (SafeModules.hasVideo()) {
    return <ModernVideoPlayer uri={uri} />;
  }
  return <LegacyVideoPlayer uri={uri} />;
};

const ModernVideoPlayer = ({ uri }: { uri: string }) => {
  const player = useVideoPlayer(uri, (p: any) => {
    p.loop = true;
    p.play();
  });
  return (
    <VideoView
      player={player}
     style={styles.fullMedia}
      contentFit="cover"
      nativeControls={false}
    />
  );
};

const LegacyVideoPlayer = ({ uri }: { uri: string }) => {
  return (
    <Video
      source={{ uri }}
      rate={1.0}
      volume={1.0}
      isMuted={false}
      resizeMode={ResizeMode.COVER}
      shouldPlay
      isLooping
      style={styles.fullMedia}
    />
  );
};



const DraggableText = ({ item }: { item: any }) => {
  const pan = useRef(new Animated.ValueXY({ x: item.x, y: item.y })).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value,
          y: (pan.y as any)._value,
        });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  return (
    <Animated.View
      style={[
        styles.draggableContainer,
        {
          transform: [{ translateX: pan.x }, { translateY: pan.y }],
        },
      ]}
      {...panResponder.panHandlers}
    >
      <Text style={[styles.overlayText, { fontSize: item.fontSize, color: item.color }]}>
        {item.text}
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  mediaContainer: { flex: 1 },
  fullMedia: { width: '100%', height: '100%' },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16,
    zIndex: 100,
  },
  toolRow: { flexDirection: 'row', gap: 12 },
  iconBtn: { 
    width: 44, height: 44, borderRadius: 22, 
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)' 
  },
  activeTool: { backgroundColor: '#6366f1' },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, zIndex: 100,
  },
  saveBtn: { 
    width: 50, height: 50, borderRadius: 25, 
    backgroundColor: 'rgba(255,255,255,0.2)', 
    alignItems: 'center', justifyContent: 'center' 
  },
  nextBtn: {
    backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 14,
    borderRadius: 30, flexDirection: 'row', alignItems: 'center', gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  nextBtnText: { color: '#000', fontWeight: '800', fontSize: 16 },
  
  filterSelector: {
    position: 'absolute', bottom: 100, left: 0, right: 0,
    height: 140, zIndex: 200, paddingBottom: 10,
  },
  filterScroll: { paddingHorizontal: 20, alignItems: 'center', gap: 16 },
  filterItem: { alignItems: 'center', gap: 8 },
  filterPreview: { 
    width: 70, height: 70, borderRadius: 12, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)'
  },
  filterPreviewImg: { width: '100%', height: '100%', opacity: 0.6 },
  filterName: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700' },
  filterNameActive: { color: '#fff' },

  textInputOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 1000,
  },
  mainTextInput: {
    color: '#fff', fontSize: 36, fontWeight: '900',
    width: width * 0.8, maxHeight: 200,
  },
  doneBtn: {
    position: 'absolute', top: 60, right: 20,
    paddingHorizontal: 20, paddingVertical: 8,
    backgroundColor: '#fff', borderRadius: 20,
  },
  doneBtnText: { color: '#000', fontWeight: '700' },

  draggableContainer: {
    position: 'absolute', top: 0, left: 0,
    zIndex: 500, padding: 10,
  },
  overlayText: {
    color: '#fff', fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
  }
});
