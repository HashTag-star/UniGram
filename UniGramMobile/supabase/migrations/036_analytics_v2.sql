-- Enhanced profile analytics with trend comparison data
CREATE OR REPLACE FUNCTION get_profile_analytics(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    -- Audience
    'followers',              (SELECT COUNT(*) FROM follows WHERE following_id = p_user_id),
    'following',              (SELECT COUNT(*) FROM follows WHERE follower_id  = p_user_id),

    -- Profile views — current + previous periods for trend
    'profile_views_7d',       (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at > now() - interval '7 days'),
    'profile_views_30d',      (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at > now() - interval '30 days'),
    'profile_views_prev_7d',  (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at BETWEEN now() - interval '14 days' AND now() - interval '7 days'),
    'profile_views_prev_30d', (SELECT COUNT(*) FROM profile_views WHERE profile_id = p_user_id AND viewed_at BETWEEN now() - interval '60 days' AND now() - interval '30 days'),

    -- Post counts
    'total_posts',            (SELECT COUNT(*) FROM posts WHERE user_id = p_user_id),
    'total_likes',            (SELECT COALESCE(SUM(likes_count), 0)    FROM posts WHERE user_id = p_user_id),
    'total_comments',         (SELECT COALESCE(SUM(comments_count), 0) FROM posts WHERE user_id = p_user_id),

    -- 30-day engagement (on posts created in window)
    'likes_30d',              (SELECT COALESCE(SUM(likes_count), 0)    FROM posts WHERE user_id = p_user_id AND created_at > now() - interval '30 days'),
    'comments_30d',           (SELECT COALESCE(SUM(comments_count), 0) FROM posts WHERE user_id = p_user_id AND created_at > now() - interval '30 days'),

    -- Post impressions — current + previous 30d for trend
    'total_views_30d',        (
      SELECT COUNT(*) FROM post_impressions pi
      JOIN posts p ON p.id = pi.post_id
      WHERE p.user_id = p_user_id AND pi.seen_at > now() - interval '30 days'
    ),
    'total_views_prev_30d',   (
      SELECT COUNT(*) FROM post_impressions pi
      JOIN posts p ON p.id = pi.post_id
      WHERE p.user_id = p_user_id AND pi.seen_at BETWEEN now() - interval '60 days' AND now() - interval '30 days'
    )
  );
$$;
