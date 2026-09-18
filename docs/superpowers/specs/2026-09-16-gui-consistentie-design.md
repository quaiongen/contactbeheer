# GUI-consistentie: één ontwerp-taal over Vandaag, Overzicht en Contacten

**Datum:** 2026-09-16
**Status:** ontwerp goedgekeurd door partner, wacht op spec-review

## Doel

Vandaag voelt strak; Overzicht en Contacten wijken visueel af. De gebruiker wil dat alle drie de tabs op elkaar lijken zonder de compactheid van Vandaag te verliezen. Kleur moet terugkomen (categorie), zonder de betekenis van urgentie-kleuren te vertroebelen.

## Probleem-samenvatting

- **Overzicht** oogt monochroom en tabellair; namen en categorie zijn niet snel scanbaar (bevestigd door partner: pijnpunten zijn "te weinig kleur" en "te weinig visuele hiërarchie").
- **Contacten** gebruikt nog de oorspronkelijke Bootstrap-look: gekleurde bovenrand per categorie, gekleurde categorie-badge, aparte progressbar met percentage, groene en blauwe actie-knoppen. Dat botst met de strakke stijl van Vandaag/Overzicht.
- **Rijen in Overzicht** zijn niet klikbaar; er is geen weg vanuit de bucket-overzichten naar acties.
- **Details-modal** mist bereik-acties (Bellen/WhatsApp/Mail + Nu afspraak maken); alleen Bewerken en Vastleggen zitten er nu.

## Ontwerp-principes

1. **Kleur heeft betekenis.** Categorie = avatar-vulkleur en filter-chip. Urgentie = bucket-bolletje en het rechter-label ("37 dagen te laat"). Categorie en urgentie nooit door elkaar.
2. **Contrast is niet-onderhandelbaar.** Grijzen op wit minimaal `#5B6470`; nooit lichter dan `#8A93A0`.
3. **Vorm volgt functie.** Vandaag is een actiescherm (max 3 kaarten, knoppen erin). Overzicht en Contacten zijn browse-lijsten (compacte rijen, klik → details).
4. **Eén weg voor acties.** Alle acties (bellen, WhatsApp, mail, nu afspraak, vastleggen, bewerken) zijn bereikbaar uit de details-modal. Vandaag toont ze extra inline vanwege snelheid.
5. **Historie is klikbaar.** Elke interactie in de historie opent zichzelf in de bewerk-modus. Max 5 zichtbaar; "Toon 5 eerdere momenten" onderaan bij meer.

## Gedeelde componenten

### Avatar (nieuw)

Ronde cirkel met initialen op categoriekleur.

- **Maten**: 32px voor lijst-rijen (Overzicht + Contacten), 36px voor Vandaag-kaarten, 48px in de details-modal.
- **Initialen**: twee letters, alle woorden. `"Jamiroquai"` → `JA`. `"Bart-Jan Lutmerding"` → `BJ`. `"Li Ying Tjeng"` → `LY`.
- **Achtergrondkleur**: categorie-kleur van het contact. Zonder categorie: `#8A93A0` (neutraal grijs).
- **Tekstkleur**: altijd wit, `font-weight: 600`.
- **Consistentie-eis**: exact dezelfde avatar op alle drie plekken (list-rij, kaart, modal-header).

### List-rij (Overzicht + Contacten)

Enkele rij binnen een `.glist` container met witte achtergrond en `#E1E5EA` rand.

**Naamgevings-noot:** de nieuwe rij-klasse heet `.glist-row` en niet `.row`, om collision met de Bootstrap-grid `.row` (nog steeds in gebruik elders in de app) te voorkomen.

