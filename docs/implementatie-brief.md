# Implementatie-brief: Vandaag-scherm en bucket-overzicht

Voor Claude Code, uit te voeren in de repo `contactbeheer`
(vanilla JS, Bootstrap 5.3, Supabase, GitHub Pages).

## Voorwaarden

- Werk op een branch, niet op main. `index.html` is de productieversie en moet blijven werken.
- Test tegen het Supabase dev-project via `index-dev.html`.
- Geen frameworks toevoegen. Geen build-stap. Vanilla JS en Bootstrap blijven.
- Lees eerst `js/app.js` volledig door en rapporteer hoe de urgentieberekening nu werkt
  voordat je iets wijzigt. Wijk niet af van de bestaande datastructuur zonder dat te melden.

## Stap 1 — Datamodel: pogingen

Nieuwe tabel `attempts` in Supabase, met Row Level Security gelijk aan de bestaande tabellen
(gebruiker ziet alleen eigen rijen).

| kolom | type | toelichting |
|---|---|---|
| id | uuid, pk | |
| user_id | uuid | RLS-sleutel, zoals bestaande tabellen |
| contact_id | uuid, fk | |
| kanaal | text | `bellen` \| `whatsapp` \| `mail` |
| created_at | timestamptz | default now() |

Belangrijk: een poging beïnvloedt **nooit** de urgentieberekening. `laatste_contact`
blijft uitsluitend gezet door een vastgelegd contactmoment of een geplande afspraak.
Een poging is alleen weergave.

Een poging vervalt na 14 dagen: bij het bepalen van de weergave alleen de meest recente
poging binnen 14 dagen meenemen, oudere negeren.

## Stap 2 — Bucket-logica

Eén functie die alle contacten indeelt in precies één bucket. Dit is de kern; schrijf hier
unit-achtige checks voor met een paar vaste testdata-gevallen.

Volgorde van evaluatie (eerste match wint):

1. **Afspraak staat al** — er is een toekomstig gepland contactmoment.
2. **Nooit contact gehad** — geen enkel contactmoment, geen afspraak.
3. **Nu een afspraak maken** — dagen sinds laatste contact >= gewenste frequentie.
4. **Binnen twee weken** — verschil tussen nu en de volgende gewenste datum is 0–14 dagen.
5. **Op schema** — al het overige.

**Geprobeerd, nog geen reactie** is geen zesde bucket maar een subverzameling van bucket 3
en 4: contacten met een poging binnen 14 dagen. In het overzicht apart weergeven, maar de
urgentie blijft ongewijzigd.

Nieuw afgeleid veld voor de weergave: `dagen_te_laat` = dagen sinds laatste contact minus
gewenste frequentie. Dit vervangt de huidige percentage-weergave.

## Stap 3 — Teksten

Vervang de huidige "Contact wenselijk in: 0 dagen / 100%" door:

- te laat: `{n} dagen te laat`
- precies op tijd: `vandaag`
- toekomst: `over {n} dagen`
- nooit contact: `nog geen contact`

Poging-regel, uitsluitend het feit, nooit een conclusie:

- vandaag: `Gebeld, vandaag` / `Geappt, vandaag` / `Gemaild, vandaag`
- eerder: `Geappt, {n} dagen geleden`

Geen tekst die stelt dat er nog geen afspraak is. Dat volgt al uit de bucket waarin het
contact staat, en zou anders achterlopen zodra er wel een afspraak gemaakt wordt.

## Stap 4 — Vandaag-scherm

Nieuw scherm, standaard-landingspagina. Tabs bovenaan: `Vandaag` en `Contacten`.
Het bestaande contactenoverzicht blijft ongewijzigd bestaan onder `Contacten`.

Toon maximaal 3 contacten uit bucket "Nu een afspraak maken", gesorteerd op `dagen_te_laat`
aflopend. Daaronder één regel: `Nog {n} contacten staan te lang open.`
Bij 0 contacten een lege staat, geen lege lijst.

Per kaart:

- naam
- `{n} dagen te laat`
- één regel metadata: categorie, laatste contact, frequentie
- poging-regel, alleen als er een poging binnen 14 dagen is
- drie gelijkwaardige knoppen: **Bellen**, **WhatsApp**, **Mail**
- één primaire knop over de volle breedte: **Nu afspraak maken**

Geen "Gesproken"-knop en geen "Later"-knop. Alleen een afspraak haalt een contact uit
bucket 3.

Knopgedrag:

- Bellen: `tel:` met het telefoonnummer, plus insert in `attempts`.
- WhatsApp: `https://wa.me/{nummer}` (internationaal formaat, geen plus, geen spaties),
  plus insert in `attempts`.
- Mail: `mailto:`, plus insert in `attempts`.
- De insert mag de navigatie niet blokkeren: eerst de link openen, dan wegschrijven, en
  bij een mislukte insert geen foutmelding aan de gebruiker.
- Een knop zonder onderliggend gegeven (geen nummer bekend) wordt disabled weergegeven,
  niet verborgen.
- **Nu afspraak maken** opent het bestaande "Contact Vastleggen"-formulier met de
  bestaande Google Calendar-koppeling. Niets aan dat formulier wijzigen in deze stap.

## Stap 5 — Overzicht-scherm

Alle buckets onder elkaar, elk met kop, teller en de namen erbij — geen tellers zonder
namen. "Op schema" ingeklapt als één regel met doorklik naar het contactenoverzicht.

Categoriekleuren verdwijnen uit dit overzicht en uit de Vandaag-kaarten. Kleur betekent
hier uitsluitend urgentie. Categorie blijft zichtbaar als tekstlabel en blijft bestaan in
het contactenoverzicht en de filters.

## Stap 6 — Mobiel

- Appbar terugbrengen tot titel plus één menu-icoon. Uitloggen, import, export,
  categoriebeheer en de Google Calendar-koppeling verhuizen naar dat menu.
- Categoriefilters van gestapelde blokken naar horizontaal scrollende chips op één regel.
- In het detailscherm: "Verwijderen" niet meer over de volle breedte boven de andere
  knoppen. Secundair maken, met bevestiging.
- Doel: op een viewport van 380 breed is het eerste contact zichtbaar zonder scrollen.

## Wat expliciet buiten scope blijft

- De dagelijkse e-mail (aparte opdracht: Supabase Edge Function plus cron).
- Web push en PWA-manifest (volgt daarna).
- Wijzigingen aan het "Contact Vastleggen"-formulier.

## Oplevering

Rapporteer aan het eind: welke bestanden gewijzigd zijn, welke SQL er nog handmatig op
Supabase moet, en wat je niet hebt kunnen testen.
