# Multi-calendar in slot-zoeker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slot-zoeker en availability-check lezen events uit een user-geconfigureerde set Google Calendars met per-calendar modus (blocking of view-only), configuratie via nieuwe modal achter menu-item "Google Calendar".

**Architectuur:** Nieuwe Supabase-tabel `user_calendar_preferences` (per user, per calendar). In-memory cache in `js/app.js` via `getConfiguredCalendars()`. Read-flow (listCalendarEventsForDay, checkGoogleAvailability) loopt over configured set en tagt events met `isBlocking` / `isViewOnly` / `calendarSummary`. Pure filter in `vindVrijeSlot` skipt non-blocking events. `bouwAgendaItems` past prefix `{summary}: {title}` toe op view-only events. Menu-handler blijft OAuth-flow starten voor niet-verbonden users (behouden 1-click UX); alleen verbonden users zien de nieuwe modal.

**Tech stack:** Vanilla JS + Bootstrap 5.3 modal, Supabase (PostgreSQL + RLS), Google Calendar API v3 (calendarList + events endpoints), `node --test`.

**Ontwerp-referentie:** `docs/superpowers/specs/2026-09-21-multi-calendar-design.md`

---

## Task 1: SQL — user_calendar_preferences tabel + RLS

**Files:**
- Create: `SUPABASE_CALENDAR_PREFS.sql`

- [ ] **Step 1: Schrijf SQL-bestand**

```sql
-- User calendar preferences — welke Google Calendars meetellen voor slot-detectie,
-- welke alleen voor weergave, welke genegeerd (afwezigheid = negeren).

CREATE TABLE IF NOT EXISTS user_calendar_preferences (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('blocking', 'view-only')),
    calendar_summary TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, calendar_id)
);

ALTER TABLE user_calendar_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_calendar_preferences_own" ON user_calendar_preferences;
CREATE POLICY "user_calendar_preferences_own" ON user_calendar_preferences
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

- [ ] **Step 2: Draai script op dev-Supabase**

Ga naar dev-project → SQL editor → plak inhoud → Run.
Expected: "Success. No rows returned."

- [ ] **Step 3: Verifieer**

```sql
SELECT tablename FROM pg_tables WHERE tablename = 'user_calendar_preferences';
SELECT COUNT(*) FROM user_calendar_preferences;  -- 0
```

- [ ] **Step 4: Commit**

```bash
git add SUPABASE_CALENDAR_PREFS.sql
git commit -m "Feat: SQL voor user_calendar_preferences tabel + RLS"
```

---

## Task 2: `vindVrijeSlot` filter op isBlocking (TDD)

**Files:**
- Test: `test/slot-finder.test.js`
- Modify: `js/lib.js:225-247` (function `vindVrijeSlot`)

- [ ] **Step 1: Voeg failing tests toe onderaan `test/slot-finder.test.js`**

```js
test('vindVrijeSlot: view-only event blokkeert NIET (isBlocking=false)', () => {
    const events = [
        { start: '11:30', end: '12:30', title: 'Anna lunch', isBlocking: false }
    ];
    // Zonder isBlocking-filter zou 11:30 lunch-slot geblokkeerd zijn.
    const slot = vindVrijeSlot(events, '11:30', '12:00', 90);
    assert.deepEqual(slot, { startTime: '11:30', endTime: '13:00' });
});

test('vindVrijeSlot: undefined isBlocking telt als blocking (backwards-compat)', () => {
    const events = [
        { start: '11:30', end: '12:30', title: 'Meeting' }  // geen isBlocking field
    ];
    assert.equal(vindVrijeSlot(events, '11:30', '12:00', 90), null);
});
```

- [ ] **Step 2: Run tests — verwacht FAIL**

```bash
node --test test/slot-finder.test.js 2>&1 | grep -E "not ok|# fail"
```
Expected: 2 fails (view-only blokkeert wél, backwards-compat werkt wel maar geen filter aanwezig).

Eigenlijk: 1e test faalt (slot=null), 2e test slaagt (behavior klopt want geen filter).

- [ ] **Step 3: Pas `vindVrijeSlot` filter aan in `js/lib.js`**

Zoek regel 230-234 (huidige filter/map van eventRanges):
```js
const eventRanges = (events || [])
    .filter(e => !e.allDay && e.start && e.end)
    .map(e => ({
        start: parseTimeString(e.start),
        end: parseTimeString(e.end)
    }));
