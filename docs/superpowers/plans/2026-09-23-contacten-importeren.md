# Contacten importeren uit telefoon — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een 4-staps wizard waarmee een gebruiker een vCard-export (`.vcf`) uit iPhone/Android inleest, per contact kiest wat er binnenkomt en dat in Supabase importeert.

**Architecture:** Pure vCard-logica (parser, mapper, default-picker, auth-error-check) in `js/lib.js` met `node --test`-tests. De wizard (modal, state, 4 stappen, insert-loop, triggers) leeft in een eigen sectie onderaan `js/app.js`. Geen SQL, geen edge function. De bestaande JSON-import (`handleImportFile`) blijft ongewijzigd.

**Tech Stack:** Vanilla JS, Bootstrap 5.3 modal, Supabase JS v2, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-23-contacten-importeren-design.md` (commit `2bbf3f7`).

**Afwijkingen / verduidelijkingen t.o.v. de spec (bewust, na code-check):**
- `isImportAuthError` accepteert naast 401 / `PGRST301` / `42501` ook `PGRST303` (JWT expired, PostgREST 12+), en de insert-loop geeft `{ ...error, status }` door omdat `status` in supabase-js v2 op het response staat, niet op de error.
- Nieuw geïmporteerde contacten worden in `contactsData` gepusht **mét `interactions: []`** (en `categoryId: null`). `lib.js` (`getPastInteractions`, `hasFuturePlannedInteraction`) leest `contact.interactions`; de spec noemde dit veld niet.
- `mapped`/`picked`/`seenNamesInFile` uit de spec worden in de wizard-state één array `rows: [{contact, picked, badge}]` (badge = `null | 'exists' | 'dup'`). Gedrag identiek; centrale selectie-state blijft onaangeroerd door de zoekbalk.
- `isImportAuthError` is een pure functie in `lib.js` zodat hij getest kan worden.
- De auto-trigger-guard "geen deep-link" wordt gedekt door de modal-check (`.modal.show`, `.modal-backdrop`, `modal-open`) + wachten op `hidden.bs.modal` (de `#instellingen`-hash opent een modal); een aparte hash-check is niet nodig.

**Bestanden:**

| Bestand | Wijziging |
|---|---|
| `js/lib.js` | + `unescapeVCardText`, `parseVCard`, `mapVCardToContact`, `selectDefaultPicked`, `isImportAuthError` (+ exports) |
| `test/vcard.test.js` | nieuw |
| `index.html`, `index-dev.html` | + menu-item `#import-phone-btn`, + modal `#import-phone-wizard-modal`, cache-buster bump |
| `css/styles.css` | + `.import-wizard-*`, `.platform-card`, `.export-steps`, `.contact-row` e.d. |
| `js/app.js` | + wizard-sectie; hooks in `loadDataFromSupabase`, `handleLogout`, `onAuthStateChange(false)`, menu-listener |
| `CLAUDE.md` | cache-buster-regel verduidelijken (Task 11, optioneel klein) |

**Hard gates (wachtpunten voor de user) in dit plan:** Task 9 (Android-validatie), Task 10 (`git push`, Notion). Geen SQL- of edge-function-gate: niet van toepassing.

---

## Fase A — Pure logica (TDD, `node --test`)

### Task 1: `unescapeVCardText` + `parseVCard`

**Files:**
- Modify: `js/lib.js` (nieuwe sectie vóór de `return {` op ~regel 397; exports onderaan)
- Create: `test/vcard.test.js`

- [ ] **Step 1: Schrijf de falende tests**

Maak `test/vcard.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseVCard, unescapeVCardText } = require('../js/lib.js');

const wrap = (...lines) => ['BEGIN:VCARD', 'VERSION:3.0', ...lines, 'END:VCARD'].join('\r\n');

test('parse: iPhone-export (FN, TEL;type=CELL, EMAIL)', () => {
    const [c] = parseVCard(wrap('FN:Anna Bloem', 'N:Bloem;Anna;;;', 'TEL;type=CELL;type=VOICE;type=pref:+31 6 12345678', 'EMAIL;type=INTERNET;type=HOME:Anna@Example.com'));
    assert.equal(c.FN, 'Anna Bloem');
    assert.equal(c.N, 'Bloem;Anna;;;');
    assert.deepEqual(c.TEL[0].params.type, ['CELL', 'VOICE', 'pref']);
    assert.equal(c.TEL[0].value, '+31 6 12345678');
    assert.equal(c.EMAIL[0].value, 'Anna@Example.com');
});

test('parse: Google-export met meerdere TEL en ORG', () => {
    const [c] = parseVCard(wrap('FN:Bart Jansen', 'ORG:Acme BV;Sales', 'TEL:0201234567', 'TEL;TYPE=CELL:0612345678'));
    assert.equal(c.TEL.length, 2);
    assert.equal(c.TEL[0].params.type, undefined);
    assert.equal(c.ORG, 'Acme BV');
});

test('parse: meerdere BEGIN:VCARD-blokken', () => {
    const text = wrap('FN:A') + '\r\n' + wrap('FN:B') + '\r\n';
    assert.deepEqual(parseVCard(text).map(c => c.FN), ['A', 'B']);
});

test('parse: line-folding, alle vier de varianten', () => {
    for (const fold of ['\r\n ', '\r\n\t', '\n ', '\n\t']) {
        const text = 'BEGIN:VCARD\nVERSION:3.0\nFN:Anna Bl' + fold + 'oem\nEND:VCARD';
        assert.equal(parseVCard(text)[0].FN, 'Anna Bloem', JSON.stringify(fold));
    }
});

test('parse: komma-gescheiden TYPE', () => {
    const [c] = parseVCard(wrap('FN:X', 'TEL;TYPE=CELL,VOICE:0612345678'));
    assert.deepEqual(c.TEL[0].params.type, ['CELL', 'VOICE']);
});

test('parse: kale type-parameter (vCard 2.1/3.0 stijl) en groep-prefix', () => {
    const [c] = parseVCard(wrap('FN:X', 'item1.TEL;CELL:0612345678'));
    assert.deepEqual(c.TEL[0].params.type, ['CELL']);
});

test('parse: vCard 4.0 tel:-prefix wordt gestript', () => {
    const [c] = parseVCard(wrap('FN:X', 'TEL:tel:+31612345678'));
    assert.equal(c.TEL[0].value, '+31612345678');
});

test('unescape: \\n, \\N, \\, \\; en \\\\', () => {
    assert.equal(unescapeVCardText('a\\nb'), 'a\nb');
    assert.equal(unescapeVCardText('a\\Nb'), 'a\nb');
    assert.equal(unescapeVCardText('a\\,b\\;c'), 'a,b;c');
    assert.equal(unescapeVCardText('a\\\\b'), 'a\\b');
});

test('unescape: \\\\n is een letterlijke backslash-n, geen newline', () => {
    assert.equal(unescapeVCardText('a\\\\nb'), 'a\\nb');
});

test('parse: NOTE wordt gedecodeerd', () => {
    const [c] = parseVCard(wrap('FN:X', 'NOTE:regel1\\nregel2\\, ok\\\\nlit'));
    assert.equal(c.NOTE, 'regel1\nregel2, ok\\nlit');
});

test('parse: BDAY komt raw terug (mapper beslist)', () => {
    for (const raw of ['1985-03-12', '19850312', '--0312', 'onzin']) {
        assert.equal(parseVCard(wrap('FN:X', 'BDAY:' + raw))[0].BDAY, raw);
    }
});

test('parse: leeg bestand → []', () => {
    assert.deepEqual(parseVCard(''), []);
    assert.deepEqual(parseVCard('   \n'), []);
});

test('parse: blok zonder END:VCARD → []', () => {
    assert.deepEqual(parseVCard('BEGIN:VCARD\nVERSION:3.0\nFN:X\n'), []);
});

test('parse: BOM aan het begin wordt genegeerd', () => {
    assert.equal(parseVCard('﻿' + wrap('FN:Anna'))[0].FN, 'Anna');
});

test('parse: onbekende velden en PHOTO breken niets', () => {
    const [c] = parseVCard(wrap('FN:X', 'PHOTO;ENCODING=b;TYPE=JPEG:AAAA', 'X-FOO:bar'));
    assert.equal(c.FN, 'X');
});
```

