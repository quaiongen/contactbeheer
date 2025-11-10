# Deployment Guide - GitHub Pages

Deze applicatie is nu live op GitHub en kan worden gedeployed via GitHub Pages.

## GitHub Pages Activeren

Volg deze stappen om de applicatie online te zetten:

### Stap 1: Ga naar Repository Settings
1. Open je browser en ga naar: https://github.com/quaiongen/contactbeheer
2. Klik op **Settings** (bovenaan de pagina, rechts)

### Stap 2: Activeer GitHub Pages
1. Scroll in het linker menu naar beneden en klik op **Pages**
2. Bij "Source" selecteer: **Deploy from a branch**
3. Bij "Branch" selecteer: **main** en **/ (root)**
4. Klik op **Save**

### Stap 3: Wacht op Deployment
1. GitHub begint nu met het deployen van je applicatie
2. Dit kan 1-2 minuten duren
3. Refresh de pagina na een minuut
4. Je ziet dan een melding: "Your site is live at https://quaiongen.github.io/contactbeheer/"

## De Applicatie Gebruiken

### Jouw Toegang
- **URL**: https://quaiongen.github.io/contactbeheer/
- **Account**: Log in met je bestaande Supabase account

### Je Vriend Toegang Geven

Deel deze informatie met je vriend:

#### Stap 1: URL Openen
```
https://quaiongen.github.io/contactbeheer/
```

#### Stap 2: Account Aanmaken
- Klik op de **Register** tab
- Vul een email adres en wachtwoord in
- Klik op **Registreer**
- Klik daarna op de **Login** tab en log in

#### Stap 3: Direct Gebruiken
- Je vriend kan nu direct contacten toevoegen
- Alle data is privé - jullie zien elkaars contacten NIET
- Data wordt automatisch gesynchroniseerd via Supabase

## Belangrijke Opmerkingen

### Privacy & Security
✅ **Aparte accounts = aparte data**
- Iedereen die zich registreert heeft zijn eigen privé database
- Jullie delen de applicatie, maar NIET de data
- Row Level Security in Supabase zorgt hiervoor

### Updates Deployen
Als je wijzigingen maakt aan de applicatie:

```bash
git add .
git commit -m "Beschrijving van wijziging"
git push origin main
```

GitHub Pages update automatisch binnen 1-2 minuten.

### Troubleshooting

**Probleem**: Site laadt niet
- Wacht 2-3 minuten na het activeren van GitHub Pages
- Clear je browser cache (Cmd+Shift+R op Mac)
- Check of GitHub Pages is geactiveerd in Settings > Pages

**Probleem**: Kan niet inloggen
- Check of je Supabase credentials correct zijn ingevuld in `js/supabase-config.js`
- Controleer of email confirmatie is uitgeschakeld in Supabase (zie SUPABASE_SETUP.md)

**Probleem**: Data wordt niet opgeslagen
- Check de browser console voor errors (F12 > Console tab)
- Controleer of je bent ingelogd
- Verifieer Supabase configuratie

## Live URL

Na activering is de applicatie beschikbaar op:
**https://quaiongen.github.io/contactbeheer/**

Deel deze URL met iedereen die de applicatie wil gebruiken!
