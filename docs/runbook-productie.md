# Runbook: uitrol naar productie

Alles wat op dev is gebouwd stap voor stap naar productie brengen, met
verificatie-checks tussendoor en rollback-instructies per fase.

**Duur:** ~45–60 minuten (gefocust; geen wachttijd voor cron-tests).

**Voordat je begint — zorg dat je bij de hand hebt:**

- Toegang tot het productie-Supabase-project (dashboard + SQL Editor).
- Prod-`service_role`-key (Supabase → Settings → API → `service_role` `secret`).
- Prod-anon key + prod-Project-URL (uit dezelfde pagina).
- Resend-API-key (mag dezelfde zijn als dev; Resend heeft geen aparte omgevingen).
- Git-toegang tot de repo, branch `main`.

**Voordat je begint — pre-flight checks:**

- [ ] Alle dev-tests groen: run in de repo `npm test` (verwacht `50 pass, 0 fail`).
- [ ] Node-syntax OK: `node --check js/lib.js && node --check js/app.js`.
- [ ] Alle openstaande commits op je feature-branch(es) gepushed (voor rollback).
- [ ] Prod-Supabase heeft een backup-schema (Supabase maakt PITR-backups, maar
      neem ook een handmatige export van `contacts` en `interactions` als CSV
      via Table Editor voor de zekerheid).

---

## Fase 1 — Supabase productie: database-schema

Volgorde belangrijk: eerst schema, dan data-migratie, dan view.

### 1.1 Nieuwe kolommen op `contacts`

**Doe:** SQL Editor → open `SUPABASE_PHONE_EMAIL.sql` uit de repo, plak, Run.

**Verwacht:** Success. No rows returned.

**Verifieer:**
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'contacts' AND column_name IN ('phone', 'email');
```
Moet 2 rijen geven.

### 1.2 Nieuwe tabel `attempts`

**Doe:** SQL Editor → `SUPABASE_ATTEMPTS.sql` → Run.

**Verwacht:** Success.

**Verifieer:**
```sql
SELECT COUNT(*) FROM attempts;              -- 0
SELECT * FROM pg_policies WHERE tablename = 'attempts';  -- 4 policies (SELECT/INSERT/UPDATE/DELETE)
```

### 1.3 View voor de wekelijkse mail

**Doe:** `supabase/functions/weekly-digest/01_view.sql` → Run.

**Verwacht:** Success.

**Verifieer:**
```sql
SELECT COUNT(*) FROM weekly_digest_v;
```
Moet gelijk zijn aan het aantal contacten op prod (of 0 als je een leeg
prod-project hebt).

**Belangrijk:** de view heeft `security_invoker = true` — normale gebruikers
zien alleen hun eigen data via RLS. Als de Supabase-linter een waarschuwing
"SECURITY DEFINER" geeft, is je view-definitie fout — check de `WITH`-clause.

### 1.4 Data-migratie (optioneel)

**Alleen als er ooit dev-data via export/import naar prod is overgezet.** Fresh
prod-project? Skip deze stap.

`SUPABASE_FIX_PLANNED.sql` → Run. Zet afspraken op vandaag/later met
`planned=false` correct op `planned=true`. Uitkomst hangt af van je data.

### Rollback Fase 1
```sql
DROP VIEW IF EXISTS weekly_digest_v;
DROP TABLE IF EXISTS attempts;
ALTER TABLE contacts DROP COLUMN IF EXISTS phone;
ALTER TABLE contacts DROP COLUMN IF EXISTS email;
```

---

## Fase 2 — Supabase productie: Edge Function

### 2.1 Function deployen

**Doe:** Edge Functions → **Create a new function**.

- **Naam:** `weekly-digest` (exact zo — met streepje; niet 'dynamic-responder' zoals per ongeluk op dev).
- **Code:** kopieer volledig `supabase/functions/weekly-digest/index.ts` uit de repo, plak in de editor.
- **Verify JWT:** UIT zetten (cron roept aan zonder user-JWT).
- Klik **Deploy**.

**Verwacht:** groene "Deployed" status.

**Verifieer:** noteer de function-URL. Formaat:
```
https://<prod-project-ref>.supabase.co/functions/v1/weekly-digest
```

### 2.2 Env-secret voor Resend

**Doe:** Edge Functions → weekly-digest → **Secrets** → **Add new secret**:
- Key: `RESEND_API_KEY`
- Value: je Resend-API-key (`re_...`)

Klik Save.

**Verifieer:** re-run curl-test (zie 2.3).

### 2.3 Function testen — dryRun

**Doe:** Terminal:
```bash
SUPABASE_URL="https://<prod-project-ref>.supabase.co"
ANON_KEY="<prod-anon-key>"
YOUR_USER_ID="<jouw-prod-user-id>"    # Supabase → Authentication → Users
curl -s "$SUPABASE_URL/functions/v1/weekly-digest?dryRun=true&userId=$YOUR_USER_ID" \
  -H "Authorization: Bearer $ANON_KEY" > /tmp/mail.html