```

Vervang met:
```js
const eventRanges = (events || [])
    .filter(e => !e.allDay && e.isBlocking !== false && e.start && e.end)
    .map(e => ({
        start: parseTimeString(e.start),
        end: parseTimeString(e.end)
    }));
```

- [ ] **Step 4: Run tests — verwacht PASS**

```bash
node --test 2>&1 | grep -E "^# tests|^# pass|^# fail"
```
Expected: alle tests (inclusief 2 nieuwe) groen.

- [ ] **Step 5: Commit**

```bash
git add js/lib.js test/slot-finder.test.js
git commit -m "Feat(multi-calendar): vindVrijeSlot filter op isBlocking (view-only skipt slot-check)"
```

---

## Task 3: `bouwAgendaItems` view-only tagging + prefix (TDD)

**Files:**
- Test: `test/slot-finder.test.js`
- Modify: `js/lib.js:251-276` (function `bouwAgendaItems`)

- [ ] **Step 1: Voeg failing tests toe onderaan `test/slot-finder.test.js`**

```js
test('bouwAgendaItems: view-only event krijgt prefix + isViewOnly=true', () => {
    const events = [
        { start: '10:00', end: '11:00', title: 'X', isViewOnly: true, calendarSummary: 'Anna' }
    ];
    const items = bouwAgendaItems(events, { startTime: '12:00', endTime: '13:00' }, 'Y');
    const viewOnly = items.find(it => it.isViewOnly);
    assert.equal(viewOnly.title, 'Anna: X');
    assert.equal(viewOnly.isViewOnly, true);
});

test('bouwAgendaItems: blocking event geen prefix, geen isViewOnly-flag', () => {
    const events = [
        { start: '10:00', end: '11:00', title: 'X' }  // geen isViewOnly
    ];
    const items = bouwAgendaItems(events, { startTime: '12:00', endTime: '13:00' }, 'Y');
    const blocking = items.find(it => !it.isProposal);
    assert.equal(blocking.title, 'X');
    assert.notEqual(blocking.isViewOnly, true);
});

test('bouwAgendaItems: mix van view-only + blocking + all-day sorteert correct', () => {
    const events = [
        { start: '14:00', end: '15:00', title: 'Klantcall' },
        { start: '10:00', end: '11:00', title: 'Lunch', isViewOnly: true, calendarSummary: 'Anna' },
        { allDay: true, title: 'Vakantie' },
        { start: '09:00', end: '10:00', title: 'Standup' }
    ];
    const items = bouwAgendaItems(events, { startTime: '12:00', endTime: '13:00' }, 'Voorstel');
    assert.equal(items[0].allDay, true);  // all-day eerst
    assert.equal(items[1].title, 'Standup');
    assert.equal(items[2].title, 'Anna: Lunch');
    assert.equal(items[3].title, 'Voorstel');  // proposal
    assert.equal(items[4].title, 'Klantcall');
});
```

- [ ] **Step 2: Run tests — verwacht FAIL**

```bash
node --test 2>&1 | grep "^not ok"
```
Expected: 3 fails.

- [ ] **Step 3: Pas `bouwAgendaItems` aan in `js/lib.js`**

Zoek de huidige body (rond regel 251-276). Vervang het `timed`-block:
```js
const timed = (events || [])
    .filter(e => !e.allDay && e.start && e.end)
    .map(e => ({
        start: e.start,
        end: e.end,
        title: e.title,
        isProposal: false
    }));
```

Met:
```js
const timed = (events || [])
    .filter(e => !e.allDay && e.start && e.end)
    .map(e => {
        const isView = !!e.isViewOnly;
        return {
            start: e.start,
            end: e.end,
            title: isView && e.calendarSummary ? `${e.calendarSummary}: ${e.title}` : e.title,
            isProposal: false,
            isViewOnly: isView
        };
    });
