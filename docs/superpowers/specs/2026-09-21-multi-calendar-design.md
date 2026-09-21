# Multi-calendar in slot-zoeker (met view-only exception)

**Datum:** 2026-09-21
**Status:** ontwerp

## Doel

Alle read-operations op Google Calendar (slot-zoeker wizard, `checkGoogleAvailability`, `listCalendarEventsForDay`) lezen events uit een user-geconfigureerde set calendars. Elke calendar heeft één van twee modi: **blocking** (telt mee voor slot-detectie én tonen) of **view-only** (alleen tonen, geen slot-blok). Calendars buiten de set worden genegeerd. Config wordt beheerd via een nieuwe modal achter menu-item "Google Calendar".

Write-operations (create/update/delete Calendar-event) blijven ongewijzigd naar `primary`.

## Achtergrond

Nu leest de app alleen uit `primary`. Wens (uit brainstorm 2026-09-21): eigen work-agenda ook mee laten tellen, én de agenda van één externe persoon (Anna) alleen zichtbaar tonen zonder dat die slots blokkeert.

## Architectuur

Drie lagen:

1. **Preferences-laag** (Supabase-tabel `user_calendar_preferences`) — bron van waarheid per user, per calendar.
2. **Fetch-laag** (`js/app.js`) — nieuwe helpers `fetchCalendarList()`, `loadCalendarPrefs()`, `saveCalendarPref()`, `getConfiguredCalendars()`. Aangepast: `listCalendarEventsForDay()` en `checkGoogleAvailability()` loopen over de configured set i.p.v. hardcoded `primary`.
3. **Presentation-laag**
   - Nieuwe modal `#calendar-settings-modal` met dropdown per kalender.
   - `vindVrijeSlot()` (`js/lib.js`) krijgt filter op `isBlocking`.
   - `bouwAgendaItems()` krijgt view-only tagging + prefix `{calendar-naam}: {title}` alleen bij view-only.
   - CSS: `.wizard-agenda-row.view-only` lichter grijs + 👁 icoon via `::before`.

## Data model

Nieuwe tabel:

```sql
CREATE TABLE user_calendar_preferences (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL,        -- Google's calendar-id ('primary' of e-mailadres)
    mode TEXT NOT NULL CHECK (mode IN ('blocking', 'view-only')),
    calendar_summary TEXT,             -- cache voor UI ("Werk C-QC", "Anna's agenda")
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, calendar_id)
);

ALTER TABLE user_calendar_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_calendar_preferences_own" ON user_calendar_preferences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Waarom een tabel en niet een jsonb-kolom op user-settings:** Contactbeheer heeft nog geen `user_settings`-tabel. Nieuwe tabel is nu simpelst; jsonb-migratie kan altijd later.

**Semantiek:** alleen calendars in `blocking` of `view-only` staan in de tabel. Afwezigheid = "Negeren".

## UI: Google Calendar modal

Menu-item **"Google Calendar"** opent voortaan een modal (was: directe toggle van koppeling).

**Modal-header:** status + ontkoppel-link
- Niet verbonden: `"Nog niet verbonden"` + knop **Verbinden**
- Verbonden: `"✓ Verbonden als {email}"` + link *ontkoppelen*

**Modal-body (alleen als verbonden):**
- H4 "Jouw kalenders"
- Lijst van rijen, één per calendar uit Google's calendarList:
  - Links: `<div>{calendar.summary}</div>` + subtekst `{calendar.id of accessRole}`
  - Rechts: `<select>` met opties:
    - `🚫 Blokkeert slots` — value: `blocking`
    - `👁 Alleen tonen` — value: `view-only`
    - `Negeren` (default) — value: `""` (of `null`)

**Interactie:** wijziging in dropdown = directe upsert/delete in Supabase (geen aparte save-knop). Bij `Negeren` → DELETE de rij; bij andere → UPSERT.

## Flow

### Openen "Google Calendar" modal

```
1. fetch calendarList (GET /calendar/v3/users/me/calendarList)
2. load user_calendar_preferences uit Supabase
3. merge:
   voor elke calendar in calendarList:
     - bekende pref? → toon met huidige mode geselecteerd
     - onbekend? → default op basis van accessRole:
        * owner/writer → 'blocking'
        * anders → 'negeren' (geen dropdown-selectie, staat op 'Negeren')
   bij eerste-keer opening: schrijf defaults direct weg naar Supabase
