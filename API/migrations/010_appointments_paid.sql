-- =============================================================================
-- CABINET PARAMÉDICAL DABAKH — Suivi des paiements
-- Ajout d'une colonne "is_paid" pour suivre les paiements des séances.
-- =============================================================================

ALTER TABLE public.appointments 
ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;
