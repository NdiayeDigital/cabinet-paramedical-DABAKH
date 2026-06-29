-- =============================================================================
-- CABINET PARAMÉDICAL DABAKH — Fiche Patient Étendue
-- Ajout de la colonne "admin_notes" pour les observations cliniques privées.
-- =============================================================================

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- Rappel: Les règles RLS actuelles permettent déjà à l'admin de modifier (UPDATE) les profiles.
-- L'admin pourra donc enregistrer ses notes, tandis que les patients n'y auront pas accès s'ils ne sont pas sélectionnés dans leur policy.
