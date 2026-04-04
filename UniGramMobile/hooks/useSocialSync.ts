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
      if (data.targetId === targetUserId && isMounted.current) {
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
    setFollowing(initialValue);
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
  const eventType: SocialEventType = type === 'POST' ? 'POST_LIKE_CHANGE' : 'REEL_LIKE_CHANGE';

  useEffect(() => {
    isMounted.current = true;
    const sub = SocialSync.on(eventType, (data: SocialEventData) => {
      if (data.targetId === targetId && isMounted.current) {
        setLiked(data.isActive);
        if (data.newCount !== undefined) {
          setCount(data.newCount);
        }
      }
    });
    return () => {
      isMounted.current = false;
      sub.remove();
    };
  }, [targetId, eventType]);

  // Synchronize with prop changes
  useEffect(() => {
    setLiked(initialLiked);
  }, [initialLiked]);

  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  return { liked, setLiked, count, setCount };
}
