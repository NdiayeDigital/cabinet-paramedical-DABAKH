CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Active RLS mais permet l'insertion et la lecture
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public insert on notifications"
    ON public.notifications FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public select on notifications"
    ON public.notifications FOR SELECT
    USING (true);

CREATE POLICY "Allow public update on notifications"
    ON public.notifications FOR UPDATE
    USING (true);

-- IMPORTANT: Enable Realtime for the notifications table!
-- This will allow the admin dashboard to receive "ping" events instantly
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime;
COMMIT;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
