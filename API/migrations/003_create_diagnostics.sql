-- =============================================================================
-- CABINET PARAMÉDICAL DABAKH — Migration Supabase
-- Table: diagnostics (documents & études cliniques)
-- Exécuter dans : https://supabase.com/dashboard/project/wotfalrbvttquqshitfs/sql
-- =============================================================================

-- ── 1. Table : diagnostics ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.diagnostics (
    id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_phone   TEXT         NOT NULL,             -- FK logique → profiles.phone
    patient_name    TEXT         NOT NULL,
    service_id      TEXT,                              -- ex: 'kine-reeduc'
    service_name    TEXT,
    symptoms        TEXT         NOT NULL,             -- description du motif / symptômes
    file_name       TEXT,                              -- nom du fichier uploadé
    file_url        TEXT,                              -- URL Supabase Storage (futur)
    file_type       TEXT,                              -- ex: 'image/jpeg'
    ai_analysis     TEXT,                              -- résultat de l'analyse IA (simulée)
    status          TEXT         NOT NULL DEFAULT 'En attente'
                    CHECK (status IN ('En attente', 'En cours d''analyse', 'Analysé', 'Archivé')),
    admin_notes     TEXT,                              -- notes de l'administrateur
    submitted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 2. Index ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_diag_patient_phone ON public.diagnostics (patient_phone);
CREATE INDEX IF NOT EXISTS idx_diag_status        ON public.diagnostics (status);
CREATE INDEX IF NOT EXISTS idx_diag_submitted_at  ON public.diagnostics (submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_diag_service       ON public.diagnostics (service_id);

-- ── 3. Trigger updated_at ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_diagnostics_updated_at ON public.diagnostics;
CREATE TRIGGER trg_diagnostics_updated_at
    BEFORE UPDATE ON public.diagnostics
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 4. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture des diagnostics"
    ON public.diagnostics FOR SELECT USING (TRUE);

CREATE POLICY "Soumission de diagnostic"
    ON public.diagnostics FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Modification de diagnostic"
    ON public.diagnostics FOR UPDATE USING (TRUE);

-- ── 5. Vue admin : diagnostics à traiter ─────────────────────────────────────
CREATE OR REPLACE VIEW public.diagnostics_admin_view AS
SELECT
    d.id,
    d.patient_name,
    d.patient_phone,
    d.service_name,
    LEFT(d.symptoms, 80) || CASE WHEN LENGTH(d.symptoms) > 80 THEN '…' ELSE '' END AS symptoms_preview,
    d.file_name,
    d.ai_analysis,
    d.status,
    d.admin_notes,
    TO_CHAR(d.submitted_at AT TIME ZONE 'Africa/Dakar', 'DD/MM/YYYY HH24:MI') AS soumis_le
FROM public.diagnostics d
ORDER BY
    CASE d.status
        WHEN 'En attente'          THEN 1
        WHEN 'En cours d''analyse' THEN 2
        WHEN 'Analysé'             THEN 3
        WHEN 'Archivé'             THEN 4
    END,
    d.submitted_at DESC;

-- ── 6. Vérification ───────────────────────────────────────────────────────────
SELECT 'Table diagnostics créée avec succès ✅' AS status, COUNT(*) AS nb_diagnostics
FROM public.diagnostics;
