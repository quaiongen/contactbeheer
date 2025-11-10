# Contactbeheer Applicatie

Een webapplicatie voor het bijhouden van contacten en interactiefrequenties.

## ✨ Huidige Functies

### Basis Functionaliteit
- ✅ Contacten toevoegen, bewerken en verwijderen
- ✅ Geboortedatum en notities per contact
- ✅ Aangepaste velden voor extra informatie
- ✅ Gewenste contactfrequentie instellen (in dagen)

### Interactie Tracking
- ✅ Contactmomenten vastleggen met datum en type
- ✅ Verschillende types: persoonlijk, video, telefoon, bericht, email
- ✅ Notities per interactie
- ✅ Geplande afspraken (toekomstige contactmomenten)

### Visuele Indicatoren
- ✅ Kleurgecodeerde voortgang (groen → oranje → rood)
- ✅ Dagen sinds laatste contact
- ✅ Dagen tot volgende contact
- ✅ Notificatie dot voor urgente contacten

### Data Beheer
- ✅ localStorage voor lokale opslag
- ✅ Export naar JSON bestand (backup functie)
- ✅ Import van JSON bestanden

### Recente Fixes
- ✅ Modal window z-index probleem opgelost
  - "Nieuw contact vastleggen" opent nu correct op de voorgrond

## 🚀 Supabase Integratie (In Progress)

### Wat Is Klaar
- ✅ Supabase client library toegevoegd
- ✅ Configuratiebestand aangemaakt (`js/supabase-config.js`)
- ✅ Database schema ontworpen en gedocumenteerd
- ✅ Row Level Security (RLS) policies gedocumenteerd
- ✅ Setup guide geschreven (`SUPABASE_SETUP.md`)

### Wat Nog Moet Gebeuren
- ⏳ Authenticatie UI bouwen (login/registratie scherm)
- ⏳ Authenticatie logica implementeren
- ⏳ Database functies implementeren (CRUD operations)
- ⏳ localStorage vervangen door Supabase calls
- ⏳ Automatische data migratie implementeren
- ⏳ Testen met bestaande data
- ⏳ Deployment instructies maken

## 📋 Volgende Stappen

### Optie 1: Blijf lokaal werken (zonder Supabase)
De applicatie werkt perfect met localStorage. Als je alleen lokaal wilt werken:
1. Gebruik de export functie (⬇️ icoon) om regelmatig backups te maken
2. Gebruik de import functie (⬆️ icoon) om backups te herstellen

### Optie 2: Migreer naar Supabase (voor cloud opslag)

#### Stap 1: Maak een Backup
**BELANGRIJK: Doe dit eerst!**
1. Open `index.html` in je browser
2. Klik op het download icoon (⬇️) bovenaan
3. Bewaar het JSON bestand veilig

#### Stap 2: Supabase Setup
Volg de instructies in `SUPABASE_SETUP.md`:
1. Maak een Supabase account
2. Maak een nieuw project
3. Voer de SQL queries uit om de database op te zetten
4. Kopieer je credentials
5. Update `js/supabase-config.js`

#### Stap 3: Wacht op Volledige Implementatie
De Supabase integratie is nog niet compleet. De volgende onderdelen moeten nog worden gebouwd:
- Authenticatie UI (login/registratie scherm)
- Database functies (opslaan/ophalen van data)
- Automatische migratie van localStorage data

**Let op**: Gebruik de app nog NIET met Supabase totdat de implementatie compleet is!

## 🛠️ Voor Developers

### Project Structuur
```
visuele-contacten/
├── index.html              # Hoofd HTML bestand
├── css/
│   └── styles.css         # Styling
├── js/
│   ├── app.js             # Hoofd applicatie logica (localStorage)
│   └── supabase-config.js # Supabase configuratie
├── SUPABASE_SETUP.md      # Supabase setup instructies
└── README.md              # Dit bestand
```

### Technologie Stack
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **UI Framework**: Bootstrap 5.3
- **Icons**: Bootstrap Icons
- **Data Storage**: 
  - localStorage (huidige implementatie)
  - Supabase (planned)

### Database Schema (Supabase)
Zie `SUPABASE_SETUP.md` voor het volledige schema.

#### Contacts Table
- id, user_id, name, birthday, frequency, notes, custom_fields

#### Interactions Table  
- id, contact_id, user_id, date, type, notes, planned

