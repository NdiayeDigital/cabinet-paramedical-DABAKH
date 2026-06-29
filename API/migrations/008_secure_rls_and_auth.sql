-- =============================================================================
-- CABINET PARAMÉDICAL DABAKH — Sécurisation RLS & Auth
-- Ce fichier met à jour les règles de sécurité (Row Level Security)
-- pour utiliser correctement Supabase Auth et restreindre l'accès aux données.
-- =============================================================================

-- 1. Mettre à jour la table profiles pour lier l'ID à auth.users
-- Note: Les anciens profils tests qui ne sont pas dans auth.users seront supprimés ou devront être recréés.
ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- 2. Suppression des anciennes règles RLS dangereuses
DROP POLICY IF EXISTS "Patient: lire son propre profil" ON public.profiles;
DROP POLICY IF EXISTS "Patient: créer un profil" ON public.profiles;
DROP POLICY IF EXISTS "Patient: modifier son profil" ON public.profiles;

DROP POLICY IF EXISTS "Lecture des rendez-vous" ON public.appointments;
DROP POLICY IF EXISTS "Création de rendez-vous" ON public.appointments;
DROP POLICY IF EXISTS "Modification de rendez-vous" ON public.appointments;
DROP POLICY IF EXISTS "Suppression de rendez-vous" ON public.appointments;

DROP POLICY IF EXISTS "Lecture des diagnostics" ON public.diagnostics;
DROP POLICY IF EXISTS "Soumission de diagnostic" ON public.diagnostics;
DROP POLICY IF EXISTS "Modification de diagnostic" ON public.diagnostics;

-- 3. Nouvelles règles sécurisées pour 'profiles'
CREATE POLICY "Admin a tous les droits sur profiles"
ON public.profiles FOR ALL 
USING (auth.jwt()->>'email' = 'contact@dabakh.com')
WITH CHECK (auth.jwt()->>'email' = 'contact@dabakh.com');

CREATE POLICY "Patient peut lire son profil"
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Patient peut créer son profil (via sign up)"
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Patient peut modifier son profil"
ON public.profiles FOR UPDATE 
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 4. Nouvelles règles sécurisées pour 'appointments'
CREATE POLICY "Admin a tous les droits sur appointments"
ON public.appointments FOR ALL 
USING (auth.jwt()->>'email' = 'contact@dabakh.com')
WITH CHECK (auth.jwt()->>'email' = 'contact@dabakh.com');

CREATE POLICY "Patient accès à ses propres rendez-vous"
ON public.appointments FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.phone = public.appointments.patient_phone AND profiles.id = auth.uid()));

CREATE POLICY "Patient peut créer un rendez-vous"
ON public.appointments FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.phone = public.appointments.patient_phone AND profiles.id = auth.uid()));

CREATE POLICY "Patient peut modifier son rendez-vous"
ON public.appointments FOR UPDATE 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.phone = public.appointments.patient_phone AND profiles.id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.phone = public.appointments.patient_phone AND profiles.id = auth.uid()));

-- 5. Nouvelles règles sécurisées pour 'diagnostics'
CREATE POLICY "Admin a tous les droits sur diagnostics"
ON public.diagnostics FOR ALL 
USING (auth.jwt()->>'email' = 'admin@dabakh.com')
WITH CHECK (auth.jwt()->>'email' = 'admin@dabakh.com');

CREATE POLICY "Patient accès à ses propres diagnostics"
ON public.diagnostics FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.phone = public.diagnostics.patient_phone AND profiles.id = auth.uid()));

CREATE POLICY "Patient peut soumettre un diagnostic"
ON public.diagnostics FOR INSERT 
WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.phone = public.diagnostics.patient_phone AND profiles.id = auth.uid()));

-- 6. Trigger pour insérer automatiquement dans profiles à la création auth (Optionnel, mais pratique)
-- Nous le laissons géré côté client (script.js) pour le moment.