- Layout: avatar links · naam+subtekst midden · rechter-label rechts.
- **Naam**: `font-size: 15px`, `font-weight: 600`, kleur `#151A21`, `text-overflow: ellipsis`.
- **Subtekst**: `font-size: 12px`, kleur `#5B6470`, `text-overflow: ellipsis`. Formaat: `{categorie} · {contextregel}` (bijv. `Urine · 97 dagen geen contact` in Overzicht, `Urine · elke 60 dagen` in Contacten).
- **Rechter-label**: `font-size: 12.5px`, `font-weight: 600`, kleur afhankelijk van bucket:
  - Bucket 1 `nu_afspraak_maken` → `#B23B32` (rood), tekst `"{n} dagen te laat"` of `"vandaag"`.
  - Bucket 2 `binnen_twee_weken` → `#96661A` (oranje), tekst `"over {n} dagen"`.
  - Bucket 3 `afspraak_staat_al` → `#2F5F8A` (blauw), tekst `"do 11:30"` / `"25 sep"`.
  - Bucket 4 `nooit_contact` → `#8A93A0` (grijs), tekst `"nog geen contact"`.
  - Bucket 5 `op_schema` → `#8A93A0` (grijs), tekst `"op schema"` (in Contacten). In Overzicht klapt Op schema in tot één regel.
- **Klik-gedrag**: de hele rij is klikbaar; opent de details-modal voor dat contact.

### Vandaag-kaart (aangepast)

- Layout: avatar (36px) linksboven · naam ernaast · urgentie-badge rechts · meta-regel · optionele poging-regel · reach-rij (Bellen/WhatsApp/Mail) · primaire knop (Nu afspraak maken).
- **Naam**: `font-size: 14px`, `font-weight: 600`.
- **Meta-regel**: uitspringend onder het avatar-blok, `font-size: 10px–11px`, kleur `#5B6470`. Formaat blijft: `{categorie} · laatste contact {date} · elke {n} dagen`.
- **Poging-regel**: subtiel grijs blokje (`#F1F3F6`), formaat `Geappt, vandaag` / `Gemaild, 3 dagen geleden`.
- **Reach-knoppen**: witte knoppen met dunne rand; disabled = subtiel grijs, niet verborgen.
- **Primaire knop**: donker (`#151A21`), volle breedte, tekst `Nu afspraak maken`.

### Details-modal (uitgebreid)

- **Top**: 48px avatar · naam (17px, bold) · categorie-regel (12px muted) · sluit-knop rechts.
- **Body sectie 1 (info)**: `flag-badge` met urgentie-label, dan info-rijen (Telefoon, E-mail, Geboortedatum). Telefoon en e-mail zijn klikbaar (`tel:` / `mailto:`).
- **Body sectie 2 (poging)**: `attempt-line` als er een poging binnen 14 dagen is.
- **Body sectie 3 (Contact opnemen)**: label + reach-rij (Bellen/WhatsApp/Mail) + primaire knop Nu afspraak maken.
- **Body sectie 4 (Contactgeschiedenis)**:
  - Kop: `Contactgeschiedenis` links, `n momenten` rechts.
  - Items (max 5 tegelijk): icoon · datum + optionele "gepland"-badge · korte omschrijving · chevron `›`.
  - Icons per type: `📅` gepland, `📞` telefoon, `💬` bericht, `📧` e-mail, `👤` persoonlijk, `🎥` video.
  - **Klik op item**: opent de bestaande interaction-modal in bewerk-modus voor die interactie.
  - **"Toon 5 eerdere momenten (n meer)"** onder de eerste 5; steeds +5 tot alles zichtbaar is.
- **Body sectie 5 (footer-rij)**: twee gelijkwaardige knoppen naast elkaar — Bewerken en Vastleggen.
- **Verwijderen niet in de details-modal.** Alleen bereikbaar via Bewerken (bevestigingsdialoog blijft).

## Per-tab layout

### Vandaag

- Tab-header: `{n} mensen wachten te lang` / `1 iemand wacht te lang`.
- Sub: `Meest verlopen bovenaan. Morgen schuiven de volgende door.`
- Kaarten: max 3, gesorteerd op dagen te laat (aflopend).
- Onder: `Nog {n} contacten staan te lang open.` bij meer dan 3.
- Empty state (0 contacten): `Klaar voor vandaag.` in gecentreerde grijze staat.

