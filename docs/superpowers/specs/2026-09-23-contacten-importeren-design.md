# Contacten importeren uit telefoon — design v1

**Datum:** 2026-09-23
**Status:** ontwerp goedgekeurd door owner (via brainstorm + mockups), wacht op spec-review
**Feature-thread:** nostr `ef82b8e67987d4e3c59c7d6189711d717e7124d29aeb57a7a9398fb6d909ac3b` in `#contactbeheer-dev`
**Cost-log:** `docs/superpowers/costs/2026-09-23-contacten-importeren.md`

## Doel

Een nieuwe gebruiker moet na de eerste login snel zijn adresboek in de app krijgen zonder handmatig 100+ contacten in te typen. De browser kan niet rechtstreeks bij het telefoon-adresboek, dus we bouwen een wizard rondom **vCard `.vcf`-upload** (het formaat dat iPhone én Android/Google native exporteren). De wizard legt uit hoe te exporteren, leest het bestand in, en laat de gebruiker per contact aan-/uitvinken wat hij wil importeren.

De feature is **additief**: de bestaande JSON-importer (menu → Importeren, backup-restore) blijft ongewijzigd naast de nieuwe optie staan.

## Design-principes

1. **Wizard = onboarding voor nieuwe users, ook later herbruikbaar.** Automatisch bij lege account (0 contacten na login), altijd handmatig via een nieuwe menu-optie *"Contacten importeren uit telefoon"*.
2. **Eén ding per scherm.** Meerstaps-modal (4 schermen). Voor een nieuwe user is één stap per scherm minder overweldigend dan een lange pagina met vinkjes.
3. **User in controle over selectie.** Bij het inlezen worden alle contacten getoond met slimme defaults; niks gaat automatisch de database in zonder dat de user het gezien heeft.
4. **Alleen `.vcf` in v1.** Eén parser, dekt iPhone én Android/Google-export. CSV en directe Google-koppeling zijn buiten scope.
5. **Instructie-tekst gemakkelijk aanpasbaar.** Export-stappen per platform veranderen af en toe. Ze leven als constanten bovenaan de wizard-file zodat een fix één regel is (+ nieuwe deploy). Geen aparte JSON.
6. **Bestaande JSON-importer blijft.** Wordt niet gewijzigd of vervangen; is voor backup-restore, niet voor telefoon-adresboek.

## Onderdelen

### Trigger

Twee triggers openen dezelfde wizard:

- **Auto na login bij lege account.** Als de contact-lijst na login-load 0 contacten telt, opent de wizard automatisch. Bevat een expliciete `Sla over`-actie waarmee de user de wizard nu wegklikt — hij komt bij een volgende login met nog steeds 0 contacten opnieuw op, of via het menu wanneer de user er klaar voor is.
- **Menu-optie.** Nieuwe item in het bestaande overloop-menu, boven of onder de huidige `Importeren` (JSON-import). Label: **"Contacten importeren uit telefoon"**. Icon-suggestie: `bi-phone` of `bi-person-plus`. Altijd beschikbaar, ook bij een vol adresboek.

**Auto-trigger guards** — voorkom botsingen en flakkerend openen:

- Alleen als er op dat moment geen andere Bootstrap-modal open is (`document.querySelector('.modal.show') === null`).
- Alleen éénmalig per browser-tab-sessie: zet `sessionStorage.setItem('phone_import_auto_shown', '1')` bij de eerste opening. Een F5 in dezelfde sessie herstart de wizard dus niet.
- **Bij logout** (in de bestaande sign-out-handler) `sessionStorage.removeItem('phone_import_auto_shown')` aanroepen zodat een nieuwe login in dezelfde tab de wizard wél opnieuw kan openen (`sessionStorage` overleeft anders een logout/login binnen dezelfde tab).
- Alleen bij een user die via de normale login-flow binnenkomt, niet als hij via een deep-link/route-parameter een specifiek scherm opende. (In deze codebase praktisch: pas triggeren nadat de standaard tab-render heeft plaatsgevonden.)

