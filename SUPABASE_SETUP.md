# Supabase Setup Guide

Deze handleiding helpt je om de contactbeheer applicatie te verbinden met Supabase voor robuuste cloud opslag.

## Stap 1: Supabase Project Aanmaken

1. Ga naar [https://supabase.com](https://supabase.com)
2. Maak een account of log in
3. Klik op "New Project"
4. Vul in:
   - **Project name**: Contactbeheer (of een naam naar keuze)
   - **Database Password**: Kies een sterk wachtwoord (bewaar dit veilig!)
   - **Region**: Kies de regio het dichtst bij jou (bijv. West EU (Ireland))
5. Klik op "Create new project"
6. Wacht tot het project klaar is (kan 1-2 minuten duren)

## Stap 2: Database Schema Opzetten

1. Ga in je Supabase project naar **SQL Editor** (in de zijbalk)
2. Klik op "New query"
3. Kopieer en plak de onderstaande SQL code
4. Klik op "Run" om de tabellen aan te maken

```sql
-- Maak de contacts tabel
CREATE TABLE contacts (
    id TEXT PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    birthday DATE,
    frequency INTEGER NOT NULL DEFAULT 30,
    notes TEXT,
    custom_fields JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maak de interactions tabel
CREATE TABLE interactions (
    id TEXT PRIMARY KEY,
    contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    date DATE NOT NULL,
    type TEXT NOT NULL,
    notes TEXT,
    planned BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexen voor betere performance
CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_interactions_contact_id ON interactions(contact_id);
CREATE INDEX idx_interactions_user_id ON interactions(user_id);
CREATE INDEX idx_interactions_date ON interactions(date);

-- Functie om updated_at automatisch bij te werken
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger om updated_at bij te werken bij wijzigingen
CREATE TRIGGER update_contacts_updated_at 
    BEFORE UPDATE ON contacts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
-- Deze zorgen ervoor dat gebruikers alleen hun eigen data kunnen zien en wijzigen

-- Enable RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- Contacts policies
CREATE POLICY "Users can view their own contacts"
    ON contacts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contacts"
    ON contacts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contacts"
    ON contacts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contacts"
    ON contacts FOR DELETE
    USING (auth.uid() = user_id);

-- Interactions policies
CREATE POLICY "Users can view their own interactions"
    ON interactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own interactions"
    ON interactions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own interactions"
    ON interactions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own interactions"
    ON interactions FOR DELETE
    USING (auth.uid() = user_id);
```

## Stap 3: API Credentials Ophalen

1. Ga naar **Project Settings** (tandwiel icoon onderaan de zijbalk)
2. Klik op **API** in de settings menu
3. Zoek de volgende gegevens:
   - **Project URL**: bijv. `https://xxxxxxxxxxxx.supabase.co`
   - **anon public key**: Een lange string die begint met `eyJ...`

## Stap 4: Credentials Configureren

1. Open het bestand `js/supabase-config.js`
2. Vervang de placeholders:
   ```javascript
   const SUPABASE_URL = 'https://jouwproject.supabase.co'; // Plak je Project URL
   const SUPABASE_ANON_KEY = 'eyJ...'; // Plak je anon public key
   ```
3. Sla het bestand op

## Stap 5: E-mail Authenticatie Instellen

1. Ga naar **Authentication** > **Providers** in je Supabase project
2. Zorg dat **Email** is ingeschakeld (dit is standaard aan)
3. Optioneel: Pas de email templates aan onder **Authentication** > **Email Templates**
4. Voor development: Schakel **Confirm email** uit bij **Authentication** > **Providers** > **Email**
   - Dit voorkomt dat je tijdens testen email verificatie moet doen
   - Voor productie: Laat dit aanstaan!

## Stap 6: Test de Verbinding

1. Open `index.html` in je browser
2. Open de Developer Console (F12)
3. Je zou moeten zien: "Supabase client initialized successfully"
4. Als je een waarschuwing ziet, controleer je credentials in stap 4

## Database Schema Uitleg

### Contacts Tabel
- **id**: Unieke identifier (hergebruikt van localStorage)
- **user_id**: Koppelt contact aan specifieke gebruiker
- **name**: Naam van het contact
- **birthday**: Geboortedatum (optioneel)
- **frequency**: Gewenste contactfrequentie in dagen
- **notes**: Notities over het contact
- **custom_fields**: Extra velden in JSON formaat
- **created_at/updated_at**: Timestamps

### Interactions Tabel
- **id**: Unieke identifier
- **contact_id**: Verwijst naar het contact
- **user_id**: Koppelt interactie aan gebruiker
- **date**: Datum van interactie
- **type**: Type contact (in-person, video, phone, etc.)
- **notes**: Notities over de interactie
- **planned**: Of het een geplande afspraak is
- **created_at**: Timestamp

## Row Level Security (RLS)

De database policies zorgen ervoor dat:
- Gebruikers alleen hun eigen contacten kunnen zien en wijzigen
- Niemand anders toegang heeft tot jouw data
- Dit werkt automatisch zonder extra code in de frontend

## Veiligheid

✅ **Veilig**:
- De `anon public` key delen in frontend code
- Deze key heeft alleen toegang tot data die door RLS policies is toegestaan
- Gebruikers kunnen alleen hun eigen data zien

❌ **NOOIT DELEN**:
- Je database password
- De `service_role` key (deze heeft volledige toegang!)

## Volgende Stap

Na het voltooien van deze setup ben je klaar om de applicatie te gebruiken met Supabase!

De applicatie zal automatisch:
1. Detecteren dat Supabase is geconfigureerd
2. Een login scherm tonen voor nieuwe gebruikers
3. localStorage data migreren naar Supabase (eerste keer na login)
4. Alle data veilig opslaan in de cloud

## Troubleshooting

### "Supabase credentials not configured"
- Controleer of je de placeholders in `supabase-config.js` hebt vervangen
- Ververs de pagina na het opslaan

### "Failed to fetch"
- Controleer je internetverbinding
- Controleer of de Project URL correct is
- Controleer of het Supabase project actief is

### "Invalid API key"
- Controleer of je de juiste `anon public` key hebt gekopieerd
- Niet de `service_role` key gebruiken!

### Database errors
- Controleer of je de SQL queries succesvol hebt uitgevoerd
- Kijk in de Supabase **Table Editor** of de tabellen zijn aangemaakt
