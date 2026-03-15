# Contactbeheer

Een persoonlijke contactbeheer-app om bij te houden wanneer je contact hebt gehad met mensen en wanneer het weer tijd is om iemand te spreken.

🔗 **Live app**: [quaiongen.github.io/contactbeheer](https://quaiongen.github.io/contactbeheer/)

---

## Wat doet de app?

Je stelt per contact in hoe vaak je contact wilt hebben (bijv. elke 30 dagen). De app houdt bij wanneer je voor het laatst contact hebt gehad en laat zien hoe urgent het is om iemand te bellen, te mailen of te ontmoeten. Je kunt ook afspraken plannen en deze direct in je Google Calendar zetten.

---

## Functies

### 👤 Contacten
- Contacten toevoegen, bewerken en verwijderen
- Geboortedatum vastleggen
- Gewenste contactfrequentie instellen (in dagen)
- Notities per contact
- Eigen velden toevoegen (flexibele sleutel/waarde-paren)
- Categorieën toewijzen met kleurcodering

### 📋 Afspraken & interacties
- Contactmomenten vastleggen met datum, type, locatie, tijdvak (van–tot) en notities
- Typen: persoonlijk, videogesprek, telefoongesprek, bericht, e-mail, overige
- Geplande afspraken (toekomstige contactmomenten) aanmaken
- Voortgangsbalk toont hoe ver je bent richting de afspraakdatum
- Datum en tijd zichtbaar op de contactkaart en in het detailoverzicht

### 🚦 Urgentie-indicatoren
- Kleurgecodeerde voortgangsbalk per contact:
  - 🟢 **Groen** — ruim op tijd
  - 🟠 **Oranje** — bijna tijd
  - 🔴 **Rood** — te laat / overschreden
- "Contact wenselijk in: X dagen" op elke kaart
- Pulserende rode stip bij contacten die al te lang niet gesproken zijn
- Sortering op urgentie (meest urgente bovenaan)

### 🗂️ Categorieën
- Categorieën aanmaken met een naam en kleur
- 10 kleuren beschikbaar: rood, oranje, geel, groen, teal, blauw, indigo, paars, roze, grijs
- Filteren op categorie via knoppen bovenaan
- Kleurgecodeerde badge en randkleur op elke contactkaart

### 📅 Google Calendar integratie
- Koppel je Google Calendar via de knop rechtsboven
- Bekijk je agenda-afspraken bij het plannen van een contactmoment
- Geplande afspraken worden automatisch als event aangemaakt in Google Calendar
- Wijzigingen en verwijderingen worden gesynchroniseerd
- Koppeling blijft ~60 dagen actief zonder opnieuw in te loggen

### 🔍 Zoeken & filteren
- Zoek contacten op naam via de zoekbalk
- Filter op categorie via de filterknoppen
- Sorteermogelijkheden:
  - **Op urgentie** — meest urgente contacten eerst
  - **Op volgende afspraak** — eerstvolgende geplande afspraak eerst

### 🔔 Notificaties
- Browser-notificaties voor contacten die wenselijk zijn
- Melding als een contact al te lang niet gesproken is (met aantal dagen)
- Klikken op notificatie opent het betreffende contact

### 💾 Data & backup
- Alle data opgeslagen in de cloud via Supabase (per gebruiker, volledig privé)
- Export naar JSON-bestand als lokale backup
- Import van eerder geëxporteerde JSON-bestanden

### 🔐 Account & beveiliging
- Registreren met e-mail en wachtwoord
- Inloggen en uitloggen
- Wachtwoord vergeten / herstellen
- Elke gebruiker ziet alleen zijn eigen data (Row Level Security)

---

## Aan de slag

### 1. Account aanmaken
1. Ga naar [quaiongen.github.io/contactbeheer](https://quaiongen.github.io/contactbeheer/)
2. Klik op **Inloggen / Registreren**
3. Kies het tabblad **Registreren** en maak een account aan

### 2. Eerste contact toevoegen
1. Klik op **+ Contact toevoegen**
2. Vul naam en gewenste contactfrequentie in (bijv. 30 dagen)
3. Optioneel: voeg geboortedatum, notities of een categorie toe
4. Klik op **Opslaan**

### 3. Contactmoment vastleggen
1. Klik op **Vastleggen** op de contactkaart
2. Kies het type contact en de datum
3. Voeg eventueel locatie, tijdvak en notities toe
4. Klik op **Opslaan**

### 4. Google Calendar koppelen
1. Klik op de knop **Google Calendar** rechtsboven in de navigatiebalk
2. Log in met je Google-account en geef toestemming
3. De knop toont nu **Gekoppeld ✓** in het groen
4. Bij het plannen van een afspraak zie je nu jouw agenda-afspraken voor die dag

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

## Projectstructuur

```
visuele contacten/
├── index.html          # Productie-versie
├── index-dev.html      # Ontwikkelversie (Supabase dev-project)
├── css/
│   └── styles.css      # Alle styling
└── js/
    └── app.js          # Volledige applicatielogica
```

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
- **Geplande afspraken**: gebruik dit voor echte toekomstige afspraken (lunch, bel-afspraak), zodat de voortgangsbalk naar de afspraakdatum toeloopt.
- **Backup**: gebruik de export-functie (⬇️ icoon) als extra zekerheid naast de cloudopslag.
- **Google Calendar**: koppel je agenda om dubbele boekingen te voorkomen — je ziet direct welke blokken al bezet zijn.
