-- Stap 4 van de wekelijkse herinneringsmail.
--
-- Roept de Edge Function `weekly-digest` aan via pg_cron + pg_net.
-- Vereist dat de function al gedeployed is (stap 2 + 3).
--
-- ── Dagelijks, niet wekelijks ──────────────────────────────────────────
-- Sinds de abonneren-flow kiest elke gebruiker zelf zijn dag
-- (`user_settings.digest_dag`). De cron vuurt daarom ELKE dag; de Edge
-- Function bepaalt per gebruiker of vandaag zijn dag is. Een wekelijkse
-- cron zou `digest_dag` dode configuratie maken.
--
-- ── Tijdzone-keuze ─────────────────────────────────────────────────────
-- pg_cron werkt in UTC. Nederland heeft twee zones:
--   Winter (CET,  UTC+1): 09:00 lokaal = 08:00 UTC → `0 8 * * *`
--   Zomer  (CEST, UTC+2): 09:00 lokaal = 07:00 UTC → `0 7 * * *`
-- We kiezen ÉÉN vast schema en accepteren dat de andere helft van het
-- jaar de mail een uur verschuift. Bewuste keuze: geen slimme omschakeling
-- inbouwen, dat is meer risico dan het waard is.
--
-- Standaard hieronder: `0 8 * * *` (winter). In de zomer valt de mail dan
-- op 10:00 lokaal. Als je liever de zomer-tijd exact hebt (mei-oktober),
-- vervang door `0 7 * * *` — dan valt hij in winter op 08:00 lokaal.
--
-- ── Volgorde van uitvoering ────────────────────────────────────────────
-- 1. `01_view.sql` gedraaid  (view aangemaakt)
-- 2. Function `weekly-digest` gedeployed met `RESEND_API_KEY` secret
-- 3. Vault-secrets ingesteld (zie CONFIG hieronder)
-- 4. `04_cron.sql` gerund (TEST: elke 5 minuten)
-- 5. Handmatig verifieren dat de test-cron mail(s) verstuurt
-- 6. Cron omzetten naar het dagelijkse schema — gebruik hiervoor
--    `SUPABASE_DIGEST_CRON_DAILY.sql` in de repo-root, niet het statement
--    onderaan dit bestand. Dat script matcht bestaande jobs op hun
--    commando in plaats van op naam, zodat er geen tweede job blijft staan.

-- ────────────────────────────────────────────────────────────────────────
-- CONFIG — één keer instellen. Vul JOUW project-URL en service-role-key in.
-- Zet ze in Vault zodat ze niet in klare tekst in de cron-tabel staan.
-- ────────────────────────────────────────────────────────────────────────

-- Extensies (waarschijnlijk al aan in Supabase, maar idempotent):
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Vault-secrets. Vervang de placeholders vóór runnen.
-- (Service-role key ophalen: Supabase → Settings → API → `service_role` `secret`.)
SELECT vault.create_secret(
    'https://YOUR-PROJECT-REF.supabase.co/functions/v1/weekly-digest',
    'weekly_digest_url',
    'URL van de weekly-digest Edge Function'
);

SELECT vault.create_secret(
    'YOUR_SERVICE_ROLE_KEY',
    'weekly_digest_service_key',
    'Service role key om de Edge Function aan te roepen (bypass RLS)'
);

-- ────────────────────────────────────────────────────────────────────────
-- CRON — TEST: elke 5 minuten. Ná verificatie omzetten (zie onderaan).
-- ────────────────────────────────────────────────────────────────────────

-- WAARSCHUWING bij deze test-cron, sinds de abonneren-flow:
--   · Elke 5 minuten + geen idempotentie = een mail per 5 minuten op de dag
--     die in `digest_dag` staat. Zet hem snel weer uit.
--   · Tussen 23:00 en 01:00 NL wijkt de UTC-dag af van de NL-dag. De function
--     kijkt naar de UTC-dag, dus je ziet op zondagavond de "maandag"-mail.
--     Voor de productie-cron (08:00 UTC) speelt dat niet.
SELECT cron.schedule(
    'weekly-digest-test',                -- naam
    '*/5 * * * *',                       -- elke 5 minuten
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
-- Na 5-10 minuten kijken:
--   SELECT * FROM cron.job_run_details WHERE jobname = 'weekly-digest-test' ORDER BY start_time DESC LIMIT 10;
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 10;
-- En check je mailbox (spam meegerekend).


-- ────────────────────────────────────────────────────────────────────────
-- PRODUCTIE — pas RUNNEN als de test-cron minstens één mail heeft verstuurd
-- en je die hebt ontvangen. Verwijdert de test-job en zet 'em op dagelijks.
-- ────────────────────────────────────────────────────────────────────────

-- SELECT cron.unschedule('weekly-digest-test');
--
-- SELECT cron.schedule(
--     'weekly-digest',
--     '0 8 * * *',                     -- elke dag 08:00 UTC = 09:00 NL (winter) / 10:00 NL (zomer)
--     $$
--     SELECT net.http_post(
--         url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'weekly_digest_url'),
--         headers := jsonb_build_object(
--             'Content-Type', 'application/json',
--             'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'weekly_digest_service_key')
--         ),
--         body := '{}'::jsonb,
--         timeout_milliseconds := 30000
--     );
--     $$
-- );

-- ── Handig ─────────────────────────────────────────────────────────────
-- Cron-jobs bekijken:      SELECT * FROM cron.job;
-- Cron uitschakelen:       SELECT cron.unschedule('<naam>');
-- Vault-secrets bekijken:  SELECT name FROM vault.decrypted_secrets;
-- Vault-secret vervangen:  SELECT vault.update_secret(id, 'nieuwe waarde') FROM vault.secrets WHERE name = '<naam>';
