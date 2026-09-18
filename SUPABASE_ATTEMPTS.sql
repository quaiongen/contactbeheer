-- Stap 1 van de Vandaag-scherm implementatie.
-- Nieuwe tabel `attempts`: registreert dat de gebruiker heeft geprobeerd
-- iemand te bereiken via bellen, whatsapp of mail. Beïnvloedt NOOIT de
-- urgentieberekening — alleen weergave. Pogingen ouder dan 14 dagen zijn
-- niet meer relevant en worden in de UI genegeerd.
--
-- Uitvoeren in de Supabase SQL Editor (dev-project eerst, prod later).

CREATE TABLE IF NOT EXISTS attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    contact_id TEXT REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
    kanaal TEXT NOT NULL CHECK (kanaal IN ('bellen', 'whatsapp', 'mail')),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_id ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_contact_id ON attempts(contact_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON attempts(created_at DESC);

ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own attempts"
    ON attempts FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own attempts"
    ON attempts FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own attempts"
    ON attempts FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own attempts"
    ON attempts FOR DELETE
    USING (auth.uid() = user_id);
