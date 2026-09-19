# Slot-zoeker wizard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bij het aanmaken van een nieuwe afspraak eerst een wizard tonen waarin de gebruiker een preset (Lunch/Diner/Anders) kiest, waarna de app via Google Calendar 5 vrije slots voorstelt als mini-agenda-view. Na slot-keuze opent het bestaande interaction-formulier voorgevuld.

**Architecture:** Nieuwe wizard-modal `#slot-wizard-modal` met interne state-management in JS. Pure zoek-logica in `js/lib.js` (test-baar via `node --test`). Wizard-orchestratie + Google Calendar API-calls (`events.list`) in `js/app.js`. Bestaande flow `openNewInteraction → showInteractionModal` wordt: `openNewInteraction → openSlotWizard → showInteractionModal(prefill)`.

**Tech Stack:** Vanilla JavaScript, Bootstrap 5.3 modals, Google Calendar API v3 (`events.list`). Geen nieuwe dependencies. Tests via `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-19-slot-zoeker-design.md`

---

## File Structure

**Aanmaken:**
- `test/slot-finder.test.js` — nieuwe unit-tests voor `vindVrijeSlot`, `presetSpec`, `bouwAgendaItems`.

**Wijzigen:**
- `js/lib.js` — 3 nieuwe pure functies toevoegen aan de dual-export lijst (`presetSpec`, `vindVrijeSlot`, `bouwAgendaItems`) + helpers (`parseTimeString`, `addMinutes`, `formatTimeString`).
- `js/app.js` — nieuwe functies: `openSlotWizard`, `renderWizardPreset/Anders/Loading/Results`, `handlePresetPick`, `listCalendarEventsForDay`, `searchSlots`, `chooseSlot`. Wijziging: `openNewInteraction` roept `openSlotWizard` aan i.p.v. `showInteractionModal`. Wijziging: `showInteractionModal` accepteert optionele `prefill`-parameter.
- `index-dev.html` + `index.html` — nieuwe `#slot-wizard-modal` Bootstrap modal na de bestaande `#calendar-reconnect-modal`. Bump cache-buster.
- `css/styles.css` — nieuwe klassen: `.slot-wizard-*`, `.preset-btn`, `.horizon-box`, `.anders-form`, `.slot`, `.day-header`, `.agenda-row`, `.agenda-row.proposal`, `.agenda-row.empty`, `.fallback-warn`, `.wizard-loading`.
- `README.md` — sectie **Functies** uitbreiden met slot-zoeker bullet. `docs/superpowers/plans/` in projectstructuur.

**Niet aanraken:**
- `showInteractionModal` bewerk-modus (interactionId meegegeven) — blijft ongewijzigd.
- `saveInteraction`, `createCalendarEvent`, `handleReach`, `handlePlan` en bucket-logica.
- Weekmail-code (`supabase/functions/weekly-digest/`).

---

## Task 1: `presetSpec` pure functie + tests

**Files:**
- Modify: `js/lib.js` (voeg toe bij de andere pure functies, direct na `formatPlannedDateShort`)
- Test: `test/slot-finder.test.js` (nieuw bestand)

Deze functie mapt een preset-keuze naar concrete waarden: startVensterVan, startVensterTot, duur (min), titelTemplate.

- [ ] **Step 1: Nieuw testbestand aanmaken met eerste test**

```js
// test/slot-finder.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { presetSpec } = require('../js/lib.js');

test('presetSpec: lunch → 11:30-12:00 startvenster, 90 min, titel-template met contact', () => {
    const s = presetSpec('lunch');
    assert.equal(s.startVensterVan, '11:30');
    assert.equal(s.startVensterTot, '12:00');
    assert.equal(s.duur, 90);
    assert.equal(s.titelTemplate, 'Lunch met {naam}');
});

test('presetSpec: diner → 18:00-19:30 startvenster, 180 min', () => {
    const s = presetSpec('diner');
    assert.equal(s.startVensterVan, '18:00');
    assert.equal(s.startVensterTot, '19:30');
    assert.equal(s.duur, 180);
    assert.equal(s.titelTemplate, 'Diner met {naam}');
});

test('presetSpec: anders → eigen input, geen titel-template', () => {
    const s = presetSpec('anders', { starttijd: '14:00', duur: 60 });
    assert.equal(s.startVensterVan, '14:00');
    assert.equal(s.startVensterTot, '14:00');
    assert.equal(s.duur, 60);
    assert.equal(s.titelTemplate, null);
});

test('presetSpec: onbekende preset → null', () => {
    assert.equal(presetSpec('random'), null);
});
```

- [ ] **Step 2: Tests draaien om falen te bevestigen**

Run: `npm test -- --test-name-pattern="presetSpec"`
Expected: 4 tests FAIL (functie bestaat niet)

- [ ] **Step 3: Functie toevoegen aan `js/lib.js`**

Locatie: direct na `formatPlannedDateShort` (rond regel 175). Ook aan de return-lijst onderaan toevoegen.

```js
    function presetSpec(preset, andersInput) {
        if (preset === 'lunch') {
            return { startVensterVan: '11:30', startVensterTot: '12:00', duur: 90, titelTemplate: 'Lunch met {naam}' };
        }
        if (preset === 'diner') {
            return { startVensterVan: '18:00', startVensterTot: '19:30', duur: 180, titelTemplate: 'Diner met {naam}' };
        }
        if (preset === 'anders') {
            const t = (andersInput && andersInput.starttijd) || '14:00';
            const d = (andersInput && andersInput.duur) || 60;
            return { startVensterVan: t, startVensterTot: t, duur: d, titelTemplate: null };
        }
        return null;
    }
```

En in de return-block onderaan `lib.js`:
```js
        // slot-zoeker
        presetSpec,
```

- [ ] **Step 4: Tests draaien om te bevestigen dat ze slagen**

Run: `npm test`
Expected: alle tests groen, aantal +4.

- [ ] **Step 5: Commit**

```bash
git add js/lib.js test/slot-finder.test.js
git commit -m "feat(slot-zoeker): presetSpec pure functie + tests"
```

---

## Task 2: Tijd-helpers `parseTimeString`, `addMinutes`, `formatTimeString`

**Files:**
- Modify: `js/lib.js`
- Test: `test/slot-finder.test.js` (aanvullen)

Kleine helpers voor tijd-arithmetic ("HH:MM" ↔ minutes-sinds-middernacht).

- [ ] **Step 1: Testen toevoegen bovenaan `test/slot-finder.test.js`**