```

- [ ] **Step 4: Run tests — verwacht PASS**

```bash
node --test 2>&1 | grep -E "^# tests|^# pass|^# fail"
```

- [ ] **Step 5: Commit**

```bash
git add js/lib.js test/slot-finder.test.js
git commit -m "Feat(multi-calendar): bouwAgendaItems view-only prefix + isViewOnly tagging"
```

---

## Task 4: `fetchCalendarList()` helper

**Files:**
- Modify: `js/app.js` (add near other Google Calendar helpers, ~line 2270)

- [ ] **Step 1: Voeg functie toe**

Zoek in `js/app.js` de plek net vóór `listCalendarEventsForDay` (rond regel 2300). Voeg toe:

```js
// Haal de lijst calendars op waar user toegang tot heeft.
// Retourneert array van {id, summary, summaryOverride, accessRole, primary}.
// Filtert hidden en deleted eruit.
async function fetchCalendarList() {
    if (!googleAccessToken) return [];
    try {
        const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        if (res.status === 401) googleAccessToken = null;
        if (!res.ok) return [];
        const data = await res.json();
        return (data.items || [])
            .filter(cal => !cal.hidden && !cal.deleted)
            .map(cal => ({
                id: cal.id,
                summary: cal.summaryOverride || cal.summary,
                accessRole: cal.accessRole,
                primary: !!cal.primary
            }));
    } catch (err) {
        console.warn('fetchCalendarList faalde:', err);
        return [];
    }
}
```

- [ ] **Step 2: Syntax-check**

```bash
node --check js/app.js
```
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "Feat(multi-calendar): fetchCalendarList helper (Google calendarList API)"
```

---

## Task 5: `loadCalendarPrefs()` + `saveCalendarPref()` Supabase helpers

**Files:**
- Modify: `js/app.js` (net onder `fetchCalendarList`)

- [ ] **Step 1: Voeg helpers toe**

Onder `fetchCalendarList` toevoegen:

```js
// In-memory cache voor calendar-preferences. Wordt gepopuleerd door
// loadCalendarPrefs() en bijgewerkt door saveCalendarPref().
let calendarPrefsCache = null;

// Retourneert array van {calendar_id, mode, calendar_summary}.
// Bij eerste call: fetcht uit Supabase; daarna in-memory.
async function loadCalendarPrefs() {
    if (calendarPrefsCache !== null) return calendarPrefsCache;
    if (!isSupabaseConfigured() || !currentUser) {
        calendarPrefsCache = [];
        return calendarPrefsCache;
    }
    const { data, error } = await supabaseClient
        .from('user_calendar_preferences')
        .select('calendar_id, mode, calendar_summary')
        .eq('user_id', currentUser.id);
    if (error) {
        console.warn('loadCalendarPrefs faalde:', error);
        calendarPrefsCache = [];
        return calendarPrefsCache;
    }
    calendarPrefsCache = data || [];
    return calendarPrefsCache;
}

// Upsert (mode = 'blocking' | 'view-only') of delete (mode = null) van een pref-rij.
async function saveCalendarPref(calendarId, mode, calendarSummary) {
    if (!isSupabaseConfigured() || !currentUser) return;
    if (mode === null) {
        const { error } = await supabaseClient
            .from('user_calendar_preferences')
            .delete()
            .eq('user_id', currentUser.id)
            .eq('calendar_id', calendarId);
        if (error) { console.warn('saveCalendarPref delete faalde:', error); return; }
        if (calendarPrefsCache) {
            calendarPrefsCache = calendarPrefsCache.filter(p => p.calendar_id !== calendarId);
        }
    } else {
        const { error } = await supabaseClient
            .from('user_calendar_preferences')
            .upsert({
                user_id: currentUser.id,
                calendar_id: calendarId,
                mode,
                calendar_summary: calendarSummary
            });
        if (error) { console.warn('saveCalendarPref upsert faalde:', error); return; }
        if (calendarPrefsCache) {
            const idx = calendarPrefsCache.findIndex(p => p.calendar_id === calendarId);
            const row = { calendar_id: calendarId, mode, calendar_summary: calendarSummary };
            if (idx >= 0) calendarPrefsCache[idx] = row; else calendarPrefsCache.push(row);
        }
    }
}
```

- [ ] **Step 2: Syntax-check**

