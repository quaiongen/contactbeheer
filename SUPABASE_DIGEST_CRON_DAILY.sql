-- Zet de weekly-digest cron om van wekelijks naar dagelijks.
--
-- Waarom: sinds de abonneren-flow kiest elke gebruiker zelf zijn dag in
-- `user_settings.digest_dag`. De Edge Function filtert daarop. Met een
-- maandag-only cron zou die kolom dode configuratie zijn.
--
-- Volgorde is strikt: EERST `SUPABASE_USER_SETTINGS.sql`, DAN de function
-- deployen, DAN dit script. Bestaat de tabel `user_settings` niet, dan
-- gooit `loadUserSettings` in de function en faalt de hele aanroep met
-- HTTP 500 — niet stil, maar wel een harde fout in `net._http_response`.
--
-- Let op: dit garandeert GEEN maximum van één mail per week. De cron vuurt
-- dagelijks en er is (nog) geen idempotentie. Wie mid-week zijn digest_dag
-- verzet van maandag naar woensdag krijgt die week twee mails, en elke
-- handmatige invocatie op de gekozen dag stuurt er nog een. Met de oude
-- wekelijkse cron was dat structureel onmogelijk. Bekende beperking.

-- ── Eerst kijken wat er staat ───────────────────────────────────────────
-- SELECT jobid, jobname, schedule FROM cron.job;

-- ── Omzetten ────────────────────────────────────────────────────────────
-- Matcht op de INHOUD van het commando, niet op de jobnaam. De bestaande
-- job kan 'weekly-digest', 'weekly-digest-test' of iets anders heten —
-- CLAUDE.md noemt de function ook 'dynamic-responder'. Matchen op naam zou
-- de oude job kunnen laten staan, en dan draaien er twee jobs naast elkaar:
-- dubbele mail op de oude dag.
--
-- Elke weekly-digest-cron verwijst naar de vault-secret `weekly_digest_url`.
-- Dat is het betrouwbare kenmerk.
DO $$
DECLARE
    j RECORD;
    n INT := 0;
BEGIN
    FOR j IN
        SELECT jobname FROM cron.job
        WHERE command LIKE '%weekly_digest_url%'
           OR jobname LIKE 'weekly-digest%'
    LOOP
        PERFORM cron.unschedule(j.jobname);
        RAISE NOTICE 'cron-job verwijderd: %', j.jobname;
        n := n + 1;
    END LOOP;
    IF n = 0 THEN
        RAISE NOTICE 'Geen bestaande weekly-digest-job gevonden. Controleer met SELECT jobname, command FROM cron.job; of er niet een job onder een andere naam loopt.';
    END IF;
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
-- SELECT jobid, jobname, schedule FROM cron.job WHERE command LIKE '%weekly_digest_url%';
--   → verwacht: PRECIES ÉÉN rij, schedule = '0 8 * * *'.
--   Twee rijen betekent dat de oude job nog leeft en je dubbele mail krijgt.
