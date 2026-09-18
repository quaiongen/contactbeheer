-- Stap 1 van de wekelijkse herinneringsmail.
--
-- View `weekly_digest_v` levert per contact de bucket en context, exact
-- volgens dezelfde regels als js/lib.js. Bewuste duplicatie: twee talen,
-- twee implementaties — beide moeten meebewegen als de bucket-regels
-- veranderen.
--
-- Bucket-namen komen overeen met js/lib.js (frontend), zodat er één
-- taal is over de hele stack heen:
--   afspraak_staat_al · nooit_contact · nu_afspraak_maken ·
--   binnen_twee_weken · op_schema
-- De brief van deze opdracht gebruikte kortere aliassen — bewust niet
-- overgenomen om drift te voorkomen.
--
-- Row Level Security: deze view leest uit `contacts`, `interactions` en
-- `attempts`. Alle drie hebben RLS die filtert op auth.uid() = user_id.
-- Met `security_invoker = true` erft de view die policies (per aanroeper),
-- dus een normale gebruiker ziet alleen zijn eigen rijen. Zonder deze
-- optie zou de view als de superuser lezen en RLS overslaan — een lek.
-- De Edge Function draait met service_role en bypasst RLS voor de
-- dagelijkse batch (onafhankelijk van deze setting).

CREATE OR REPLACE VIEW weekly_digest_v
WITH (security_invoker = true) AS
WITH past AS (
    -- Alle interactions op of vóór vandaag tellen als past contact,
    -- ongeacht `planned` (een afspraak in het verleden telt ook).
    SELECT contact_id,
           user_id,
           MAX(date) AS last_past_date
    FROM interactions
    WHERE date <= CURRENT_DATE
    GROUP BY contact_id, user_id
),
future_planned AS (
    -- Toekomstige afspraak = planned=true én date vandaag of later.
    -- (Vandaag telt als "afspraak staat", consistent met de frontend.)
    SELECT DISTINCT contact_id
    FROM interactions
    WHERE planned = true
      AND date >= CURRENT_DATE
),
recent_attempt AS (
    -- Meest recente poging binnen 14 dagen (inclusief exact 14 dagen).
    -- DISTINCT ON per contact_id + ORDER BY created_at DESC pakt de laatste.
    SELECT DISTINCT ON (contact_id)
           contact_id,
           kanaal,
           GREATEST(0, (CURRENT_DATE - created_at::date))::int AS dagen_geleden
    FROM attempts
    WHERE created_at >= (NOW() - INTERVAL '14 days')
    ORDER BY contact_id, created_at DESC
)
SELECT
    c.user_id,
    c.id,
    c.name AS naam,

    -- Frequency: NULL of 0 → 30 (matcht `contact.frequency || 30` in JS).
    COALESCE(NULLIF(c.frequency, 0), 30) AS frequency_effective,

    CASE
        WHEN fp.contact_id IS NOT NULL THEN 'afspraak_staat_al'
        WHEN p.last_past_date IS NULL THEN 'nooit_contact'
        WHEN (CURRENT_DATE - p.last_past_date)
             >= COALESCE(NULLIF(c.frequency, 0), 30)
            THEN 'nu_afspraak_maken'
        WHEN (COALESCE(NULLIF(c.frequency, 0), 30) - (CURRENT_DATE - p.last_past_date))
             BETWEEN 0 AND 14
            THEN 'binnen_twee_weken'
        ELSE 'op_schema'
    END AS bucket,

    -- Dagen te laat: dagen sinds laatste contact - frequency.
    -- NULL als er nooit contact is geweest.
    CASE
        WHEN p.last_past_date IS NULL THEN NULL
        ELSE (CURRENT_DATE - p.last_past_date) - COALESCE(NULLIF(c.frequency, 0), 30)
    END AS dagen_te_laat,

    ra.kanaal AS laatste_poging_kanaal,
    ra.dagen_geleden AS laatste_poging_dagen

FROM contacts c
LEFT JOIN past p ON p.contact_id = c.id
LEFT JOIN future_planned fp ON fp.contact_id = c.id
LEFT JOIN recent_attempt ra ON ra.contact_id = c.id;

COMMENT ON VIEW weekly_digest_v IS
    'Wekelijkse mail-source: bucket + context per contact. Zie ook js/lib.js — duplicatie is bewust.';