```bash
node --check js/app.js
```

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "Feat(multi-calendar): loadCalendarPrefs + saveCalendarPref Supabase helpers"
```

---

## Task 6: `getConfiguredCalendars()` getter met fallback

**Files:**
- Modify: `js/app.js` (net onder saveCalendarPref)

- [ ] **Step 1: Voeg getter toe**

```js
// Retourneert de calendars die actief zijn voor read-operations.
// Sync — leest uit cache. Roep loadCalendarPrefs() aan voor eerste populatie.
// Fallback bij lege prefs: [{calendarId:'primary', mode:'blocking'}] — matcht oud gedrag.
function getConfiguredCalendars() {
    const prefs = calendarPrefsCache || [];
    if (prefs.length === 0) {
        return [{ calendarId: 'primary', mode: 'blocking', calendarSummary: null }];
    }
    return prefs.map(p => ({
        calendarId: p.calendar_id,
        mode: p.mode,
        calendarSummary: p.calendar_summary
    }));
}
```

- [ ] **Step 2: Syntax-check**

```bash
node --check js/app.js
```

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "Feat(multi-calendar): getConfiguredCalendars getter met primary-fallback"
```

---

## Task 7: `listCalendarEventsForDay` refactor — loop over configured calendars

**Files:**
- Modify: `js/app.js:2306-2360` (function `listCalendarEventsForDay`)

- [ ] **Step 1: Vervang de body van `listCalendarEventsForDay`**

Hele huidige functie (regel 2306 t/m rond 2360) vervangen door:

```js
async function listCalendarEventsForDay(dateStr) {
    if (!googleAccessToken) return [];

    function localRfc3339(dateStr, hhmm) {
        const [y, mo, d] = dateStr.split('-').map(Number);
        const [h, mi] = hhmm.split(':').map(Number);
        const dt = new Date(y, mo - 1, d, h, mi, 0, 0);
        const tzOffsetMin = -dt.getTimezoneOffset();
        const sign = tzOffsetMin >= 0 ? '+' : '-';
        const abs = Math.abs(tzOffsetMin);
        const oh = String(Math.floor(abs / 60)).padStart(2, '0');
        const om = String(abs % 60).padStart(2, '0');
        const pad = (n) => String(n).padStart(2, '0');
        return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:00${sign}${oh}:${om}`;
    }

    const timeMin = encodeURIComponent(localRfc3339(dateStr, '07:00'));
    const timeMax = encodeURIComponent(localRfc3339(dateStr, '23:00'));

    // Zorg dat prefs zijn geladen (eerste call fetch uit Supabase, daarna cache).
    await loadCalendarPrefs();
    const configuredCals = getConfiguredCalendars();

    // Per calendar events ophalen. Errors per calendar loggen maar niet doorgeven.
    const perCalendarResults = await Promise.all(configuredCals.map(async (cal) => {
        const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
            if (res.status === 401) { googleAccessToken = null; return []; }
            if (res.status === 404) return []; // verdwenen calendar — stil skippen
            if (!res.ok) return [];
            const data = await res.json();
            const items = data.items || [];
            const isBlocking = cal.mode === 'blocking';
            return items
                .filter(ev => {
                    if (ev.status === 'cancelled') return false;
                    if (!ev.start) return false;
                    if (ev.attendees && ev.attendees.some(a => a.self && a.responseStatus === 'declined')) return false;
                    if (ev.start.dateTime && ev.transparency === 'transparent') return false;
                    return true;
                })
                .map(ev => {
                    const base = { calendarId: cal.calendarId, calendarSummary: cal.calendarSummary, isBlocking, isViewOnly: !isBlocking };
                    if (!ev.start.dateTime) {
                        return { ...base, allDay: true, title: ev.summary || '(geen titel)' };
                    }
                    const s = new Date(ev.start.dateTime);
                    const e = new Date(ev.end.dateTime);
                    const fmt = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                    return { ...base, id: ev.id, start: fmt(s), end: fmt(e), title: ev.summary || '(geen titel)' };
                });
        } catch (err) {
            console.warn(`listCalendarEventsForDay faalde voor ${cal.calendarId}:`, err);
            return [];
        }
    }));

    // Flatten, dedupe op event-id (alleen timed events hebben id), sorteer.
    const flat = perCalendarResults.flat();
    const seen = new Set();
    const deduped = flat.filter(e => {
        if (!e.id) return true;
        if (seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
    });
    return deduped.sort((a, b) => {
        if (a.allDay && !b.allDay) return -1;
        if (!a.allDay && b.allDay) return 1;
        if (a.allDay && b.allDay) return 0;
        return a.start.localeCompare(b.start);
    });
}
```

- [ ] **Step 2: Syntax-check**

```bash
node --check js/app.js
```

- [ ] **Step 3: Run bestaande tests (regressie-check)**

```bash
node --test 2>&1 | grep -E "^# tests|^# pass|^# fail"
```
Expected: alle tests groen (pure lib.js-tests niet geraakt door app.js refactor).

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "Feat(multi-calendar): listCalendarEventsForDay loopt over configured calendars"
```

