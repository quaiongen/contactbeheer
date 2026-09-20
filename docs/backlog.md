# Backlog

Open werk dat buiten scope viel van de huidige implementatie-brief.

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

## Multi-calendar in slot-zoeker (met view-only exception)

Nu leest de slot-zoeker alleen de `primary` Google Calendar. Wens: alle
eigen calendars meenemen voor slot-detectie **én** één specifieke calendar
van iemand anders alleen tonen als context (niet slots blokkeren).

Uitwerking (nog geen spec/plan):
- `GET /calendar/v3/users/me/calendarList` ophalen bij eerste keer +
  via een "Kalenders beheren"-scherm in het menu.
- Per calendar 3 keuzes: **Blokkeert slots** / **Alleen tonen** / **Negeren**.
- Defaults op basis van accessRole: `owner`/`writer` → Blokkeert, rest → Negeren.
  Gebruiker zet handmatig calendars op "Alleen tonen".
- Voorkeuren opslaan in Supabase (per-user) of localStorage (per browser).
- `listCalendarEventsForDay` haalt events uit alle geselecteerde calendars,
  tagt met `blocking: true/false`.
- `vindVrijeSlot` filtert op `blocking === true`.
- `bouwAgendaItems` toont ze allemaal; view-only krijgt aparte styling
  (bijv. lichter/grijs).

Scope-schatting: ~4-6 uur werk, eigen taken + tests. Start met brainstorm-
sessie voor spec/plan.

## Slot-zoeker: chooseSlot modal-transition robuuster

In `chooseSlot` staat een `setTimeout(300)` tussen wizard sluiten en
interaction-modal openen — matched met de Bootstrap-modal-transition van
300 ms. Bij snelle heropening van de wizard kan de setTimeout alsnog vuren
en de nieuwe wizard-state stompen.

Fix: vervang de `setTimeout` door een `hidden.bs.modal`-event listener
met `{ once: true }`:
```js
el.addEventListener('hidden.bs.modal', () => showInteractionModal(...), { once: true });
```
Nice-to-have, geen bug in normaal gebruik. Zie ook code-review Task 12 in
`docs/superpowers/plans/2026-09-19-slot-zoeker.md`.
