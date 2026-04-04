-- ============================================================
-- UniGram — Advanced Messaging Migrations (v2)
-- Adding: Voice notes, Replies, Unsend, and Active Status
-- ============================================================

-- 1. Update profiles for Active Status
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();

-- 2. Update messages for new features
-- Note: PostgreSQL doesn't allow direct CHECK constraint modification easily if it has a name.
-- We'll drop the old one and add a new one if it exists, or just add the new one.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_type_check 
  CHECK (type IN ('text', 'image', 'gif', 'audio', 'video', 'share'));

ALTER TABLE messages ADD COLUMN IF NOT EXISTS duration            INTEGER; -- for audio/video
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_deleted          BOOLEAN DEFAULT false;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited           BOOLEAN DEFAULT false;

-- 3. Update the last_message trigger to support new types
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
  -- If message is deleted, don't update last_message (or update to 'Message unsent')
  IF NEW.is_deleted THEN
     UPDATE conversations
     SET last_message = 'Message unsent'
     WHERE id = NEW.conversation_id;
     RETURN NEW;
  END IF;

  UPDATE conversations
  SET
    last_message    = CASE 
                        WHEN NEW.type = 'image' THEN '📷 Photo' 
                        WHEN NEW.type = 'audio' THEN '🎤 Voice message'
                        WHEN NEW.type = 'gif'   THEN '🎬 GIF'
                        WHEN NEW.type = 'video' THEN '🎥 Video'
                        WHEN NEW.type = 'share' THEN '🔗 Shared content'
                        ELSE NEW.text 
                      END,
    last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  -- Increment unread count for all participants except the sender
  -- Only for NEW inserts, not updates (like is_deleted)
  IF (TG_OP = 'INSERT') THEN
    UPDATE conversation_participants
    SET unread_count = COALESCE(unread_count, 0) + 1
    WHERE conversation_id = NEW.conversation_id
      AND user_id != NEW.sender_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The trigger already exists from v1, but we updated the function it calls.
-- If it doesn't exist, create it:
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_message_insert') THEN
    CREATE TRIGGER on_message_insert
      AFTER INSERT ON messages
      FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();
  END IF;
END $$;

-- Add a trigger for UPDATES (to handle unsend updates)
DROP TRIGGER IF EXISTS on_message_update ON messages;
CREATE TRIGGER on_message_update
  AFTER UPDATE OF is_deleted ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_last_message();
