-- Migratie voor bestaande afspraken die vóór de fix zijn opgeslagen.
--
-- Voor de fix telde alleen `date > today` als gepland; afspraken van
-- vandaag werden dus per ongeluk als "past interaction" (planned=false)
-- weggeschreven. Deze query zet ze alsnog op planned=true.
--
-- Draai op zowel dev als prod (na overname van de nieuwe code).
-- Row Level Security zorgt dat elke gebruiker alleen zijn eigen rijen
-- bijwerkt.

UPDATE interactions
SET planned = true
WHERE date >= CURRENT_DATE
  AND planned = false;