open /tmp/mail.html
```

**Verwacht:** browser toont de mail-preview. Als je op prod geen contacten hebt
in bucket `nu_afspraak_maken`, krijg je de tekst "geen mail zou worden verstuurd".
Dat is óók een success-signaal — de function draait.

### Rollback Fase 2
Edge Functions → weekly-digest → **Details** → Delete function.
Secret verdwijnt mee.

---

## Fase 3 — Supabase productie: Vault + Cron

### 3.1 Vault-secrets aanmaken

**Doe:** SQL Editor:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT vault.create_secret(
    'https://<prod-project-ref>.supabase.co/functions/v1/weekly-digest',
    'weekly_digest_url',
    'URL van de weekly-digest Edge Function'
);

SELECT vault.create_secret(
    '<prod-service-role-key>',
    'weekly_digest_service_key',
    'Service role key om de Edge Function aan te roepen'
);
```

**Verifieer:**
```sql
SELECT name FROM vault.decrypted_secrets
WHERE name IN ('weekly_digest_url', 'weekly_digest_service_key');
```
Moet 2 rijen geven.

### 3.2 Test-cron aanzetten (elke 5 min)

**Doe:**
```sql
SELECT cron.schedule(
    'weekly-digest-test',
    '*/5 * * * *',
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
```

**Verwacht:** één rij met een `jobid`.

### 3.3 Wachten en verifiëren (5–10 min)

```sql
SELECT d.jobid, j.jobname, d.start_time, d.status, d.return_message
FROM cron.job_run_details d
JOIN cron.job j ON j.jobid = d.jobid
WHERE j.jobname = 'weekly-digest-test'
ORDER BY d.start_time DESC LIMIT 5;

SELECT id, status_code, LEFT(content::text, 200) AS body, created
FROM net._http_response
ORDER BY created DESC LIMIT 5;
```

**Verwacht:** cron-status `succeeded`, http-response `status_code = 200`.

Als er contacten in bucket `nu_afspraak_maken` bestaan → mail komt binnen op je
Resend-verifieerde adres (spam meegerekend).

**Als je 403-fout van Resend ziet** (mail naar user's e-mail is niet je
Resend-account-adres): pas de Vault-URL aan met `forceTo`:
```sql
SELECT vault.update_secret(
    (SELECT id FROM vault.secrets WHERE name = 'weekly_digest_url'),
    'https://<prod-project-ref>.supabase.co/functions/v1/weekly-digest?forceTo=<jouw-resend-mail>'
);
```

**Test op een willekeurige dag:** sinds de abonneren-flow filtert de function op
`digest_dag`. Een live test met alleen `forceTo` faalt daarom stil met
`skipped: andere dag` op zes van de zeven dagen. Voeg `&ignoreSchedule=true` toe
om `digest_dag` te negeren; `digest_enabled` blijft wél gerespecteerd.

### 3.4 Test-cron uit, productie-cron aan

**Alleen doen zodra 3.3 groen is.**

> **Sinds de abonneren-flow:** gebruik `SUPABASE_DIGEST_CRON_DAILY.sql` uit de
> repo-root in plaats van het statement hieronder. Dat script verwijdert
> bestaande jobs op basis van hun commando (betrouwbaarder dan op naam) en zet
> het dagelijkse schema neer. Draai eerst `SUPABASE_USER_SETTINGS.sql` en
> deploy dan de function — zonder de tabel `user_settings` faalt de function
> met HTTP 500.

```sql
SELECT cron.unschedule('weekly-digest-test');

SELECT cron.schedule(
    'weekly-digest',
    '0 8 * * *',
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
```

**Verifieer:**
```sql
SELECT jobid, jobname, schedule, active FROM cron.job;
```
Verwacht: één rij `weekly-digest`, `0 8 * * *`, `active = true`.
Twee rijen betekent dat een oude job nog leeft — dan gaat er dubbele mail uit.

