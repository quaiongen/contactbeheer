# Backlog

Open werk dat buiten scope viel van de huidige implementatie-brief.

## SQL nog te draaien op prod-Supabase

Voordat `index.html` live kan met de nieuwe features, moeten op het
productie-project deze scripts worden uitgevoerd (op dev zijn ze al
gedraaid):

- `SUPABASE_ATTEMPTS.sql` — nieuwe tabel `attempts` (stap 1 uit brief).
- `SUPABASE_PHONE_EMAIL.sql` — kolommen `phone` en `email` op `contacts`.
- `SUPABASE_FIX_PLANNED.sql` — eenmalige migratie: zet afspraken op
  vandaag/later met `planned=false` alsnog op `planned=true`. Voor prod
  alleen nuttig als er ooit dev-data via export/import is overgezet.

Zonder deze scripts geeft productie een lege "Geprobeerd, nog geen
reactie"-sectie en console-warnings, en gaan telefoon/e-mail-vaste
velden niet opgeslagen worden.

## Wekelijkse herinneringsmail — openstaand

Stap 1 t/m 4 van `docs/prompt-weekmail.md` zijn af (view, Edge Function,
Resend, cron). De function is gedeployed als `dynamic-responder` en de
cron staat op maandag 09:00 (winter) / 10:00 (zomer) — met de Vault-URL
tijdelijk beperkt tot alleen `userId=93d994f4-...` + `forceTo=flemcolin@gmail.com`.

Wat nog moet gebeuren voor volwassen productie:

### 1. Eigen domein bij Resend + DNS-records
Zolang `onboarding@resend.dev` de afzender is:
- alleen mail naar het geverifieerde Resend-account-adres (flemcolin@gmail.com)
- mails belanden in spam bij Gmail
Actie: domein toevoegen op resend.com/domains, drie DNS-records aanmaken
(SPF, DKIM x2). Daarna `RESEND_FROM`-secret in Supabase zetten
(`Contactbeheer <noreply@quaiongen.nl>`).

### 2. Stap 5 uit de brief — robustheid
- Nieuwe tabel `digest_sends (user_id, verzonden_op, aantal_contacten, status)`
  voor idempotency: check op dubbel-mailen als de cron per ongeluk twee
  keer draait.
- Fouten per user loggen naar `digest_sends`, niet alleen console.
- Een mislukte send voor één user mag de rest niet blokkeren (staat er al,
  maar de logging is er nog niet).

### 3. Abonneren
Nieuwe kolommen op user-settings (of aparte tabel):
- `digest_enabled` (boolean, default false)
- `digest_dag` (0-6, default 1 = maandag)
Nieuwe gebruikers krijgen dus niets tenzij ze het aanzetten. Toevoegen
aan het app-menu (Instellingen). Uitschrijflink onderaan de mail.

### 4. Vault-URL terug op productie-modus
Zodra domein + digest_enabled er zijn, `forceTo` en `userId` uit de
Vault-URL halen zodat alle geabonneerde users hun eigen mail krijgen:
```sql
SELECT vault.update_secret(
    (SELECT id FROM vault.secrets WHERE name = 'weekly_digest_url'),
    'https://rzhfwknedklqunrdimvb.supabase.co/functions/v1/dynamic-responder'
);
```

### 5. Function hernoemen (cosmetisch)
De function heet nu `dynamic-responder` (auto-gegenereerd bij deploy).
Voor duidelijkheid delete-en en opnieuw deployen als `weekly-digest`.
Daarna Vault-URL opnieuw updaten.

### 6. Prod-Supabase
Zowel `01_view.sql` als de Edge Function + secrets + cron opnieuw
opzetten op het productie-project. Nu alleen op dev.