---

## Task 8: `checkGoogleAvailability` — zelfde multi-calendar patroon

**Files:**
- Modify: `js/app.js:2239-2298` (function `checkGoogleAvailability`)

- [ ] **Step 1: Vervang de fetch-body**

De huidige functie fetcht van `/calendars/primary/events` op regel 2239. Refactor:
- `await loadCalendarPrefs()` toevoegen
- `getConfiguredCalendars()` gebruiken
- Per calendar events ophalen (zelfde patroon als Task 7)
- Events samenvoegen voor de mini-availability-view

De mini-view in de interaction-modal (buiten wizard-flow) laat gewoon alle geconfigureerde events zien. View-only styling wordt hier NIET toegepast — deze view is puur informatief en heeft geen "slot-blokkeert-vs-view-only" onderscheid nodig (gebruiker maakt hier direct een afspraak, geen slot-detectie).

Vervang de fetch (rond regel 2239) door:
```js
await loadCalendarPrefs();
const configuredCals = getConfiguredCalendars();
const perCalendarResponses = await Promise.all(configuredCals.map(async (cal) => {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.calendarId)}/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;
    try {
        const r = await fetch(url, { headers: { 'Authorization': `Bearer ${googleAccessToken}` } });
        if (r.status === 401) { googleAccessToken = null; throw new Error('401'); }
        if (r.status === 404 || !r.ok) return [];
        const d = await r.json();
        return d.items || [];
    } catch (err) {
        if (err.message === '401') throw err;
        return [];
    }
}));
const events = perCalendarResponses.flat();
```

Rest van de functie (rendering) blijft ongewijzigd — die krijgt nu events uit meerdere calendars maar rendered hetzelfde.

- [ ] **Step 2: Syntax-check + tests**

```bash
node --check js/app.js && node --test 2>&1 | grep -E "^# tests|^# pass|^# fail"
```

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "Feat(multi-calendar): checkGoogleAvailability loopt over configured calendars"
```

---

## Task 9: HTML skeleton `#calendar-settings-modal`

**Files:**
- Modify: `index.html` + `index-dev.html`

- [ ] **Step 1: Zoek plek voor nieuwe modal**

```bash
grep -n "slot-wizard-modal" index.html index-dev.html
```

- [ ] **Step 2: Voeg direct NA de slot-wizard-modal toe** (in beide files)

```html
<!-- Google Calendar-instellingen: verbinding + per-kalender modus -->
<div class="modal fade" id="calendar-settings-modal" tabindex="-1" aria-hidden="true" aria-label="Kalenders beheren">
    <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Google Calendar</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Sluiten"></button>
            </div>
            <div class="modal-body" id="calendar-settings-body">
                <!-- Dynamisch gerenderd door renderCalendarSettingsRows -->
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add index.html index-dev.html
git commit -m "Feat(multi-calendar): HTML skeleton voor calendar-settings-modal"
```

---

## Task 10: Modal-renderer + interactie (`openCalendarSettingsModal`)

**Files:**
- Modify: `js/app.js` (net onder de nieuwe helpers uit Task 4-6)

- [ ] **Step 1: Voeg module-level modal-instance toe**

Zoek de andere modal-instances (bijv. `slotWizardModal` rond regel 705). Voeg toe:
```js
let calendarSettingsModal = null;
```

