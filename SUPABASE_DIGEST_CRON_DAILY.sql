-- Zet de weekly-digest cron om van wekelijks naar dagelijks.
--
-- Waarom: sinds de abonneren-flow kiest elke gebruiker zelf zijn dag in
-- `user_settings.digest_dag`. De Edge Function filtert daarop. Met een
-- maandag-only cron zou die kolom dode configuratie zijn.
--
-- Draai dit NA `SUPABASE_USER_SETTINGS.sql`. Als je die nog niet hebt
-- gedraaid, mailt de function niemand — geen rijen in user_settings
-- betekent niemand geabonneerd. Dat is veilig, maar wel stil.
--
-- Let op: de mail wordt niet vaker verstuurd. De cron vuurt dagelijks,
-- maar per gebruiker gaat er nog steeds maximaal één mail per week uit.

-- ── Eerst kijken wat er staat ───────────────────────────────────────────
-- SELECT jobid, jobname, schedule FROM cron.job;

-- ── Omzetten ────────────────────────────────────────────────────────────
-- Verwijdert elke bestaande weekly-digest-job (zowel 'weekly-digest' als
-- de test-variant 'weekly-digest-test') en zet er één dagelijkse job neer.
DO $$
DECLARE
    j RECORD;
BEGIN
    FOR j IN SELECT jobname FROM cron.job WHERE jobname LIKE 'weekly-digest%' LOOP
        PERFORM cron.unschedule(j.jobname);
        RAISE NOTICE 'cron-job verwijderd: %', j.jobname;
    END LOOP;
END $$;

SELECT cron.schedule(
    'weekly-digest',
    '0 8 * * *',                         -- elke dag 08:00 UTC = 09:00 NL (winter) / 10:00 NL (zomer)
    $$
    SELECT net.http_post(
        url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'weekly_digest_url'),
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'weekly_digest_service_key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
    );
    $$
);

-- ── Verificatie ─────────────────────────────────────────────────────────
-- SELECT jobid, jobname, schedule FROM cron.job WHERE jobname = 'weekly-digest';
--   → verwacht: schedule = '0 8 * * *', precies één rij.