### Wizard-modal

- HTML-id: `#import-phone-wizard-modal`, nieuwe Bootstrap-modal.
- Één modal, meerdere states (`platform` / `export` / `loading` / `selectie`). State-management in JS, zoals de slot-zoeker (`#slot-wizard-modal`).
- Op elk moment sluitbaar met X of Esc → wizard sluit, geen import.
- **Cleanup bij close**: state-object (`platform`, `file`, `parsed`, `mapped`, `existingNames`, `picked`, `seenNamesInFile`) wordt gereset, `#import-phone-wizard-body`-innerHTML wordt geleegd. Zo staat er geen oude selectie klaar als de user later opnieuw opent.
- Body geeft één stap tegelijk weer; header toont een progress-indicator "stap X van 4" met vinkjes voor voltooide stappen.

### Stap 1 — Kies je platform

Drie klikbare kaarten, verticaal op mobiel, horizontaal op desktop:

- **📱 iPhone**
- **🤖 Android / Google Contacts**
- **📁 Ik heb al een `.vcf`-bestand**

De emoji is decoratief; a11y-label per kaart komt uit de tekst (bijv. `<button aria-label="iPhone"><span aria-hidden="true">📱</span> iPhone</button>`), zodat screenreaders alleen `iPhone` uitspreken en niet `mobile phone iPhone`.

**Auto-detect:** Bij openen wordt op basis van `navigator.userAgent` een van de drie kaarten voorgeselecteerd (visueel gemarkeerd, niet klik-vervangend):

- iOS/iPad → iPhone.
- Android → Android.
- Anders (desktop) → geen preselectie.

De user kan altijd een andere kaart kiezen.

Onder de kaarten: knop **"Volgende →"** (disabled tot een kaart is gekozen) en een tekstlink **"Sla over"** links onderaan.

### Stap 2 — Exporteer je contacten

Inhoud verschilt per platform-keuze:

**Variant iPhone** — genummerde stappen (bevestigd door owner, iOS 17/18):

1. Open de **Telefoon**-app.
2. Tik onderin op **Contacten**.
3. Tik linksboven op het **pijltje naar links** — je komt nu in de lijsten.
4. Houd de **lijst** die je wil exporteren **ingedrukt** en tik op **Exporteer**.
5. Optioneel: kies welke velden je wil delen en vink aan.
6. Tik op **Sla op in Bestanden** en kies een plek waar je het straks terugvindt.

Onder de stappen een discrete regel: *"Werken de stappen niet meer of zijn ze anders bij jouw iOS-versie? Laat het weten — we passen ze aan."*

**Variant Android/Google Contacts** — web-flow via `contacts.google.com` (werkt op elk toestel/merk):

1. Ga naar **contacts.google.com** in je browser en log in met je Google-account.
2. Selecteer linksboven het **vierkantje** naast "Contacten" om alle contacten aan te vinken (of selecteer per stuk).
3. Klik op het **drie-punten-menu** ⋮ rechtsboven → **Exporteren**.
4. Kies **vCard (voor iOS-contacten)** als indeling.
5. Klik op **Exporteren**. Het bestand `contacts.vcf` wordt gedownload.

Onder de stappen een discrete regel: *"Werken de stappen niet meer? Laat het weten — we passen ze aan."* + optionele link naar Google's help.

> ⚠ **Nog te verifiëren vóór productie:** de Android/Google-instructies zijn opgesteld op basis van Google-help en niet getest op een echt toestel. Bij eerste release blijft de "kan verouderd zijn"-regel zichtbaar. Als iemand met Android het gevalideerd heeft, vervalt die regel.

**Variant "Ik heb al een `.vcf`-bestand"** — instructie-stap wordt overgeslagen; body toont alleen de bestandskiezer met een korte uitleg-regel:

*"Kies het `.vcf`-bestand dat je al hebt (bijvoorbeeld eerder geëxporteerd of iemand heeft het je gestuurd)."*

Onder de uitleg: *"Ken je het formaat niet? Ga terug en kies iPhone of Android — dan geven we stap-voor-stap uitleg."*

