# Slot-zoeker wizard bij nieuwe afspraak

**Datum:** 2026-09-19
**Status:** ontwerp goedgekeurd door partner (via klikbare mockup), wacht op spec-review

## Doel

Bij het aanmaken van een nieuwe afspraak wil de gebruiker niet meer eerst een datum kiezen en dán zien wat er die dag al staat. In plaats daarvan: **eerst een tijdvenster + duur opgeven** (via preset of eigen invoer), dan **5 voorgestelde slots** krijgen — elk voorstel getoond als een mini-dag-agenda met het voorstel-slot in context van de bestaande afspraken. Klik op een voorstel → interaction-modal voorgevuld.

Beperkt tot **één contact per afspraak** (zoals nu). Verandert de bestaande UI-instap ("Nu afspraak maken") — de wizard komt ertussen; daarna volgt het bestaande interaction-formulier.

## Design-principes

1. **Wizard tussen trigger en formulier.** Trigger-knop opent niet meer direct de interaction-modal maar eerst de wizard. Na slot-keuze opent het formulier voorgevuld.
2. **Preset > flexibel.** De meeste sociale afspraken zijn Lunch of Diner. Twee vaste presets dekken 80% van de gevallen; "Anders" blijft beschikbaar voor de rest.
3. **Voorstel in agenda-context.** Elk voorstel is een compacte dag-agenda: bestaande events + het voorstel-slot chronologisch onder elkaar, voorstel gemarkeerd. Zo zie je meteen "past dit tussen mijn dag door".
4. **Titels tonen.** Bestaande events worden met titel getoond (privacy-scope al aanwezig via `calendar.events`).
5. **Fallback zonder Calendar.** Zonder verbinding werkt de zoeker beperkt (venster zonder busy-check). Gebruiker krijgt een uitleg + optie om te verbinden.

## Onderdelen

### Trigger-knoppen (bestaand)
De wizard vervangt de directe opening van de interaction-modal op drie plekken:

- `handlePlan(contact)` in `js/app.js` — Vandaag-kaart, primaire "Nu afspraak maken".
- `add-interaction-btn` in details-modal — "Nieuw contact vastleggen".
- Log-interaction-btn op contact-card (kaart-lijst) — indien nog aanwezig na GUI-refactor.

Alle drie roepen momenteel `openNewInteraction(contactId)` aan (met calendar-reconnect-check). Nieuwe flow: `openNewInteraction(contactId)` opent de wizard i.p.v. `showInteractionModal(contactId)`. Reconnect-check blijft ervoor gebeuren zoals nu.

### Wizard-modal — nieuwe Bootstrap-modal
- HTML-id: `slot-wizard-modal`.
- Één modal, meerdere states (`preset` / `anders` / `loading` / `results`), state-management in JS.
- Op elk moment sluitbaar met een X of Esc → geen interaction-modal opent.

### Stap 1 — Preset-keuze
Drie klikbare kaarten (verticaal gestapeld op mobiel, worden knoppen op desktop):
- **🍽 Lunch** — start tussen 11:30 en 12:00, duur 90 min.
- **🍷 Diner** — start tussen 18:00 en 19:30, duur 180 min.
- **⚙️ Anders** — vervolg naar Stap 2.

Onder de kaarten: input **Aantal dagen vooruit** (default `30`, min `1`, max `365`). Waarde persistent binnen sessie.

Weekenden altijd meegenomen (geen toggle).

### Stap 2 — "Anders"-inputs
Zichtbaar alleen als "Anders" gekozen is:
- **Starttijd** — `<input type="time">`, default `14:00`.
- **Duur (minuten)** — `<input type="number" min="15" step="15">`, default `60`.

Knoppen: `Terug` (naar Stap 1) · `Zoek slots` (naar Stap 3).

Voor "Anders": start-venster = één exact tijdstip (`startVensterVan == startVensterTot == starttijd`).

### Stap 3 — Zoeken (loading)
Toon spinner + tekst `"Zoeken in Google Calendar…"`. Tijdens deze state:

1. **Sequentieel** per dag (day-by-day, geen `Promise.all`) — zo stoppen we zodra we 5 slots hebben en besparen we API-calls. Voor elke dag in `[today, today + horizonDagen)`:
   - Fetch `events.list` op primary calendar. Parameters:
     - `timeMin` = dag@07:00 lokale tijdzone van de browser, geserialiseerd als RFC3339 met offset (bv. `2026-09-24T07:00:00+02:00`). Gebruik `new Date(...).toISOString()` NIET direct — dat converteert naar UTC. In plaats daarvan een helper die `date.getTimezoneOffset()` in de offset-suffix zet.
     - `timeMax` = dag@23:00 lokale tijdzone, idem geserialiseerd.
     - `singleEvents=true`, `orderBy=startTime`.
   - Filter events die skip-baar zijn: all-day events (`start.date` gezet i.p.v. `start.dateTime`), events waar de user heeft geantwoord `declined`, transparent-events (busy=false).