- [ ] **Step 2: Run tests, verwacht FAIL**

Run: `cd /Users/quaiongen/.buzz/REPOS/contactbeheer && node --test test/vcard.test.js`
Expected: FAIL (`parseVCard is not a function`).

- [ ] **Step 3: Implementeer in `js/lib.js`**

Voeg toe vóór de `return {`-regel (binnen de factory):

```js
    // --- vCard-import -----------------------------------------------------

    // Decodeer vCard TEXT-escapes. Volgorde: eerst splitsen op `\\` zodat een
    // letterlijke backslash-n (`\\n`) niet als newline wordt gelezen.
    function unescapeVCardText(s) {
        return String(s).split('\\\\').map(part =>
            part.replace(/\\[nN]/g, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';')
        ).join('\\');
    }

    const VCARD_SINGLE_FIELDS = ['FN', 'N', 'BDAY', 'NOTE', 'ORG', 'PHOTO', 'ADR', 'TITLE', 'URL', 'NICKNAME', 'REV'];

    /**
     * Parse een .vcf-tekst (één of meer vCards) naar ruwe objecten.
     * TEL/EMAIL zijn arrays van {value, params:{type?: string[]}}.
     * FN/NOTE/ORG zijn gedecodeerd; N en BDAY blijven raw (mapper beslist).
     */
    function parseVCard(text) {
        if (typeof text !== 'string') return [];
        const lines = text
            .replace(/^﻿/, '')
            .replace(/\r\n|\r/g, '\n')
            .replace(/\n[ \t]/g, '')      // unfold: dekt \r\n␠, \r\n\t, \n␠, \n\t
            .split('\n');
        const cards = [];
        let cur = null;
        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            const upper = line.toUpperCase();
            if (upper === 'BEGIN:VCARD') { cur = { TEL: [], EMAIL: [] }; continue; }
            if (upper === 'END:VCARD') { if (cur) cards.push(cur); cur = null; continue; }
            if (!cur) continue;
            const colon = line.indexOf(':');
            if (colon < 0) continue;
            const head = line.slice(0, colon).split(';');
            let value = line.slice(colon + 1);
            const name = head[0].split('.').pop().toUpperCase(); // groep-prefix "item1." weg
            const types = [];
            for (const p of head.slice(1)) {
                const eq = p.indexOf('=');
                const key = (eq < 0 ? 'type' : p.slice(0, eq)).toLowerCase();
                const val = eq < 0 ? p : p.slice(eq + 1);
                if (key === 'type') val.split(',').map(t => t.trim()).filter(Boolean).forEach(t => types.push(t));
            }
            const params = types.length ? { type: types } : {};
            if (name === 'TEL' || name === 'EMAIL') {
                if (name === 'TEL') value = value.replace(/^tel:/i, '');
                cur[name].push({ value: value.trim(), params });
            } else if (VCARD_SINGLE_FIELDS.includes(name) && cur[name] === undefined) {
                if (name === 'FN' || name === 'NOTE') value = unescapeVCardText(value);
                else if (name === 'ORG') value = unescapeVCardText(value.split(/(?<!\\);/)[0]);
                cur[name] = value.trim();
            }
        }
        return cards;
    }
```

Voeg toe aan de `return { ... }` (nieuw blok onderaan, na `moetDigestVandaag`; let op de komma):

```js
        moetDigestVandaag,
        // vCard-import
        unescapeVCardText,
        parseVCard
```

- [ ] **Step 4: Run tests, verwacht PASS**

Run: `node --test test/vcard.test.js`
Expected: alle tests PASS. Faalt een fold-variant, check dan de regex `/\n[ \t]/g` en de volgorde (eerst regeleindes normaliseren).

- [ ] **Step 5: Commit**

```bash
git add js/lib.js test/vcard.test.js
git commit -m "feat(import): parseVCard + unescapeVCardText met tests"
```

---

### Task 2: `mapVCardToContact`

**Files:**
- Modify: `js/lib.js`, `test/vcard.test.js`

- [ ] **Step 1: Voeg falende tests toe** (onderaan `test/vcard.test.js`; pas de bovenste `require` aan naar `const { parseVCard, unescapeVCardText, mapVCardToContact } = require('../js/lib.js');`)