### Overzicht

- Bucket-secties op volgorde:
  1. Nu een afspraak maken (rood bolletje, sortering: dagen_te_laat desc)
  2. Binnen twee weken (oranje bolletje, sortering: dagen_te_laat asc)
  3. Afspraak staat al (blauw bolletje, sortering: eerste afspraakdatum asc)
  4. Geprobeerd, nog geen reactie (grijs bolletje, contacten uit bucket 1+2 met poging binnen 14 dagen — deze contacten **blijven ook zichtbaar in hun oorspronkelijke bucket 1 of 2**; deze sectie is een extra weergave, geen exclusieve verzameling)
  5. Nooit contact gehad (grijs bolletje)
- Op schema: ingeklapt onderaan als één regel; klik switcht naar Contacten.
- Elke rij is klikbaar (opent details-modal).

### Contacten

- Zoek-veld bovenaan (compact, één regel).
- Filter-chips horizontaal scrollbaar op één regel; actieve chip = zwart.
- Sort-dropdown (Urgentie / Eerstvolgende afspraak) direct daaronder.
- Eén lange lijst met alle contacten in dezelfde list-rij-stijl. Sortering en filter bepalen de volgorde.
- Elke rij is klikbaar (opent details-modal).
- Geen kaart-per-contact meer, geen progressbar, geen inline actie-knoppen (die zitten in de modal).
- Empty state: bestaande "Geen contacten gevonden — Klik op Nieuw Contact om te beginnen".

## Kleur-palet (definitief)

| Rol | Kleur | Gebruik |
|-----|-------|---------|
| Tekst primair | `#151A21` | Namen, koppen |
| Tekst secundair | `#5B6470` | Subtekst, tellers |
| Tekst tertiair | `#8A93A0` | Placeholders, disabled |
| Randen soft | `#EDF0F3` | Rij-scheiders |
| Randen | `#E1E5EA` | Container-randen |
| Paneel achtergrond | `#FFFFFF` | Kaarten, modal |
| Chip / poging-vlak | `#F1F3F6` / `#F4F6F8` | Attempt-line, "toon meer"-knop |
| Urgentie rood | `#B23B32` / bg `#FCF0EF` | Bucket 1, badge |
| Urgentie oranje | `#96661A` / bg `#FBF4E8` | Bucket 2 |
| Urgentie blauw | `#2F5F8A` / bg `#EFF4F9` | Bucket 3, gepland-badge |
| Urgentie grijs | `#8A93A0` | Bucket 4, 5, op schema |
| Categorie-kleuren | huidige 10 | Avatar-vulling, filter-chip |
| Donker (primair) | `#151A21` | Primaire knop, actieve chip |

## Impact op bestaande code

### `js/app.js`

- **`createContactCard`** (huidige rijke Bootstrap-kaart) → **vervangen** door een `renderContactRow(contact)` die dezelfde list-rij oplevert als Overzicht.
- **`renderContacts`** rendert nu binnen een `<div class="glist">` container in plaats van de Bootstrap `.row` met kolommen; sorteert nog steeds op basis van de dropdown.
- **`renderVandaagCard`** krijgt een avatar-element linksboven; meta-regel schuift onder het avatar-blok in.
- **`renderOverzichtSection`** krijgt avatar-element per rij; row-klik-handler geeft `showContactDetails(contact.id)`.
- **`showContactDetails`**:
  - Uitbreiden met de sectie **Contact opnemen** (Bellen / WhatsApp / Mail / Nu afspraak maken) direct onder de attempt-line. Hergebruikt `handleReach` en `openNewInteraction`.
  - Uitbreiden met paginering-logica in de historie: initieel 5 items tonen, klik op "Toon 5 eerdere momenten" verhoogt de limiet met 5.
  - Historie-items worden klikbaar; klik → `showInteractionModal(contactId, interactionId)` (bestaande bewerk-flow).
  - Verwijder-knop verhuist uit de modal-body naar de Bewerken-flow. Uit de HTML `#delete-contact-btn` verwijderen op deze locatie.