```js
const { parseTimeString, addMinutes, formatTimeString } = require('../js/lib.js');

test('parseTimeString: HH:MM → minutes-sinds-middernacht', () => {
    assert.equal(parseTimeString('00:00'), 0);
    assert.equal(parseTimeString('11:30'), 690);
    assert.equal(parseTimeString('23:59'), 1439);
});

test('formatTimeString: minutes → HH:MM (zero-padded)', () => {
    assert.equal(formatTimeString(0), '00:00');
    assert.equal(formatTimeString(690), '11:30');
    assert.equal(formatTimeString(1439), '23:59');
});

test('addMinutes: telt op zonder overflow-controle (voor slot-berekening)', () => {
    assert.equal(addMinutes('11:30', 90), '13:00');
    assert.equal(addMinutes('23:00', 30), '23:30');
});
```

- [ ] **Step 2: Tests draaien om falen te bevestigen**

Run: `npm test -- --test-name-pattern="parseTimeString|formatTimeString|addMinutes"`
Expected: 3 tests FAIL.

- [ ] **Step 3: Helpers toevoegen aan `js/lib.js`**

Locatie: bij de bestaande `dagWoord` en `daysBetween` (rond regel 80).

```js
    function parseTimeString(hhmm) {
        const [h, m] = String(hhmm).split(':').map(Number);
        return h * 60 + m;
    }

    function formatTimeString(minutes) {
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    function addMinutes(hhmm, minutes) {
        return formatTimeString(parseTimeString(hhmm) + minutes);
    }
```

En aan return-block:
```js
        parseTimeString, formatTimeString, addMinutes,
```

- [ ] **Step 4: Tests draaien**

Run: `npm test`
Expected: alle groen, +3 tests.

- [ ] **Step 5: Commit**

```bash
git add js/lib.js test/slot-finder.test.js
git commit -m "feat(slot-zoeker): tijd-helpers parseTimeString/formatTimeString/addMinutes"
```

---

## Task 3: `vindVrijeSlot` pure functie + tests

**Files:**
- Modify: `js/lib.js`
- Test: `test/slot-finder.test.js`

Kern-algoritme: geef events + startVenster + duur, retourneer eerste vrije slot of null. Events zijn `{ start: 'HH:MM', end: 'HH:MM' }` (al genormaliseerd naar HH:MM per dag door de caller).

- [ ] **Step 1: Testen toevoegen**

```js
const { vindVrijeSlot } = require('../js/lib.js');

test('vindVrijeSlot: lege dag → passeert op startVensterVan', () => {
    const slot = vindVrijeSlot([], '11:30', '12:00', 90);
    assert.deepEqual(slot, { startTime: '11:30', endTime: '13:00' });
});

test('vindVrijeSlot: dag volledig bezet → null', () => {
    const events = [{ start: '00:00', end: '23:59' }];
    assert.equal(vindVrijeSlot(events, '11:30', '12:00', 90), null);
});

test('vindVrijeSlot: overlap aan begin blokkeert 11:30, 11:45 past wel', () => {
    // Event 11:00-11:45 overlapt met 11:30 start. 11:45 past (11:45-13:15, geen conflicten).
    const events = [{ start: '11:00', end: '11:45' }];
    const slot = vindVrijeSlot(events, '11:30', '12:00', 90);
    assert.deepEqual(slot, { startTime: '11:45', endTime: '13:15' });
});

test('vindVrijeSlot: overlap aan einde blokkeert alle 11:30-12:00 starts', () => {
    // Event 12:30-14:00: 11:30-13:00 zou overlappen, 11:45-13:15 idem, 12:00-13:30 idem.
    const events = [{ start: '12:30', end: '14:00' }];
    assert.equal(vindVrijeSlot(events, '11:30', '12:00', 90), null);
});

test('vindVrijeSlot: exact aansluitend event (11:30-12:00 event, start om 12:00) past', () => {
    // Start-venster is enkel 12:00 (van==tot). Event eindigt exact 12:00, dus 12:00-13:30 past.
    const events = [{ start: '11:30', end: '12:00' }];
    const slot = vindVrijeSlot(events, '12:00', '12:00', 90);
    assert.deepEqual(slot, { startTime: '12:00', endTime: '13:30' });
});

test('vindVrijeSlot: Anders-modus (van==tot) exact tijdstip vrij', () => {
    const slot = vindVrijeSlot([], '14:00', '14:00', 60);
    assert.deepEqual(slot, { startTime: '14:00', endTime: '15:00' });
});

test('vindVrijeSlot: Anders-modus tijdstip bezet → null', () => {
    const events = [{ start: '13:30', end: '14:30' }];
    assert.equal(vindVrijeSlot(events, '14:00', '14:00', 60), null);
});

test('vindVrijeSlot: kandidaten stepping van 15 min, eerste passende wint', () => {
    // Blokkeer 11:30-11:45 én 12:00-12:20. 11:45 past niet (overlap 12:00-12:20).
    // Wacht, 11:45+90 = 13:15, dat overlapt 12:00-12:20. Dus 11:45 past niet.
    // Volgende kandidaat 12:00 zit in venster (11:30-12:00 inclusief). 12:00-13:30 overlapt 12:00-12:20 → nope.
    // Dus null. Test dat.
    const events = [
        { start: '11:30', end: '11:45' },
        { start: '12:00', end: '12:20' }
    ];
    assert.equal(vindVrijeSlot(events, '11:30', '12:00', 90), null);
});

test('vindVrijeSlot: duur langer dan tot 23:59 → null (voorbij einde dag)', () => {
    assert.equal(vindVrijeSlot([], '22:00', '22:00', 180), null);
});
```

- [ ] **Step 2: Tests draaien om falen te bevestigen**

Run: `npm test -- --test-name-pattern="vindVrijeSlot"`
Expected: 9 tests FAIL.

- [ ] **Step 3: Functie toevoegen aan `js/lib.js`**

Locatie: na `presetSpec`.

