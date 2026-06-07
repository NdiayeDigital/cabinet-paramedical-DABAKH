-- =============================================================================
-- CABINET PARAMÉDICAL DABAKH — Migration Supabase
-- Table: appointments (rendez-vous patients)
-- Exécuter dans : https://supabase.com/dashboard/project/wotfalrbvttquqshitfs/sql
-- =============================================================================

-- ── 1. Table : appointments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointments (
    id              TEXT         PRIMARY KEY,          -- ex: 'APT-1717600000000'
    patient_phone   TEXT         NOT NULL,             -- FK logique vers profiles.phone
    patient_name    TEXT         NOT NULL,
    service_id      TEXT         NOT NULL,             -- ex: 'kine-reeduc'
    service_name    TEXT         NOT NULL,
    price           INTEGER      NOT NULL DEFAULT 5000, -- en FCFA
    doctor          TEXT,
    appointment_date DATE        NOT NULL,
    appointment_time TIME        NOT NULL,
    status          TEXT         NOT NULL DEFAULT 'Confirmé'
                    CHECK (status IN ('Confirmé', 'En attente de validation', 'Annulé', 'Terminé')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    notes           TEXT                               -- notes internes admin
);

-- ── 2. Index ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_apt_patient_phone  ON public.appointments (patient_phone);
CREATE INDEX IF NOT EXISTS idx_apt_date           ON public.appointments (appointment_date);
CREATE INDEX IF NOT EXISTS idx_apt_status         ON public.appointments (status);
CREATE INDEX IF NOT EXISTS idx_apt_service        ON public.appointments (service_id);

-- ── 3. Contrainte : pas de doublon sur le même créneau (date + heure) ─────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_apt_slot_unique
    ON public.appointments (appointment_date, appointment_time)
    WHERE status != 'Annulé';

-- ── 4. Trigger updated_at ────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_appointments_updated_at ON public.appointments;
CREATE TRIGGER trg_appointments_updated_at
    BEFORE UPDATE ON public.appointments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 5. Row Level Security ─────────────────────────────────────────────────────
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture des rendez-vous"
    ON public.appointments FOR SELECT USING (TRUE);

CREATE POLICY "Création de rendez-vous"
    ON public.appointments FOR INSERT WITH CHECK (TRUE);

CREATE POLICY "Modification de rendez-vous"
    ON public.appointments FOR UPDATE USING (TRUE);

CREATE POLICY "Suppression de rendez-vous"
    ON public.appointments FOR DELETE USING (TRUE);

-- ── 6. Vue : prochains rendez-vous ───────────────────────────────────────────
CREATE OR REPLACE VIEW public.upcoming_appointments AS
SELECT
    a.id,
    a.patient_name,
    a.patient_phone,
    a.service_name,
    a.doctor,
    a.price,
    a.appointment_date,
    a.appointment_time,
    a.status,
    TO_CHAR(a.appointment_date, 'DD/MM/YYYY') AS date_fr,
    TO_CHAR(a.created_at AT TIME ZONE 'Africa/Dakar', 'DD/MM/YYYY HH24:MI') AS cree_le
FROM public.appointments a
WHERE a.appointment_date >= CURRENT_DATE
  AND a.status != 'Annulé'
ORDER BY a.appointment_date, a.appointment_time;

-- ── 7. Vérification ───────────────────────────────────────────────────────────
SELECT 'Table appointments créée avec succès ✅' AS status, COUNT(*) AS nb_rdv
FROM public.appointments;
