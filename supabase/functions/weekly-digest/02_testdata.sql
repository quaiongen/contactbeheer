-- Testdata + verificatie voor `weekly_digest_v`.
--
-- Voer eerst `01_view.sql` uit (aanmaken van de view).
-- Vervang hieronder `93d994f4-8690-4995-add5-95f4d30661b1` met jouw eigen auth-user-id
-- (te vinden in Supabase: Authentication → Users → jouw eigen rij, kolom `id`).
--
-- Deze SQL draait binnen een transactie en rolt aan het eind terug —
-- er blijven geen testrijen in je database achter.

BEGIN;

-- ================================================================
-- HIER JE EIGEN USER-ID INVULLEN:
-- ================================================================
-- Bijvoorbeeld: '12345678-1234-1234-1234-123456789abc'

-- Randgeval 1: contact dat vandaag precies verloopt (dtl = 0)
-- Verwacht: bucket = te_laat, dagen_te_laat = 0
INSERT INTO contacts (id, user_id, name, frequency)
VALUES ('digesttest-1', '93d994f4-8690-4995-add5-95f4d30661b1', 'Test 1: verloopt vandaag', 30);
INSERT INTO interactions (id, contact_id, user_id, date, type, planned)
VALUES ('digesttest-1i', 'digesttest-1', '93d994f4-8690-4995-add5-95f4d30661b1', CURRENT_DATE - 30, 'in-person', false);

-- Randgeval 2: afspraak in verleden die nooit expliciet is vastgelegd
-- (planned=true met datum in het verleden). Telt in de frontend als
-- een past interaction, dus moet ook zo in de query werken.
-- Verwacht: bucket = op_schema of binnenkort of te_laat, afhankelijk van freq/leeftijd.
-- Freq = 90, afspraak 20 dagen terug → dtl = -70 → op_schema
INSERT INTO contacts (id, user_id, name, frequency)
VALUES ('digesttest-2', '93d994f4-8690-4995-add5-95f4d30661b1', 'Test 2: oude planned die telt', 90);
INSERT INTO interactions (id, contact_id, user_id, date, type, planned)
VALUES ('digesttest-2i', 'digesttest-2', '93d994f4-8690-4995-add5-95f4d30661b1', CURRENT_DATE - 20, 'in-person', true);

-- Randgeval 3: geplande afspraak vandaag later op de dag
-- Verwacht: bucket = afspraak_staat (want date >= CURRENT_DATE)
INSERT INTO contacts (id, user_id, name, frequency)
VALUES ('digesttest-3', '93d994f4-8690-4995-add5-95f4d30661b1', 'Test 3: afspraak vandaag', 30);
INSERT INTO interactions (id, contact_id, user_id, date, type, planned)
VALUES ('digesttest-3i', 'digesttest-3', '93d994f4-8690-4995-add5-95f4d30661b1', CURRENT_DATE, 'phone', true);

-- Randgeval 4: poging van precies 14 dagen oud (inclusief in cutoff)
-- Verwacht: laatste_poging_kanaal = 'whatsapp', laatste_poging_dagen = 14
INSERT INTO contacts (id, user_id, name, frequency)
VALUES ('digesttest-4', '93d994f4-8690-4995-add5-95f4d30661b1', 'Test 4: poging 14 dagen oud', 60);
INSERT INTO interactions (id, contact_id, user_id, date, type, planned)
VALUES ('digesttest-4i', 'digesttest-4', '93d994f4-8690-4995-add5-95f4d30661b1', CURRENT_DATE - 100, 'in-person', false);
INSERT INTO attempts (user_id, contact_id, kanaal, created_at)
VALUES ('93d994f4-8690-4995-add5-95f4d30661b1', 'digesttest-4', 'whatsapp', NOW() - INTERVAL '14 days');

-- Randgeval 5: contact zonder telefoon en zonder e-mail
-- Verwacht: bucket-berekening normaal (bereik-info speelt hier geen rol);
-- deze kolommen komen pas in stap 2 (mail-inhoud) terug.
INSERT INTO contacts (id, user_id, name, frequency, phone, email)
VALUES ('digesttest-5', '93d994f4-8690-4995-add5-95f4d30661b1', 'Test 5: zonder tel/mail', 30, NULL, NULL);
INSERT INTO interactions (id, contact_id, user_id, date, type, planned)
VALUES ('digesttest-5i', 'digesttest-5', '93d994f4-8690-4995-add5-95f4d30661b1', CURRENT_DATE - 50, 'in-person', false);

-- Randgeval 6: frequency = 0 → moet als 30 behandeld worden.
-- Laatste contact 30 dagen terug → dtl = 0 → nu_afspraak_maken.
-- (NB: contacts.frequency heeft NOT NULL, dus een NULL-scenario is in
-- productie niet mogelijk. De view is defensief met COALESCE+NULLIF
-- voor het geval de constraint ooit versoepeld wordt.)
INSERT INTO contacts (id, user_id, name, frequency)
VALUES ('digesttest-6', '93d994f4-8690-4995-add5-95f4d30661b1', 'Test 6: frequency = 0', 0);
INSERT INTO interactions (id, contact_id, user_id, date, type, planned)
VALUES ('digesttest-6i', 'digesttest-6', '93d994f4-8690-4995-add5-95f4d30661b1', CURRENT_DATE - 30, 'in-person', false);

-- Randgeval 7: nooit contact gehad
-- Verwacht: bucket = nooit_contact, dagen_te_laat = NULL
INSERT INTO contacts (id, user_id, name, frequency)
VALUES ('digesttest-7', '93d994f4-8690-4995-add5-95f4d30661b1', 'Test 7: nooit contact', 30);

-- ================================================================
-- Resultaat bekijken:
-- ================================================================
SELECT id, naam, bucket, dagen_te_laat, laatste_poging_kanaal, laatste_poging_dagen, frequency_effective
FROM weekly_digest_v
WHERE user_id = '93d994f4-8690-4995-add5-95f4d30661b1'
  AND id LIKE 'digesttest-%'
ORDER BY id;

-- Verwachte resultaten:
--
--  id             | naam                          | bucket             | dagen_te_laat | poging_kanaal | poging_dagen | freq
--  digesttest-1   | Test 1: verloopt vandaag      | nu_afspraak_maken  | 0             | NULL          | NULL         | 30
--  digesttest-2   | Test 2: oude planned die telt | op_schema          | -70           | NULL          | NULL         | 90
--  digesttest-3   | Test 3: afspraak vandaag      | afspraak_staat_al  | -30           | NULL          | NULL         | 30
--                 (dtl = -30 want de afspraak vandaag telt zowel als future_planned
--                  → bucket wint, als past → last_past_date = vandaag → dtl = 0 - freq.
--                  Voor deze bucket is dtl niet relevant voor de mail-inhoud.)
--  digesttest-4   | Test 4: poging 14 dagen oud   | nu_afspraak_maken  | 40            | whatsapp      | 14           | 60
--  digesttest-5   | Test 5: zonder tel/mail       | nu_afspraak_maken  | 20            | NULL          | NULL         | 30
--  digesttest-6   | Test 6: frequency = 0         | nu_afspraak_maken  | 0             | NULL          | NULL         | 30
--  digesttest-7   | Test 7: nooit contact         | nooit_contact      | NULL          | NULL          | NULL         | 30

ROLLBACK;
