-- SECURITY DEFINER function so the nested conversation_participants join
-- returns ALL participants (not just the caller), regardless of RLS policies.

CREATE OR REPLACE FUNCTION get_user_conversations(p_user_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.last_message_at DESC NULLS LAST), '[]'::json)
  FROM (
    SELECT
      c.id,
      c.is_group,
      c.group_name,
      c.last_message,
      c.last_message_at,
      cp_me.unread_count,
      (
        SELECT COALESCE(json_agg(json_build_object(
          'user_id',          cp2.user_id,
          'unread_count',     cp2.unread_count,
          'profiles', json_build_object(
            'id',                p.id,
            'username',          p.username,
            'full_name',         p.full_name,
            'avatar_url',        p.avatar_url,
            'is_verified',       p.is_verified,
            'verification_type', p.verification_type
          )
        )), '[]'::json)
        FROM conversation_participants cp2
        JOIN profiles p ON p.id = cp2.user_id
        WHERE cp2.conversation_id = c.id
      ) AS conversation_participants
    FROM conversation_participants cp_me
    JOIN conversations c ON c.id = cp_me.conversation_id
    WHERE cp_me.user_id = p_user_id
  ) t;
$$;

GRANT EXECUTE ON FUNCTION get_user_conversations(UUID) TO authenticated;
