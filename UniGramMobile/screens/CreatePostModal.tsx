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
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useAudioPlayer } from 'expo-audio';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeModules } from '../lib/SafeModules';
const VideoThumbnails = SafeModules.thumbnails;
import { createPost } from '../services/posts';
import { createStory } from '../services/stories';
import { createReel } from '../services/reels';
import { getFollowing } from '../services/profiles';
import { supabase } from '../lib/supabase';
import { MusicPicker } from '../components/MusicPicker';
import { usePopup } from '../context/PopupContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../context/ThemeContext';
import { getCaptionSuggestions, checkKeywordFilter, CaptionSuggestion } from '../services/aiEngine';
import { getTrendingHashtags } from '../services/algorithm';

export const SafeBlur = ({ intensity, tint, style, children }: any) => {
  if (SafeModules.hasBlur()) {
    const { BlurView } = require('expo-blur');
    return <BlurView intensity={intensity} tint={tint} style={style}>{children}</BlurView>;
  }
  return <View style={[style, { backgroundColor: tint === 'dark' ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.8)' }]}>{children}</View>;
};

const { width } = Dimensions.get('window');
type PostType = 'post' | 'thread' | 'story' | 'reel';

interface Props {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onPosted?: (optimisticPost?: any) => void;
  initialType?: PostType;
  preCapturedMedia?: Array<{ 
    uri: string; 
    type: 'image' | 'video'; 
    mode: PostType;
    song?: string;
    songPreviewUrl?: string;
  }>;
}

async function requestPickerPermission(showPopup: any): Promise<boolean> {
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') {
    showPopup({
      title: 'Permission needed',
      message: 'Please allow photo library access in your device settings.',
      icon: 'images-outline',
      buttons: [{ text: 'OK', onPress: () => {} }]
    });
    return false;
  }
  return true;
}

export const CreatePostModal: React.FC<Props> = ({ visible, userId, onClose, onPosted, initialType, preCapturedMedia }) => {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { showPopup } = usePopup();
  const { showToast } = useToast();
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
  const [songPreviewUrl, setSongPreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedMediaIdx, setSelectedMediaIdx] = useState(0);
  const [activeMention, setActiveMention] = useState('');

  const [isBanned, setIsBanned] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);
  const [university, setUniversity] = useState('');

  // ── AI Caption Assistant ──────────────────────────────────────────────────────
  const [captionSuggestions, setCaptionSuggestions] = useState<CaptionSuggestion[]>([]);
  const [suggestedHashtags, setSuggestedHashtags] = useState<string[]>([]);
  const [loadingCaptions, setLoadingCaptions] = useState(false);
  const [showCaptionPanel, setShowCaptionPanel] = useState(false);

  useEffect(() => {
    if (visible && userId) {
      getFollowing(userId).then(setFollowingList).catch(() => {});
      // Check if user is banned or suspended; also grab university for AI captions
      supabase.from('profiles').select('is_banned, is_suspended, university').eq('id', userId).single()
        .then(({ data }) => {
          setIsBanned(!!data?.is_banned);
          setIsSuspended(!!data?.is_suspended);
          if (data?.university) setUniversity(data.university);
        });

      if (initialType === 'thread' && !preCapturedMedia?.length) {
        // Opened directly as thread composer — skip media picker and go straight to compose
        setPostType('thread');
        setStep('compose');
      } else if (preCapturedMedia && preCapturedMedia.length > 0) {
        setPostType(preCapturedMedia[0].mode);
        setMediaAssets(preCapturedMedia.map(m => ({
          uri: m.uri,
          type: m.type === 'video' ? 'video' : 'image'
        } as any)));

        if (preCapturedMedia[0].song) setSong(preCapturedMedia[0].song);
        if (preCapturedMedia[0].songPreviewUrl) setSongPreviewUrl(preCapturedMedia[0].songPreviewUrl);

        setStep('compose');
      }
    }
  }, [visible, userId, preCapturedMedia, initialType]);

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
  const detectLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showPopup({
          title: 'Permission denied',
          message: 'Location access is needed to tag your location.',
          icon: 'location-outline',
          buttons: [{ text: 'OK', onPress: () => {} }]
        });
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
      showPopup({
        title: 'Could not get location',
        message: 'Please try again or enter manually.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
    } finally {
      setLocationLoading(false);
    }
  };

  const openMusicPicker = () => {
    setShowMusicPicker(true);
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


  const reset = () => {
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
    setUploading(false);
    setSelectedMediaIdx(0);
    setCaptionSuggestions([]);
    setSuggestedHashtags([]);
    setShowCaptionPanel(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const suggestCaption = async () => {
    setLoadingCaptions(true);
    setShowCaptionPanel(true);
    try {
      const trending = await getTrendingHashtags(8, userId).catch(() => [] as any[]);
      const trendingTags = (trending ?? []).map((t: any) => `#${t.tag}`);

      let mediaBase64: string | undefined;
      let mediaType: 'image' | 'video' | undefined;

      if (postType !== 'thread' && mediaAssets.length > 0) {
        const { readAsStringAsync } = require('expo-file-system/legacy');
        const asset = mediaAssets[0];
        const assetIsVideo = asset.type === 'video' ||
          ['mp4', 'mov', 'avi', 'webm'].includes(asset.uri.split('.').pop()?.toLowerCase() ?? '');

        if (assetIsVideo) {
          try {
            const VideoThumbnails = SafeModules.thumbnails;
            if (VideoThumbnails) {
              const thumb = await VideoThumbnails.getThumbnailAsync(asset.uri, { quality: 0.4, time: 1000 });
              mediaBase64 = await readAsStringAsync(thumb.uri, { encoding: 'base64' });
              mediaType = 'video';
            }
          } catch { /* skip vision if thumbnail fails */ }
        } else {
          try {
            mediaBase64 = await readAsStringAsync(asset.uri, { encoding: 'base64' });
            mediaType = 'image';
          } catch { /* skip vision if read fails */ }
        }
      }

      const result = await getCaptionSuggestions({
        userId,
        postType,
        university: university || undefined,
        trendingHashtags: trendingTags,
        mediaBase64,
        mediaType,
      });
      setCaptionSuggestions(result.captions ?? []);
      setSuggestedHashtags(result.hashtags ?? []);
    } catch {
      showPopup({
        title: 'Caption suggestions unavailable',
        message: 'Could not reach the AI. Please try again.',
        icon: 'alert-circle-outline',
        buttons: [{ text: 'OK', onPress: () => {} }],
      });
      setShowCaptionPanel(false);
    } finally {
      setLoadingCaptions(false);
    }
  };

  const pickMedia = async (type: PostType) => {
    setPostType(type);
    if (type === 'thread') { setStep('compose'); return; }
    const ok = await requestPickerPermission(showPopup);
    if (!ok) return;

    const isStory = type === 'story';
    const isReel = type === 'reel';
    const allowsVideo = isReel;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: isReel ? ImagePicker.MediaTypeOptions.Videos : ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: !isStory && !isReel,
      selectionLimit: isStory || isReel ? 1 : 10,
      allowsEditing: false, // WhatsApp style: no forced crop
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
    const ok = await requestPickerPermission(showPopup);
    if (!ok) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 10 - mediaAssets.length,
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.length > 0) {
      setMediaAssets(prev => [...prev, ...result.assets].slice(0, 10));
    }
  };

  const removeMedia = (idx: number) => {
    setMediaAssets(prev => prev.filter((_, i) => i !== idx));
    if (selectedMediaIdx >= idx && selectedMediaIdx > 0) setSelectedMediaIdx(selectedMediaIdx - 1);
  };

  const uploadCancelled = useRef(false);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('cancel_upload', () => {
      uploadCancelled.current = true;
    });
    return () => sub.remove();
  }, []);

  const handlePost = async () => {
    if (uploading) return;
    if (postType === 'thread' && !caption.trim()) {
      showPopup({
        title: 'Empty post',
        message: 'Write something first.',
        icon: 'chatbubble-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }
    if ((postType === 'post' || postType === 'reel') && mediaAssets.length === 0) {
      showPopup({
        title: 'No media',
        message: `Please select ${postType === 'reel' ? 'a video' : 'an image'}.`,
        icon: 'images-outline',
        buttons: [{ text: 'OK', onPress: () => {} }]
      });
      return;
    }

    // Keyword filter pre-check (non-blocking for warn/flag, hard-stop for block)
    const captionText = [caption.trim(), hashtags.trim()].filter(Boolean).join(' ');
    if (captionText) {
      const filterResult = await checkKeywordFilter(captionText);
      if (filterResult.flagged) {
        if (filterResult.severity === 'block') {
          showPopup({
            title: 'Content not allowed',
            message: 'Your caption contains content that violates Community Guidelines. Please revise before posting.',
            icon: 'ban-outline',
            buttons: [{ text: 'OK', onPress: () => {} }],
          });
          return;
        }
        if (filterResult.severity === 'warn') {
          // Warn but allow through — user must confirm
          await new Promise<void>((resolve) => {
            showPopup({
              title: 'Community Guidelines',
              message: 'Your caption may contain content that some users find offensive. Please review before posting.',
              icon: 'warning-outline',
              buttons: [
                { text: 'Post anyway', onPress: () => resolve() },
                { text: 'Edit caption', onPress: () => { /* resolve stays pending → upload never starts */ } },
              ],
            });
            // Resolve after a tick if the popup doesn't block
            setTimeout(resolve, 100);
          });
        }
        // 'flag' severity: silently auto-report after upload (fire-and-forget below)
      }
    }

    setUploading(true);
    uploadCancelled.current = false;

    const fullCaption = [caption.trim(), hashtags.trim()].filter(Boolean).join('\n\n');
    const primaryAsset = mediaAssets[0];
    const isVideoFromAsset = primaryAsset?.type === 'video' || ['mp4', 'mov', 'avi', 'webm'].includes(primaryAsset?.uri.split('.').pop()?.toLowerCase() ?? '');
    const type = postType === 'thread' ? 'thread' : isVideoFromAsset ? 'video' : 'image';

    // Fire and forget upload process
    const emitStatus = (status: 'loading' | 'success' | 'error', extra = {}) => {
      DeviceEventEmitter.emit('upload_status', { 
        status, 
        type: postType, 
        id: 'post_upload', // constant ID for tracking
        ...extra 
      });
    };

    const uploadTask = async () => {
      emitStatus('loading', { progress: 0.1 });
      
      try {
        const uris: string[] = [];
        
        for (let i = 0; i < mediaAssets.length; i++) {
          if (uploadCancelled.current) throw new Error('CANCELLED');
          
          const asset = mediaAssets[i];
          const fileName = `${Date.now()}_${i}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
          const filePath = `${userId}/${fileName}`;
          
          // Increment progress per file
          emitStatus('loading', { progress: 0.1 + (i / mediaAssets.length) * 0.7 });

          // Safer Android upload: read as base64 then decode to ArrayBuffer
          const { readAsStringAsync } = require('expo-file-system/legacy');
          const { decode } = require('base64-arraybuffer');
          
          const base64 = await readAsStringAsync(asset.uri, { encoding: 'base64' });
          const arrayBuffer = decode(base64);

          const bucket = (postType === 'reel' || asset.type === 'video') ? 'videos' : 'post-media';
          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(filePath, arrayBuffer, {
              contentType: asset.type === 'video' ? 'video/mp4' : 'image/jpeg',
              upsert: true
            });
            
          if (uploadError) throw uploadError;
          
          const { data: { publicUrl } } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);
            
          uris.push(publicUrl);
        }

        if (uploadCancelled.current) throw new Error('CANCELLED');
        emitStatus('loading', { progress: 0.85 });

        // Final database entry
        // Correct table mapping
        let tableName = 'posts';
        let postData: any = {
          user_id: userId,
          caption: caption.trim(),
        };

        if (postType === 'reel') {
          tableName = 'reels';
          postData.video_url = uris[0];
          postData.song = song || null;
        } else if (postType === 'story') {
          tableName = 'stories';
          postData.media_url = uris[0];
        } else {
          tableName = 'posts';
          postData.type = postType === 'thread' ? 'thread' : isVideoFromAsset ? 'video' : 'image';
          postData.media_url = uris[0] || null;
          postData.media_urls = uris;
          postData.song = song || null;
          postData.location = location || null;
        }

        const { error: dbError } = await supabase
          .from(tableName)
          .insert([postData]);

        if (dbError) throw dbError;
        
        if (uploadCancelled.current) return;
        
        emitStatus('success', { progress: 1 });
        onPosted?.();
      } catch (e: any) {
        if (e.message === 'CANCELLED') {
          console.log('User cancelled upload');
          return;
        }
        showToast(e.message || 'Failed to post. Please try again.', 'error');
        emitStatus('error', { message: e.message });
      } finally {
        setUploading(false);
      }
    };

    const optPost = {
      id: 'temp-' + Date.now(),
      user_id: userId,
      caption: caption.trim(),
      type: type,
      media_url: primaryAsset?.uri, // Local URI
      created_at: new Date().toISOString(),
      likes_count: 0,
      comments_count: 0,
      profiles: { username: 'Posting...', avatar_url: null }
    };

    // Optimistic payload
    DeviceEventEmitter.emit('new_post', optPost);
    onPosted?.(optPost);

    uploadTask();
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
        <SafeBlur intensity={20} tint="dark" style={styles.header}>
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
              style={styles.shareBtnWrap}
              onPress={handlePost}
              disabled={uploading}
            >
              <LinearGradient
                colors={['#4f46e5', '#7e22ce']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.shareBtn}
              >
                {uploading
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.shareBtnText}>Share</Text>
                }
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerSide} />
          )}
        </SafeBlur>

        {/* ── Banned/Suspended Zone ── */}
        {(isBanned || isSuspended) && (
          <View style={styles.bannedContainer}>
            <View style={styles.bannedCard}>
              <Ionicons name="alert-circle" size={48} color="#ef4444" />
              <Text style={styles.bannedTitle}>{isBanned ? 'Account Banned' : 'Account Suspended'}</Text>
              <Text style={styles.bannedSub}>
                {isBanned 
                  ? 'Your account has been permanently banned for violating campus community guidelines.'
                  : 'Your account has been temporarily suspended for violating campus community guidelines. You can still browse, but you are restricted from posting or selling.'}
              </Text>
              <TouchableOpacity style={styles.bannedBtn}>
                <Text style={styles.bannedBtnText}>Contact Support</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Step 1: Type selector ── */}
        {!isBanned && !isSuspended && step === 'type' && (
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
        {!isBanned && !isSuspended && step === 'compose' && (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

            {/* Media preview */}
            {mediaAssets.length > 0 && (
              <View>
                <View style={{ position: 'relative' }}>
                  <Image
                    source={{ uri: mediaAssets[selectedMediaIdx].uri }}
                    style={[styles.mediaPreview, isVideo && { opacity: 0.85 }]}
                    resizeMode="contain"
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
              {/* AI Caption Suggest button */}
              {postType !== 'story' && (
                <TouchableOpacity
                  style={styles.aiSuggestBtn}
                  onPress={suggestCaption}
                  disabled={loadingCaptions}
                >
                  {loadingCaptions
                    ? <ActivityIndicator size="small" color="#818cf8" />
                    : <Text style={styles.aiSuggestBtnText}>✨ Suggest</Text>
                  }
                </TouchableOpacity>
              )}
            </View>

            {/* AI Caption Suggestions Panel */}
            {showCaptionPanel && captionSuggestions.length > 0 && (
              <View style={styles.captionPanel}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={styles.captionPanelLabel}>✨ AI Suggested</Text>
                  <TouchableOpacity onPress={() => setShowCaptionPanel(false)}>
                    <Ionicons name="close" size={16} color="rgba(255,255,255,0.4)" />
                  </TouchableOpacity>
                </View>
                {captionSuggestions.map((s, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.captionChip}
                    onPress={() => {
                      setCaption(s.text);
                      setShowCaptionPanel(false);
                    }}
                  >
                    <Text style={styles.captionChipTone}>
                      {s.tone === 'casual' ? '😎' : s.tone === 'inspirational' ? '🌟' : '😂'} {s.tone}
                    </Text>
                    <Text style={styles.captionChipText} numberOfLines={3}>{s.text}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
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
            {/* AI hashtag suggestions (shown when AI has returned them and user hasn't typed yet) */}
            {suggestedHashtags.length > 0 && !hashtags && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 10, gap: 6 }}>
                {suggestedHashtags.map((tag, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.hashtagChip}
                    onPress={() => setHashtags(prev => [prev.trim(), tag].filter(Boolean).join(' '))}
                  >
                    <Text style={styles.hashtagChipText}>{tag}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
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

      <MusicPicker
        visible={showMusicPicker}
        onClose={() => setShowMusicPicker(false)}
        onSelect={(track: any, startTime: number) => {
          const trackName = `${track.trackName} — ${track.artistName}`;
          setSong(trackName);
          setSongPreviewUrl(track.previewUrl || '');
          setShowMusicPicker(false);
        }}
      />
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
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#fff' },
  shareBtnWrap: { overflow: 'hidden', borderRadius: 20 },
  shareBtn: { paddingHorizontal: 20, paddingVertical: 8, minWidth: 80, alignItems: 'center' },
  shareBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

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
  captionInput: { color: '#fff', fontSize: 15, lineHeight: 22, flex: 1 },
  aiSuggestBtn: { alignSelf: 'flex-end', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(129,140,248,0.5)', marginTop: 6 },
  aiSuggestBtnText: { color: '#818cf8', fontSize: 12, fontWeight: '600' },
  captionPanel: { marginHorizontal: 12, marginBottom: 8, backgroundColor: 'rgba(129,140,248,0.08)', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: 'rgba(129,140,248,0.2)' },
  captionPanelLabel: { color: '#818cf8', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' },
  captionChip: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 10, marginBottom: 6 },
  captionChipTone: { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 3, textTransform: 'capitalize', fontWeight: '600' },
  captionChipText: { color: '#fff', fontSize: 13, lineHeight: 18 },
  hashtagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: 'rgba(129,140,248,0.15)', borderWidth: 1, borderColor: 'rgba(129,140,248,0.3)' },
  hashtagChipText: { color: '#818cf8', fontSize: 12, fontWeight: '600' },
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
