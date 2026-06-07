-- =============================================================================
-- CABINET PARAMÉDICAL DABAKH — Setup Complet Supabase
-- Exécuter UNE SEULE FOIS dans :
-- https://supabase.com/dashboard/project/wotfalrbvttquqshitfs/sql/new
-- =============================================================================

-- ── 0. Extensions ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLE : profiles (patients inscrits)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT         NOT NULL,
    phone         TEXT         NOT NULL UNIQUE,
    address       TEXT,
    region        TEXT         DEFAULT 'Dakar',
    password_hash TEXT,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    role          TEXT         NOT NULL DEFAULT 'patient',
    registered_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_phone  ON public.profiles (phone);
CREATE INDEX IF NOT EXISTS idx_profiles_region ON public.profiles (region);

-- Désactiver RLS pour accès public (app gère l'auth par mot de passe)
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- TABLE : appointments (rendez-vous)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.appointments (
    id               UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_phone    TEXT         NOT NULL,
    patient_name     TEXT         NOT NULL,
    service_id       TEXT         NOT NULL,
    service_name     TEXT         NOT NULL,
    price            INTEGER      DEFAULT 5000,
    doctor           TEXT         DEFAULT 'Dr. Fall',
    appointment_date TEXT         NOT NULL,
    appointment_time TEXT,
    status           TEXT         NOT NULL DEFAULT 'confirmed',
    notes            TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_phone  ON public.appointments (patient_phone);
CREATE INDEX IF NOT EXISTS idx_appointments_date   ON public.appointments (appointment_date);

ALTER TABLE public.appointments DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- TABLE : diagnostics (soumissions de clichés)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.diagnostics (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_phone TEXT         NOT NULL,
    patient_name  TEXT         NOT NULL,
    service_id    TEXT,
    service_name  TEXT,
    symptoms      TEXT,
    file_name     TEXT,
    file_url      TEXT,
    file_type     TEXT,
    ai_analysis   TEXT,
    status        TEXT         NOT NULL DEFAULT 'pending',
    admin_notes   TEXT,
    submitted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diagnostics_phone  ON public.diagnostics (patient_phone);
CREATE INDEX IF NOT EXISTS idx_diagnostics_status ON public.diagnostics (status);

ALTER TABLE public.diagnostics DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- TABLE : notifications (alertes SMS admin)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
    id         UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    title      TEXT         NOT NULL,
    message    TEXT         NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Données initiales (patients de démonstration)
-- =============================================================================
INSERT INTO public.profiles (name, phone, address, region, registered_at)
VALUES
    ('Amadou Ndiaye',  '+221 77 123 45 67', 'Point E, Dakar',   'Dakar', '2026-05-10T14:30:00Z'),
    ('Seynabou Diop',  '+221 78 456 12 90', 'Mermoz, Dakar',    'Dakar', '2026-05-15T09:15:00Z'),
    ('Moussa Fall',    '+221 76 789 45 12', 'Thiès, Sénégal',   'Thiès', '2026-05-20T11:45:00Z')
ON CONFLICT (phone) DO NOTHING;

-- =============================================================================
-- Vérification finale
-- =============================================================================
SELECT 'profiles'     AS table_name, COUNT(*) AS nb_lignes FROM public.profiles
UNION ALL
SELECT 'appointments' AS table_name, COUNT(*) AS nb_lignes FROM public.appointments
UNION ALL
SELECT 'diagnostics'  AS table_name, COUNT(*) AS nb_lignes FROM public.diagnostics
UNION ALL
SELECT 'notifications' AS table_name, COUNT(*) AS nb_lignes FROM public.notifications;
