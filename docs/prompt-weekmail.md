# Opdracht: wekelijkse herinneringsmail

Voor Claude Code, uit te voeren in de repo `contactbeheer`.
Losstaand van de UI-opdracht in `implementatie-brief.md`: dit raakt de frontend niet.

## Doel

Elke maandagochtend om 09:00 Nederlandse tijd stuurt de app mij een mail met de contacten
die te lang wachten, met een directe link per contact. Zodat ik de app niet zelf hoef op
te zoeken.

## Stack

- Supabase Edge Function (Deno, TypeScript) in `supabase/functions/weekly-digest/`
- Supabase Cron (pg_cron plus pg_net) roept die functie aan
- Resend voor de verzending

## Werkwijze

Werk in deze volgorde en **stop na elke stap voor mijn review**. Niet alles in één keer.

1. Bucket-query los testbaar maken en aan mij laten zien
2. Edge Function die de mail opbouwt, met een `?dryRun=true` die de HTML teruggeeft
   zonder te verzenden
3. Resend aansluiten, één echte testmail naar mijzelf
4. Cron-job instellen
5. Foutafhandeling en logging

Lees eerst `js/app.js` en rapporteer hoe de urgentieberekening daar nu werkt. De query in
stap 1 moet **exact dezelfde uitkomst** geven als de frontend. Als je die logica dupliceert,
zeg dat expliciet — dan is dat een bewuste keuze en geen ongeluk.

## Stap 1 — De query

Eén Postgres-functie of view die per gebruiker de indeling oplevert. Zelfde regels als de
frontend, eerste match wint:

1. **afspraak_staat** — er is een toekomstig gepland contactmoment
2. **nooit_contact** — geen enkel contactmoment en geen afspraak
3. **te_laat** — dagen sinds laatste contact >= gewenste frequentie
4. **binnenkort** — volgende gewenste datum ligt 0 tot 14 dagen in de toekomst
5. **op_schema** — de rest

Per contact teruggeven: `id`, `naam`, `bucket`, `dagen_te_laat`, `laatste_poging_kanaal`,
`laatste_poging_dagen` (alleen als de poging jonger is dan 14 dagen, anders null).

Maak testdata aan en laat me de uitkomst zien voor deze randgevallen voordat je verder gaat:

- contact dat vandaag precies verloopt
- contact met een afspraak in het verleden die nooit is vastgelegd
- contact met een afspraak vandaag later op de dag
- contact met een poging van precies 14 dagen oud
- contact zonder telefoonnummer en zonder e-mailadres
- contact met frequentie 0 of null

## Stap 2 — De mail

Edge Function `weekly-digest`. Query per gebruiker met een actief abonnement (zie hieronder),
bouw de mail, verstuur.

Inhoud, in deze vorm:

- Subject: `3 mensen wachten te lang` (het aantal uit bucket `te_laat`)
- Maximaal 5 contacten uit `te_laat`, gesorteerd op `dagen_te_laat` aflopend
- Per regel: naam, `{n} dagen te laat`, en als er een poging is: `Geappt, 4 dagen geleden`
- Eén knop "Openen" naar het Vandaag-scherm
- Per contact een directe link naar dat contact:
  `https://quaiongen.github.io/contactbeheer/#contact={id}`
- Afsluitende regel, samengevat en zonder namen:
  `5 afspraken staan al in je agenda · 12 contacten op schema · 2 wachten op een reactie`

Regels voor de inhoud:

- Alleen feiten, geen conclusies. Dus `Geappt, 4 dagen geleden` en **niet**
  "nog geen afspraak" — dat kan achterlopen op de werkelijkheid.
- Bij 0 contacten in `te_laat`: **geen mail versturen**. Een lege mail is de snelste manier
  om de mail te laten negeren.
- Plain-text variant meesturen naast de HTML.
- HTML met inline styles en tabellen, geen flexbox of grid. Mailclients ondersteunen dat
  niet betrouwbaar. Houd het onder 102 KB in verband met Gmail-clipping.
- Nederlandse teksten.

Bouw `?dryRun=true` in die de HTML teruggeeft in de response zonder te verzenden, zodat ik
hem in de browser kan bekijken. Dit is de belangrijkste testhaak van de hele opdracht.

## Stap 3 — Resend

- Resend-gratistier: 3.000 mails per maand en maximaal 100 per dag, één verifieerd domein.
  Voor mijn eigen gebruik en een handvol testgebruikers ruim genoeg. (Prijzen en limieten
  veranderen; ik verifieer zelf op resend.com/pricing.)
- Ik heb nog geen eigen domein. Gebruik in eerste instantie het testadres van Resend
  (`onboarding@resend.dev`) zodat ik naar mijn eigen accountmail kan sturen. Leg in de
  oplevering uit welke DNS-records ik straks nodig heb als ik een eigen domein ga gebruiken,
  maar doe dat nu niet.
- API-key als Edge Function secret (`supabase secrets set RESEND_API_KEY=...`).
  **Zet geen key in de repo of in een commit.**

## Stap 4 — Cron

Gebruik Supabase Cron via het dashboard of via `cron.schedule`, met `pg_net` om de Edge
Function aan te roepen. Zet de project-URL en het token in Supabase Vault, niet hardcoded.

- Schema: maandag 09:00 Nederlandse tijd. **Let op:** pg_cron werkt in UTC. Dat is
  `0 8 * * 1` in zomertijd en `0 7 * * 1` in wintertijd. Kies één van deze twee, documenteer
  de keuze, en noem in de oplevering expliciet dat dit twee keer per jaar een uur verschuift.
  Bouw er geen slimme omrekening voor; dat is meer risico dan het waard is.
- Zet de job eerst op elke 5 minuten om te testen, en zet hem daarna pas op maandag.
  Vergeet dat niet terug te draaien.

## Stap 5 — Robustheid

- Idempotent: als de functie twee keer draait op dezelfde dag, gaat er één mail uit.
  Log verzendingen in een tabel `digest_sends` (user_id, verzonden_op, aantal_contacten,
  status) en controleer daarop.
- Een mislukte verzending voor één gebruiker mag de rest niet blokkeren.
- Log fouten naar `digest_sends` met status, niet alleen naar de console.
- Geen persoonsgegevens in URL-parameters behalve het contact-id.

## Abonneren

Voeg aan de bestaande gebruikersinstellingen toe:

- `digest_enabled` (boolean, default false)
- `digest_dag` (0 tot 6, default 1 voor maandag)

Nieuwe gebruikers krijgen dus niets tenzij ze het aanzetten. Een uitschrijflink in de mail
die naar de instellingen gaat.

## Buiten scope

- Web push en PWA
- Dagelijkse variant (eerst wekelijks werkend krijgen)
- Wijzigingen aan de frontend, behalve de twee instellingen hierboven

## Oplevering

Rapporteer: gewijzigde bestanden, welke SQL ik handmatig op Supabase moet uitvoeren, welke
secrets ik moet zetten, en wat je niet hebt kunnen testen.