```js
const tel = (value, ...type) => ({ value, params: type.length ? { type } : {} });
const mail = tel;

test('map: FN heeft voorrang op N', () => {
    assert.equal(mapVCardToContact({ FN: 'Anna Bloem', N: 'X;Y;;;', TEL: [], EMAIL: [] }).name, 'Anna Bloem');
});

test('map: alleen N → "voornaam achternaam"', () => {
    assert.equal(mapVCardToContact({ N: 'Bloem;Anna;;;', TEL: [], EMAIL: [] }).name, 'Anna Bloem');
});

test('map: lege naam → null', () => {
    assert.equal(mapVCardToContact({ FN: '  ', TEL: [], EMAIL: [] }), null);
    assert.equal(mapVCardToContact({ N: ';;;;', TEL: [], EMAIL: [] }), null);
    assert.equal(mapVCardToContact({ TEL: [tel('06')], EMAIL: [] }), null);
});

test('map: TEL komma-types matchen CELL', () => {
    const c = mapVCardToContact({ FN: 'X', TEL: [tel('020111'), tel('0612345678', 'CELL', 'VOICE')], EMAIL: [] });
    assert.equal(c.phone, '0612345678');
});

test('map: mobiel (nl) telt ook, case-insensitive', () => {
    const c = mapVCardToContact({ FN: 'X', TEL: [tel('020111'), tel('0611', 'Mobiel')], EMAIL: [] });
    assert.equal(c.phone, '0611');
});

test('map: één TEL zonder type → gekozen; eerste als geen CELL', () => {
    assert.equal(mapVCardToContact({ FN: 'X', TEL: [tel('0201')], EMAIL: [] }).phone, '0201');
    assert.equal(mapVCardToContact({ FN: 'X', TEL: [tel('0201', 'WORK'), tel('0202', 'HOME')], EMAIL: [] }).phone, '0201');
});

test('map: tel:-prefix en spaties/streepjes/haakjes weg', () => {
    assert.equal(mapVCardToContact({ FN: 'X', TEL: [tel('tel:+31 (6) 12-34 56 78')], EMAIL: [] }).phone, '+31612345678');
});

test('map: EMAIL HOME voorrang, lowercase', () => {
    const c = mapVCardToContact({ FN: 'X', TEL: [], EMAIL: [mail('Werk@X.nl', 'WORK'), mail('Thuis@X.NL', 'HOME')] });
    assert.equal(c.email, 'thuis@x.nl');
    assert.equal(mapVCardToContact({ FN: 'X', TEL: [], EMAIL: [mail('A@B.nl')] }).email, 'a@b.nl');
});

test('map: geen TEL/EMAIL → lege strings', () => {
    const c = mapVCardToContact({ FN: 'X', TEL: [], EMAIL: [] });
    assert.equal(c.phone, '');
    assert.equal(c.email, '');
});

test('map: BDAY-varianten', () => {
    const b = raw => mapVCardToContact({ FN: 'X', BDAY: raw, TEL: [], EMAIL: [] }).birthday;
    assert.equal(b('1985-03-12'), '1985-03-12');
    assert.equal(b('19850312'), '1985-03-12');
    assert.equal(b('--0312'), null);
    assert.equal(b('onzin'), null);
    assert.equal(b('19851345'), null);
    assert.equal(b(undefined), null);
});

test('map: ORG → customFields Bedrijf; leeg → []', () => {
    assert.deepEqual(mapVCardToContact({ FN: 'X', ORG: 'Acme', TEL: [], EMAIL: [] }).customFields, [{ key: 'Bedrijf', value: 'Acme' }]);
    assert.deepEqual(mapVCardToContact({ FN: 'X', ORG: '', TEL: [], EMAIL: [] }).customFields, []);
    assert.deepEqual(mapVCardToContact({ FN: 'X', TEL: [], EMAIL: [] }).customFields, []);
});

test('map: camelCase keys, notes, overige velden genegeerd', () => {
    const c = mapVCardToContact({ FN: 'X', NOTE: 'hoi', PHOTO: 'abc', ADR: 'z', TEL: [], EMAIL: [] });
    assert.deepEqual(Object.keys(c).sort(), ['birthday', 'customFields', 'email', 'name', 'notes', 'phone']);
    assert.equal(c.notes, 'hoi');
    assert.equal(c.custom_fields, undefined);
});
```

- [ ] **Step 2: Run, verwacht FAIL**

Run: `node --test test/vcard.test.js` → Expected: FAIL (`mapVCardToContact is not a function`).

- [ ] **Step 3: Implementeer** (in `js/lib.js`, direct na `parseVCard`)

```js
    function pickTyped(list, wanted) {
        if (!list || !list.length) return null;
        const hit = list.find(e => (e.params.type || []).some(t => wanted.includes(t.toLowerCase())));
        return hit || list[0];
    }

    function normalizeVCardBirthday(raw) {
        if (!raw) return null;
        const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:T.*)?$/.exec(String(raw).trim());
        if (!m) return null; // incl. "--MMDD" (jaar onbekend) en onzin
        const [, y, mo, d] = m;
        const dt = new Date(Date.UTC(+y, +mo - 1, +d));
        if (dt.getUTCFullYear() !== +y || dt.getUTCMonth() !== +mo - 1 || dt.getUTCDate() !== +d) return null;
        return `${y}-${mo}-${d}`;
    }

    /** vCard-object (uit parseVCard) → concept-contact, of null bij lege naam. */
    function mapVCardToContact(vcard) {
        let name = (vcard.FN || '').trim();
        if (!name && vcard.N) {
            const [last = '', first = ''] = vcard.N.split(';').map(p => unescapeVCardText(p).trim());
            name = [first, last].filter(Boolean).join(' ');
        }
        if (!name) return null;
        const tel = pickTyped(vcard.TEL, ['cell', 'mobiel']);
        const mail = pickTyped(vcard.EMAIL, ['home']);
        const org = (vcard.ORG || '').trim();
        return {
            name,
            phone: tel ? tel.value.replace(/^tel:/i, '').replace(/[\s\-()]/g, '') : '',
            email: mail ? mail.value.trim().toLowerCase() : '',
            birthday: normalizeVCardBirthday(vcard.BDAY),
            notes: vcard.NOTE || '',
            customFields: org ? [{ key: 'Bedrijf', value: org }] : []
        };
    }
```

Exports: voeg `mapVCardToContact` toe na `parseVCard`.

- [ ] **Step 4: Run, verwacht PASS**

Run: `node --test test/vcard.test.js` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/lib.js test/vcard.test.js
git commit -m "feat(import): mapVCardToContact met tests"
```

---

### Task 3: `selectDefaultPicked` + `isImportAuthError`

**Files:**
- Modify: `js/lib.js`, `test/vcard.test.js`

- [ ] **Step 1: Falende tests** (pas `require` aan: voeg `selectDefaultPicked, isImportAuthError` toe)

```js
test('default: telefoon, niet bestaand, niet eerder gezien → true', () => {
    assert.equal(selectDefaultPicked({ name: 'Anna', phone: '06', email: '' }, new Set(), new Set()), true);
    assert.equal(selectDefaultPicked({ name: 'Anna', phone: '', email: 'a@b.nl' }, new Set(), new Set()), true);
});

test('default: geen telefoon en geen email → false', () => {
    assert.equal(selectDefaultPicked({ name: 'Anna', phone: '', email: '' }, new Set(), new Set()), false);
});

test('default: bestaande naam (case-insensitive) → false', () => {
    assert.equal(selectDefaultPicked({ name: ' ANNA ', phone: '06', email: '' }, new Set(['anna']), new Set()), false);
});

test('default: eerder in bestand gezien → false', () => {
    assert.equal(selectDefaultPicked({ name: 'Anna', phone: '06', email: '' }, new Set(), new Set(['anna'])), false);
});

test('authError: 401, PGRST301, PGRST303, 42501 → true; rest → false', () => {
    assert.equal(isImportAuthError({ status: 401 }), true);
    assert.equal(isImportAuthError({ code: 'PGRST301' }), true);
    assert.equal(isImportAuthError({ code: 'PGRST303' }), true);
    assert.equal(isImportAuthError({ code: '42501' }), true);
    assert.equal(isImportAuthError({ code: '23505' }), false);
    assert.equal(isImportAuthError(new Error('netwerk')), false);
    assert.equal(isImportAuthError(null), false);
});
```

- [ ] **Step 2: Run, verwacht FAIL** — `node --test test/vcard.test.js`

- [ ] **Step 3: Implementeer** (na `mapVCardToContact`)

```js
    /** Slimme default voor het vinkje: contactgegevens aanwezig én geen duplicaat. */
    function selectDefaultPicked(contact, existingNames, seenNamesInFile) {
        const key = contact.name.trim().toLowerCase();
        const hasInfo = Boolean(contact.phone || contact.email);
        return hasInfo && !existingNames.has(key) && !seenNamesInFile.has(key);
    }

    /**
     * Supabase/PostgREST-fout die wijst op verlopen sessie of geen toegang (RLS).
     * In supabase-js v2 zit `status` op het response, niet op de error: de caller
     * geeft `{ ...error, status }` mee. PGRST303 = "JWT expired" (PostgREST 12+).
     */
    function isImportAuthError(err) {
        return Boolean(err) && (err.status === 401 || err.code === 'PGRST301' || err.code === 'PGRST303' || err.code === '42501');
    }