- **Nieuw hulpfuncties**:
  - `getContactInitials(contact)` — twee letters uit `contact.name`.
  - `getContactAvatarColor(contact)` — categorie-kleur of neutraal grijs.
  - `renderAvatar(contact, size)` — element-factory voor 32/36/48px varianten.

### `index.html` en `index-dev.html`

- Contact-container in Contacten-view: `<div class="row" id="contacts-container">` → `<div class="glist" id="contacts-container">`.
- Details-modal-body: nieuwe sectie voor bereik-knoppen; historie-items als `<button>` of `<div role="button">`; delete-knop weg.

### `css/styles.css`

- Nieuwe klassen: `.avatar` (met size-modifiers), `.glist`, `.row`, `.who-block`, `.right` (met bucket-modifiers), `.flag-badge`, `.attempt-line`, `.action-block`, `.reach-row`, `.primary-btn`, `.history-section`, `.history-item`, `.load-more`.
- Oud opruimen: `.contact-card`-styles die alleen door de rijke Bootstrap-kaart werden gebruikt (`progress`, `progress-bar`, `notification-dot` in de contact-context), `.status-good/warning/danger` (blijven wel bestaan als CSS-klassen zolang ze elders gebruikt worden — controleren tijdens implementatie).

### Geen impact

- Datamodel (Supabase) blijft ongewijzigd — geen SQL-migratie nodig.
- `js/supabase-config*.js` ongemoeid.
- Google Calendar-flow (reconnect-prompt) ongemoeid.
- Bucket-logica (`computeBucket`, `computeDagenTeLaat`, `formatUrgencyLabel`, `formatAttemptLabel`) ongemoeid.

## Verificatie / testcriteria

- **Visueel**: op 380px viewport is het eerste contact in Contacten volledig zichtbaar zonder scrollen.
- **Categorie-kleur**: avatar-vulkleur komt overeen met de kleur van de categorie-chip in de filter-balk.
- **Klik-flow**: klik op elke rij in Overzicht én Contacten opent de details-modal met de juiste contact.
- **Bereik-knoppen in details-modal**: klik op Bellen/WhatsApp/Mail volgt exact hetzelfde pad als op de Vandaag-kaart (attempt-insert + tel:/wa.me/mailto:).
- **Historie-klik**: klik op een interactie in de historie opent `showInteractionModal(contactId, interactionId)` in bewerk-modus.
- **Paginering historie**: bij 6+ items zijn er 5 zichtbaar, knop toont resterende aantal, klik verhoogt met 5.
- **Verwijderen alleen via Bewerken**: geen delete-knop meer in de details-modal-body; delete blijft werken vanuit Bewerken met bevestigingsdialoog.
- **Consistente subtekst-contrast**: geen tekst met `color` lichter dan `#5B6470`.
- **Regressies**: sort-dropdown, categorie-filter en zoek werken nog steeds op Contacten; Vandaag-restnote en empty-state blijven werken.

## Buiten scope

- Aanpassen van de contact-vaststel-modal (`#interaction-modal`) zelf — die blijft met de Google Calendar-velden zoals hij is.
- Aanpassen van de contact-bewerk-modal (`#contact-modal`) — die blijft in huidige Bootstrap-look. Verwijderen-knop staat daar al.
- Categoriebeheer-modal (`#categories-modal`) — buiten deze GUI-refactor.
- Animaties/transities — geen bijzondere overgangen bijgevoegd (bestaande Bootstrap-modal-fade blijft).
- Toevoegen van avatar-foto-upload — initialen volstaan voor nu.

## Openstaande vragen

Geen op dit moment.
