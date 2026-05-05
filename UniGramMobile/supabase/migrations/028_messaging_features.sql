-- 028_messaging_features.sql
-- 1. Add Archive and Mute functionality to conversation_participants
ALTER TABLE public.conversation_participants
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_muted BOOLEAN DEFAULT false;

-- 2. Add "Delete for Me" functionality to messages
-- We use an array of user IDs who have deleted this message for themselves.
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS deleted_by UUID[] DEFAULT '{}';

-- 3. Update message type check constraint to include 'document'
-- First, we need to find the name of the constraint if it exists.
-- Since we don't know the name, we'll try to drop a common name or just add a new check.
-- For safety, we'll use a DO block to drop it if it exists by checking pg_constraint.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'messages_type_check'
    ) THEN
        ALTER TABLE public.messages DROP CONSTRAINT messages_type_check;
    END IF;
END $$;

ALTER TABLE public.messages
ADD CONSTRAINT messages_type_check 
CHECK (type IN ('text', 'image', 'gif', 'audio', 'share', 'video', 'document'));

-- 4. RPC for granular deletion (Delete for Me)
CREATE OR REPLACE FUNCTION delete_message_for_me(p_message_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.messages
    SET deleted_by = array_append(deleted_by, p_user_id)
    WHERE id = p_message_id
    AND NOT (deleted_by @> ARRAY[p_user_id]);
END;
$$;

-- 5. Updated RPC for conversations with archive/mute support
CREATE OR REPLACE FUNCTION get_user_conversations_v2(p_user_id UUID, p_archived BOOLEAN DEFAULT false)
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
      c.pinned_message_id,
      cp_me.unread_count,
      cp_me.is_archived,
      cp_me.is_muted,
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
    AND cp_me.is_archived = p_archived
  ) t;
$$;

