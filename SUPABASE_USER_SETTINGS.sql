-- User settings — per-user voorkeuren die niet bij een contact horen.
--
-- Eerste gebruiker van deze tabel is de wekelijkse herinneringsmail:
--   digest_enabled  → opt-in. Nieuwe gebruikers krijgen GEEN mail tenzij
--                     ze hem zelf aanzetten (default false).
--   digest_dag      → op welke weekdag de mail valt. 0 = zondag … 6 = zaterdag,
--                     zelfde nummering als PostgreSQL's EXTRACT(DOW) en
--                     JavaScript's Date.getDay(). Default 1 = maandag.
--
-- Row Level Security: elke gebruiker ziet en schrijft alleen zijn eigen rij.
-- De Edge Function `weekly-digest` draait met service_role en bypasst RLS
-- voor de dagelijkse batch.

CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    digest_enabled BOOLEAN NOT NULL DEFAULT false,
    digest_dag SMALLINT NOT NULL DEFAULT 1 CHECK (digest_dag BETWEEN 0 AND 6),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_settings_own" ON user_settings;
CREATE POLICY "user_settings_own" ON user_settings
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Eenmalige backfill ──────────────────────────────────────────────────
-- Bestaande gebruikers krijgen de mail nu al (er was geen opt-in). Zonder
-- deze backfill zou hun mail stil stoppen bij het uitrollen van de feature.
-- Daarom: bestaande accounts op true, nieuwe accounts op de default false.
--
-- ON CONFLICT DO NOTHING beschermt alleen rijen die AL bestaan. Zonder de
-- datumgrens hieronder zou een tweede run (dev → prod, of een herhaalde
-- setup) elk account dat zich ná de eerste run registreerde alsnog op true
-- zetten — precies het tegenovergestelde van de opt-in. De grens is het
-- uitrolmoment en staat daarom hard in het script.
--
-- Uitgesloten:
--   deleted_at IS NOT NULL       → soft-deleted accounts
--   email_confirmed_at IS NULL   → nooit geverifieerd mailadres. Die
--                                  abonneren zou mail sturen naar een adres
--                                  dat niemand heeft bevestigd.
INSERT INTO user_settings (user_id, digest_enabled, digest_dag)
SELECT id, true, 1
FROM auth.users
WHERE created_at < TIMESTAMPTZ '2026-09-22 00:00:00+00'
  AND deleted_at IS NULL
  AND email_confirmed_at IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE user_settings IS
    'Per-user voorkeuren. digest_enabled/digest_dag sturen de weekly-digest Edge Function.';