**Bestandskiezer** (alle drie de varianten): knop **"Kies bestand…"** met `<input type="file" accept=".vcf">`. Alleen `.vcf` toegestaan; andere extensies leveren een inline foutmelding op.

Knoppen onderaan: **← Vorige** (naar Stap 1) · **Volgende →** (disabled tot een bestand is gekozen).

**Instructie-tekst als constanten.** De teksten voor iPhone-stappen, Android-stappen en de vcf-uitleg leven als constanten bovenaan de wizard-file (bijv. `IMPORT_INSTRUCTIONS.iphone`, `.android`, `.vcf`). Een tekst-fix is één regel + nieuwe deploy.

### Stap 3 — Bezig met inlezen…

Kort loading-scherm (meestal < 1s bij een normale export). Onder de spinner de teller `"{n} contacten gevonden…"` zodra de parser klaar is met tellen. Gaat automatisch door naar Stap 4.

Tijdens deze state:

1. `parseVCard(fileText)` → array van vCard-objecten.
2. `mapVCardToContact(vcard)` per object → concept-contact volgens het contactbeheer-model.
3. Auto-skip toepassen bij een bestaand adresboek (case-insensitive naam-match met bestaande `contacts`).
4. Slimme default toepassen (aanvinken als telefoon OF email aanwezig).

**Fouten:** bij een parse-fout of leeg bestand → inline foutmelding en knop `Terug` naar Stap 2. Geen crash.

### Stap 4 — Kies welke contacten je wil

Scrollbare lijst met alle geïmporteerde contacten, één rij per contact met vinkje links, naam bold, en één regel eronder met samenvatting (telefoon en/of email, of `— geen contactgegevens —` als beide leeg zijn).

**Defaults:**

- Aangevinkt als **telefoon OF email** aanwezig.
- Contacten zonder telefoon én zonder email zijn standaard **uit-gevinkt** en visueel grijzer.
- Reeds bestaande contacten (case-insensitive naam-match) tonen een grijze **"al aanwezig"**-badge en zijn standaard **uit-gevinkt**.

**Hulpmiddelen bovenaan de lijst:**

- **Zoekbalk** — typen filtert de lijst op naam (case-insensitive, substring). **Filtert alleen zichtbaarheid; vinkjes-state blijft intact.** Concreet: iemand aanvinken → zoekbalk aanpassen → hij verdwijnt uit beeld maar blijft geselecteerd. Zoekbalk leegmaken → hij is weer zichtbaar én nog steeds aangevinkt. De selectie is één centraal state-object dat door filteren niet wordt gereset.
- **Alles aan / Alles uit**-knop. Werkt op de **zichtbare** rijen (na een actieve zoekfilter), zodat een filter-selectie-flow bewust blijft. Zonder filter = op alle rijen.
- **Teller** `"X van Y geselecteerd"` (live bijgewerkt, altijd totaal over de hele lijst, niet alleen zichtbaar).

**Sortering:** alfabetisch op `name`, geen keuze.

**Knop onderaan:** **"Importeer X contacten"** (label toont het aantal geselecteerde). Disabled bij 0 geselecteerd (blokkeert een klik-zonder-selectie zonder aparte foutmelding). Klik → import naar Supabase, wizard sluit, korte toast/alert `"{n} contacten geïmporteerd"`. Elk succesvol contact wordt óók toegevoegd aan de in-memory `contactsData` (zoals `handleImportFile` doet); daarna `renderContacts()` (of de huidige tab-render-functie) voor een herbouw van de zichtbare lijst.

**"Sla over" / X**: sluit de wizard zonder importeren.

### Veld-mapping (vCard → contactbeheer)

Het bestaande contactbeheer-model (uit `handleImportFile`, tabel `contacts`) heeft: `id`, `user_id`, `name`, `birthday`, `frequency`, `notes`, `phone`, `email`, `custom_fields`.