```

Exports: voeg `selectDefaultPicked, isImportAuthError` toe.

- [ ] **Step 4: Run volledige suite + syntax**

Run: `npm test && node --check js/lib.js && node --check js/app.js`
Expected: alle tests (bestaand + nieuw) PASS, geen syntaxfouten.

- [ ] **Step 5: Commit**

```bash
git add js/lib.js test/vcard.test.js
git commit -m "feat(import): selectDefaultPicked + isImportAuthError met tests"
```

---

## Fase B — UI (handmatig te verifiëren op dev; geen unit-tests)

### Task 4: HTML — menu-item en modal (beide index-bestanden) + CSS

**Files:**
- Modify: `index.html` (menu bij regel 26, modal na `#slot-wizard-modal` ~regel 313–326), `index-dev.html` (regel 45, ~332–345), `css/styles.css` (onderaan)

- [ ] **Step 1: Menu-item** — in beide bestanden direct ná de `import-data-btn`-`<li>`:

```html
<li><button class="dropdown-item" id="import-phone-btn" type="button"><i class="bi bi-phone me-2"></i>Contacten importeren uit telefoon</button></li>
```

- [ ] **Step 2: Modal** — in beide bestanden direct ná de `#slot-wizard-modal`-`</div>`:

```html
        <!-- Contacten importeren uit telefoon (vCard-wizard) -->
        <div class="modal fade" id="import-phone-wizard-modal" tabindex="-1" aria-hidden="true" aria-labelledby="import-phone-wizard-title">
            <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <div>
                            <h5 class="modal-title" id="import-phone-wizard-title">Contacten importeren</h5>
                            <div class="import-wizard-progress small text-muted" id="import-phone-wizard-progress"></div>
                        </div>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Sluiten"></button>
                    </div>
                    <div class="modal-body" id="import-phone-wizard-body">
                        <!-- Filled dynamically by openPhoneImportWizard() -->
                    </div>
                </div>
            </div>
        </div>
```

- [ ] **Step 3: CSS** — onderaan `css/styles.css` (volg de bestaande variabelen/kleuren in dat bestand; onderstaande gebruikt Bootstrap-variabelen):

```css
/* ===== Contacten importeren uit telefoon ===== */
.import-wizard-progress { margin-top: .15rem; }
.import-wizard-progress .done { color: var(--bs-success); }
.platform-cards { display: flex; flex-direction: column; gap: .75rem; }
@media (min-width: 576px) { .platform-cards { flex-direction: row; } .platform-cards .platform-card { flex: 1; } }
.platform-card { border: 2px solid var(--bs-border-color); border-radius: .5rem; background: var(--bs-body-bg); padding: 1rem; text-align: center; cursor: pointer; }
.platform-card.auto-detected { border-color: var(--bs-primary-border-subtle, #9ec5fe); }
.platform-card.selected { border-color: var(--bs-primary); background: var(--bs-primary-bg-subtle, #e7f1ff); }
.platform-card .emoji { display: block; font-size: 2rem; }
.export-steps { padding-left: 1.25rem; }
.export-steps li { margin-bottom: .5rem; }
.export-hint { color: var(--bs-secondary-color); font-size: .85rem; }
.file-picker .error { color: var(--bs-danger); font-size: .9rem; }
.wizard-loading { text-align: center; padding: 2rem 0; }
.import-list { max-height: 50vh; overflow-y: auto; border: 1px solid var(--bs-border-color); border-radius: .5rem; }
.contact-row { display: flex; gap: .6rem; align-items: flex-start; padding: .5rem .75rem; border-bottom: 1px solid var(--bs-border-color-translucent); cursor: pointer; }
.contact-row:last-child { border-bottom: 0; }
.contact-row .name { font-weight: 600; }
.contact-row .summary { font-size: .85rem; color: var(--bs-secondary-color); }
.contact-row.dimmed .name, .contact-row.dimmed .summary { color: var(--bs-secondary-color); }
.contact-row .exists-badge { font-size: .7rem; background: var(--bs-secondary-bg); color: var(--bs-secondary-color); border-radius: .25rem; padding: .05rem .4rem; margin-left: .4rem; font-weight: 400; }
```

- [ ] **Step 4: Verifieer**

Run: `cd /Users/quaiongen/.buzz/REPOS/contactbeheer && python3 -m http.server 8765` en open `http://localhost:8765/index-dev.html`, log in.
Expected: menu toont "Contacten importeren uit telefoon" (klik doet nog niets); geen console-fouten; bestaande menu-items ongewijzigd.

- [ ] **Step 5: Commit**

```bash
git add index.html index-dev.html css/styles.css
git commit -m "feat(import): menu-item, wizard-modal en styling"
```

---

### Task 5: Wizard-skelet, stap 1 (platform) en stap 2 (export + bestandskiezer)

**Files:**
- Modify: `js/app.js` (nieuwe sectie helemaal onderaan; de `escapeHtml`-helper op regel 634 bestaat al)

- [ ] **Step 1: Schrijf de wizard-sectie** (onderaan `js/app.js`)