4. render modal
```

**calendar-list caching:** in-memory voor de sessie. Modal-refresh = re-fetch.

**prefs-caching:** `getConfiguredCalendars()` gebruikt een module-level in-memory cache die wordt gepopuleerd door `loadCalendarPrefs()` bij eerste wizard-open. Na elke pref-wijziging (upsert of delete via `saveCalendarPref`) wordt de cache lokaal bijgewerkt. Bij modal-close hoeft niets extra te gebeuren want elke individuele wijziging schrijft al naar Supabase én cache.

### Wizard-open / availability-check

```
1. getConfiguredCalendars() → lees prefs (in-memory cache, of Supabase eerste keer)
2. voor elke calendar (blocking OF view-only):
     - fetch events voor dag via listCalendarEventsForDay-per-calendar
     - tag elk event met: calendarId, isBlocking (bool), calendarSummary
3. dedupe: zelfde eventId in meerdere calendars → keep first
4. sorteer: all-day eerst, dan chronologisch op start
5. return array van events met tags
```

`vindVrijeSlot` filtert dan op `!e.allDay && e.isBlocking && e.start && e.end`.

`bouwAgendaItems` splitst op `isViewOnly` (opposite van `isBlocking` voor gemak) en past prefix toe: als view-only, title wordt `{calendarSummary}: {originalTitle}`.

### Wat als er nog geen prefs zijn (nieuwe user of net verbonden)

Fallback: `getConfiguredCalendars()` retourneert `[{calendarId: 'primary', mode: 'blocking'}]`. Gedraagt zich als oud gedrag. Zodra user "Kalenders beheren" opent, worden defaults toegepast en geschreven.

## Code-wijzigingen

### Nieuw in `js/app.js`

- `async function fetchCalendarList()` — GET calendarList, filter `hidden === false` en `deleted !== true`; retourneer array `{id, summary, summaryOverride, accessRole}`
- `async function loadCalendarPrefs()` — SELECT * FROM user_calendar_preferences WHERE user_id
- `async function saveCalendarPref(calendarId, mode, calendarSummary)` — UPSERT als mode gezet, DELETE als mode = null
- `function getConfiguredCalendars()` — in-memory getter (populated by loadCalendarPrefs); fallback naar `[{calendarId:'primary', mode:'blocking'}]`
- `async function openCalendarSettingsModal()` — orchestrator: fetch, merge, render
- `function renderCalendarSettingsRows(calendars, prefs)` — HTML voor de dropdown-lijst
- Menu-handler voor "Google Calendar" wijzigt: open modal i.p.v. `handleGoogleCalendarConnect()`. Verbinden zit dan in de modal.

### Aangepast in `js/app.js`

- `listCalendarEventsForDay(dateStr)` — nieuwe signature `listCalendarEventsForDay(dateStr)` (ongewijzigd extern) maar intern:
  - `const calendars = getConfiguredCalendars()`
  - loop, per calendar fetch met encoded calendarId
  - resultaten combineren, taggen met `calendarId`, `isBlocking`, `calendarSummary`
  - dedupe op `id` field van Google event
  - sort: all-day eerst, dan op start
- `checkGoogleAvailability(dateStr)` — zelfde patroon toegepast (kleiner scope: alleen mini-view rendering).
- `handleGoogleCalendarConnect()`, `handleGoogleCalendarDisconnect()` — blijven bestaan, worden getriggerd vanuit de modal.

### Aangepast in `js/lib.js`

- `vindVrijeSlot(events, ...)` — filter:
  ```js
  .filter(e => !e.allDay && e.isBlocking !== false && e.start && e.end)
  ```
  Default `isBlocking = true` (undefined telt als true) voor backwards-compat met bestaande call-sites en tests.
- `bouwAgendaItems(events, slot, proposalTitle)` — nieuwe field `isViewOnly` per item:
  ```js
  { start, end, title: e.isViewOnly ? `${e.calendarSummary}: ${e.title}` : e.title, isProposal: false, isViewOnly: !!e.isViewOnly }
  ```

### Nieuw in `css/styles.css`

- `.wizard-agenda-row.view-only` — kleur `#B0B7BF` (lichter dan default `#5B6470`)
- `.wizard-agenda-row.view-only .time::before` — `content: "👁 "; font-size: 12px;`
- `.wizard-agenda-row.view-only .title` — cursief