| vCard-veld | Naar | Regel |
|---|---|---|
| `FN` (formatted name) of `N` (achternaam;voornaam;…) | `name` | `FN` heeft voorrang. Bij alleen `N`: samengesteld als `"voornaam achternaam"`. Trimmen; leeg → contact overslaan. |
| `TEL` met `type=CELL` of `type=mobiel` (case-insensitive), anders eerste `TEL` | `phone` | `TYPE`-parameter kan komma-gescheiden zijn (`TEL;TYPE=CELL,VOICE:...`); split op `,` en match "cell"/"mobiel" case-insensitive tegen elk element. vCard 4.0 mag een `tel:`-URI-prefix hebben (`TEL:tel:+31612…`) — die prefix strippen. Waarde genormaliseerd (spaties/`-`/`(`/`)` verwijderd). Overige nummers verloren in v1. |
| `EMAIL` met `type=HOME`, anders eerste `EMAIL` | `email` | `TYPE` idem komma-split; matching `home` case-insensitive. Lowercase. Overige emails verloren in v1. |
| `BDAY` | `birthday` | Accepteer zowel extended (`YYYY-MM-DD`) als basic (`YYYYMMDD`); normaliseer naar `YYYY-MM-DD`. vCard 4.0 `--MMDD` (jaar onbekend) → `null` (v1 model heeft geen jaar-loze verjaardag). Overig ongeldig → `null`. |
| `NOTE` | `notes` | Plaintext, escape-sequences (`\n`, `\,`) uit vCard normaliseren. |
| `ORG` | `customFields: [{key:"Bedrijf", value:...}]` (kolom heet `custom_fields`) | Leeg → veld niet toevoegen. |
| `frequency` | (default `30`) | vCard heeft dit niet. User past later per contact aan. |
| `PHOTO`, `ADR`, `TITLE`, `URL`, `NICKNAME`, extra `TEL`/`EMAIL` | genegeerd | Expliciet buiten scope v1. |

**vCard-versies:** ondersteun ten minste `VERSION:3.0` (iPhone, Android) en `VERSION:4.0`. Voor `VERSION:2.1` (oud, weinig gebruikt) doen we best-effort — parse-fout op één record slaat dat record over, niet het hele bestand.

**Character-set:** UTF-8 verwacht. Bij een BOM: negeren. Bij `CHARSET=`-parameter op individuele velden: warning in de console, verder best-effort.

**Line-folding:** RFC 6350 zegt regels langer dan 75 tekens mogen worden opgesplitst met een CRLF gevolgd door één whitespace-teken. Praktijk: exporters wisselen `\r\n `, `\r\n\t`, `\n `, `\n\t`. De parser normaliseert **alle vier** naar één regel voordat velden worden gelezen.

**Escape-decoding:** `NOTE` (en andere `TEXT`-velden) kunnen `\\`, `\n`, `\N`, `\,`, `\;` bevatten. Decode in deze volgorde om dubbele backslashes correct af te handelen:

1. Split op elke `\\` (dus dubbele backslash) → losse tokens.
2. In elk token: vervang `\n`/`\N` → newline, `\,` → `,`, `\;` → `;`.
3. Join met een letterlijke `\`.

Test-set moet `\\n` (letterlijke `\n`) én `\n` (newline) dekken.

**Meerdere vCards in één bestand:** iPhone en Google exporteren beide een concat van `BEGIN:VCARD`/`END:VCARD`-blokken in één file. Parser moet die stream aankunnen.

**Intra-file duplicaten:** komt voor als een user twee lijsten na elkaar exporteert of één contact in meerdere groepen zit. Regel: bij twee vCards met dezelfde `name` na trim+lowercase in hetzelfde bestand → het **eerste** voorkomen krijgt normale slimme default, het **tweede** en verdere voorkomens krijgen een grijze **"duplicaat in bestand"**-badge en zijn standaard **uit-gevinkt**. Zo krijgt de user niet stilletjes twee identieke inserts.

### Dedup

- **Trigger:** alleen relevant bij een niet-lege database (menu-hergebruik of auto-trigger die eerder is overgeslagen na eerste contact-toevoeging).
- **Bron van bestaande namen:** de in-memory `contactsData` (die na login is geladen). Concreet: `existingNames = new Set(contactsData.map(c => c.name.trim().toLowerCase()))`. Geen extra Supabase-call.
- **Regel:** contact wordt als *al aanwezig* gemarkeerd als `name.trim().toLowerCase()` in `existingNames` zit.
- **Effect:** grijze "al aanwezig"-badge in Stap 4, standaard uit-gevinkt. User kan alsnog aanvinken om een dubbele te maken (bewuste keuze).
- **Geen fuzzy matching** (bv. `Jan Jansen` vs `J. Jansen` wordt niet gedetecteerd). Geen merge-flow. Wie samenvoegen wil, doet dat handmatig achteraf.

### Persistentie

Per aangevinkt contact één insert in de bestaande `contacts`-tabel. Geen interacties (die zijn er nog niet voor deze contacten).

- `id`: `generateUniqueId()` (bestaande helper).
- `user_id`: `currentUser.id`.
- `name`, `phone`, `email`, `birthday`, `notes`: uit `mapVCardToContact` (in-memory keys: camelCase).
- `custom_fields` (DB-kolom): bevat `customFields` uit `mapVCardToContact` (in-memory in camelCase, gemapt naar snake_case kolomnaam bij insert — zelfde patroon als `handleImportFile` regel 3377).
- `frequency`: `30`.
- **Ook toevoegen aan `contactsData`** na een succesvolle insert (`.push({id, name, phone, email, birthday, notes, frequency:30, customFields})`) zodat de UI-render de nieuwe contacten direct ziet zonder een tweede fetch.

Insert-loop: sequentieel of `Promise.all` in batches van ~10 (zoals bestaand). **Error-handling met early-abort voor auth-fouten:** bij elk optreden van een Supabase/PostgREST-fout waarvan `status === 401` OF `code === "PGRST301"` OF `code === "42501"` (RLS `insufficient_privilege`) → abort direct de rest van de loop (ook als het niet de eerste insert is; sessie kan halverwege verlopen), toon `"Kan niet importeren — je bent uitgelogd of hebt geen toegang. Log opnieuw in en probeer nogmaals."`. Andere fouten (netwerk, individuele record-fout): log naar console, ga door met de rest, toon in de eind-alert `"X van N geïmporteerd (M gefaald)"`.

## Impact op bestaande code

### `js/lib.js` (pure, testbaar)

- **Nieuw:** `parseVCard(text)` → array van `{FN?: string, N?: string, TEL: Array<{value: string, params: {type?: string[]}}>, EMAIL: Array<{value: string, params: {type?: string[]}}>, BDAY?: string, NOTE?: string, ORG?: string, PHOTO?: string, ADR?: string, TITLE?: string, URL?: string, NICKNAME?: string, REV?: string}`. `params.type` is altijd een array (komma-split van de vCard `TYPE`-parameter), leeg → `undefined`. Robuust tegen line-folding (alle 4 varianten), meerdere `BEGIN:VCARD`-blokken, escaped chars, BOM.
- **Nieuw:** `mapVCardToContact(vcard)` → `{name, phone, email, birthday, notes, customFields}` volgens de regels in de tabel hierboven. Return `null` als `name` na trim leeg is.
- **Nieuw:** `selectDefaultPicked(contact, existingNames, seenNamesInFile)` → boolean. `true` als (telefoon of email aanwezig) EN naam niet in `existingNames` EN naam niet in `seenNamesInFile` (beide case-insensitive Sets). De caller bouwt `seenNamesInFile` incrementeel op tijdens de map-pass zodat intra-file duplicaten alleen bij het eerste voorkomen aangevinkt zijn.

Alle drie de pure functies retourneren camelCase-keys (`customFields`, niet `custom_fields`). De DB-mapping naar snake_case-kolomnamen gebeurt in de app.js insert-loop, precies zoals in `handleImportFile`.

### `js/app.js` (DOM + Supabase)

- **Nieuwe module** (kan onderaan `app.js` of in eigen sectie): `openPhoneImportWizard(source?)`. `source` = `'auto'` bij lege-account-trigger, `'menu'` bij menu-klik.
- **Auto-trigger:** in de bestaande post-login load-flow: als na het laden van `contacts` de lijst leeg is en de user via de app (niet een direct-menu-actie) binnenkomt → `openPhoneImportWizard('auto')`.
- **Menu-item:** nieuwe `<li><button id="import-phone-btn">Contacten importeren uit telefoon</button></li>` in `index.html` én `index-dev.html`, in het bestaande dropdown-menu naast `import-data-btn`.
- **Wizard-orchestratie:** state-object met `platform`, `file`, `parsed`, `mapped`, `existingNames`, `picked`. Render-functies per stap. Vorige/Volgende-navigatie.
- **Instructie-constanten:** bovenaan de wizard-sectie:
  ```js
  // Bewerk hier om de export-instructies aan te passen; deploy = git push.
  const IMPORT_INSTRUCTIONS = {
    iphone: [ /* 6 stappen */ ],
    android: [ /* 5 stappen */ ],
    vcf: '…',
  };
  ```
- **Bestaande wijziging** — geen. `handleImportFile` en de JSON-import-flow blijven ongewijzigd.

### `index.html` en `index-dev.html`

- Nieuwe Bootstrap-modal `#import-phone-wizard-modal` met interne div `#import-phone-wizard-body` (dynamisch gerenderd door JS).
- Nieuwe menu-item `#import-phone-btn` in het bestaande dropdown-menu.
- Cache-buster op `js/lib.js`, `js/app.js` en `css/styles.css` bumpen (zie CLAUDE.md).