```js
    // Zoek de eerste starttijd binnen [startVensterVan, startVensterTot]
    // (stepping 15 min) waar het blok [start, start+duur) geen enkel event
    // overlapt. Voor "Anders"-modus (van==tot) wordt alleen die exacte
    // starttijd geprobeerd. Retourneert {startTime, endTime} of null.
    function vindVrijeSlot(events, startVensterVan, startVensterTot, duur, stapMinuten) {
        const stap = stapMinuten || 15;
        const eindeVanDag = 24 * 60 - 1;
        const vanMin = parseTimeString(startVensterVan);
        const totMin = parseTimeString(startVensterTot);
        const eventRanges = (events || []).map(e => ({
            start: parseTimeString(e.start),
            end: parseTimeString(e.end)
        }));

        // Voor Anders: van==tot, dus één iteratie.
        for (let kand = vanMin; kand <= totMin; kand += stap) {
            const einde = kand + duur;
            if (einde > eindeVanDag) continue;
            const overlaps = eventRanges.some(ev => kand < ev.end && einde > ev.start);
            if (!overlaps) {
                return { startTime: formatTimeString(kand), endTime: formatTimeString(einde) };
            }
            if (vanMin === totMin) break; // geen stepping in Anders-modus
        }
        return null;
    }
```

En aan return-block:
```js
        vindVrijeSlot,
```

- [ ] **Step 4: Tests draaien**

Run: `npm test`
Expected: alle groen (+9).

- [ ] **Step 5: Commit**

```bash
git add js/lib.js test/slot-finder.test.js
git commit -m "feat(slot-zoeker): vindVrijeSlot pure functie + 9 tests"
```

---

## Task 4: `bouwAgendaItems` pure functie + tests

**Files:**
- Modify: `js/lib.js`
- Test: `test/slot-finder.test.js`

Combineer bestaande events + het voorstel-slot; sorteer chronologisch. Nodig voor de agenda-mini-view in Stap 4 van de wizard.

- [ ] **Step 1: Testen toevoegen**

```js
const { bouwAgendaItems } = require('../js/lib.js');

test('bouwAgendaItems: leeg + voorstel → 1 item (voorstel)', () => {
    const items = bouwAgendaItems([], { startTime: '12:00', endTime: '13:30' }, 'Lunch met Jamiroquai');
    assert.deepEqual(items, [
        { start: '12:00', end: '13:30', title: 'Lunch met Jamiroquai', isProposal: true }
    ]);
});

test('bouwAgendaItems: gesorteerd op start-tijd', () => {
    const events = [
        { start: '14:00', end: '15:00', title: 'Klantcall' },
        { start: '09:00', end: '10:00', title: 'Standup' }
    ];
    const items = bouwAgendaItems(events, { startTime: '12:00', endTime: '13:30' }, 'Lunch');
    assert.equal(items.length, 3);
    assert.equal(items[0].title, 'Standup');
    assert.equal(items[1].title, 'Lunch');
    assert.equal(items[1].isProposal, true);
    assert.equal(items[2].title, 'Klantcall');
});

test('bouwAgendaItems: events krijgen isProposal=false', () => {
    const events = [{ start: '09:00', end: '10:00', title: 'X' }];
    const items = bouwAgendaItems(events, { startTime: '11:00', endTime: '12:00' }, 'Y');
    assert.equal(items[0].isProposal, false);
});
```

- [ ] **Step 2: Tests draaien om falen te bevestigen**

Run: `npm test -- --test-name-pattern="bouwAgendaItems"`
Expected: 3 tests FAIL.

- [ ] **Step 3: Functie toevoegen aan `js/lib.js`**

```js
    function bouwAgendaItems(events, slot, proposalTitle) {
        const items = (events || []).map(e => ({
            start: e.start,
            end: e.end,
            title: e.title,
            isProposal: false
        }));
        items.push({
            start: slot.startTime,
            end: slot.endTime,
            title: proposalTitle,
            isProposal: true
        });
        items.sort((a, b) => parseTimeString(a.start) - parseTimeString(b.start));
        return items;
    }
```

En aan return-block:
```js
        bouwAgendaItems,
```

- [ ] **Step 4: Tests draaien**

Run: `npm test`
Expected: alle groen.

- [ ] **Step 5: Commit**

```bash
git add js/lib.js test/slot-finder.test.js
git commit -m "feat(slot-zoeker): bouwAgendaItems pure functie + tests"
```

---

## Task 5: HTML skeleton — `#slot-wizard-modal` in beide HTML-files

**Files:**
- Modify: `index-dev.html` (na `#calendar-reconnect-modal`)
- Modify: `index.html` (na `#calendar-reconnect-modal`)

Bootstrap-modal met lege body (`#slot-wizard-body`) die JS gaat vullen.

- [ ] **Step 1: Zoek `#calendar-reconnect-modal` in `index-dev.html`**

```bash
grep -n "calendar-reconnect-modal" index-dev.html
```

- [ ] **Step 2: Voeg modal toe in `index-dev.html` direct na de `</div>` die de reconnect-modal sluit**

```html
        <!-- Slot-zoeker wizard (vervangt directe opening van interaction-modal
             bij "Nu afspraak maken" / "Nieuw contact vastleggen"). -->
        <div class="modal fade" id="slot-wizard-modal" tabindex="-1" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header border-0 pb-0">
                        <button type="button" class="btn-close ms-auto" data-bs-dismiss="modal" aria-label="Sluiten"></button>
                    </div>
                    <div class="modal-body pt-0" id="slot-wizard-body">
                        <!-- Filled dynamically by openSlotWizard() -->
                    </div>
                </div>
            </div>
        </div>
```

- [ ] **Step 3: Zelfde blok toevoegen in `index.html`** (identiek aan Step 2)

- [ ] **Step 4: Cache-buster ophogen in beide files**

```bash
grep -n "styles.css?v=" index-dev.html index.html
```

Verhoog het versie-suffix (bijv. `20260919a`). Beide files.

- [ ] **Step 5: Commit**

```bash
git add index-dev.html index.html
git commit -m "feat(slot-zoeker): HTML skeleton voor slot-wizard-modal"
```

---

## Task 6: CSS voor wizard

**Files:**
- Modify: `css/styles.css`

Alle wizard-styles onderaan appenden. Overschrijven mobile `.btn { width: 100% }` waar nodig.

- [ ] **Step 1: Blok appenden aan `css/styles.css`**

