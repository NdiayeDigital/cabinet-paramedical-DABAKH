-- Enable Realtime replication for appointments and diagnostics tables
-- This ensures that the patient dashboard and admin panel receive instant updates when records are added or modified

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.diagnostics;