```js
/**
 * ======================
 * CONTACTEN IMPORTEREN UIT TELEFOON (vCard-wizard)
 * ======================
 */

// Bewerk hier om de export-instructies aan te passen; deploy = git push.
const IMPORT_INSTRUCTIONS = {
    iphone: [
        'Open de <strong>Telefoon</strong>-app.',
        'Tik onderin op <strong>Contacten</strong>.',
        'Tik linksboven op het <strong>pijltje naar links</strong> — je komt nu in de lijsten.',
        'Houd de <strong>lijst</strong> die je wil exporteren <strong>ingedrukt</strong> en tik op <strong>Exporteer</strong>.',
        'Optioneel: kies welke velden je wil delen en vink aan.',
        'Tik op <strong>Sla op in Bestanden</strong> en kies een plek waar je het straks terugvindt.'
    ],
    android: [
        'Ga naar <strong>contacts.google.com</strong> in je browser en log in met je Google-account.',
        'Selecteer linksboven het <strong>vierkantje</strong> naast "Contacten" om alle contacten aan te vinken (of selecteer per stuk).',
        'Klik op het <strong>drie-punten-menu</strong> ⋮ rechtsboven → <strong>Exporteren</strong>.',
        'Kies <strong>vCard (voor iOS-contacten)</strong> als indeling.',
        'Klik op <strong>Exporteren</strong>. Het bestand <code>contacts.vcf</code> wordt gedownload.'
    ],
    vcf: 'Kies het <code>.vcf</code>-bestand dat je al hebt (bijvoorbeeld eerder geëxporteerd of iemand heeft het je gestuurd).',
    hintIphone: 'Werken de stappen niet meer of zijn ze anders bij jouw iOS-versie? Laat het weten — we passen ze aan.',
    // Verwijder deze regel zodra iemand met Android de stappen heeft gevalideerd (zie plan Task 9).
    hintAndroid: 'Werken de stappen niet meer? Laat het weten — we passen ze aan. (Kan verouderd zijn; zie <a href="https://support.google.com/contacts/answer/7199294" target="_blank" rel="noopener">Google-help</a>.)',
    hintVcf: 'Ken je het formaat niet? Ga terug en kies iPhone of Android — dan geven we stap-voor-stap uitleg.'
};

const PHONE_IMPORT_AUTO_KEY = 'phone_import_auto_shown';
const PHONE_IMPORT_STEP_NUMBER = { platform: 1, export: 2, loading: 3, selectie: 4 };

let phoneImportModal = null;
let phoneImportState = null;

function detectImportPlatform() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua)) return 'iphone';
    if (/Android/i.test(ua)) return 'android';
    return null;
}

function newPhoneImportState(source) {
    return {
        source,
        step: 'platform',
        suggested: detectImportPlatform(),
        platform: null,
        file: null,
        error: '',
        rows: [],        // [{contact, picked, badge: null|'exists'|'dup'}], alfabetisch
        search: '',
        importing: false
    };
}

/** source: 'auto' (lege account na login) of 'menu'. */
function openPhoneImportWizard(source) {
    const el = document.getElementById('import-phone-wizard-modal');
    if (!el) return;
    if (!phoneImportModal) {
        phoneImportModal = new bootstrap.Modal(el);
        // Cleanup bij sluiten (X/Esc/backdrop/Sla over): geen oude selectie laten staan.
        el.addEventListener('hidden.bs.modal', () => {
            phoneImportState = null;
            document.getElementById('import-phone-wizard-body').innerHTML = '';
            document.getElementById('import-phone-wizard-progress').innerHTML = '';
        });
    }
    phoneImportState = newPhoneImportState(source);
    if (source === 'auto') sessionStorage.setItem(PHONE_IMPORT_AUTO_KEY, '1');
    renderPhoneImport();
    phoneImportModal.show();
}

function renderPhoneImportProgress() {
    const cur = PHONE_IMPORT_STEP_NUMBER[phoneImportState.step];
    const el = document.getElementById('import-phone-wizard-progress');
    el.innerHTML = `Stap ${cur} van 4` + (cur > 1 ? ` · <span class="done">${'✓'.repeat(cur - 1)}</span>` : '');
}

function renderPhoneImport() {
    if (!phoneImportState) return;
    renderPhoneImportProgress();
    const body = document.getElementById('import-phone-wizard-body');
    switch (phoneImportState.step) {
        case 'platform': return renderPhoneImportPlatform(body);
        case 'export': return renderPhoneImportExport(body);
        case 'loading': return renderPhoneImportLoading(body);
        case 'selectie': return renderPhoneImportSelectie(body);
    }
}

function renderPhoneImportPlatform(body) {
    const s = phoneImportState;
    const cards = [
        { id: 'iphone', emoji: '📱', label: 'iPhone' },
        { id: 'android', emoji: '🤖', label: 'Android / Google Contacts' },
        { id: 'vcf', emoji: '📁', label: 'Ik heb al een .vcf-bestand' }
    ];
    body.innerHTML = `
        <h6 class="mb-3">Kies je platform</h6>
        <div class="platform-cards">
            ${cards.map(c => `
                <button type="button" class="platform-card${s.platform === c.id ? ' selected' : ''}${s.suggested === c.id ? ' auto-detected' : ''}"
                        data-platform="${c.id}" aria-pressed="${s.platform === c.id}" aria-label="${escapeHtml(c.label)}">
                    <span class="emoji" aria-hidden="true">${c.emoji}</span>${escapeHtml(c.label)}
                </button>`).join('')}
        </div>
        <div class="d-flex justify-content-between align-items-center mt-4">
            <button type="button" class="btn btn-link px-0" id="pi-skip">Sla over</button>
            <button type="button" class="btn btn-primary" id="pi-next" ${s.platform ? '' : 'disabled'}>Volgende →</button>
        </div>`;
    body.querySelectorAll('.platform-card').forEach(btn => btn.addEventListener('click', () => {
        s.platform = btn.dataset.platform;
        renderPhoneImport();
    }));
    body.querySelector('#pi-skip').addEventListener('click', () => phoneImportModal.hide());
    body.querySelector('#pi-next').addEventListener('click', () => { s.step = 'export'; renderPhoneImport(); });
}

function renderPhoneImportExport(body) {
    const s = phoneImportState;
    let instructions;
    if (s.platform === 'vcf') {
        instructions = `<p>${IMPORT_INSTRUCTIONS.vcf}</p><p class="export-hint">${IMPORT_INSTRUCTIONS.hintVcf}</p>`;
    } else {
        const steps = IMPORT_INSTRUCTIONS[s.platform];
        const hint = s.platform === 'iphone' ? IMPORT_INSTRUCTIONS.hintIphone : IMPORT_INSTRUCTIONS.hintAndroid;
        instructions = `<ol class="export-steps">${steps.map(t => `<li>${t}</li>`).join('')}</ol><p class="export-hint">${hint}</p>`;
    }
    body.innerHTML = `
        <h6 class="mb-3">Exporteer je contacten</h6>
        ${instructions}
        <div class="file-picker mt-3">
            <input type="file" accept=".vcf,text/vcard,text/x-vcard" class="d-none" id="pi-file">
            <button type="button" class="btn btn-outline-primary" id="pi-pick">Kies bestand…</button>
            <span class="ms-2" id="pi-filename">${s.file ? escapeHtml(s.file.name) : ''}</span>
            <div class="error mt-2" id="pi-error" role="alert">${escapeHtml(s.error)}</div>
        </div>
        <div class="d-flex justify-content-between mt-4">
            <button type="button" class="btn btn-outline-secondary" id="pi-back">← Vorige</button>
            <button type="button" class="btn btn-primary" id="pi-next" ${s.file ? '' : 'disabled'}>Volgende →</button>
        </div>`;
    const input = body.querySelector('#pi-file');
    body.querySelector('#pi-pick').addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
        const f = input.files[0];
        if (!f) return;
        if (!f.name.toLowerCase().endsWith('.vcf')) {
            s.file = null;
            s.error = 'Selecteer een .vcf-bestand.';
        } else {
            s.file = f;
            s.error = '';
        }
        renderPhoneImport();
    });
    body.querySelector('#pi-back').addEventListener('click', () => { s.step = 'platform'; s.error = ''; renderPhoneImport(); });
    body.querySelector('#pi-next').addEventListener('click', () => { s.step = 'loading'; renderPhoneImport(); });
}
```

