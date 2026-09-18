-- Backlog item: vaste velden telefoon en email op contacten.
-- Op dev al gerund. Voor prod: uitvoeren op het productie-project
-- voordat `index.html` live gaat met deze wijziging.

ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS email TEXT;
