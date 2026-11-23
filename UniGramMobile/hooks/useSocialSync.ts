import { useState, useEffect, useRef } from 'react';
import { SocialSync, SocialEventData, SocialEventType } from '../services/social_sync';

/**
 * Hook to manage follow state with global synchronization.
 */
export function useSocialFollow(targetUserId: string, initialValue: boolean) {
  const [following, setFollowing] = useState(initialValue);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const sub = SocialSync.on('FOLLOW_CHANGE', (data: SocialEventData) => {
      if (data.targetId === targetUserId && isMounted.current && data.isActive !== undefined) {
        setFollowing(data.isActive);
      }
    });
    return () => {
      isMounted.current = false;
      sub.remove();
    };
  }, [targetUserId]);

  // Synchronize with prop changes (e.g. if parent re-fetches)
  useEffect(() => {
    setFollowing(prev => {
      if (prev !== initialValue) return initialValue;
      return prev;
    });
  }, [initialValue]);

  return [following, setFollowing] as const;
}

/**
 * Hook to manage like state with global synchronization.
 */
export function useSocialLike(
  targetId: string, 
  type: 'POST' | 'REEL',
  initialLiked: boolean,
  initialCount: number
) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);
  const isMounted = useRef(true);
  const likedRef = useRef(initialLiked);
  const eventType: SocialEventType = type === 'POST' ? 'POST_LIKE_CHANGE' : 'REEL_LIKE_CHANGE';

  useEffect(() => {
    isMounted.current = true;
    const sub = SocialSync.on(eventType, (data: SocialEventData) => {
      if (data.targetId === targetId && isMounted.current && data.isActive !== undefined) {
        const changed = likedRef.current !== data.isActive;
        likedRef.current = data.isActive;
        setLiked(data.isActive);
        if (data.newCount !== undefined) {
          setCount(data.newCount);
        } else if (changed) {
          // Another screen toggled this like without an authoritative count — apply the delta
          setCount(c => Math.max(0, c + (data.isActive ? 1 : -1)));
        }
      }
    });
    return () => {
      isMounted.current = false;
      sub.remove();
    };
  }, [targetId, eventType]);

  const lastInitialRef = useRef(initialLiked);
  useEffect(() => {
    if (lastInitialRef.current !== initialLiked) {
      setLiked(initialLiked);
      likedRef.current = initialLiked;
      lastInitialRef.current = initialLiked;
    }
  }, [initialLiked]);

  useEffect(() => {
    setCount(prev => {
      if (prev !== initialCount) return initialCount;
      return prev;
    });
  }, [initialCount]);

  const setLikedSynced = (v: boolean | ((p: boolean) => boolean)) => {
    setLiked(prev => {
      const next = typeof v === 'function' ? (v as (p: boolean) => boolean)(prev) : v;
      likedRef.current = next;
      return next;
    });
  };

  return { liked, setLiked: setLikedSynced as typeof setLiked, count, setCount };
}
