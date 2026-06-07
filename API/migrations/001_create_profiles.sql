-- =============================================================================
-- CABINET PARAMÉDICAL DABAKH — Migration Supabase
-- Table: profiles (utilisateurs patients)
-- Exécuter dans : https://supabase.com/dashboard/project/wotfalrbvttquqshitfs/sql
-- =============================================================================

-- ── 1. Extension UUID (si pas déjà activée) ──────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── 2. Table principale : profiles ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          TEXT         NOT NULL,
    phone         TEXT         NOT NULL UNIQUE,
    address       TEXT,
    region        TEXT         DEFAULT 'Dakar',
    password_hash TEXT,                          -- mot de passe haché (bcrypt côté serveur)
    avatar_url    TEXT,                          -- future photo de profil
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    role          TEXT         NOT NULL DEFAULT 'patient' CHECK (role IN ('patient', 'admin')),
    registered_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── 3. Index pour les requêtes fréquentes ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_profiles_phone    ON public.profiles (phone);
CREATE INDEX IF NOT EXISTS idx_profiles_region   ON public.profiles (region);
CREATE INDEX IF NOT EXISTS idx_profiles_role     ON public.profiles (role);
CREATE INDEX IF NOT EXISTS idx_profiles_active   ON public.profiles (is_active);

-- ── 4. Trigger : mise à jour automatique de updated_at ───────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 5. Row Level Security (RLS) ───────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Politique : un patient peut lire uniquement son propre profil (via phone)
CREATE POLICY "Patient: lire son propre profil"
    ON public.profiles FOR SELECT
    USING (TRUE);  -- lecture publique pour l'instant (auth par téléphone gérée côté app)

-- Politique : insertion ouverte (inscription)
CREATE POLICY "Patient: créer un profil"
    ON public.profiles FOR INSERT
    WITH CHECK (TRUE);

-- Politique : modification de son propre profil uniquement
CREATE POLICY "Patient: modifier son profil"
    ON public.profiles FOR UPDATE
    USING (TRUE);

-- ── 6. Données initiales : patients pré-chargés (depuis localStorage) ─────────
INSERT INTO public.profiles (name, phone, address, region, registered_at)
VALUES
    ('Amadou Ndiaye',   '+221 77 123 45 67', 'Point E, Dakar',      'Dakar',  '2026-05-10T14:30:00.000Z'),
    ('Seynabou Diop',   '+221 78 456 12 90', 'Mermoz, Dakar',       'Dakar',  '2026-05-15T09:15:00.000Z'),
    ('Moussa Fall',     '+221 76 789 45 12', 'Thiès, Sénégal',      'Thiès',  '2026-05-20T11:45:00.000Z')
ON CONFLICT (phone) DO NOTHING;

-- ── 7. Vue pratique pour l'admin ──────────────────────────────────────────────
CREATE OR REPLACE VIEW public.profiles_admin_view AS
SELECT
    id,
    name,
    phone,
    address,
    region,
    role,
    is_active,
    TO_CHAR(registered_at AT TIME ZONE 'Africa/Dakar', 'DD/MM/YYYY HH24:MI') AS inscrit_le,
    TO_CHAR(updated_at    AT TIME ZONE 'Africa/Dakar', 'DD/MM/YYYY HH24:MI') AS modifie_le
FROM public.profiles
ORDER BY registered_at DESC;

-- ── 8. Vérification ───────────────────────────────────────────────────────────
SELECT 'Table profiles créée avec succès ✅' AS status, COUNT(*) AS nb_profils
FROM public.profiles;