- [ ] **Step 2: Voeg openers-functie toe**

```js
// Opent de Google Calendar-instellingen modal. Alleen aangeroepen als
// googleAccessToken truthy is; menu-handler kiest zelf.
async function openCalendarSettingsModal() {
    const el = document.getElementById('calendar-settings-modal');
    if (!el) return;
    if (!calendarSettingsModal) calendarSettingsModal = new bootstrap.Modal(el);

    const body = document.getElementById('calendar-settings-body');
    body.innerHTML = '<p class="text-muted">Kalenders laden…</p>';
    calendarSettingsModal.show();

    const [calendarList, prefs] = await Promise.all([
        fetchCalendarList(),
        loadCalendarPrefs()
    ]);

    if (calendarList.length === 0) {
        body.innerHTML = '<p class="text-danger">Kan kalenderlijst niet ophalen. Verbinding vernieuwen?</p>';
        return;
    }

    // Bij eerste-keer opening: pas defaults toe voor calendars zonder pref.
    const prefsMap = new Map(prefs.map(p => [p.calendar_id, p]));
    const defaultsToWrite = [];
    for (const cal of calendarList) {
        if (!prefsMap.has(cal.id)) {
            const isOwnerOrWriter = cal.accessRole === 'owner' || cal.accessRole === 'writer';
            if (isOwnerOrWriter) {
                defaultsToWrite.push({ calendarId: cal.id, mode: 'blocking', summary: cal.summary });
            }
        }
    }
    for (const d of defaultsToWrite) {
        await saveCalendarPref(d.calendarId, d.mode, d.summary);
    }

    // Re-render met nu-actuele prefs (cache is bijgewerkt door saveCalendarPref).
    renderCalendarSettingsRows(body, calendarList);
}

function renderCalendarSettingsRows(body, calendarList) {
    const prefs = calendarPrefsCache || [];
    const prefsMap = new Map(prefs.map(p => [p.calendar_id, p.mode]));

    const header = `
        <div class="calendar-settings-status">
            <div><b>✓ Verbonden</b>${currentUser ? ` als ${escapeHtml(currentUser.email || '')}` : ''}</div>
            <a href="#" data-action="disconnect">Ontkoppelen</a>
        </div>
        <h6 class="mt-3 mb-2 text-muted">Jouw kalenders</h6>
    `;

    const rows = calendarList.map(cal => {
        const currentMode = prefsMap.get(cal.id) || '';  // '' = negeren
        return `
            <div class="calendar-settings-row">
                <div>
                    <div class="cal-name">${escapeHtml(cal.summary)}${cal.primary ? ' <span class="badge bg-secondary">primary</span>' : ''}</div>
                    <div class="cal-sub text-muted small">${escapeHtml(cal.id)}</div>
                </div>
                <select class="form-select form-select-sm" data-calendar-id="${escapeHtml(cal.id)}" data-summary="${escapeHtml(cal.summary)}">
                    <option value="" ${currentMode === '' ? 'selected' : ''}>Negeren</option>
                    <option value="blocking" ${currentMode === 'blocking' ? 'selected' : ''}>🚫 Blokkeert slots</option>
                    <option value="view-only" ${currentMode === 'view-only' ? 'selected' : ''}>👁 Alleen tonen</option>
                </select>
            </div>
        `;
    }).join('');

    body.innerHTML = header + rows;

    // Wiring: change-events op de dropdowns.
    body.querySelectorAll('select[data-calendar-id]').forEach(sel => {
        sel.addEventListener('change', async () => {
            const calId = sel.dataset.calendarId;
            const summary = sel.dataset.summary;
            const val = sel.value;
            await saveCalendarPref(calId, val === '' ? null : val, summary);
        });
    });

    body.querySelector('[data-action="disconnect"]').addEventListener('click', (e) => {
        e.preventDefault();
        handleGoogleCalendarDisconnect();
        if (calendarSettingsModal) calendarSettingsModal.hide();
    });
}
```

- [ ] **Step 3: Syntax-check**

