-- Upgrades to Messages (IG & WhatsApp Features)

-- 1. Add fields for Message Forwarding and View Once Media
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS view_once BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMP WITH TIME ZONE;

-- 2. Add pinned_message_id to conversations
ALTER TABLE public.conversations
ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

-- 3. Create message_reads table for Group Read Receipts
CREATE TABLE IF NOT EXISTS public.message_reads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(message_id, user_id)
);

-- Enable RLS for message_reads
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;

-- Policy for message_reads: users can insert their own reads
DROP POLICY IF EXISTS "Users can insert their own message reads" ON public.message_reads;
CREATE POLICY "Users can insert their own message reads"
ON public.message_reads FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy for message_reads: users can view reads for messages in their conversations
DROP POLICY IF EXISTS "Users can view reads for their conversations" ON public.message_reads;
CREATE POLICY "Users can view reads for their conversations"
ON public.message_reads FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = message_reads.message_id
    AND cp.user_id = auth.uid()
  )
);
