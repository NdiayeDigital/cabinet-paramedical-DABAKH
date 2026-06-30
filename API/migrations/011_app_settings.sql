CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;

INSERT INTO public.settings (key, value) VALUES ('whatsapp_number', '+221772091725') ON CONFLICT (key) DO NOTHING;
INSERT INTO public.settings (key, value) VALUES ('whatsapp_display', '+221 77 209 17 25') ON CONFLICT (key) DO NOTHING;
