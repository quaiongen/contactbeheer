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
-- ON CONFLICT DO NOTHING maakt dit idempotent — meerdere keren runnen is
-- veilig en overschrijft geen keuze die een gebruiker daarna zelf maakt.
INSERT INTO user_settings (user_id, digest_enabled, digest_dag)
SELECT id, true, 1
FROM auth.users
ON CONFLICT (user_id) DO NOTHING;

COMMENT ON TABLE user_settings IS
    'Per-user voorkeuren. digest_enabled/digest_dag sturen de weekly-digest Edge Function.';
