-- Create blocks table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.blocks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    blocker_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now(),
    UNIQUE(blocker_id, blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own blocks"
    ON public.blocks
    FOR ALL
    USING (auth.uid() = blocker_id);

CREATE POLICY "Anyone can see if they are blocked"
    ON public.blocks
    FOR SELECT
    USING (true);