**Tijdzone-noot:** `0 8 * * *` = 09:00 lokaal in wintertijd, 10:00 in zomertijd.
Zie de comment bovenaan `supabase/functions/weekly-digest/03_cron.sql` voor
de trade-off.

### Rollback Fase 3
```sql
SELECT cron.unschedule('weekly-digest');
SELECT cron.unschedule('weekly-digest-test');
DELETE FROM vault.secrets WHERE name IN ('weekly_digest_url', 'weekly_digest_service_key');
-- pg_cron en pg_net extensies laat je gewoon staan.
```

---

## Fase 4 — Frontend naar GitHub Pages

### 4.1 Controle prod-config

Open `js/supabase-config.js` en verifieer dat daar de **prod**-URL en
**prod**-anon-key staan (niet dev). Als er nog dev-credentials staan:
- Aanpassen, committen, pushen (aparte commit "prod credentials").

### 4.2 Feature-branch naar main mergen

**Doe:**
```bash
cd "/Users/quaiongen/Documents/ClaudeCode/visuele contacten"
git status                                    # verwacht: clean, geen uncommitted changes
git checkout main
git pull origin main
git merge feat/vandaag-scherm --no-ff        # of welke branch je actief hebt
git push origin main
```

**Verwacht:** push geslaagd. GitHub Actions (of GitHub Pages) start een deploy.

### 4.3 Deploy verifiëren

**Doe:** wacht ~1–2 minuten. Ga dan naar
`https://quaiongen.github.io/contactbeheer/` en refresh (harde refresh:
Cmd+Shift+R op Mac, Ctrl+Shift+R op Windows) — cache-busters in de code
zouden alles vernieuwen, maar hard refresh is dubbel-safe.

**Verifieer:**
- [ ] Login werkt met je prod-account.
- [ ] Tab **Vandaag** toont "Tijd voor een catch-up" of empty state.
- [ ] Tab **Overzicht** toont bucket-secties.
- [ ] Tab **Contacten** toont sort-dropdown (Urgentie / Naam A-Z), zoek, filter-chips.
- [ ] Details-modal opent bij klik op een rij, met Bellen/WhatsApp/Mail/Nu-afspraak-maken.
- [ ] Console (F12) laat geen errors zien.

### Rollback Fase 4
```bash
git checkout main
git revert HEAD --no-edit          # of specifiek commit-hash
git push origin main
```

---

## Fase 5 — End-to-end verificatie

Doorloop deze checks bewust en vink af. Als iets faalt: rollback of gerichte fix.

- [ ] Nieuw contact aanmaken op prod (met telefoon + e-mail).
- [ ] Klik **Bellen** → tel: opent (op mobile: belapp; op desktop: FaceTime/etc). Cancel voor je echt belt.
- [ ] Klik **WhatsApp** → wa.me opent in nieuwe tab. Sluit direct.
- [ ] Vandaag-kaart verschijnt binnen enkele seconden na WhatsApp-klik met poging-regel.
- [ ] Contact bewerken: telefoon-veld al gevuld (of leeg als custom fields ontbraken).
- [ ] Klik **Nu afspraak maken** → interaction-modal opent, datum vandaag als default.
- [ ] Afspraak in de toekomst inplannen → verschijnt in Overzicht onder "Afspraak staat al".
- [ ] Existerende afspraak bewerken → datum staat correct op de opgeslagen dag (niet vandaag).
- [ ] Hamburger-menu → Google Calendar → verbindings-flow werkt (als je Calendar wil gebruiken).
- [ ] `dryRun` van weekly-digest werkt (zie Fase 2.3).
- [ ] Cron actief in `cron.job` (zie Fase 3.4).

## Post-deploy — communicatie

- Update `docs/backlog.md`: streep item **"SQL nog te draaien op prod-Supabase"**
  door zodra alles is gerund.
- Andere gebruikers (als die er zijn): informeren dat het onderhoudsvenster
  voorbij is en dat ze de app kunnen refreshen.

## Openstaande post-deploy items (uit backlog)

Deze horen NIET in dit deploy-runbook (te doen in aparte iteratie):

- Eigen domein bij Resend + DNS-records (mail uit spam krijgen, naar
  alle users kunnen mailen).
- Stap 5 uit `docs/prompt-weekmail.md`: `digest_sends`-tabel + logging
  + abonnements-instellingen per user.
- Vault-URL zonder `forceTo` (na eigen domein).

Zie `docs/backlog.md` voor de volledige lijst.