2. Voor elke dag: **vindVrijeSlot(events, startVensterVan, startVensterTot, duur)**:
   - Loop over kandidaat-starttijden binnen het venster in stappen van 15 minuten (voor "Anders": alleen de exacte starttijd).
   - Voor elke kandidaat: check of het blok `[kandidaat, kandidaat+duur)` geen enkele busy overlapt.
   - Return de eerste passende starttijd of `null`.
3. Verzamel de eerste 5 dagen met een geldige slot. Break de loop zodra we 5 hebben.
4. **Zelfde gefilterde event-set** die in vindVrijeSlot wordt gebruikt, gaat mee naar Stap 4 als context voor de agenda-mini-view (dus geen all-day-events of declined-events in de agenda-rijen).

### Stap 4 — Resultaten
Titel: `Voorstellen` + subtekst met preset-label + horizon.

Per voorstel (max 5):
```
<div class="slot" onclick="chooseSlot(i)">
  <div class="day-header">wo 24 sep</div>
  <div class="agenda-row">
    <span class="time">09:00-10:00</span> <span class="title">Standup</span>
  </div>
  <div class="agenda-row proposal">
    <span class="time">12:00-13:30</span>
    <span class="title">Lunch met Bizarros Problemas ← voorstel</span>
  </div>
  <div class="agenda-row">
    <span class="time">14:00-15:00</span> <span class="title">Klantcall Acme</span>
  </div>
</div>
```

Visuele stijl:
- `.slot` wit met dunne rand, klikbaar (hover: subtiele shadow).
- `.day-header` bold, onderstreepje.
- `.agenda-row` grijs, tabular-nums voor tijden.
- `.agenda-row.proposal` rode achtergrond-tint (`#FCF0EF`) + rode linker-balk (`border-left: 3px solid #B23B32`) + rode tekst. Bevat suffix `← voorstel`.
- Als dag geen andere events heeft: rij `Verder niks` in italic-grijs.

Bij 0 voorstellen:
```
Geen vrije slots gevonden
Probeer een langere horizon of andere tijden.
```

Knoppen onderaan: `Terug` (naar Stap 1).

### Slot kiezen
Klik op een voorstel → wizard sluit → interaction-modal opent (`showInteractionModal(contactId)`) met **voorgevulde velden**:

- `interaction-date` = voorstel-datum (`YYYY-MM-DD`).
- `interaction-start-time` = voorstel-start (`HH:MM`).
- `interaction-end-time` = voorstel-eind (`HH:MM`).
- `interaction-title` = auto-vullen alleen als leeg:
  - Lunch → `"Lunch met {contact.name}"`.
  - Diner → `"Diner met {contact.name}"`.
  - Anders → niet vullen.
- Overige velden (locatie, type, notities): leeg / default.

Klik Opslaan in interaction-modal: bestaande `saveInteraction`-flow (inclusief Google Calendar-event via bestaande `createCalendarEvent`).

### Fallback zonder Google Calendar
Als bij het openen van Stap 1 geldt dat `googleAccessToken === null`:
- Toon boven de preset-kaarten een geel infoblok: *"Google Calendar niet verbonden — de zoeker toont slots zonder agenda-check. Elke dag in de horizon krijgt één voorstel."* + knop `Nu verbinden`.
- **Het gele infoblok is ook zichtbaar in Stap 2** (Anders-invoer), zodat de gebruiker halverwege niet verrast wordt dat er geen agenda-check gedaan wordt.
- Knop `Nu verbinden` roept `connectGoogleCalendar()` aan. Bij succes → wizard hertekent (zonder infoblok, met agenda-check actief). Bij mislukking → wizard blijft in fallback-mode.
- In Stap 3 (loading): geen `events.list`-calls; genereer per dag één voorstel op de opgegeven starttijd (voor Lunch: 11:30; Diner: 18:00; Anders: de user-tijd). Neem eerste 5 dagen die passen (weekenden inbegrepen).
- Stap 4 toont voorstellen zonder `.agenda-row`-context (alleen de proposal-rij).

## Data-flow (samengevat)