Stap 3 en 4 komen in Task 6; zet nu tijdelijk onderaan de sectie zodat de code laadt:

```js
function renderPhoneImportLoading(body) { body.innerHTML = ''; }
function renderPhoneImportSelectie(body) { body.innerHTML = ''; }
```

- [ ] **Step 2: Syntax-check**

Run: `node --check js/app.js` → Expected: geen output.

- [ ] **Step 3: Koppel het menu-item** — in de bestaande listeners-sectie van `js/app.js`, direct onder `importFileInput.addEventListener('change', handleImportFile);` (~regel 321):

```js
    // Contacten importeren uit telefoon (vCard-wizard)
    const importPhoneBtn = document.getElementById('import-phone-btn');
    if (importPhoneBtn) importPhoneBtn.addEventListener('click', () => openPhoneImportWizard('menu'));
```

- [ ] **Step 4: Handmatige verificatie (dev)**

Herlaad `http://localhost:8765/index-dev.html` (hard refresh), menu → "Contacten importeren uit telefoon". Verwacht:
- Modal opent met "Stap 1 van 4", drie kaarten; op desktop-Chrome geen preselectie, "Volgende" disabled tot een kaart is gekozen; op iPhone/Android-UA (DevTools device-emulatie) staat de bijpassende kaart gemarkeerd maar "Volgende" blijft disabled.
- iPhone → 6 genummerde stappen + hint; Android → 5 stappen + hint; `.vcf` → alleen uitleg + bestandskiezer.
- Een `.txt` kiezen → rode foutmelding, "Volgende" disabled; een `.vcf` kiezen → bestandsnaam zichtbaar, "Volgende" actief.
- "← Vorige" werkt; "Sla over" en X sluiten; heropenen begint weer op stap 1 zonder oude bestandsnaam.

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat(import): wizard-skelet, platform-keuze en export-stap"
```

---

### Task 6: Stap 3 (inlezen) en stap 4 (selectie) + import naar Supabase

**Files:**
- Modify: `js/app.js` (vervang de twee tijdelijke stubs uit Task 5)

- [ ] **Step 1: Vervang `renderPhoneImportLoading` en `renderPhoneImportSelectie`** door:

```js
function renderPhoneImportLoading(body) {
    const s = phoneImportState;
    body.innerHTML = `
        <div class="wizard-loading">
            <div class="spinner-border" role="status" aria-hidden="true"></div>
            <p class="mt-3 mb-0" id="pi-loading-text">Bezig met inlezen…</p>
        </div>
        <div class="text-center d-none" id="pi-load-error">
            <p class="text-danger" role="alert" id="pi-load-error-text"></p>
            <button type="button" class="btn btn-outline-secondary" id="pi-back">← Terug</button>
        </div>`;
    const fail = (msg) => {
        body.querySelector('.wizard-loading').classList.add('d-none');
        body.querySelector('#pi-load-error').classList.remove('d-none');
        body.querySelector('#pi-load-error-text').textContent = msg;
        body.querySelector('#pi-back').addEventListener('click', () => { s.step = 'export'; s.file = null; renderPhoneImport(); });
    };
    const reader = new FileReader();
    reader.onerror = () => { if (phoneImportState === s) fail('Het bestand kon niet gelezen worden.'); };
    reader.onload = () => {
        if (phoneImportState !== s) return; // wizard is intussen gesloten
        try {
            const parsed = parseVCard(String(reader.result));
            const existingNames = new Set(contactsData.map(c => (c.name || '').trim().toLowerCase()));
            const seenNamesInFile = new Set();
            const rows = [];
            for (const vcard of parsed) {
                let contact;
                try { contact = mapVCardToContact(vcard); } catch (e) { console.warn('vCard-record overgeslagen:', e); continue; }
                if (!contact) continue;
                const key = contact.name.toLowerCase();
                const badge = existingNames.has(key) ? 'exists' : (seenNamesInFile.has(key) ? 'dup' : null);
                rows.push({ contact, picked: selectDefaultPicked(contact, existingNames, seenNamesInFile), badge });
                seenNamesInFile.add(key);
            }
            if (!rows.length) return fail('Geen contacten gevonden in dit bestand. Is het wel een .vcf-export?');
            rows.sort((a, b) => a.contact.name.localeCompare(b.contact.name, 'nl', { sensitivity: 'base' }));
            s.rows = rows;
            s.search = '';
            body.querySelector('#pi-loading-text').textContent = `${rows.length} contacten gevonden…`;
            setTimeout(() => { if (phoneImportState === s) { s.step = 'selectie'; renderPhoneImport(); } }, 300);
        } catch (e) {
            console.error('vCard parse-fout:', e);
            fail('Dit bestand kon niet gelezen worden. Probeer de export opnieuw.');
        }
    };
    reader.readAsText(s.file);
}

function phoneImportSummary(contact) {
    const parts = [contact.phone, contact.email].filter(Boolean);
    return parts.length ? parts.join(' · ') : '— geen contactgegevens —';
}

function renderPhoneImportSelectie(body) {
    const s = phoneImportState;
    body.innerHTML = `
        <h6 class="mb-3">Kies welke contacten je wil</h6>
        <div class="d-flex gap-2 mb-2">
            <input type="search" class="form-control" id="pi-search" placeholder="Zoek op naam…" aria-label="Zoek op naam" value="${escapeHtml(s.search)}">
            <button type="button" class="btn btn-outline-secondary text-nowrap" id="pi-all-on">Alles aan</button>
            <button type="button" class="btn btn-outline-secondary text-nowrap" id="pi-all-off">Alles uit</button>
        </div>
        <div class="small text-muted mb-2" id="pi-count" aria-live="polite"></div>
        <div class="import-list" id="pi-list"></div>
        <div class="d-flex justify-content-between mt-3">
            <button type="button" class="btn btn-link px-0" id="pi-skip">Sla over</button>
            <button type="button" class="btn btn-primary" id="pi-import"></button>
        </div>`;
    body.querySelector('#pi-search').addEventListener('input', (e) => { s.search = e.target.value; updatePhoneImportList(); });
    body.querySelector('#pi-all-on').addEventListener('click', () => setVisiblePhoneImportPicked(true));
    body.querySelector('#pi-all-off').addEventListener('click', () => setVisiblePhoneImportPicked(false));
    body.querySelector('#pi-skip').addEventListener('click', () => phoneImportModal.hide());
    body.querySelector('#pi-import').addEventListener('click', runPhoneImport);
    updatePhoneImportList();
}

function visiblePhoneImportRows() {
    const q = phoneImportState.search.trim().toLowerCase();
    return phoneImportState.rows.filter(r => !q || r.contact.name.toLowerCase().includes(q));
}