```css

/* --- Slot-zoeker wizard --- */

#slot-wizard-body {
    padding: 8px 4px 16px;
}
.wizard-step-title {
    font-size: 17px;
    font-weight: 700;
    color: #151A21;
    margin: 0 0 4px;
}
.wizard-step-sub {
    font-size: 12.5px;
    color: #5B6470;
    margin: 0 0 16px;
}

.preset-btn {
    display: block;
    width: 100% !important;
    margin-bottom: 10px;
    padding: 14px;
    text-align: left;
    border: 1px solid #E1E5EA;
    background: white;
    border-radius: 10px;
    cursor: pointer;
    font-family: inherit;
    box-shadow: none !important;
    transition: background 0.15s ease;
}
.preset-btn:hover { background: #F4F6F8; transform: none !important; }
.preset-btn .preset-icon { font-size: 20px; margin-right: 10px; vertical-align: -2px; }
.preset-btn .preset-title { font-size: 15px; font-weight: 600; color: #151A21; }
.preset-btn .preset-meta { font-size: 12px; color: #5B6470; margin-top: 3px; margin-left: 30px; }

.horizon-box {
    margin-top: 12px;
    padding-top: 14px;
    border-top: 1px solid #EDF0F3;
    display: flex;
    align-items: center;
    gap: 10px;
}
.horizon-box label { font-size: 13px; color: #5B6470; flex: 1; margin: 0; }
.horizon-box input { width: 70px; padding: 6px 8px; border: 1px solid #E1E5EA; border-radius: 6px; font-size: 13px; text-align: right; }

.anders-form label {
    display: block;
    font-size: 12.5px;
    color: #5B6470;
    margin: 12px 0 4px;
    font-weight: 500;
}
.anders-form input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid #E1E5EA;
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
    font-family: inherit;
}

.fallback-warn {
    background: #FFF7E6;
    border: 1px solid #F5D9A6;
    padding: 10px 12px;
    border-radius: 8px;
    font-size: 12.5px;
    color: #4A5568;
    margin-bottom: 14px;
}
.fallback-warn button {
    display: inline-block;
    margin-top: 6px;
    background: #151A21;
    color: white;
    border: 0;
    padding: 5px 12px;
    border-radius: 5px;
    font-size: 12px;
    cursor: pointer;
    box-shadow: none !important;
    width: auto !important;
}
.fallback-warn button:hover { transform: none !important; }

.wizard-loading {
    text-align: center;
    padding: 30px 0;
    color: #5B6470;
    font-size: 13px;
}
.wizard-loading .spinner {
    display: inline-block;
    width: 22px;
    height: 22px;
    border: 3px solid #E1E5EA;
    border-top-color: #151A21;
    border-radius: 50%;
    animation: slot-spin 0.8s linear infinite;
    margin-bottom: 8px;
}
@keyframes slot-spin { to { transform: rotate(360deg); } }

.slot {
    border: 1px solid #E1E5EA;
    border-radius: 10px;
    padding: 12px 14px;
    margin-bottom: 12px;
    cursor: pointer;
    background: white;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.slot:hover {
    border-color: #C6CCD4;
    box-shadow: 0 2px 6px rgba(0,0,0,0.04);
}
.slot .day-header {
    font-weight: 700;
    font-size: 14px;
    color: #151A21;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #EDF0F3;
}
.agenda-row {
    display: flex;
    gap: 10px;
    padding: 3px 0;
    font-size: 12.5px;
}
.agenda-row .time {
    color: #8A93A0;
    white-space: nowrap;
    width: 100px;
    font-variant-numeric: tabular-nums;
}
.agenda-row .title { color: #5B6470; }
.agenda-row.proposal {
    background: #FCF0EF;
    border-left: 3px solid #B23B32;
    margin: 4px -14px;
    padding: 6px 11px;
}
.agenda-row.proposal .time { color: #B23B32; font-weight: 700; }
.agenda-row.proposal .title { color: #B23B32; font-weight: 600; }
.agenda-row.empty { color: #8A93A0; font-style: italic; }

.wizard-empty {
    padding: 30px 20px;
    text-align: center;
    color: #5B6470;
}
.wizard-empty .empty-title {
    font-weight: 600;
    color: #151A21;
    margin-bottom: 4px;
}

.wizard-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
    padding-top: 14px;
    border-top: 1px solid #EDF0F3;
}
.wizard-actions button {
    padding: 9px 14px;
    border: 1px solid #E1E5EA;
    background: white;
    border-radius: 8px;
    font-size: 13px;
    cursor: pointer;
    box-shadow: none !important;
    font-family: inherit;
    width: auto !important;
}
.wizard-actions button:hover { background: #F4F6F8; transform: none !important; }
.wizard-actions .primary {
    background: #151A21;
    color: white;
    border-color: #151A21;
    margin-left: auto;
}
.wizard-actions .primary:hover { background: #1E2530; }
```

- [ ] **Step 2: Commit**

```bash
git add css/styles.css
git commit -m "feat(slot-zoeker): CSS voor wizard-flow, agenda-mini-view, fallback-warn"
```

---

## Task 7: `listCalendarEventsForDay` helper in app.js

**Files:**
- Modify: `js/app.js` (nabij `checkGoogleAvailability`)

Wrapt Google Calendar `events.list` API. Filtert all-day + declined + transparent. Retourneert `[{start:'HH:MM', end:'HH:MM', title}]` gesorteerd. Async.

- [ ] **Step 1: Zoek de bestaande `checkGoogleAvailability`-functie**

```bash
grep -n "async function checkGoogleAvailability" js/app.js
```

- [ ] **Step 2: Voeg `listCalendarEventsForDay` toe direct na `checkGoogleAvailability`**

```js
// Haal alle events op voor een datum-blok 07:00-23:00 lokale tijd.
// Retourneert een array van {start:'HH:MM', end:'HH:MM', title}
// gesorteerd op start-tijd. Filtert all-day, declined en transparent
// events uit (die tellen niet als "bezet").
async function listCalendarEventsForDay(dateStr) {
    if (!googleAccessToken) return [];

    // RFC3339 met lokale timezone-offset. new Date(...).toISOString() zou
    // naar UTC converteren en dan een verkeerd dag-venster geven.
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
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`;

    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${googleAccessToken}` }
        });
        if (!res.ok) return [];
        const data = await res.json();
        const items = data.items || [];

        return items
            .filter(ev => {
                if (!ev.start || !ev.start.dateTime) return false; // skip all-day
                if (ev.transparency === 'transparent') return false; // skip vrij-blokken
                // Declined: kijk in ev.attendees waar self === true
                if (ev.attendees && ev.attendees.some(a => a.self && a.responseStatus === 'declined')) return false;
                return true;
            })
            .map(ev => {
                const s = new Date(ev.start.dateTime);
                const e = new Date(ev.end.dateTime);
                const fmt = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
                return { start: fmt(s), end: fmt(e), title: ev.summary || '(geen titel)' };
            })
            .sort((a, b) => a.start.localeCompare(b.start));
    } catch (err) {
        console.warn('listCalendarEventsForDay faalde:', err);
        return [];
    }
}
```

