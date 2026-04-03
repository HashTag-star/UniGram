import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Modal, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, FlatList, Dimensions, DeviceEventEmitter,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAudioPlayer } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createPost } from '../services/posts';
import { createStory } from '../services/stories';
import { createReel } from '../services/reels';
import { getFollowing } from '../services/profiles';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
type PostType = 'post' | 'thread' | 'story' | 'reel';

interface Props {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onPosted?: (optimisticPost?: any) => void;
  initialType?: PostType;
}

async function requestPickerPermission(): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission needed', 'Please allow photo library access in your device settings.');
    return false;
  }
  return true;
}

export const CreatePostModal: React.FC<Props> = ({ visible, userId, onClose, onPosted, initialType }) => {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'type' | 'compose'>('type');
  const [postType, setPostType] = useState<PostType>(initialType ?? 'post');
  const [mediaAssets, setMediaAssets] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [taggedUsers, setTaggedUsers] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<any[]>([]);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [hashtags, setHashtags] = useState('');
  const [song, setSong] = useState('');
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [musicTracks, setMusicTracks] = useState<any[]>([]);
  const [musicQuery, setMusicQuery] = useState('');
  const [musicSearching, setMusicSearching] = useState(false);
  const [songPreviewUrl, setSongPreviewUrl] = useState('');
  const [playingTrackId, setPlayingTrackId] = useState<number | null>(null);
  const [previewTrack, setPreviewTrack] = useState<any>(null);
  const player = useAudioPlayer(previewTrack?.previewUrl ?? '');
  const [posting, setPosting] = useState(false);
  const [selectedMediaIdx, setSelectedMediaIdx] = useState(0);
  const [activeMention, setActiveMention] = useState('');

  const [isBanned, setIsBanned] = useState(false);

  useEffect(() => {
    if (visible && userId) {
      getFollowing(userId).then(setFollowingList).catch(() => {});
      // Check if user is banned
      supabase.from('profiles').select('is_banned').eq('id', userId).single()
        .then(({ data }) => setIsBanned(!!data?.is_banned));
    }
  }, [visible, userId]);

  useEffect(() => {
    const mentionMatch = caption.match(/@(\w+)$/);
    if (mentionMatch) setActiveMention(mentionMatch[1]);
    else setActiveMention('');
  }, [caption]);

  useEffect(() => {
    const query = activeMention || tagInput;
    if (!query.trim()) { setTagSuggestions([]); return; }
    const q = query.toLowerCase().replace('@', '');
    setTagSuggestions(
      followingList.filter(u => u?.username?.toLowerCase().includes(q)).slice(0, 6)
    );
  }, [tagInput, activeMention, followingList]);

  // Location is detected only when user taps the location field

  // Stop any playing preview
  const stopPreview = () => {
    player.pause();
    setPlayingTrackId(null);
    setPreviewTrack(null);
  };

  // Play/pause a 30-sec iTunes preview for the given track
  const togglePreview = (item: any) => {
    if (playingTrackId === item.trackId) {
      if (player.playing) {
        player.pause();
      } else {
        player.play();
      }
      return;
    }
    
    setPreviewTrack(item);
    setPlayingTrackId(item.trackId);
    // useAudioPlayer will load the new URL automatically when previewTrack changes
    // We just need to trigger play after a short delay or handle it in an effect
  };

  useEffect(() => {
    if (previewTrack && player) {
      player.play();
    }
  }, [previewTrack, player]);

  // Stop preview whenever picker closes
  useEffect(() => {
    if (!showMusicPicker) stopPreview();
  }, [showMusicPicker]);

  const reset = () => {
    stopPreview();
    setStep('type');
    setPostType(initialType ?? 'post');
    setMediaAssets([]);
    setCaption('');
    setLocation('');
    setTagInput('');
    setTaggedUsers([]);
    setTagSuggestions([]);
    setHashtags('');
    setSong('');
    setSongPreviewUrl('');
    setPosting(false);
    setSelectedMediaIdx(0);
  };

  const handleClose = () => { reset(); onClose(); };

  const pickMedia = async (type: PostType) => {
    setPostType(type);
    if (type === 'thread') { setStep('compose'); return; }
    const ok = await requestPickerPermission();
    if (!ok) return;

    const isStory = type === 'story';
    const isReel = type === 'reel';
    const allowsVideo = isReel;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: isReel ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: !isStory && !isReel,
      selectionLimit: isStory || isReel ? 1 : 10,
      allowsEditing: isStory || isReel,
      aspect: isStory ? [9, 16] : isReel ? [9, 16] : undefined,
      quality: 0.85,
      videoMaxDuration: isReel ? 60 : undefined,
    });

    if (!result.canceled && result.assets?.length > 0) {
      setMediaAssets(result.assets);
      setSelectedMediaIdx(0);
      setStep('compose');
    }
  };

  const addMoreMedia = async () => {
    const ok = await requestPickerPermission();
    if (!ok) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 10 - mediaAssets.length,
      quality: 0.85,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setMediaAssets(prev => [...prev, ...result.assets].slice(0, 10));
    }
  };

  const removeMedia = (idx: number) => {
    setMediaAssets(prev => prev.filter((_, i) => i !== idx));
    if (selectedMediaIdx >= idx && selectedMediaIdx > 0) setSelectedMediaIdx(selectedMediaIdx - 1);
  };

  const detectLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Location access is needed to tag your location.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (place) {
        const loc = [place.name, place.city, place.region, place.country]
          .filter(Boolean).join(', ');
        setLocation(loc);
      }
    } catch (e) {
      Alert.alert('Could not get location', 'Please try again or enter manually.');
    } finally {
      setLocationLoading(false);
    }
  };

  const searchMusic = async (q: string) => {
    if (!q.trim()) { setMusicTracks([]); return; }
    setMusicSearching(true);
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=25`
      );
      const json = await res.json();
      setMusicTracks(json.results ?? []);
    } catch {
      setMusicTracks([]);
    } finally {
      setMusicSearching(false);
    }
  };

  const openMusicPicker = () => {
    setMusicQuery('');
    setMusicTracks([]);
    setShowMusicPicker(true);
    // Pre-load trending
    searchMusic('top hits 2024');
  };

  const addTag = (username: string) => {
    if (activeMention) {
      setCaption(caption.replace(new RegExp(`@${activeMention}$`), `@${username} `));
      setActiveMention('');
    } else {
      if (!taggedUsers.includes(username)) {
        setTaggedUsers(prev => [...prev, username]);
      }
      setTagInput('');
    }
    setTagSuggestions([]);
  };

  const removeTag = (username: string) => setTaggedUsers(prev => prev.filter(u => u !== username));

  const handlePost = () => {
    if (postType === 'thread' && !caption.trim()) {
      Alert.alert('Empty post', 'Write something first.');
      return;
    }
    if ((postType === 'post' || postType === 'reel') && mediaAssets.length === 0) {
      Alert.alert('No media', `Please select ${postType === 'reel' ? 'a video' : 'an image'}.`);
      return;
    }

    const fullCaption = [caption.trim(), hashtags.trim()].filter(Boolean).join('\n\n');
    const primaryAsset = mediaAssets[0];
    const isVideoFromAsset = primaryAsset?.type === 'video' || ['mp4', 'mov', 'avi', 'webm'].includes(primaryAsset?.uri.split('.').pop()?.toLowerCase() ?? '');
    const type = postType === 'thread' ? 'thread' : isVideoFromAsset ? 'video' : 'image';

    // Fire and forget upload process
    const uploadTask = async () => {
      DeviceEventEmitter.emit('upload_status', { status: 'loading', type: postType });
      try {
        if (postType === 'story') {
          await createStory(userId, mediaAssets[0].uri, fullCaption || undefined);
        } else if (postType === 'reel') {
          await createReel(userId, mediaAssets[0].uri, fullCaption, song || undefined);
        } else {
          await createPost(userId, fullCaption, type, mediaAssets.map(a => a.uri), {
            location: location || undefined,
            song: song || undefined,
            taggedUsers: taggedUsers.length > 0 ? taggedUsers : undefined,
            mimeType: primaryAsset?.mimeType,
          });
        }
        DeviceEventEmitter.emit('upload_status', { status: 'success', type: postType });
      } catch (e: any) {
        DeviceEventEmitter.emit('upload_status', { status: 'error', type: postType });
        Alert.alert('Upload Failed', 'Your post could not be uploaded.');
      }
    };

    const optPost = {
      id: 'temp-' + Date.now(),
      user_id: userId,
      caption: fullCaption,
      type: type,
      media_url: primaryAsset?.uri, // Local URI
      created_at: new Date().toISOString(),
      likes_count: 0,
      comments_count: 0,
      profiles: { username: 'Posting...', avatar_url: null }
    };

    // Optimistic payload (to render in feed immediately)
    DeviceEventEmitter.emit('new_post', optPost);
    onPosted?.(optPost);

    uploadTask();
    reset();
    onClose();
  };

  const typeOptions: Array<{ type: PostType; icon: string; label: string; sub: string; color: string }> = [
    { type: 'post',   icon: 'images-outline',      label: 'Post',   sub: 'Share photos or videos',       color: '#4f46e5' },
    { type: 'thread', icon: 'chatbubbles-outline',  label: 'Thread', sub: 'Share thoughts in text',       color: '#0ea5e9' },
    { type: 'story',  icon: 'time-outline',         label: 'Story',  sub: 'Disappears after 24 hours',    color: '#f43f5e' },
    { type: 'reel',   icon: 'film-outline',         label: 'Reel',   sub: 'Short vertical video (≤60s)',  color: '#10b981' },
  ];

  const isVideo = postType === 'reel' ||
    mediaAssets[0]?.type === 'video' ||
    (['mp4', 'mov', 'avi', 'webm'].includes(mediaAssets[0]?.uri.split('.').pop()?.toLowerCase() ?? ''));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={[styles.container, { paddingTop: insets.top || 16 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={step === 'compose' ? () => { setStep('type'); setMediaAssets([]); } : handleClose}
            style={styles.headerSide}
          >
            <Ionicons name={step === 'compose' ? 'arrow-back' : 'close'} size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {step === 'type' ? 'Create'
              : postType === 'story' ? 'New Story'
              : postType === 'thread' ? 'New Thread'
              : postType === 'reel' ? 'New Reel'
              : 'New Post'}
          </Text>
          {step === 'compose' ? (
            <TouchableOpacity
              style={[styles.shareBtn, posting && { opacity: 0.5 }]}
              onPress={handlePost}
              disabled={posting}
            >
              {posting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.shareBtnText}>Share</Text>
              }
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSide} />
          )}
        </View>

        {/* ── Banned Zone ── */}
        {isBanned && (
          <View style={styles.bannedContainer}>
            <View style={styles.bannedCard}>
              <Ionicons name="alert-circle" size={48} color="#ef4444" />
              <Text style={styles.bannedTitle}>Account Suspended</Text>
              <Text style={styles.bannedSub}>
                Your account has been suspended for violating campus community guidelines. You can still browse, but you are restricted from posting or selling.
              </Text>
              <TouchableOpacity style={styles.bannedBtn}>
                <Text style={styles.bannedBtnText}>Contact Support</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step 1: Type selector ── */}
        {!isBanned && step === 'type' && (
          <ScrollView contentContainerStyle={styles.typeList} showsVerticalScrollIndicator={false}>
            {typeOptions.map(({ type, icon, label, sub, color }) => (
              <TouchableOpacity key={type} style={styles.typeCard} onPress={() => pickMedia(type)} activeOpacity={0.75}>
                <View style={[styles.typeIcon, { backgroundColor: color + '1a' }]}>
                  <Ionicons name={icon as any} size={26} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.typeLabel}>{label}</Text>
                  <Text style={styles.typeSub}>{sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── Step 2: Compose ── */}
        {!isBanned && step === 'compose' && (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

            {/* Media preview */}
            {mediaAssets.length > 0 && (
              <View>
                <View style={{ position: 'relative' }}>
                  <Image
                    source={{ uri: mediaAssets[selectedMediaIdx].uri }}
                    style={[styles.mediaPreview, isVideo && { opacity: 0.85 }]}
                    resizeMode="cover"
                  />
                  {isVideo && (
                    <View style={StyleSheet.absoluteFill as any} pointerEvents="none">
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="play-circle" size={56} color="rgba(255,255,255,0.8)" />
                      </View>
                    </View>
                  )}
                  {mediaAssets.length > 1 && (
                    <View style={styles.countBadge}>
                      <Ionicons name="layers-outline" size={12} color="#fff" />
                      <Text style={styles.countBadgeText}>{selectedMediaIdx + 1}/{mediaAssets.length}</Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeMedia(selectedMediaIdx)}>
                    <Ionicons name="close-circle" size={26} color="rgba(255,255,255,0.9)" />
                  </TouchableOpacity>
                </View>

                {mediaAssets.length > 1 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, padding: 8 }}>
                    {mediaAssets.map((asset, i) => (
                      <TouchableOpacity key={i} onPress={() => setSelectedMediaIdx(i)}>
                        <Image source={{ uri: asset.uri }} style={[styles.thumb, i === selectedMediaIdx && styles.thumbSelected]} />
                      </TouchableOpacity>
                    ))}
                    {mediaAssets.length < 10 && postType === 'post' && (
                      <TouchableOpacity style={styles.addMoreBtn} onPress={addMoreMedia}>
                        <Ionicons name="add" size={22} color="rgba(255,255,255,0.5)" />
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                )}
              </View>
            )}

            {/* Caption */}
            <View style={styles.captionRow}>
              <TextInput
                style={styles.captionInput}
                placeholder={
                  postType === 'thread' ? "What's happening on campus?"
                  : postType === 'story' ? 'Add a caption (optional)...'
                  : postType === 'reel' ? 'Describe your reel...'
                  : 'Write a caption...'
                }
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={2200}
                autoFocus={postType === 'thread'}
              />
            </View>
            <View style={styles.divider} />

            {/* Hashtags */}
            <View style={styles.composeField}>
              <Ionicons name="pricetag-outline" size={20} color="#818cf8" />
              <TextInput
                style={styles.composeInput}
                placeholder="#Hashtags"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={hashtags}
                onChangeText={setHashtags}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.divider} />

            {/* Tag people */}
            <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
              <View style={styles.composeField}>
                <Ionicons name="at-outline" size={20} color="rgba(255,255,255,0.4)" />
                <TextInput
                  style={styles.composeInput}
                  placeholder="Tag people"
                  placeholderTextColor="rgba(255,255,255,0.3)"
                  value={tagInput}
                  onChangeText={setTagInput}
                  autoCapitalize="none"
                />
              </View>
              {taggedUsers.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingTop: 6 }}>
                  {taggedUsers.map(u => (
                    <TouchableOpacity key={u} style={styles.tagChip} onPress={() => removeTag(u)}>
                      <Text style={styles.tagChipText}>@{u}</Text>
                      <Ionicons name="close" size={12} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {/* Suggestions dropdown */}
              {tagSuggestions.length > 0 && (
                <View style={styles.suggestionsBox}>
                  {tagSuggestions.map(u => (
                    <TouchableOpacity key={u.id} style={styles.suggestionRow} onPress={() => addTag(u.username)}>
                      {u.avatar_url
                        ? <Image source={{ uri: u.avatar_url }} style={styles.suggestionAvatar} />
                        : <View style={[styles.suggestionAvatar, { backgroundColor: '#222' }]} />
                      }
                      <Text style={styles.suggestionName}>{u.username}</Text>
                      {u.full_name ? <Text style={styles.suggestionSub}>{u.full_name}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <View style={styles.divider} />

            {/* Location */}
            <TouchableOpacity style={styles.composeField} onPress={detectLocation} disabled={locationLoading}>
              <Ionicons name="location-outline" size={20} color={location ? '#10b981' : 'rgba(255,255,255,0.4)'} />
              {locationLoading
                ? <ActivityIndicator size="small" color="#10b981" style={{ marginLeft: 8 }} />
                : location
                  ? (
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.composeInput, { color: '#10b981' }]} numberOfLines={1}>{location}</Text>
                      <TouchableOpacity onPress={() => setLocation('')}>
                        <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
                      </TouchableOpacity>
                    </View>
                  )
                  : (
                    <Text style={[styles.composeInput, { color: 'rgba(255,255,255,0.4)' }]}>
                      Tap to detect location
                    </Text>
                  )
              }
            </TouchableOpacity>
            <View style={styles.divider} />

            {/* Music */}
            <TouchableOpacity style={styles.composeField} onPress={openMusicPicker}>
              <Ionicons name="musical-notes-outline" size={20} color={song ? '#f43f5e' : 'rgba(255,255,255,0.4)'} />
              {song
                ? (
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.composeInput, { color: '#f43f5e' }]} numberOfLines={1}>{song}</Text>
                    <TouchableOpacity onPress={() => setSong('')}>
                      <Ionicons name="close-circle" size={16} color="rgba(255,255,255,0.3)" />
                    </TouchableOpacity>
                  </View>
                )
                : <Text style={[styles.composeInput, { color: 'rgba(255,255,255,0.4)' }]}>Add music</Text>
              }
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.2)" />
            </TouchableOpacity>
            <View style={styles.divider} />
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      {/* Music picker modal — iTunes Search API */}
      <Modal
        visible={showMusicPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMusicPicker(false)}
      >
        <View style={styles.musicOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill as any} onPress={() => setShowMusicPicker(false)} />
          <View style={[styles.musicSheet, { paddingBottom: insets.bottom || 16 }]}>
            <View style={styles.musicHandle} />
            <Text style={styles.musicTitle}>Add Music</Text>

            {/* Search bar */}
            <View style={styles.musicSearchRow}>
              <Ionicons name="search" size={16} color="rgba(255,255,255,0.4)" />
              <TextInput
                style={styles.musicSearchInput}
                value={musicQuery}
                onChangeText={q => {
                  setMusicQuery(q);
                  if (q.length > 1) searchMusic(q);
                  else if (!q) searchMusic('top hits 2024');
                }}
                placeholder="Search any song or artist..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                returnKeyType="search"
                onSubmitEditing={() => searchMusic(musicQuery)}
                autoFocus
              />
              {musicSearching && <ActivityIndicator size="small" color="#f43f5e" />}
            </View>

            {musicSearching && musicTracks.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 30 }}>
                <ActivityIndicator color="#f43f5e" />
                <Text style={{ color: '#555', marginTop: 12 }}>Searching...</Text>
              </View>
            ) : musicTracks.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="musical-notes-outline" size={48} color="#333" />
                <Text style={{ color: '#555', marginTop: 12, fontSize: 14 }}>Search for a song above</Text>
              </View>
            ) : (
              <FlatList
                data={musicTracks}
                keyExtractor={t => String(t.trackId ?? t.collectionId ?? Math.random())}
                style={{ maxHeight: 380 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => {
                  const trackName = `${item.trackName} — ${item.artistName}`;
                  const isSelected = song === trackName;
                  const isPlaying = playingTrackId === item.trackId;
                  const dur = item.trackTimeMillis ? Math.round(item.trackTimeMillis / 1000) : null;
                  return (
                    <TouchableOpacity
                      style={[styles.trackRow, isSelected && { backgroundColor: 'rgba(244,63,94,0.12)' }]}
                      onPress={() => {
                        stopPreview();
                        setSong(trackName);
                        setSongPreviewUrl(item.previewUrl ?? '');
                        setShowMusicPicker(false);
                      }}
                    >
                      {item.artworkUrl60
                        ? <Image source={{ uri: item.artworkUrl60 }} style={styles.trackArtwork} />
                        : <View style={styles.trackArtPlaceholder}>
                            <Ionicons name="musical-note" size={18} color="rgba(255,255,255,0.3)" />
                          </View>
                      }
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.trackName} numberOfLines={1}>{item.trackName}</Text>
                        <Text style={styles.trackArtist} numberOfLines={1}>{item.artistName}</Text>
                      </View>
                      <View style={{ alignItems: 'center', gap: 4 }}>
                        {dur && <Text style={styles.trackDur}>{Math.floor(dur / 60)}:{String(dur % 60).padStart(2, '0')}</Text>}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {item.previewUrl && (
                            <TouchableOpacity
                              onPress={() => togglePreview(item)}
                              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                              <Ionicons
                                name={playingTrackId === item.trackId && player.playing ? 'pause-circle' : 'play-circle-outline'}
                                size={24}
                                color={playingTrackId === item.trackId && player.playing ? '#f43f5e' : 'rgba(255,255,255,0.45)'}
                              />
                            </TouchableOpacity>
                          )}
                          {isSelected && <Ionicons name="checkmark-circle" size={20} color="#f43f5e" />}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerSide: { width: 44, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  shareBtn: { backgroundColor: '#4f46e5', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8, minWidth: 72, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  typeList: { padding: 16, gap: 10 },
  typeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
    borderRadius: 18, padding: 18,
  },
  typeIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 2 },
  typeSub: { fontSize: 12, color: 'rgba(255,255,255,0.4)' },

  mediaPreview: { width: '100%', height: 380, backgroundColor: '#111' },
  countBadge: {
    position: 'absolute', top: 10, right: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  countBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  removeBtn: { position: 'absolute', top: 8, left: 8 },
  thumb: { width: 56, height: 56, borderRadius: 8, borderWidth: 2, borderColor: 'transparent' },
  thumbSelected: { borderColor: '#4f46e5' },
  addMoreBtn: {
    width: 56, height: 56, borderRadius: 8,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },

  captionRow: { padding: 16, minHeight: 100 },
  captionInput: { color: '#fff', fontSize: 15, lineHeight: 22 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  composeField: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  composeInput: { flex: 1, color: '#fff', fontSize: 14 },

  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(99,102,241,0.15)',
    borderWidth: 1, borderColor: 'rgba(99,102,241,0.3)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
  },
  tagChipText: { color: '#818cf8', fontSize: 12 },
  suggestionsBox: {
    backgroundColor: '#1a1a1a', borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    marginTop: 4, overflow: 'hidden',
  },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  suggestionAvatar: { width: 32, height: 32, borderRadius: 16 },
  suggestionName: { fontSize: 13, fontWeight: '600', color: '#fff' },
  suggestionSub: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 4 },

  musicOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  musicSheet: { backgroundColor: '#111', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '80%' },
  musicHandle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  musicTitle: { fontSize: 15, fontWeight: '700', color: '#fff', marginBottom: 10, textAlign: 'center' },
  musicSearchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 9, marginBottom: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  musicSearchInput: { flex: 1, color: '#fff', fontSize: 14 },
  trackRow: { flexDirection: 'row', alignItems: 'center', padding: 10, borderRadius: 10, marginBottom: 2 },
  trackArtwork: { width: 44, height: 44, borderRadius: 6 },
  trackArtPlaceholder: { width: 44, height: 44, borderRadius: 6, backgroundColor: '#1e1e1e', alignItems: 'center', justifyContent: 'center' },
  trackName: { fontSize: 13, color: '#fff', fontWeight: '600' },
  trackArtist: { fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 },
  trackDur: { fontSize: 11, color: 'rgba(255,255,255,0.35)' },

  bannedContainer: { flex: 1, padding: 24, justifyContent: 'center' },
  bannedCard: { backgroundColor: 'rgba(239, 68, 68, 0.05)', borderRadius: 24, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.2)' },
  bannedTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 20 },
  bannedSub: { color: 'rgba(255,255,255,0.5)', fontSize: 15, textAlign: 'center', marginTop: 12, lineHeight: 22 },
  bannedBtn: { backgroundColor: '#ef4444', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 25, marginTop: 32 },
  bannedBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