// Filtert alleen zichtbaarheid; r.picked (de centrale selectie) blijft ongemoeid.
function updatePhoneImportList() {
    const s = phoneImportState;
    const list = document.getElementById('pi-list');
    if (!s || !list) return;
    const visible = visiblePhoneImportRows();
    list.innerHTML = visible.length ? visible.map(r => {
        const i = s.rows.indexOf(r);
        const badge = r.badge === 'exists' ? '<span class="exists-badge">al aanwezig</span>'
                    : r.badge === 'dup' ? '<span class="exists-badge">duplicaat in bestand</span>' : '';
        const dimmed = (!r.contact.phone && !r.contact.email) || r.badge;
        return `<label class="contact-row${dimmed ? ' dimmed' : ''}">
            <input type="checkbox" class="form-check-input mt-1" data-i="${i}" ${r.picked ? 'checked' : ''}>
            <span><span class="name">${escapeHtml(r.contact.name)}</span>${badge}<br><span class="summary">${escapeHtml(phoneImportSummary(r.contact))}</span></span>
        </label>`;
    }).join('') : '<div class="p-3 text-muted">Geen contacten gevonden voor deze zoekterm.</div>';
    list.querySelectorAll('input[type=checkbox]').forEach(cb => cb.addEventListener('change', () => {
        s.rows[+cb.dataset.i].picked = cb.checked;
        updatePhoneImportCounter();
    }));
    updatePhoneImportCounter();
}

function setVisiblePhoneImportPicked(value) {
    visiblePhoneImportRows().forEach(r => { r.picked = value; });
    updatePhoneImportList();
}

// Teller telt over de héle lijst, niet alleen de zichtbare rijen.
function updatePhoneImportCounter() {
    const s = phoneImportState;
    if (!s) return;
    const n = s.rows.filter(r => r.picked).length;
    document.getElementById('pi-count').textContent = `${n} van ${s.rows.length} geselecteerd`;
    const btn = document.getElementById('pi-import');
    btn.textContent = `Importeer ${n} contact${n === 1 ? '' : 'en'}`;
    btn.disabled = n === 0 || s.importing;
}

async function runPhoneImport() {
    const s = phoneImportState;
    if (!s || s.importing) return;
    if (!isSupabaseConfigured() || !currentUser) { alert('Log eerst in om te importeren.'); return; }
    const picked = s.rows.filter(r => r.picked).map(r => r.contact);
    s.importing = true;
    updatePhoneImportCounter();

    let ok = 0, failed = 0, authAbort = false;
    for (let i = 0; i < picked.length && !authAbort; i += 10) {
        const batch = picked.slice(i, i + 10);
        const results = await Promise.all(batch.map(async (c) => {
            const id = generateUniqueId();
            const { error, status } = await supabaseClient.from('contacts').insert({
                id,
                user_id: currentUser.id,
                name: c.name,
                birthday: c.birthday || null,
                frequency: 30,
                notes: c.notes || null,
                phone: c.phone || null,
                email: c.email || null,
                custom_fields: c.customFields || []
            });
            return { c, id, error: error ? { ...error, status } : null };
        }));
        for (const { c, id, error } of results) {
            if (!error) {
                contactsData.push({
                    id, name: c.name, categoryId: null, birthday: c.birthday, frequency: 30,
                    notes: c.notes, phone: c.phone, email: c.email,
                    customFields: c.customFields, interactions: []
                });
                ok++;
            } else if (isImportAuthError(error)) {
                authAbort = true;
            } else {
                console.error(`Import mislukt voor ${c.name}:`, error);
                failed++;
            }
        }
    }

    renderContacts();
    if (phoneImportModal) phoneImportModal.hide();
    if (authAbort) {
        alert(`Kan niet importeren — je bent uitgelogd of hebt geen toegang. Log opnieuw in en probeer nogmaals.${ok ? `\n\n${ok} contacten zijn al wel geïmporteerd.` : ''}`);
    } else if (failed) {
        alert(`${ok} van ${picked.length} geïmporteerd (${failed} gefaald)`);
    } else {
        alert(`${ok} contact${ok === 1 ? '' : 'en'} geïmporteerd`);
    }
}
```

- [ ] **Step 2: Syntax + volledige suite**

Run: `node --check js/app.js && npm test` → Expected: geen syntaxfouten, alle tests PASS.

- [ ] **Step 3: Maak een testbestand** (niet committen) `.scratch/test.vcf` met minstens: 3 gewone contacten (één met alleen `N`), 1 zonder tel/email, 1 duplicaat-naam (dezelfde `FN` twee keer), 1 met `BDAY:19850312` en `NOTE:regel1\nregel2`, 1 met `ORG:Acme`, plus line-folding. Of exporteer een echte iPhone-lijst.

- [ ] **Step 4: Handmatige verificatie (dev, met een niet-lege én een lege account)**

Doorloop platform → bestand → inlezen. Verwacht:
- Stap 3 toont kort "{n} contacten gevonden…" en gaat vanzelf naar stap 4; kapot bestand (bv. `echo "hallo" > .scratch/kapot.vcf`) → rode foutmelding + "← Terug", geen crash.
- Stap 4: alfabetisch; contact zonder tel/email uit + grijs met "— geen contactgegevens —"; tweede duplicaat uit met "duplicaat in bestand"; naam die al bestaat uit met "al aanwezig".
- Zoekbalk: Anna aanvinken → zoek "Bart" → Anna onzichtbaar; teller blijft over de hele lijst; zoekbalk leeg → Anna nog aangevinkt. "Alles aan" met actief filter vinkt alleen zichtbare rijen aan.
- "Importeer 0 contacten" is disabled bij 0 selectie.
- Import: alert "{n} contacten geïmporteerd"; nieuwe contacten staan direct in de lijst (zonder herladen) met juiste telefoon/email/verjaardag/notitie/"Bedrijf"-veld (open een detail-modal); na F5 staan ze er nog (Supabase Table Editor: `custom_fields`, `frequency = 30`).
- Regressie: menu → Importeren (JSON) werkt ongewijzigd.
- Auth-fout (optioneel): zet in DevTools-console `supabaseClient.from = () => ({ insert: async () => ({ error: { code: 'PGRST303' }, status: 401 }) })`, importeer → melding "Kan niet importeren — je bent uitgelogd…" en geen "gefaald"-telling. (Niet `signOut()` gebruiken: dat leegt `currentUser` en raakt dit pad niet.) Herlaad daarna de pagina.

- [ ] **Step 5: Commit**

```bash
git add js/app.js
git commit -m "feat(import): inlezen, selectie en import naar Supabase"
```

---

### Task 7: Auto-trigger bij lege account + logout-reset

**Files:**
- Modify: `js/app.js` (`loadDataFromSupabase` ~regel 3877, `handleLogout` ~3591, `onAuthStateChange` else-tak ~3680, wizard-sectie)

- [ ] **Step 1: Voeg de trigger-functie toe** aan de wizard-sectie:

```js
function maybeAutoOpenPhoneImport() {
    if (contactsData.length !== 0) return;
    if (sessionStorage.getItem(PHONE_IMPORT_AUTO_KEY)) return;
    // `.modal-backdrop` / `modal-open` blijven staan tot het eind van de hide-transitie
    // (auth-modal vlak na login); `.modal.show` alleen is dan al weg.
    if (document.querySelector('.modal.show, .modal-backdrop') || document.body.classList.contains('modal-open')) {
        // Andere modal nog open of aan het sluiten: opnieuw proberen zodra die dicht is.
        document.addEventListener('hidden.bs.modal', maybeAutoOpenPhoneImport, { once: true });
        return;
    }
    openPhoneImportWizard('auto');
}
```

- [ ] **Step 2: Roep aan** in `loadDataFromSupabase`, direct ná `renderContacts();` (vóór de `console.log`):

```js
        // Lege account → onboarding-wizard voor telefoon-import
        maybeAutoOpenPhoneImport();