## 📝 Implementatie Checklist voor Supabase

### Authenticatie
- [ ] Login modal bouwen
- [ ] Registratie modal bouwen
- [ ] Logout functionaliteit
- [ ] Session management
- [ ] "Wachtwoord vergeten" flow

### Database Functionaliteit
- [ ] `loadContactsFromSupabase()` - Laad contacten van gebruiker
- [ ] `saveContactToSupabase()` - Sla nieuw contact op
- [ ] `updateContactInSupabase()` - Update bestaand contact
- [ ] `deleteContactFromSupabase()` - Verwijder contact
- [ ] `saveInteractionToSupabase()` - Sla interactie op
- [ ] `updateInteractionInSupabase()` - Update interactie
- [ ] `deleteInteractionFromSupabase()` - Verwijder interactie

### Data Migratie
- [ ] Detecteer localStorage data bij eerste login
- [ ] Toon migratie prompt aan gebruiker
- [ ] Migreer contacten naar Supabase
- [ ] Migreer interacties naar Supabase
- [ ] Verificatie dat data correct is gemigreerd
- [ ] Optioneel: localStorage data behouden als backup

### UI Aanpassingen
- [ ] Login/logout knop in header
- [ ] User email tonen als ingelogd
- [ ] Loading states tijdens database operaties
- [ ] Error handling en user feedback
- [ ] Offline modus detectie

### Testing
- [ ] Test registratie flow
- [ ] Test login flow
- [ ] Test CRUD operaties
- [ ] Test data migratie
- [ ] Test met meerdere gebruikers
- [ ] Test Row Level Security (gebruikers zien alleen eigen data)

### Deployment
- [ ] README voor deployment
- [ ] Environment variables setup
- [ ] Vercel/Netlify configuratie
- [ ] Custom domain setup (optioneel)

## 🔒 Veiligheid

### Huidige Implementatie (localStorage)
- ⚠️ Data is alleen op je lokale computer
- ⚠️ Data kan verloren gaan bij browsercache wissen
- ⚠️ Geen encryptie
- ✅ Geen externe toegang mogelijk

### Toekomstige Implementatie (Supabase)
- ✅ Data encrypted in transit (HTTPS)
- ✅ Data encrypted at rest
- ✅ Row Level Security (RLS)
- ✅ Elke gebruiker ziet alleen eigen data
- ✅ Automatische backups door Supabase
- ✅ Multi-device sync

## 📱 Browser Ondersteuning

- ✅ Chrome/Edge (aanbevolen)
- ✅ Firefox
- ✅ Safari
- ⚠️ Internet Explorer (niet ondersteund)

## 🐛 Bekende Issues

### Opgelost
- ✅ Modal z-index probleem bij "Nieuw contact vastleggen"

### Nog Te Doen
- ⏳ Supabase integratie nog niet compleet

## 💡 Tips

### Best Practices
1. **Maak regelmatig backups** via de export functie
2. **Test import/export** voordat je grote wijzigingen maakt
3. **Gebruik consistente contactfrequenties** voor betere tracking

### Performance
- De app kan honderden contacten aan zonder performance problemen
- localStorage heeft een limiet van ~5-10MB (voldoende voor duizenden contacten)

## 🤝 Contributing

Dit is een persoonlijk project. Als je suggesties hebt:
1. Maak een backup van je data
2. Test je wijzigingen lokaal
3. Controleer of export/import blijft werken

## 📄 Licentie

Dit project is voor persoonlijk gebruik.

## 🆘 Hulp Nodig?

### localStorage Issues
- Controleer of je browser localStorage ondersteunt
- Controleer of cookies/storage niet geblokkeerd zijn
- Probeer in een andere browser

### Export/Import Issues  
- Controleer of het JSON bestand niet corrupt is
- Controleer de browser console voor error messages

### Supabase Issues
- Zie `SUPABASE_SETUP.md` voor troubleshooting
- Controleer de Supabase dashboard voor database errors

## 📚 Documentatie

- [Supabase Setup Guide](SUPABASE_SETUP.md) - Complete setup instructies
- [Bootstrap 5 Docs](https://getbootstrap.com/docs/5.3/) - UI framework
- [Supabase Docs](https://supabase.com/docs) - Database en auth

---

**Status**: Lokale versie compleet ✅ | Supabase versie in ontwikkeling ⏳