### Nieuw in `index.html` en `index-dev.html`

- Nieuwe modal `<div class="modal fade" id="calendar-settings-modal">` met header (title + close), body (dynamisch gerenderd), footer met close-knop.
- Cache-buster op `styles.css` bumpen.

## Tests (`test/slot-finder.test.js` — nieuwe test-cases)

- `vindVrijeSlot: view-only event blokkeert NIET` — event `{isBlocking: false, start: '11:30', end: '12:30'}` blokkeert lunch-slot niet
- `vindVrijeSlot: undefined isBlocking telt als blocking` — backwards-compat check
- `bouwAgendaItems: view-only krijgt prefix + isViewOnly=true` — event `{isViewOnly: true, calendarSummary: 'Anna', title: 'X', start:'10:00', end:'11:00'}` → item `{title: 'Anna: X', isViewOnly: true}`
- `bouwAgendaItems: blocking event ongewijzigde title` — geen prefix
- `bouwAgendaItems: mix van view-only + blocking sorteert correct chronologisch`

## Edge cases

- **Verdwenen calendar** (in prefs maar niet meer in calendarList): stil skippen bij events-fetch (`fetch` retourneert 404 → catch, continue). Rij blijft in tabel; user kan 'm bij volgende modal-open handmatig verwijderen (of via toekomstig auto-cleanup — niet in MVP).
- **Rate limit / 401**: per-calendar 401 → clear token en fallback (zelfde als huidige gedrag).
- **Transparent events per calendar**: bestaande filter `ev.transparency === 'transparent'` in `listCalendarEventsForDay` (voor timed events; all-day transparents blijven zichtbaar als info) blijft ongewijzigd én wordt uniform toegepast op elke calendar in de loop. Geen per-calendar override.
- **> 250 events per dag per calendar**: Google API paginated; laten voor MVP (geen pagineerlogica), doc de limiet.
- **User draait mode van view-only naar blocking (of andersom)**: geen cache-invalidation nodig; volgende wizard-open leest verse prefs.
- **`primary` staat op "Negeren"**: gerespecteerd. User krijgt geen slots gefilterd op `primary`, alleen op andere blocking calendars. Rare edge case maar toegestaan.

## Out of scope

- **Write-operations naar meerdere calendars** — nieuwe events altijd naar `primary`. Als een user een event wil in Werk-agenda, kan dat via Google UI.
- **Prefix bij eigen non-primary events** ("Werk C-QC: Klantcall") — brainstorm-keuze A: alleen view-only krijgt prefix.
- **Auto-cleanup verdwenen calendars** — later, indien database vervuild raakt.
- **Multi-select van "welke calendars in de weekmail"** — dit spec gaat alleen over slot-zoeker; weekmail-flow is aparte feature.
- **Sub-groups per calendar** (bijv. "alleen events met label X") — niet ondersteund; hele calendar of niet.
- **Kleurweergave** per calendar in mini-view (Google-color-per-calendar) — niet in MVP; blijft één neutrale kleur.

## Scope-schatting

- 8-10 taken (SQL, fetch-helpers, modal-UI, listCalendarEventsForDay refactor, vindVrijeSlot filter, bouwAgendaItems tagging, CSS, prefill bij oude gedrag, tests, README-update)
- Ongeveer 5-8 uur werk verdeeld over de dag
- 5-8 nieuwe unit tests