```
klik "Nu afspraak maken" (contactId)
  → openNewInteraction(contactId)
    → checkCalendarConnect()   [bestaande reconnect-flow]
    → openSlotWizard(contactId)
      → step preset:
        - user kiest preset
        - if 'anders': step anders (starttijd, duur)
        - else: presetSpec = { startVensterVan, startVensterTot, duur }
      → step loading:
        - loop dagen in [today, today+horizon):
          if connected: events = calendar.events.list(day)
                       slot = vindVrijeSlot(events, presetSpec)
          else:         slot = { start: preset-starttijd, end: start+duur }
                       events = []
          if slot: voorstellen.push({ day, slot, events })
          break als voorstellen.length == 5
      → step results:
        - render voorstellen als agenda-mini-view
        - klik voorstel → chosen = { contactId, presetType, slot }
          → wizard sluit
          → showInteractionModal(contactId)
          → prefill(chosen)
```

## Impact op bestaande code

### `js/app.js`

- **Nieuwe module (zelfde bestand of separaat)**: `openSlotWizard(contactId)` — orchestreert de wizard.
- **Nieuwe pure functies** (kunnen naar `js/lib.js`, dus test-baar):
  - `vindVrijeSlot(events, startVensterVan, startVensterTot, duur, stapMinuten=15)` → `{startTime, endTime} | null`.
  - `bouwAgendaItems(events, slot, proposalTitle)` → gesorteerde array voor render.
  - `presetSpec(presetType, andersInput?)` → `{startVensterVan, startVensterTot, duur, titelTemplate}`.
- **Bestaande wijziging** `openNewInteraction(contactId)`:
  - Was: opent direct interaction-modal na Calendar-reconnect-check.
  - Wordt: opent wizard (na dezelfde check).
  - Interaction-modal wordt pas geopend nadat een slot gekozen is (of niet, als user wizard sluit).
- **Nieuw**: `showInteractionModal` accepteert optioneel `{prefill}` argument, of we zetten de veldwaarden vlak vóór de `.show()`-aanroep.
- **Nieuwe API-helper**: `listCalendarEventsForDay(dateStr)` → `events.list` op primary calendar voor dag-blok 07:00-23:00, retourneert array `{start, end, title}`.

### `index.html` en `index-dev.html`

- Nieuwe Bootstrap modal `#slot-wizard-modal` met interne div `#slot-wizard-body` (dynamisch gerenderd door JS, net als `#details-modal-body`).
- Cache-buster op `js/app.js` (of `js/lib.js`) bumpen.

### `css/styles.css`

Nieuwe klassen: `.slot-wizard-*`, `.preset-btn`, `.horizon-box`, `.anders-form`, `.slot`, `.day-header`, `.agenda-row`, `.agenda-row.proposal`, `.agenda-row.empty`, `.fallback-warn`, `.loading`.

### Testen

Nieuwe test-file `test/slot-finder.test.js`:
- `vindVrijeSlot`: leeg dag → passeert startVensterVan.
- Vol dag: null.
- Overlap aan begin/einde van venster.
- Exact aansluitend event: past nog steeds.
- `startVensterVan == startVensterTot` (Anders-modus): passeert of null.
- Duur langer dan venster: null.
- Meerdere kandidaten in stappen van 15 min: eerste passende wint.

Nieuwe DOM-tests niet nodig; wizard state en render zijn UI-glue.

## Verificatie / testcriteria

- **Handmatig — happy path**: klik "Nu afspraak maken" op Jamiroquai → wizard → Lunch → 5 voorstellen → klik derde → interaction-modal opent met datum + tijden gevuld en titel "Lunch met Jamiroquai".
- **Handmatig — Anders**: idem, maar met "Anders" → stap 2 → invoer 15:00 60 min → voorstellen op 15:00 in de horizon → klik → formulier zonder titel-invulling.
- **Handmatig — fallback**: OAuth uit, klik "Nu afspraak maken" → wizard toont geel blok, Lunch → 5 voorstellen op 11:30 zonder events erin.
- **Unit-tests** groen (nieuwe test-file).
- **Regressie**: `renderVandaag`, `showContactDetails`, `saveInteraction` ongewijzigd van gedrag. Alleen het pad ná trigger-knop is anders.

## Buiten scope

- Duur van een slot in de voorstellen bijstellen (bv. "Lunch is normaal 90 min, maar bij deze afspraak wil ik 60 min"). Kan later.
- Werkdagen-filter of andere weekend-toggle. Als de user aangeeft zaterdag-lunches vaak weg te klikken, dan alsnog.
- Slot verplaatsen ná opslaan via drag-en-drop in een agenda-view. Buiten scope.
- Voorstellen tonen die "bijna passen" (bv. je zoekt 90 min maar er is een blok van 75 min beschikbaar).
- Meerdere agenda's van dezelfde gebruiker doorzoeken (nu: alleen `primary`).
- Voorstellen versturen naar contact (uitnodigings-flow) — de mail-uitnodiging gebeurt straks via Google Calendar zelf zodra het event is aangemaakt.

## Openstaande vragen

Geen op dit moment.
