-- =============================================================================
-- CABINET DABAKH — Création du bucket Supabase Storage
-- À exécuter dans : Supabase Dashboard → Storage → New Bucket
-- OU dans l'éditeur SQL (Supabase Storage SQL API)
-- =============================================================================

-- Option 1 : Via l'éditeur SQL Supabase
INSERT INTO storage.buckets (id, name, public)
VALUES ('medical-files', 'medical-files', true)
ON CONFLICT (id) DO NOTHING;

-- Politique : Lecture publique des fichiers (pour affichage dans l'app)
CREATE POLICY "Lecture publique fichiers médicaux"
ON storage.objects FOR SELECT
USING (bucket_id = 'medical-files');

-- Politique : Upload autorisé pour tous (authentifié via anon key)
CREATE POLICY "Upload fichiers médicaux autorisé"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'medical-files');

-- Politique : Suppression autorisée
CREATE POLICY "Suppression fichiers médicaux autorisée"
ON storage.objects FOR DELETE
USING (bucket_id = 'medical-files');

-- Vérification
SELECT id, name, public FROM storage.buckets WHERE id = 'medical-files';
