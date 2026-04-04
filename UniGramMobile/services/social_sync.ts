import { DeviceEventEmitter } from 'react-native';

export type SocialEventType = 
  | 'FOLLOW_CHANGE' 
  | 'POST_LIKE_CHANGE' 
  | 'REEL_LIKE_CHANGE'
  | 'STORY_LIKE_CHANGE';

export interface SocialEventData {
  targetId: string; // userId, postId, reelId, etc.
  isActive: boolean; // isLiked, isFollowing, etc.
  newCount?: number; // updated likes_count
}

export const SocialSync = {
  emit: (type: SocialEventType, data: SocialEventData) => {
    DeviceEventEmitter.emit(type, data);
  },
  
  on: (type: SocialEventType, callback: (data: SocialEventData) => void) => {
    return DeviceEventEmitter.addListener(type, callback);
  }
};