- [ ] **Step 3: Syntax-check**

Run: `node --check js/app.js`
Expected: geen output (=OK).

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(slot-zoeker): listCalendarEventsForDay helper (Calendar events.list + filter)"
```

---

## Task 8: `openSlotWizard` entry-point + preset-scherm renderen

**Files:**
- Modify: `js/app.js` (nabij `openNewInteraction`)

`openSlotWizard(contactId)` opent de modal en toont Stap 1 (preset-keuze).

- [ ] **Step 1: Zoek de bestaande `openNewInteraction`-functie**

```bash
grep -n "function openNewInteraction" js/app.js
```

- [ ] **Step 2: Voeg wizard-state + `openSlotWizard` toe direct boven `openNewInteraction`**

```js
// --- Slot-zoeker wizard ---------------------------------------------------

let slotWizardModal = null;
let slotWizardState = {
    contactId: null,
    step: 'preset',       // 'preset' | 'anders' | 'loading' | 'results'
    preset: null,         // 'lunch' | 'diner' | 'anders'
    andersInput: { starttijd: '14:00', duur: 60 },
    horizon: 30,
    proposals: []         // gevuld in results-stap
};

function openSlotWizard(contactId) {
    slotWizardState = {
        contactId,
        step: 'preset',
        preset: null,
        andersInput: { starttijd: '14:00', duur: 60 },
        horizon: 30,
        proposals: []
    };
    const el = document.getElementById('slot-wizard-modal');
    if (!el) {
        // Fallback: als de modal-HTML ontbreekt, gewoon direct interaction openen.
        showInteractionModal(contactId);
        return;
    }
    if (!slotWizardModal) slotWizardModal = new bootstrap.Modal(el);
    renderWizard();
    slotWizardModal.show();
}

function renderWizard() {
    const body = document.getElementById('slot-wizard-body');
    if (!body) return;
    if (slotWizardState.step === 'preset') return renderWizardPreset(body);
    if (slotWizardState.step === 'anders') return renderWizardAnders(body);
    if (slotWizardState.step === 'loading') return renderWizardLoading(body);
    if (slotWizardState.step === 'results') return renderWizardResults(body);
}

function renderWizardPreset(body) {
    const contact = contactsData.find(c => c.id === slotWizardState.contactId);
    const contactName = contact ? contact.name : '';
    const fallback = !googleAccessToken;

    body.innerHTML = `
        <h2 class="wizard-step-title">Zoek een vrij moment</h2>
        <p class="wizard-step-sub">${escapeHtml('Voor afspraak met ' + contactName)}</p>

        ${fallback ? `
            <div class="fallback-warn">
                <b>Google Calendar niet verbonden.</b> De zoeker toont slots zonder agenda-check. Elke dag in de horizon krijgt één voorstel.
                <br><button type="button" data-action="connect">Nu verbinden</button>
            </div>
        ` : ''}

        <button class="preset-btn" type="button" data-preset="lunch">
            <span class="preset-icon">🍽</span><span class="preset-title">Lunch</span>
            <div class="preset-meta">Start tussen 11:30–12:00 · 90 min</div>
        </button>
        <button class="preset-btn" type="button" data-preset="diner">
            <span class="preset-icon">🍷</span><span class="preset-title">Diner</span>
            <div class="preset-meta">Start tussen 18:00–19:30 · 3 uur</div>
        </button>
        <button class="preset-btn" type="button" data-preset="anders">
            <span class="preset-icon">⚙️</span><span class="preset-title">Anders</span>
            <div class="preset-meta">Eigen tijd + duur</div>
        </button>

        <div class="horizon-box">
            <label>Aantal dagen vooruit</label>
            <input type="number" min="1" max="365" value="${slotWizardState.horizon}" id="wizard-horizon-input">
        </div>
    `;

    body.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => handlePresetPick(btn.dataset.preset));
    });
    const horizonInput = body.querySelector('#wizard-horizon-input');
    horizonInput.addEventListener('change', () => {
        const v = parseInt(horizonInput.value, 10);
        if (v > 0 && v <= 365) slotWizardState.horizon = v;
    });
    const connectBtn = body.querySelector('[data-action="connect"]');
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            connectGoogleCalendar(
                () => renderWizard(),  // success: rerender zonder fallback-warn
                () => {}                // failure: blijf in fallback
            );
        });
    }
}

function handlePresetPick(preset) {
    slotWizardState.preset = preset;
    if (preset === 'anders') {
        slotWizardState.step = 'anders';
        renderWizard();
    } else {
        slotWizardState.step = 'loading';
        renderWizard();
        searchSlots();
    }
}
```

- [ ] **Step 3: Stubs toevoegen voor de andere render-functies + `searchSlots` (voorlopig placeholder)**

Direct na `handlePresetPick`:

```js
function renderWizardAnders(body) { body.innerHTML = '<p>Anders-stap komt in Task 9</p>'; }
function renderWizardLoading(body) { body.innerHTML = '<p>Loading komt in Task 10</p>'; }
function renderWizardResults(body) { body.innerHTML = '<p>Results komen in Task 11</p>'; }
function searchSlots() { console.log('searchSlots stub — Task 10'); }
```

- [ ] **Step 4: Syntax-check**

Run: `node --check js/app.js`

- [ ] **Step 5: Manuele test in de browser (Vandaag-tab, klik "Nu afspraak maken")**

**Nog niet gewired via `openNewInteraction`. Test via console:**

```js
openSlotWizard(contactsData[0].id)
```

Expected: modal opent met preset-scherm. Als je op Anders klikt: stub-tekst. Klik op Lunch/Diner: stub-tekst (loading). Als je niet verbonden bent met Calendar: fallback-warn zichtbaar.

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat(slot-zoeker): openSlotWizard + preset-scherm"
```

---

## Task 9: `renderWizardAnders` — starttijd + duur inputs

**Files:**
- Modify: `js/app.js` (vervang de stub uit Task 8)

- [ ] **Step 1: Vervang de stub-implementatie**