```bash
node --check js/app.js
```

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "Feat(multi-calendar): openCalendarSettingsModal + renderCalendarSettingsRows"
```

---

## Task 11: CSS voor view-only + modal + cache-buster bump

**Files:**
- Modify: `css/styles.css`
- Modify: `index.html`, `index-dev.html` (cache-buster)

- [ ] **Step 1: Voeg CSS toe onder bestaande wizard-agenda-row styling**

Zoek `.wizard-agenda-row.allday` in `css/styles.css` (rond regel 1115). Voeg direct daaronder toe:

```css
.wizard-agenda-row.view-only { color: #B0B7BF; font-style: italic; }
.wizard-agenda-row.view-only .time::before { content: "👁 "; font-style: normal; font-size: 12px; margin-right: 2px; }
.wizard-agenda-row.view-only .title { color: #B0B7BF; }

.calendar-settings-status {
    padding: 12px 14px;
    background: #F0F9F0;
    border-radius: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 14px;
}
.calendar-settings-status a { color: #6C757D; text-decoration: none; font-size: 13px; }
.calendar-settings-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    margin-bottom: 6px;
    gap: 12px;
}
.calendar-settings-row .cal-name { font-weight: 600; font-size: 14px; }
.calendar-settings-row .cal-sub { font-size: 12px; word-break: break-all; }
.calendar-settings-row select { max-width: 180px; }
```

- [ ] **Step 2: Bump cache-buster in beide HTML-files**

Zoek `styles.css?v=20260919b` (of latere). Bump naar `20260921a`.

- [ ] **Step 3: Commit**

```bash
git add css/styles.css index.html index-dev.html
git commit -m "Feat(multi-calendar): CSS voor view-only + calendar-settings-modal + cache-buster bump"
```

---

## Task 12: Menu-handler switch — 1-click OAuth voor niet-verbonden, modal voor verbonden

**Files:**
- Modify: `js/app.js` — menu-handler voor Google Calendar (zoek `handleGoogleCalendarConnect` binding of menu-item wiring)

- [ ] **Step 1: Vind huidige menu-wiring**

```bash
grep -n "google-calendar\|GoogleCalendar\|handleGoogleCalendarConnect" js/app.js | head -20
```

- [ ] **Step 2: Wijzig de wiring**

Zoek de plek waar het menu-item "Google Calendar" een click-handler heeft. Vervang de directe aanroep van `handleGoogleCalendarConnect` met:

```js
// Menu-item "Google Calendar":
// - Niet verbonden → start OAuth direct (bewaar 1-click UX)
// - Verbonden → open Kalender-beheer modal
if (!googleAccessToken) {
    handleGoogleCalendarConnect();
} else {
    openCalendarSettingsModal();
}
```

- [ ] **Step 3: Zorg dat `handleGoogleCalendarDisconnect` cache reset**

Zoek `handleGoogleCalendarDisconnect` en voeg toe aan het eind:
```js
calendarPrefsCache = null;  // volgende sessie/wizard-open fetcht opnieuw
```

- [ ] **Step 4: Syntax-check + tests**

```bash
node --check js/app.js && node --test 2>&1 | grep -E "^# tests|^# pass|^# fail"
```

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "Feat(multi-calendar): menu-handler switch — modal alleen bij verbonden, oud OAuth-gedrag anders"
```

---

## Task 13: Notion documentatie bijwerken

**Files:**
- Notion pagina: Contactbeheer — Documentatie (page ID `3e1c13a2-187c-81dd-ac48-d3c9d7646b43`)

Per user's memory rule (`feedback_readme_sync.md`) moet de Notion doc meebewegen met deze feature.

- [ ] **Step 1: Voeg nieuwe sub-sectie toe onder "📅 Google Calendar-integratie"**

Nieuwe H3-sectie **"### 🗂️ Meerdere agenda's beheren"** met bullets:
- Nieuwe modal achter menu-item "Google Calendar" (alleen zichtbaar als je al verbonden bent)
- Per kalender: **🚫 Blokkeert slots** (telt mee voor slot-detectie), **👁 Alleen tonen** (info in mini-view, blokkeert geen slots), of **Negeren**
- Defaults: eigen calendars (owner/writer) automatisch op *Blokkeert*, rest op *Negeren*
- Wijzigingen direct opgeslagen; sync via Supabase tussen apparaten
- View-only events verschijnen in mini-view met prefix "{agenda}: {titel}" en 👁-icoon

- [ ] **Step 2: Update datamodel-tabel**

Voeg regel toe:
| `user_calendar_preferences` | user_id · calendar_id · mode ('blocking'\|'view-only') · calendar_summary · updated_at | Welke Google Calendars meetellen/tonen bij slot-detectie |

- [ ] **Step 3: Update "Laatst bijgewerkt"-datum onderaan naar `2026-09-21`**

- [ ] **Step 4: Update SQL-bestanden-lijst in Projectstructuur**

Voeg toe: `SUPABASE_CALENDAR_PREFS.sql` — calendar-preferences tabel

- [ ] **Step 5: Verifieer via Notion**

Open https://app.notion.com/p/3e1c13a2187c81ddac48d3c9d7646b43 in browser — controleer dat wijzigingen zichtbaar zijn.

---

## Task 14: E2E manuele verificatie (user-action)

**Files:** geen wijzigingen.

- [ ] **Setup** — refresh dev en zorg dat SQL is gedraaid op dev-Supabase

- [ ] **Scenario 1 — Niet-verbonden user, oud gedrag preserved**
  1. Log in met account zonder Google Calendar-koppeling
  2. Open menu → klik "Google Calendar" → OAuth-flow start direct (geen modal)
  3. Verwacht: exact zelfde UX als voor deze feature

- [ ] **Scenario 2 — Eerste keer verbonden, modal opent**
  1. Verbind Google Calendar
  2. Open menu → klik "Google Calendar" → modal opent
  3. Verwacht: alle calendars uit je Google-account zichtbaar; eigen calendars staan op "🚫 Blokkeert slots", overige op "Negeren"

- [ ] **Scenario 3 — Wijziging blijft persistent**
  1. Zet een calendar op "👁 Alleen tonen"
  2. Sluit modal, open opnieuw → wijziging is er nog
  3. Log uit, log in op ander device (of ander browser met zelfde account) → wijziging is er nog

- [ ] **Scenario 4 — View-only in slot-zoeker mini-view**
  1. Zet Anna's agenda op "👁 Alleen tonen"
  2. Open wizard voor een contact
  3. Bekijk een van de 5 voorstel-kaarten die overlapt met Anna's events die dag
  4. Verwacht: Anna's events lichter/grijs met `👁 Anna's agenda: {titel}` prefix; ze blokkeren geen slots

- [ ] **Scenario 5 — Blocking calendar blokkeert slots**
  1. Zet Werk-agenda op "🚫 Blokkeert slots"
  2. Open wizard op een dag waar Werk-agenda de lunch-strook bezet
  3. Verwacht: die dag wordt overgeslagen (geen voorstel), volgende dag krijgt voorregel

- [ ] **Scenario 6 — Ontkoppelen sluit modal**
  1. Klik "Ontkoppelen" in de modal
  2. Verwacht: modal sluit, koppeling weg, menu-klik "Google Calendar" start weer OAuth

---

## Task 15: SQL draaien op prod + Merge naar main (user-action)

**Files:** geen code-wijzigingen; deployment-stap.

- [ ] **Step 1: SQL draaien op prod-Supabase**

Ga naar prod-project → SQL editor → plak inhoud van `SUPABASE_CALENDAR_PREFS.sql` → Run.
Zonder deze stap crasht de live app zodra een user "Kalenders beheren" opent.

- [ ] **Step 2: Merge naar main + push**

Als je op een feature-branch werkt:
```bash
git checkout main && git merge feat/multi-calendar --no-ff -m "Merge: multi-calendar in slot-zoeker met view-only exception"
git push origin main
```
Als je direct op main hebt gecommit: alleen `git push origin main`.

- [ ] **Step 3: Verifieer op prod**

Open https://quaiongen.github.io/contactbeheer → hard refresh → test kort de golden-path (Scenario 2 + 4 uit Task 14).

- [ ] **Step 4: Notion backlog-item op Gereed zetten**

Sleep het item "Multi-calendar in slot-zoeker (met view-only exception)" naar de kolom **Gereed** in Notion.