### `css/styles.css`

Nieuwe klassen (voorstel — Planner detailleert):
- `.import-wizard-*` (header, body, footer, progress).
- `.platform-card`, `.platform-card.selected`, `.platform-card.auto-detected`.
- `.export-steps` (`ol`-styling met genummerde bullets), `.export-hint` (grijze regel).
- `.file-picker`.
- `.contact-row`, `.contact-row.dimmed`, `.contact-row .exists-badge`, `.contact-row .summary`.
- `.wizard-loading`.

### SQL / Supabase

Geen migratie nodig. `contacts` en `interactions` dekken de feature.

### Tests

Nieuwe test-file `test/vcard.test.js` (Node's `--test`, geen dependencies):

**`parseVCard`:**
- Enkele iPhone-export (`VERSION:3.0`, `FN`, `TEL;type=CELL`, `EMAIL`).
- Enkele Android/Google-export (`VERSION:3.0`, meerdere `TEL`, `ORG`).
- Meerdere `BEGIN:VCARD`-blokken in één string.
- Line-folding — alle vier de varianten: `\r\n `, `\r\n\t`, `\n `, `\n\t`.
- Komma-gescheiden `TYPE`: `TEL;TYPE=CELL,VOICE:...` → parser levert `params.type = ["CELL", "VOICE"]`.
- vCard 4.0 tel-URI prefix: `TEL:tel:+31612…` → waarde na strip = `+31612…`.
- Escaped chars in `NOTE`: `\n`, `\,`, `\;`, `\\`, én de combinatie `\\n` (letterlijke backslash-n, NIET een newline).
- BDAY-varianten: `1985-03-12`, `19850312`, `--0312` (jaar-loos), `onzin` — parser levert raw, mapper beslist.
- Leeg bestand → `[]`.
- Bestand zonder één correct `END:VCARD` → `[]` (of best-effort met warning).
- BOM aan het begin: genegeerd.

**`mapVCardToContact`:**
- `FN` heeft voorrang op `N`.
- Alleen `N`: samengesteld naar "voornaam achternaam".
- Leeg naam → `null`.
- `TEL;TYPE=CELL,VOICE:...` matcht als "cell" (komma-split).
- `TEL;type=CELL` gekozen boven eerdere `TEL` zonder type.
- `TEL:tel:+31612…` → phone = `+31612…` (URI-prefix gestript, spaties/`-` weg).
- Alleen één `TEL` zonder type → gekozen.
- `EMAIL;type=HOME` gekozen boven eerdere `EMAIL`.
- `EMAIL` uppercase → lowercase in output.
- `BDAY` `19850312` → `1985-03-12`.
- `BDAY` `--0312` → `null` (jaar onbekend, model ondersteunt geen jaar-loze verjaardag in v1).
- `BDAY` `onzin` → `null`.
- `ORG` niet-leeg → `customFields` bevat `{key:"Bedrijf", value}`.
- `ORG` leeg → geen `customFields`.
- Return-type: object met **camelCase-keys** (`customFields`, niet `custom_fields`). App.js mapt naar kolomnaam bij insert.
- Alle overige velden (`PHOTO`, `ADR`, …) genegeerd.

**`selectDefaultPicked`:**
- Telefoon aanwezig, geen bestaande naam, geen intra-file duplicaat → `true`.
- Geen telefoon, geen email → `false`.
- Telefoon aanwezig, naam bestaat al in DB (case-insensitive) → `false`.
- Telefoon aanwezig, naam al eerder in het bestand gezien → `false` (intra-file duplicaat).

**Handmatig / E2E (dev-Supabase):**
- iPhone-export van eigen adresboek uploaden → wizard toont N contacten → aanvinken → import → verschijnt in contact-lijst met juiste velden.
- Bij bestaande database: dedup werkt (badge zichtbaar, uit-gevinkt).
- `.vcf`-variant: skip-flow werkt.
- Fouten: kapot bestand → foutmelding zonder crash.

## Mockups

**Sessie-map:** `.superpowers/brainstorm/99648-1790172307/` (in `.gitignore`, niet gecommit).

| Bestand | Stap | Goedgekeurd? |
|---|---|---|
| `00-index.html` | index | ja |
| `01-platform.html` | Stap 1 | ja |
| `02-export-v2.html` | Stap 2 (iPhone) | ja — instructies bevestigd door owner |
| `02-export-android.html` | Stap 2 (Android) | akkoord op flow; **stappen concept**, verifieer nog |
| `02-export-vcf.html` | Stap 2 (vcf skip) | ja |
| `03-loading.html` | Stap 3 | ja |
| `04-selectie.html` | Stap 4 | ja |
| `wizard-shape.html` | vergelijking A/B wizard-vorm | keuze: A (meerstaps) |
| `02-export.html` | eerste iPhone-versie (v1) | afgekeurd (verkeerde stappen); vervangen door v2 |

Openen:

```bash
open /Users/quaiongen/.buzz/REPOS/contactbeheer/.superpowers/brainstorm/99648-1790172307/00-index.html
open /Users/quaiongen/.buzz/REPOS/contactbeheer/.superpowers/brainstorm/99648-1790172307/01-platform.html
open /Users/quaiongen/.buzz/REPOS/contactbeheer/.superpowers/brainstorm/99648-1790172307/02-export-v2.html
open /Users/quaiongen/.buzz/REPOS/contactbeheer/.superpowers/brainstorm/99648-1790172307/02-export-android.html
open /Users/quaiongen/.buzz/REPOS/contactbeheer/.superpowers/brainstorm/99648-1790172307/02-export-vcf.html
open /Users/quaiongen/.buzz/REPOS/contactbeheer/.superpowers/brainstorm/99648-1790172307/03-loading.html
open /Users/quaiongen/.buzz/REPOS/contactbeheer/.superpowers/brainstorm/99648-1790172307/04-selectie.html
```

## Data-flow (samengevat)

```
POST-LOGIN LOAD
  if contacts.length === 0 and source !== 'menu-open':
    openPhoneImportWizard('auto')

MENU 'Contacten importeren uit telefoon'
  → openPhoneImportWizard('menu')

WIZARD
  step platform:
    - auto-detect platform op user-agent
    - user kiest kaart → volgende
  step export:
    - render IMPORT_INSTRUCTIONS[platform] (of skip-flow bij 'vcf')
    - user kiest bestand (accept=.vcf) → volgende
  step loading:
    - text = readFileAsText(file)
    - parsed = parseVCard(text)
    - existingNames = new Set(contactsData.map(c => c.name.trim().toLowerCase()))  // in-memory
    - mapped = parsed.map(mapVCardToContact).filter(Boolean)
    - seenNamesInFile = new Set()
    - picked = []
    - for c of mapped:
        picked.push(selectDefaultPicked(c, existingNames, seenNamesInFile))
        seenNamesInFile.add(c.name.trim().toLowerCase())
    - render Stap 4
  step selectie:
    - lijst met vinkjes, zoek, alles-aan/uit, teller, badges
    - klik 'Importeer' → per aangevinkt contact: insert in Supabase
    - toon toast '{n} contacten geïmporteerd'
    - sluit modal, hertken contact-lijst
```

## Verificatie / testcriteria

- **Handmatig — eerste login** (dev-Supabase, leeg account): login → wizard opent automatisch → doorloop iPhone-flow met echt bestand → 20-plus contacten aangevinkt → import → contact-lijst toont alle nieuwe contacten.
- **Handmatig — menu-hergebruik**: bij een vol adresboek via menu opnieuw importeren, met deels overlappende namen → dedup-badges zichtbaar, alleen nieuwkomers standaard aangevinkt.
- **Handmatig — .vcf-skip**: platform "Ik heb al een bestand" → alleen bestandskiezer, geen instructies.
- **Handmatig — Sla over**: op stap 1 op "Sla over" klikken → wizard sluit → bij volgende login met 0 contacten opnieuw opgekomen (of nu via menu).
- **Handmatig — fout**: upload een niet-.vcf → inline foutmelding, geen crash. Upload een kapotte `.vcf` → foutmelding in Stap 3, terug-knop.
- **Unit-tests** groen (nieuwe `test/vcard.test.js`).
- **Regressie**: bestaande JSON-importer (`handleImportFile`) ongewijzigd; menu-item "Importeren" blijft werken zoals nu.

## Nog te doen vóór productie

- **Android-export-stappen laten valideren** door iemand met Android-toestel. Anders in de wizard onder een "kan verouderd zijn"-hint met link naar Google-help laten staan.
- **Notion-doc updaten** (contactbeheer-documentatie) met een sectie over de nieuwe import-flow (post-implement, hoort bij de deploy — CLAUDE.md-regel).
- **Backlog-status Notion** meebewegen tijdens implementatie (Design/mockup → Bouwen → Testen → Implementeren → Gereed).
- **CLAUDE.md cache-buster-regel verifiëren.** CLAUDE.md (regel 97) noemt alleen CSS-bump; deze feature raakt ook `js/lib.js` en `js/app.js`. Bevestig bestaande praktijk in `index.html`/`index-dev.html` (bumpt de app JS met een `?v=` bij releases?). Als ja én de regel is smaller dan de praktijk, dat in een aparte kleine PR aan CLAUDE.md verduidelijken. Buiten scope van deze feature.

## Buiten scope (v1)

- Google Contacts CSV, generieke CSV met kolom-mapping.
- Directe Google Contacts API-koppeling (via bestaande Google OAuth, met extra scope).
- Foto's (`PHOTO`), adressen (`ADR`), functie (`TITLE`), URL, nickname.
- Meerdere telefoons/emails per contact (bijv. thuis + werk als aparte `customFields`).
- Fuzzy dedup (`Jan Jansen` vs `J. Jansen`).
- Merge-flow ("vervangen bij duplicaat", "samenvoegen").
- Bewerken van veld-mapping in de UI.
- "Ongedaan maken"-actie na import (rollback van de laatste batch).
- iCloud- of Outlook-directe koppeling (`.ics`/`.pst` etc.).

## Openstaande vragen

Geen — alle keuzes zijn tijdens de brainstorm gemaakt. Verificatie van Android-stappen staat als expliciete pre-productie-actie in *Nog te doen vóór productie*.