```js
function renderWizardAnders(body) {
    const s = slotWizardState.andersInput;
    const fallback = !googleAccessToken;

    body.innerHTML = `
        <h2 class="wizard-step-title">Eigen tijd</h2>
        <p class="wizard-step-sub">Kies exacte tijd en duur</p>

        ${fallback ? `
            <div class="fallback-warn">
                <b>Google Calendar niet verbonden.</b> De zoeker toont slots zonder agenda-check.
                <br><button type="button" data-action="connect">Nu verbinden</button>
            </div>
        ` : ''}

        <div class="anders-form">
            <label for="wizard-anders-tijd">Starttijd</label>
            <input type="time" id="wizard-anders-tijd" value="${s.starttijd}">
            <label for="wizard-anders-duur">Duur (minuten)</label>
            <input type="number" id="wizard-anders-duur" min="15" step="15" value="${s.duur}">
        </div>

        <div class="wizard-actions">
            <button type="button" data-action="back">Terug</button>
            <button type="button" class="primary" data-action="search">Zoek slots</button>
        </div>
    `;

    body.querySelector('[data-action="back"]').addEventListener('click', () => {
        slotWizardState.step = 'preset';
        renderWizard();
    });
    body.querySelector('[data-action="search"]').addEventListener('click', () => {
        slotWizardState.andersInput.starttijd = body.querySelector('#wizard-anders-tijd').value;
        slotWizardState.andersInput.duur = parseInt(body.querySelector('#wizard-anders-duur').value, 10) || 60;
        slotWizardState.step = 'loading';
        renderWizard();
        searchSlots();
    });
    const connectBtn = body.querySelector('[data-action="connect"]');
    if (connectBtn) {
        connectBtn.addEventListener('click', () => {
            connectGoogleCalendar(() => renderWizard(), () => {});
        });
    }
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/app.js`

- [ ] **Step 3: Manuele test — console**

```js
openSlotWizard(contactsData[0].id)
// Klik "Anders" → tijd + duur velden zichtbaar → wijzig 15:00 90 → klik "Zoek slots"
```

Expected: loading-stub verschijnt.

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(slot-zoeker): Anders-stap met starttijd + duur inputs"
```

---

## Task 10: `renderWizardLoading` + `searchSlots` (kern-logica)

**Files:**
- Modify: `js/app.js`

Loading-view + de daadwerkelijke zoek-orchestratie: per dag events ophalen, `vindVrijeSlot` aanroepen, 5 voorstellen verzamelen, dan naar results.

- [ ] **Step 1: Vervang de stub-implementaties**

```js
function renderWizardLoading(body) {
    body.innerHTML = `
        <div class="wizard-loading">
            <div class="spinner"></div>
            <div>${googleAccessToken ? 'Zoeken in Google Calendar…' : 'Voorstellen genereren…'}</div>
        </div>
    `;
}

async function searchSlots() {
    const spec = presetSpec(slotWizardState.preset, slotWizardState.andersInput);
    if (!spec) {
        slotWizardState.proposals = [];
        slotWizardState.step = 'results';
        renderWizard();
        return;
    }

    const proposals = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let dayOffset = 0; dayOffset < slotWizardState.horizon; dayOffset++) {
        if (proposals.length >= 5) break;

        const d = new Date(today);
        d.setDate(d.getDate() + dayOffset);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

        let events = [];
        let slot;

        if (googleAccessToken) {
            events = await listCalendarEventsForDay(dateStr);
            slot = vindVrijeSlot(events, spec.startVensterVan, spec.startVensterTot, spec.duur);
        } else {
            // Fallback: geen check, gebruik gewoon de preset-start.
            slot = { startTime: spec.startVensterVan, endTime: addMinutes(spec.startVensterVan, spec.duur) };
        }

        if (slot) {
            proposals.push({ dateStr, date: d, slot, events });
        }
    }

    slotWizardState.proposals = proposals;
    slotWizardState.step = 'results';
    renderWizard();
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/app.js`

- [ ] **Step 3: Manuele test — console (verbonden met Google Calendar)**

```js
openSlotWizard(contactsData[0].id)
// Klik Lunch → loading-spinner ~1-3 sec → results-stub (Task 11)
// Check console: geen errors
```

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(slot-zoeker): loading-state + searchSlots orchestratie"
```

---

## Task 11: `renderWizardResults` met agenda-mini-view

**Files:**
- Modify: `js/app.js`

Toont max 5 voorstellen, elk als mini-dag-agenda met voorstel-rij gemarkeerd.

- [ ] **Step 1: Vervang de stub**

