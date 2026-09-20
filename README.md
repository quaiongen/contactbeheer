# Contactbeheer

Een persoonlijke contactbeheer-app om bij te houden wanneer je contact hebt gehad met mensen en wanneer het weer tijd is om iemand te spreken.

🔗 **Live app**: [quaiongen.github.io/contactbeheer](https://quaiongen.github.io/contactbeheer/)

---

## Wat doet de app?

Je stelt per contact in hoe vaak je contact wilt hebben (bijv. elke 30 dagen). De app deelt je contacten automatisch in vijf buckets in — van "nu een afspraak maken" tot "op schema" — en toont dagelijks maximaal drie mensen die je aandacht nodig hebben. Bellen, WhatsAppen en mailen kan met één tik. Afspraken kun je direct in je Google Calendar zetten.

---

## Schermen

De app heeft drie tabbladen die dezelfde visuele taal delen: een ronde avatar met initialen in de kleur van de categorie, prominente naam, ondergeschikte subtekst en een urgentie-label rechts.

### Vandaag
Standaard-landingspagina. Toont maximaal drie kaarten uit de bucket **Nu een afspraak maken**, gesorteerd op wie het langst wacht. Per kaart:

- Avatar met initialen (categoriekleur) · naam · badge `{n} dagen te laat` of `vandaag`.
- Eén regel metadata: categorie · laatste contact · frequentie.
- Poging-regel als je recent hebt geprobeerd (bijv. `Geappt, 4 dagen geleden`). Een poging is alleen weergave — de teller blijft rood tot er een afspraak is.
- Drie gelijkwaardige knoppen: **Bellen** (`tel:`), **WhatsApp** (`wa.me`) en **Mail** (`mailto:`). Knop is disabled als het onderliggende gegeven ontbreekt.
- Eén primaire knop **Nu afspraak maken** die het bestaande "Contact Vastleggen"-formulier opent.

Kop: **Tijd voor een catch-up** — sub: _Langst geleden geen contact mee gehad bovenaan_. Klik op naam of avatar → details-modal met alle informatie en acties. Onder de kaarten: `Nog {n} contacten staan te lang open`. Bij 0 openstaande: een lege staat.

### Overzicht
Compacte lijst met alle contacten gegroepeerd per bucket, met gekleurde bolletjes per sectie en tellers naast de titel. Volgorde:

1. 🔴 **Nu een afspraak maken** — dagen sinds laatste contact ≥ frequentie.
2. 🟠 **Binnen twee weken** — volgende gewenste datum ligt 0–14 dagen weg.
3. 🔵 **Afspraak staat al** — er is een toekomstig gepland contactmoment.
4. ⚪ **Geprobeerd, nog geen reactie** — subverzameling van bucket 1 en 2 met een poging binnen 14 dagen. Contacten blijven ook zichtbaar in hun eigen bucket.
5. ⚪ **Nooit contact gehad** — geen enkel contactmoment, geen afspraak.
6. **Op schema** — ingeklapt als één regel onderaan; klik opent de Contacten-tab.

Per rij: avatar met initialen (categoriekleur), naam, subtekst (categorie · X dagen geen contact), rechts een gekleurd label per bucket (rood/oranje/blauw/grijs). **Klik op een rij → details-modal.**

### Contacten
Zelfde list-stijl als Overzicht, maar één lange lijst zonder bucket-koppen. Bovenaan: sortering (**Urgentie** of **Naam A-Z**), zoekveld, en horizontaal scrollende categorie-filter-chips. Elke rij: avatar · naam · categorie · elke {n} dagen · rechts een bucket-gekleurd status-label.

**Klik op een rij → details-modal**, waarin alles zit: bellen/WhatsApp/mail-knoppen, Nu afspraak maken, Bewerken/Vastleggen en de contactgeschiedenis.

### Details-modal
Overal in de app wordt hetzelfde detailscherm getoond:

- Grote avatar (48px) · naam · `{categorie} · elke {n} dagen`.
- Badge met de huidige status (bijv. `37 dagen te laat`, `Afspraak do`, `Op schema`).
- Info-rijen: Telefoon (klikbare `tel:`-link), E-mail (klikbare `mailto:`), Geboortedatum, Notities, en overige custom fields.
- Poging-regel bij recente poging.
- **Contact opnemen**: drie knoppen (Bellen / WhatsApp / Mail) + primaire knop Nu afspraak maken.
- **Contactgeschiedenis**: eerste 5 items zichtbaar met icoon per type (📅 gepland, 📞 telefoon, 💬 bericht, 📧 mail, 👤 persoonlijk, 🎥 video), datum en detail. Klik op een item → opent Bewerken voor die interactie. Bij meer dan 5 momenten verschijnt een "Toon 5 eerdere momenten (n meer)"-knop.
- Onderaan: Bewerken en Vastleggen naast elkaar. Verwijderen is niet meer in de details-modal aanwezig; dat gebeurt vanuit de Bewerken-flow (met bevestigingsdialoog).

---

## Functies

### 👤 Contacten
- Contacten toevoegen, bewerken en verwijderen.
- Vaste velden: naam, categorie, geboortedatum, gewenste contactfrequentie, **telefoonnummer**, **e-mailadres**, notities.
- Extra vrije velden (sleutel/waarde-paren) voor overige informatie.
- Bij bewerken worden bestaande telefoon/mail-custom-fields automatisch gemigreerd naar de vaste velden.

### 📋 Afspraken & interacties
- Contactmomenten vastleggen met titel, datum + tijdvak (van–tot), type, locatie en notities.
- Typen: persoonlijk, videogesprek, telefoongesprek, bericht, e-mail, overige.
- Geplande afspraken (contactmomenten op vandaag of in de toekomst) aanmaken en later bewerken of verwijderen. Afspraken in het verleden worden opgeslagen als "reeds gebeurd".
- Bij een nieuwe afspraak checkt de app of Google Calendar verbonden is en biedt de gebruiker de keuze om te verbinden of door te gaan zonder Calendar.

### 🎯 Pogingen (attempts)
- Elke klik op Bellen, WhatsApp of Mail vanuit de Vandaag-kaart wordt stilletjes vastgelegd als een poging.
- Pogingen tellen **niet** mee voor de urgentieberekening — alleen een echt vastgelegd contactmoment of een geplande afspraak halen iemand van de "Nu"-lijst.
- Pogingen vervallen na 14 dagen; oudere worden genegeerd.
- Zichtbaar op de Vandaag-kaart en in de sectie "Geprobeerd, nog geen reactie" in het Overzicht.

### 🚦 Urgentie & buckets
- Elk contact zit in precies één bucket, bepaald door: gewenste frequentie, laatste contactmoment en toekomstige afspraken.
- Nieuw afgeleid veld `dagen te laat`: dagen sinds laatste contact minus de frequentie.
- Teksten: `{n} dagen te laat` · `vandaag` · `over {n} dagen` · `nog geen contact`.
- Rechter-label kleur per rij: rood (te laat), oranje (binnen twee weken), blauw (afspraak staat al), grijs (nooit / op schema).

### 🗂️ Categorieën
- Categorieën aanmaken en bewerken met een naam en een kleur uit een keuze van tien.
- Filteren op categorie via horizontaal scrollende chips boven de contactenlijst.
- Kleurgecodeerde badge en randkleur op elke contactkaart in het Contactenoverzicht.

### 📧 Wekelijkse herinneringsmail (opt-in)
- Elke maandagochtend ontvang je een e-mail met de contacten die te lang wachten (bucket **Nu een afspraak maken**).
- Onderwerp: `Tijd voor een catch-up met N contacten`.
- Inhoud: max 5 contacten, met naam · dagen te laat · eventuele recente poging · directe link per contact naar de app.
- Voettekst met samenvatting van geplande afspraken en op-schema-contacten.
- Bij 0 contacten in "Nu een afspraak maken" gaat er géén mail uit — geen ruis.
- Draait als Supabase Edge Function met cron; verzending via Resend.

### 📅 Google Calendar-integratie
- Koppel je Google Calendar via het menu (hamburger rechtsboven).
- Bij het plannen van een contactmoment zie je jouw agenda-afspraken voor die dag.
- Geplande afspraken worden automatisch als event aangemaakt, gewijzigd en verwijderd in Google Calendar.
- Koppeling blijft ~60 dagen actief via stille token-vernieuwing.
- Als je op enig moment ontkoppeld raakt, verschijnt bij een nieuwe afspraak een keuze-prompt: **Verbinden** of **Zonder Calendar**. Gebruikers die de koppeling nooit hebben aangezet zien deze prompt niet.

### 🔍 Slot-zoeker (wizard bij nieuwe afspraak)
- Bij het aanmaken van een nieuwe afspraak opent eerst een wizard i.p.v. het lege formulier.
- Kies **Lunch** (11:30–12:00 · 90 min), **Diner** (18:00–19:30 · 3 uur) of **Anders** (eigen tijd + duur).
- Instelbaar hoeveel dagen vooruit gezocht wordt (default 30).
- App zoekt via Google Calendar naar de eerste 5 dagen waarin je gekozen venster + duur past.
- Elk voorstel wordt getoond als mini-dag-agenda: bestaande afspraken die dag + het voorstel-slot, chronologisch, voorstel gemarkeerd in rood.
- All-day events (bijv. Vakantie) verschijnen bovenaan als grijze rij "Hele dag" — ze blokkeren geen slots, dienen als context.
- Klik op een voorstel → het formulier opent met datum, tijd én titel ("Lunch met {naam}" of "Diner met {naam}") ingevuld.
- Knop **"Volgende 5 →"** toont de eerstvolgende 5 dagen als je meer opties wil binnen de horizon.
- Bij een interactie **verwijderen** in bewerkmodus verdwijnt óók de gekoppelde Google Calendar-afspraak.
- **Zonder Google Calendar-verbinding**: wizard slaat de voorstellen-stap over — het formulier opent direct met tijd + titel voorgevuld (datum = vandaag; zelf te wijzigen).

### 🔍 Zoeken & filteren
- Zoek contacten op naam via de zoekbalk (Contacten-tab).
- Filter op categorie via horizontaal scrollende chips.
- Sorteermogelijkheden op de Contacten-tab: op urgentie of op eerstvolgende afspraak.

### 🔔 Notificaties
- Browser-notificaties voor contacten die wenselijk zijn.
- Melding als een contact al te lang niet gesproken is (met aantal dagen).
- Klikken op notificatie opent het betreffende contact.

### 💾 Data & backup
- Alle data opgeslagen in de cloud via Supabase (per gebruiker, volledig privé).
- Export naar JSON-bestand als lokale backup.
- Import van eerder geëxporteerde JSON-bestanden.

### 🔐 Account & beveiliging
- Registreren met e-mail en wachtwoord.
- Inloggen en uitloggen.
- Wachtwoord vergeten / herstellen.
- Row Level Security zorgt dat elke gebruiker uitsluitend zijn eigen data ziet.

### 📱 Mobiel
- Compacte app-balk: alleen titel en een hamburger-menu (Nieuw contact · Google Calendar · Categorieën · Importeren · Exporteren · Uitloggen).
- Filter-chips zijn horizontaal scrollend op smalle schermen.
- Ontwerpt voor een viewport van 380px breed; het eerste contact staat zichtbaar zonder scrollen.
- Verwijderen-actie is secundair (geen prominente knop) en vraagt om bevestiging.

---

## Aan de slag

### 1. Account aanmaken
1. Ga naar [quaiongen.github.io/contactbeheer](https://quaiongen.github.io/contactbeheer/).
2. Klik op **Inloggen / Registreren**.
3. Kies het tabblad **Registreren** en maak een account aan.

### 2. Eerste contact toevoegen
1. Open het menu (hamburger rechtsboven) en klik op **Nieuw contact**.
2. Vul naam en gewenste contactfrequentie in (bijv. 30 dagen).
3. Optioneel: geboortedatum, telefoonnummer, e-mailadres, notities of een categorie.
4. Klik op **Opslaan**.

### 3. Contactmoment vastleggen
1. Ga naar de **Contacten**-tab en klik op **Vastleggen** op de contactkaart, of gebruik **Nu afspraak maken** op een Vandaag-kaart.
2. Kies het type contact en de datum.
3. Voeg eventueel locatie, tijdvak en notities toe.
4. Klik op **Opslaan**.

### 4. Google Calendar koppelen
1. Open het menu en kies **Google Calendar**.
2. Log in met je Google-account en geef toestemming.
3. Het menu-item toont dan **Gekoppeld ✓**.
4. Bij een nieuwe afspraak zie je jouw agenda-afspraken voor die dag.

---

## Technologie

| Onderdeel | Technologie |
|-----------|-------------|
| Frontend | Vanilla JavaScript, HTML5, CSS3 |
| UI Framework | Bootstrap 5.3 + Bootstrap Icons |
| Database & Auth | Supabase (PostgreSQL + Row Level Security) |
| Agenda-integratie | Google Identity Services + Calendar API v3 |
| Hosting | GitHub Pages |

---

## Datamodel (Supabase)

| Tabel | Belangrijkste kolommen | Doel |
|-------|------------------------|------|
| `contacts` | `id`, `user_id`, `name`, `category_id`, `birthday`, `frequency`, `notes`, `phone`, `email`, `custom_fields` | Kern-record per persoon |
| `interactions` | `id`, `contact_id`, `user_id`, `date`, `type`, `notes`, `planned`, `calendar_event_id` | Vastgelegde en geplande contactmomenten |
| `attempts` | `id`, `contact_id`, `user_id`, `kanaal` (`bellen`\|`whatsapp`\|`mail`), `created_at` | Pogingen vanuit Vandaag-scherm; vervallen na 14 dagen |
| `categories` | `id`, `user_id`, `name`, `color` | Categorieën met kleurcodering |
| `weekly_digest_v` (view) | `user_id`, `id`, `naam`, `bucket`, `dagen_te_laat`, `laatste_poging_kanaal`, `laatste_poging_dagen`, `frequency_effective` | Bron voor de wekelijkse herinneringsmail; bucket-logica in SQL, exact als `js/lib.js` |

SQL-bestanden in de repo-root voor het opzetten van dev- of prod-project:

- `SUPABASE_SETUP.md` — instructies voor initiële `contacts` en `interactions`.
- `SUPABASE_CATEGORIES.sql` — categorieën-tabel.
- `SUPABASE_ATTEMPTS.sql` — pogingen-tabel (Vandaag-scherm).
- `SUPABASE_PHONE_EMAIL.sql` — vaste kolommen `phone` en `email` op `contacts`.

Elke tabel heeft Row Level Security policies die filteren op `auth.uid() = user_id`.

---

## Projectstructuur

```
visuele contacten/
├── index.html                    # Productie-versie
├── index-dev.html                # Ontwikkelversie (Supabase dev-project)
├── css/
│   └── styles.css                # Alle styling
├── js/
│   ├── lib.js                    # Pure logica-laag (bucket, formatters, avatar, sort)
│   ├── app.js                    # DOM- en Supabase-code; gebruikt lib.js
│   ├── supabase-config.js        # Prod-config (URL + anon key)
│   └── supabase-config-dev.js    # Dev-config
├── test/
│   ├── bucket.test.js            # Bucket-logica + rightLabelClass + getRecentAttempt
│   ├── formatters.test.js        # Urgentie- en attempt-labels, planned-date, dagWoord
│   ├── avatar.test.js            # Initialen
│   ├── phone.test.js             # normalizePhoneForWa + getContactPhone/Email
│   ├── sort.test.js              # urgencyRank op de Contacten-tab
│   └── slot-finder.test.js       # presetSpec, vindVrijeSlot, bouwAgendaItems
├── .github/workflows/tests.yml   # CI: draait node --test bij elke push/PR
├── .githooks/pre-commit          # Lokale pre-commit test-run
├── docs/
│   ├── implementatie-brief.md    # Feature-brief voor Vandaag/Overzicht
│   ├── prompt-weekmail.md        # Feature-brief voor wekelijkse mail
│   ├── mockup-v2.html            # Visuele mockup
│   ├── backlog.md                # Openstaande wensen
│   ├── runbook-productie.md      # Stap-voor-stap uitrol van dev naar prod
│   ├── superpowers/specs/        # Ontwerp-documenten
│   └── superpowers/plans/        # Implementatie-plannen bij specs
├── package.json                  # `npm test`
├── supabase/functions/weekly-digest/
│   ├── 01_view.sql               # View weekly_digest_v (bucket-logica in SQL)
│   ├── 02_testdata.sql           # Testrijen voor de view (7 randgevallen)
│   ├── 03_cron.sql               # pg_cron-schedule voor wekelijkse mail
│   └── index.ts                  # Deno Edge Function (build mail + Resend)
├── SUPABASE_SETUP.md
├── SUPABASE_CATEGORIES.sql
├── SUPABASE_ATTEMPTS.sql
├── SUPABASE_PHONE_EMAIL.sql
├── SUPABASE_FIX_PLANNED.sql
└── DEPLOYMENT.md
```

---

## Wekelijkse herinneringsmail — technisch

Backend-flow los van de frontend, samengesteld uit:

- **`weekly_digest_v`** (Postgres-view) — dezelfde bucket-regels als `js/lib.js`. Bewuste duplicatie in twee talen; beide moeten meebewegen als de regels wijzigen.
- **Edge Function** `weekly-digest` (`supabase/functions/weekly-digest/index.ts`) — bouwt HTML + plain-text mail, verstuurt via Resend.
- **Query-params**:
  - `?dryRun=true&userId=<uuid>` → HTML in response, geen verzending.
  - `?userId=<uuid>` → filter op één user.
  - `?forceTo=<email>` → overschrijft de ontvanger (test-modus zolang geen eigen domein bij Resend).
- **Cron** via `pg_cron` + `pg_net`; schedule `0 8 * * 1` = maandag 09:00 NL wintertijd / 10:00 zomertijd. Bewust geen slimme DST-omschakeling.
- **Secrets** in Supabase Vault: `weekly_digest_url`, `weekly_digest_service_key`. Env-secret voor de Edge Function: `RESEND_API_KEY` (optioneel `RESEND_FROM`).
- **`docs/prompt-weekmail.md`** is de brief die deze functionaliteit definieert.
- **Openstaande items** (eigen domein, robustheid, abonnements-instellingen, productie-uitrol) staan in `docs/backlog.md`.

---

## Tests

Pure-logica testset via Node's ingebouwde `node --test` (geen dependencies).

```bash
npm test
```

Draait 46 tests in ~50ms. Dekt bucket-logica, tekst-formatters, avatar-initialen, telefoon-normalisatie en urgentie-sortering.

**GitHub Actions** (`.github/workflows/tests.yml`) draait dezelfde suite bij elke push en pull request naar `main`.

**Lokale pre-commit hook** (optioneel, éénmalig activeren):

```bash
git config core.hooksPath .githooks
```

Vanaf dat moment blokkeert `git commit` als de tests rood zijn of als `js/lib.js` / `js/app.js` een syntax-fout heeft.

Voor UI-regressies (bijvoorbeeld modal-flows) staat Playwright op de roadmap; nu nog niet in gebruik.

---

## Browser-ondersteuning

| Browser | Status |
|---------|--------|
| Chrome / Edge | ✅ Aanbevolen |
| Firefox | ✅ Ondersteund |
| Safari | ✅ Ondersteund |
| Internet Explorer | ❌ Niet ondersteund |

---

## Tips

- **Contactfrequentie**: stel een realistisch aantal dagen in — niet te kort, anders staat alles al snel op rood.
- **Geplande afspraken**: gebruik dit voor echte toekomstige afspraken (lunch, bel-afspraak), zodat de bucket "Afspraak staat al" klopt.
- **Pogingen**: een poging is expres geen contactmoment. Alleen een echte afspraak haalt iemand uit de "Nu"-lijst.
- **Backup**: gebruik de export-functie in het menu als extra zekerheid naast de cloudopslag.
- **Google Calendar**: koppel je agenda om dubbele boekingen te voorkomen — je ziet direct welke blokken al bezet zijn.

---

## Developer-hulp

**Pure functies via de console** (dev en productie):

- `computeBucket(contact, referenceDate?)`, `computeDagenTeLaat(contact, referenceDate?)`, `getRecentAttempt(attempts, referenceDate?)`, `formatUrgencyLabel(...)`, `formatAttemptLabel(...)`, `normalizePhoneForWa(...)`, `getContactInitials(...)`, `urgencyRank(...)` — allemaal beschikbaar als globals (afkomstig uit `js/lib.js`).
- `renderVandaag()`, `renderOverzicht()`, `switchMainTab('vandaag' | 'overzicht' | 'contacten')` — handmatige re-renders en tab-switch.

**Testen buiten de browser:** `npm test` (zie de sectie **Tests**).