```

- [ ] **Step 3: Reset bij logout** — in `handleLogout` direct na `contactsData = [];` en in `onAuthStateChange` else-tak (direct na `contactsData = [];`):

```js
        sessionStorage.removeItem(PHONE_IMPORT_AUTO_KEY);
```

- [ ] **Step 4: Syntax + suite** — `node --check js/app.js && npm test` → PASS.

- [ ] **Step 5: Handmatige verificatie (dev, met een lege test-account)**

- Login met lege account → wizard opent vanzelf (ná het verdwijnen van de auth-modal, geen dubbele backdrop).
- F5 in dezelfde tab → wizard opent **niet** opnieuw.
- Uitloggen → weer inloggen (zelfde tab) → wizard opent wél opnieuw.
- "Sla over" → volgende login met 0 contacten → opnieuw automatisch; via menu altijd bereikbaar.
- Account met ≥1 contact → geen automatische wizard.
- Open de app via `#instellingen`-link → instellingen-modal opent, wizard komt daar niet bovenop (of pas erna, zonder kapotte backdrop).

- [ ] **Step 6: Commit**

```bash
git add js/app.js
git commit -m "feat(import): auto-trigger bij lege account met sessie-guard"
```

---

## Fase C — Vóór productie en uitrol

### Task 8: Volledige verificatie op dev

- [ ] **Step 1:** `npm test && node --check js/lib.js && node --check js/app.js` → alles groen.
- [ ] **Step 2:** Herhaal de handmatige checks uit `docs/superpowers/specs/2026-09-23-contacten-importeren-design.md` → *Verificatie / testcriteria* (eerste login, menu-hergebruik met dedup, `.vcf`-skip, Sla over, foutbestanden, JSON-import-regressie) met een **echte iPhone-export** (20+ contacten) op dev.
- [ ] **Step 3:** Controleer op een smal scherm (DevTools ~375px): kaarten verticaal, lijst scrolt binnen de modal, knoppen bereikbaar.

### Task 9: ⏸ WACHTPUNT — Android-exportstappen laten valideren (user)

**Wachtpunt voor de user.** De Android-instructies (`IMPORT_INSTRUCTIONS.android`) zijn niet op een echt toestel/contacts.google.com getest.

- [ ] **Step 1:** Vraag iemand met een Android-toestel de vijf stappen te volgen (contacts.google.com → selecteren → ⋮ → Exporteren → vCard → Exporteren) en te melden of labels en volgorde kloppen.
- [ ] **Step 2 (geldig):** Verwijder de "Kan verouderd zijn"-zin uit `IMPORT_INSTRUCTIONS.hintAndroid` (laat de "Laat het weten"-zin staan). **Step 2 (afwijkend):** pas de stappen in `IMPORT_INSTRUCTIONS.android` aan naar de werkelijke labels.
- [ ] **Step 2b:** Laat dezelfde persoon ook testen of de bestandskiezer het `.vcf` uit Downloads op Android-Chrome selecteerbaar toont (de `accept` bevat ook `text/vcard`/`text/x-vcard`); zo niet, `accept` aanpassen.
- [ ] **Step 3:** Niet gevalideerd vóór de release? Dan blijft `hintAndroid` ongewijzigd staan (spec-fallback) en wordt validatie een follow-up. Commit een eventuele tekstwijziging:

```bash
git add js/app.js
git commit -m "docs(import): Android-exportstappen gevalideerd"
```

### Task 10: Deploy (cache-buster, push, verificatie op GitHub Pages)

- [ ] **Step 1: Cache-buster bump** — in **beide** `index.html` en `index-dev.html` de drie querystrings (`css/styles.css`, `js/lib.js`, `js/app.js`) van `?v=20260922a` naar `?v=20260923a` (bij een tweede bump dezelfde dag: `b`).

Run: `grep -n "?v=" index.html index-dev.html` → Expected: zes regels, allemaal `20260923a`.

- [ ] **Step 2: Laatste check en commit**

Run: `npm test && node --check js/lib.js && node --check js/app.js` → PASS.

```bash
git add index.html index-dev.html
git commit -m "chore(import): cache-buster 20260923a"
```

- [ ] **Step 3: ⏸ WACHTPUNT — `git push` (user)**

Geen SQL en geen edge function nodig, dus geen volgorde-afhankelijkheid met Supabase. **Vraag de user om `git push origin main` (of expliciet akkoord dat de Orchestrator pusht).** Controleer vóór het push de uitgaande commits: `git log --oneline origin/main..HEAD` (verwacht: spec-, plan- en feature-commits, correcte auteurs).

- [ ] **Step 4: Verificatie op prod** (na 1–2 min GitHub Pages): open `https://quaiongen.github.io/contactbeheer/` met hard refresh (Network-tab: `app.js?v=20260923a` geladen). Doorloop kort met een test-account/echt account: menu → wizard → klein `.vcf` → 1 contact importeren → verschijnt in lijst → dit test-contact daarna handmatig verwijderen. Verwacht: geen console-fouten; auto-trigger op lege prod-account werkt.

- [ ] **Step 5: ⏸ WACHTPUNT — Notion (user-akkoord vereist)**
  - Contactbeheer-documentatie (page `3e1c13a2-187c-81dd-ac48-d3c9d7646b43`): sectie over de import-flow toevoegen (trigger, 4 stappen, veld-mapping, dedup, beperkingen v1) en "Laatst bijgewerkt" bijwerken (`notion-fetch` eerst, per edit één `notion-update-page`-call).
  - Backlog-item "Contacten importeren" (Task 13) meebewegen: Plannen → Bouwen → Testen → Implementeren → Gereed.

### Task 11 (optioneel, aparte kleine commit): CLAUDE.md cache-buster-regel

CLAUDE.md regel 97 noemt alleen CSS-wijzigingen, terwijl `js/lib.js` en `js/app.js` dezelfde `?v=`-buster gebruiken (bevestigd in `index.html`/`index-dev.html`).

- [ ] Wijzig de regel naar: `**Cache-buster:** bij wijziging in CSS of JS (\`css/styles.css\`, \`js/lib.js\`, \`js/app.js\`) bump \`?v=YYYYMMDD?\` op die drie bestanden in **beide** \`index.html\` en \`index-dev.html\`. Anders zien users oude versies.`
- [ ] Commit: `git add CLAUDE.md && git commit -m "docs: cache-buster-regel dekt ook JS"` (zelfde push-gate als Task 10).