```js
function renderWizardResults(body) {
    const spec = presetSpec(slotWizardState.preset, slotWizardState.andersInput);
    const proposals = slotWizardState.proposals;
    const contact = contactsData.find(c => c.id === slotWizardState.contactId);
    const contactName = contact ? contact.name : '';
    const proposalTitle = spec && spec.titelTemplate
        ? spec.titelTemplate.replace('{naam}', contactName)
        : 'Afspraak (voorstel)';

    const labelParts = [];
    if (slotWizardState.preset === 'lunch') labelParts.push('🍽 Lunch · 90 min');
    else if (slotWizardState.preset === 'diner') labelParts.push('🍷 Diner · 3 uur');
    else labelParts.push(`⚙️ Eigen · ${slotWizardState.andersInput.duur} min`);
    labelParts.push(`komende ${slotWizardState.horizon} dagen`);

    body.innerHTML = `
        <h2 class="wizard-step-title">Voorstellen</h2>
        <p class="wizard-step-sub">${escapeHtml(labelParts.join(' · '))}</p>

        ${proposals.length === 0 ? `
            <div class="wizard-empty">
                <div class="empty-title">Geen vrije slots gevonden</div>
                <div>Probeer een langere horizon of andere tijden.</div>
            </div>
        ` : proposals.map((p, i) => {
            const items = bouwAgendaItems(p.events, p.slot, proposalTitle);
            const dayLabel = `${['zo','ma','di','wo','do','vr','za'][p.date.getDay()]} ${p.date.getDate()} ${['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'][p.date.getMonth()]}`;
            return `
                <div class="slot" data-proposal-index="${i}">
                    <div class="day-header">${escapeHtml(dayLabel)}</div>
                    ${items.length === 1 ? '<div class="agenda-row empty"><span class="time">Verder niks</span></div>' : ''}
                    ${items.map(it => `
                        <div class="agenda-row ${it.isProposal ? 'proposal' : ''}">
                            <span class="time">${escapeHtml(it.start)}–${escapeHtml(it.end)}</span>
                            <span class="title">${escapeHtml(it.title)}${it.isProposal ? ' ← voorstel' : ''}</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('')}

        <div class="wizard-actions">
            <button type="button" data-action="back">Terug</button>
        </div>
    `;

    body.querySelectorAll('.slot[data-proposal-index]').forEach(el => {
        el.addEventListener('click', () => {
            const idx = parseInt(el.dataset.proposalIndex, 10);
            chooseSlot(idx);
        });
    });
    body.querySelector('[data-action="back"]').addEventListener('click', () => {
        slotWizardState.step = 'preset';
        renderWizard();
    });
}

function chooseSlot(idx) {
    // Stub — invulling in Task 12.
    console.log('chooseSlot', idx, slotWizardState.proposals[idx]);
}
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/app.js`

- [ ] **Step 3: Manuele test — happy path**

```js
openSlotWizard(contactsData[0].id)
// Klik Lunch → loading → 5 voorstellen met agenda-mini-view + rood voorstel-rij
// Klik een voorstel → console.log('chooseSlot', ...)
```

- [ ] **Step 4: Commit**

```bash
git add js/app.js
git commit -m "feat(slot-zoeker): results-scherm met agenda-mini-view en voorstel-highlight"
```

---

## Task 12: `chooseSlot` → sluit wizard, open interaction-modal voorgevuld

**Files:**
- Modify: `js/app.js`

- [ ] **Step 1: Zoek `showInteractionModal`-functie**

```bash
grep -n "function showInteractionModal" js/app.js
```

- [ ] **Step 2: Vervang de stub `chooseSlot`**

```js
function chooseSlot(idx) {
    const proposal = slotWizardState.proposals[idx];
    if (!proposal) return;

    const spec = presetSpec(slotWizardState.preset, slotWizardState.andersInput);
    const contact = contactsData.find(c => c.id === slotWizardState.contactId);
    const contactName = contact ? contact.name : '';
    const title = spec && spec.titelTemplate
        ? spec.titelTemplate.replace('{naam}', contactName)
        : null;

    // Slot-wizard bewaren we in een prefill-payload; sluit wizard eerst,
    // dan opent showInteractionModal en zetten we de velden.
    const prefill = {
        date: proposal.dateStr,
        start_time: proposal.slot.startTime,
        end_time: proposal.slot.endTime,
        title
    };

    if (slotWizardModal) slotWizardModal.hide();
    setTimeout(() => {
        showInteractionModal(slotWizardState.contactId, null, prefill);
    }, 300); // Bootstrap-modal-transition
}
```

- [ ] **Step 3: `showInteractionModal` uitbreiden om `prefill` te accepteren**

Zoek de functie, direct na de vorm-reset + default-set (dus vóór de `if (interactionId)` bewerk-modus check). Voeg dit blok toe:

```js
    // Slot-zoeker prefill (Task 12 van de slot-zoeker plan).
    // Alleen bij NIEUWE afspraken (interactionId is null).
    if (!interactionId && prefill) {
        if (prefill.date) document.getElementById('interaction-date').value = prefill.date;
        if (prefill.start_time) document.getElementById('interaction-start-time').value = prefill.start_time;
        if (prefill.end_time) document.getElementById('interaction-end-time').value = prefill.end_time;
        if (prefill.title) {
            const titleEl = document.getElementById('interaction-title');
            if (!titleEl.value) titleEl.value = prefill.title;
        }
    }
```

Ook de signature aanpassen:
```js
function showInteractionModal(contactId, interactionId = null, prefill = null) {
```

- [ ] **Step 4: Syntax-check**

Run: `node --check js/app.js`

- [ ] **Step 5: Manuele test — full flow**

```js
openSlotWizard(contactsData[0].id)
// Klik Lunch → loading → results → klik derde voorstel
// Interaction-modal opent met datum + tijden + titel "Lunch met <naam>" ingevuld
```

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat(slot-zoeker): chooseSlot opent interaction-modal met prefill (datum, tijden, titel)"
```

---

## Task 13: Wire `openNewInteraction` naar wizard

**Files:**
- Modify: `js/app.js`

Nu gebruiken alle trigger-punten (`handlePlan`, `add-interaction-btn`, `log-interaction-btn`) al `openNewInteraction`. Deze functie moet nu de wizard openen i.p.v. de interaction-modal.

- [ ] **Step 1: Zoek huidige implementatie**

```bash
grep -n "function openNewInteraction" js/app.js
```

- [ ] **Step 2: Bekijk de huidige body van de functie**

Verwacht: `openNewInteraction(contactId)` doet nu de Calendar-reconnect-check en roept dan `showInteractionModal(contactId)` aan.

- [ ] **Step 3: Vervang de aanroepen van `showInteractionModal(contactId)` (zonder interactionId) door `openSlotWizard(contactId)`**

De reconnect-flow is dezelfde. Alleen de eind-actie verandert. Concreet: in de handlers voor reconnect-success en skip roept de code straks `openSlotWizard(contactId)` aan i.p.v. `showInteractionModal(contactId)`.

Voorbeeld (verifieer exact tegen de huidige code):
```js
// Voorheen:
if (typeof showInteractionModal === 'function') {
    showInteractionModal(contactId);
}

// Wordt:
openSlotWizard(contactId);
```

Herhaal voor alle plekken in `openNewInteraction` en in `handleCalendarReconnectClick` / `handleCalendarSkipClick` waar de eind-actie was: `showInteractionModal(contactId)` (zonder interactionId).

- [ ] **Step 4: Syntax-check**

Run: `node --check js/app.js`

- [ ] **Step 5: Manuele test — via echte UI-knoppen**

Refresh browser (hard: Cmd+Shift+R). Ga naar Vandaag-kaart, klik "Nu afspraak maken". Wizard moet openen.

Expected: wizard opent bij:
- `Nu afspraak maken` op Vandaag-kaart
- `Nu afspraak maken` in details-modal
- `Nieuw contact vastleggen` in details-modal (add-interaction-btn)

- [ ] **Step 6: Regressie-check op edit-flow**

In details-modal: klik op een historie-item (Bewerken van een bestaande interactie). Verwacht: **bestaande interaction-modal opent direct (geen wizard)** want interactionId is meegegeven.

- [ ] **Step 7: Commit**

```bash
git add js/app.js
git commit -m "feat(slot-zoeker): openNewInteraction opent wizard i.p.v. interaction-modal"
```

---

## Task 14: Verificatie — testset draait groen + node --check

**Files:** geen wijzigingen; alleen verificatie.

- [ ] **Step 1: Full test-suite draaien**

Run: `npm test`
Expected: alle tests groen. Aantal moet gestegen zijn met de nieuwe slot-finder tests (Task 1-4). Verwacht: ~65+ tests.

- [ ] **Step 2: Syntax-check beide files**

Run: `node --check js/lib.js && node --check js/app.js`
Expected: geen output.

- [ ] **Step 3: Als iets faalt: fix voor je door gaat**

- [ ] **Step 4: Commit** (alleen als er nog uncommitte fixes zijn — anders skip)

```bash
git add -A
git commit -m "chore(slot-zoeker): fix van verificatie-check"
```

---

## Task 15: README bijwerken

**Files:**
- Modify: `README.md`

Nieuwe feature vermelden in de Functies-sectie.

- [ ] **Step 1: Zoek de bullet "📅 Google Calendar-integratie"**

```bash
grep -n "Google Calendar-integratie" README.md
```

- [ ] **Step 2: Voeg direct daarna (of net ervoor) een nieuwe bullet toe**

```markdown
### 🔍 Slot-zoeker (wizard bij nieuwe afspraak)
- Bij het aanmaken van een nieuwe afspraak opent eerst een wizard i.p.v. het lege formulier.
- Kies **Lunch** (11:30–12:00 · 90 min), **Diner** (18:00–19:30 · 3 uur) of **Anders** (eigen tijd + duur).
- Instelbaar hoeveel dagen vooruit (default 30).
- App zoekt via Google Calendar naar de eerste 5 dagen waarin je gekozen venster + duur past.
- Elk voorstel wordt getoond als mini-dag-agenda: bestaande afspraken die dag + het voorstel-slot, chronologisch, voorstel gemarkeerd in rood.
- Klik op een voorstel → het formulier opent met datum, tijd én titel ("Lunch met {naam}" of "Diner met {naam}") ingevuld.
- Zonder Google Calendar-verbinding: wizard werkt beperkt (geen agenda-check) met een uitleg en optie om alsnog te verbinden.
```

- [ ] **Step 3: Projectstructuur-sectie bijwerken**

Voeg toe onder `test/`:
```
│   └── slot-finder.test.js       # Tests voor vindVrijeSlot, presetSpec, bouwAgendaItems
```

En onder `docs/superpowers/specs/`:
```
│   └── plans/                    # Implementatie-plannen bij specs
```

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): slot-zoeker feature + tests toevoegen aan structuur"
```

---

## Task 16: E2E manuele verificatie op productie-branch

**Files:** geen wijzigingen.

Voor deze test draai je de dev-server (`python3 -m http.server 8765`) en test je alle scenarios in de browser.

- [ ] **Step 1: Server starten en `index-dev.html` openen**

```bash
python3 -m http.server 8765 &
open http://localhost:8765/index-dev.html
```

Inloggen op je dev-account.

- [ ] **Step 2: Happy path — Lunch met Calendar**

- [ ] Klik "Nu afspraak maken" op een Vandaag-kaart
- [ ] Wizard opent, preset-scherm zichtbaar, horizon = 30
- [ ] Klik "Lunch"
- [ ] Loading-spinner (~1-3 sec)
- [ ] 5 voorstellen zichtbaar, elk met agenda-mini-view + rode voorstel-rij
- [ ] Klik voorstel #3
- [ ] Interaction-modal opent met: titel = "Lunch met {contactnaam}", datum + tijden gevuld
- [ ] Klik Opslaan
- [ ] Afspraak zichtbaar in Overzicht onder "Afspraak staat al"

- [ ] **Step 3: Happy path — Diner**

- [ ] Klik "Nu afspraak maken" op een andere kaart
- [ ] Klik "Diner"
- [ ] 5 voorstellen 18:00 of later, incl. weekenden
- [ ] Klik een voorstel
- [ ] Titel = "Diner met {contactnaam}"

- [ ] **Step 4: Happy path — Anders**

- [ ] Wizard, klik "Anders"
- [ ] Voer 15:00 en 60 min in
- [ ] Klik "Zoek slots"
- [ ] Voorstellen op 15:00 (of null als 15:00 bezet is → melding)
- [ ] Klik een voorstel
- [ ] Titel = leeg (Anders vult geen titel)

- [ ] **Step 5: Fallback — zonder Calendar**

- [ ] In de menu, klik Google Calendar → ontkoppel (of test in incognito)
- [ ] Klik "Nu afspraak maken"
- [ ] Gele fallback-warn zichtbaar in Stap 1
- [ ] Klik "Anders", 14:00 60 min, "Zoek slots"
- [ ] Fallback-warn ook zichtbaar in Stap 2 (verifieer: wizard opnieuw openen na "Anders")
- [ ] Elke dag krijgt één voorstel op de opgegeven tijd
- [ ] Kies er een → interaction-modal opent

- [ ] **Step 6: Regressie — bewerken bestaande afspraak**

- [ ] Ga naar Vandaag → klik naam van contact → details-modal
- [ ] Klik een historie-item
- [ ] Interaction-modal opent DIRECT in bewerk-modus (geen wizard)

- [ ] **Step 7: Sluiten en heropenen**

- [ ] Wizard openen, sluit met X
- [ ] Interaction-modal opent NIET
- [ ] Opnieuw "Nu afspraak maken" klikken: wizard begint bij Stap 1 (state reset)

Als alle 6 subchecks slagen: klaar. Anders: fix voor je verder gaat.

- [ ] **Step 8: Commit** (indien laatste fixes)

```bash
git add -A
git commit -m "chore(slot-zoeker): E2E-verificatie afgerond"
```

---

## Task 17: Merge naar main + productie-deploy

**Files:** geen wijzigingen.

Dit volgt de bestaande productie-runbook (`docs/runbook-productie.md`), maar korter want er zijn geen DB- of Edge-Function-wijzigingen.

- [ ] **Step 1: Feature-branch pushen (indien nog niet)**

```bash
git push origin <feature-branch-naam>
```

- [ ] **Step 2: Switch naar main, pull, merge, push**

```bash
git checkout main
git pull origin main
git merge <feature-branch-naam> --no-ff -m "Slot-zoeker wizard bij nieuwe afspraak"
git push origin main
```

- [ ] **Step 3: Verifieer live op github.io**

Wacht ~2 min voor GitHub Pages deploy. Ga naar https://quaiongen.github.io/contactbeheer/, hard refresh (Cmd+Shift+R). Doorloop Happy path — Lunch (Step 2 van Task 16) op de live URL.

- [ ] **Step 4: Klaar!**

Backlog niet bijgewerkt (geen openstaande sub-punten uit deze feature).

---

## Buiten scope van dit plan

Zie de spec-sectie "Buiten scope" — o.a. duur bijstellen in voorstellen, werkdagen-filter, drag-en-drop, meerdere agenda's, en uitnodigings-flow.
