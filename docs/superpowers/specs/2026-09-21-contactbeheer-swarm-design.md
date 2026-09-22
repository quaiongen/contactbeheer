# Contactbeheer Multi-Agent Swarm — Design

**Date:** 2026-09-21
**Owner:** quaiongen
**Target repo:** [github.com/quaiongen/contactbeheer](https://github.com/quaiongen/contactbeheer)
**Draft location:** `PLANS/2026-09-21-contactbeheer-swarm-design.md` (this workspace)
**Final home (once repo is local):** `docs/superpowers/specs/2026-09-21-contactbeheer-swarm-design.md`

## Doel

Een team van AI-agents in Buzz opzetten dat samen de bestaande **Contactbeheer** web-app door-ontwikkelt. De user (owner) blijft in modus **co-decider**: elke fase-overgang vereist expliciete goedkeuring. Zichtbaarheid en controle voorop; automatisering waar het veilig kan.

## Scope

**In scope**
- Agent-architectuur voor Contactbeheer (zichtbare beslissers + verborgen uitvoerders)
- Buzz project/channel/repo-topologie
- Feature-flow die aansluit op de bestaande CLAUDE.md-werkwijze (brainstorm → plan → bouw)
- Fast lane voor kleine wijzigingen
- Harde gates voor destructieve/irreversibele acties
- Gefaseerde rollout

**Out of scope (voor deze spec)**
- Concrete system-prompts per agent (komen in de implementation plan)
- Kosten-monitoring / rate-limits per agent
- Multi-user samenwerking (nu solo; later mogelijk)
- Migratie van de bestaande app zelf

## Uitgangspunten

- **Werktaal:** Nederlands (spec, commits, user-facing text). Engelse termen waar dat de-facto standaard is (git, PR, spec).
- **Operatie-modus:** Co-decider (C). User keurt elke fase-overgang goed. Bij vertrouwensopbouw kan dit verschuiven naar toezichthouder (A).
- **CLAUDE.md is leidend** voor werkwijze, structuur, deploy-flow en Notion-conventies. De swarm implementeert die conventies, wijzigt ze niet.

## Architectuur — Aanpak 3 (hybride)

Zichtbare beslissers in Buzz + verborgen uitvoerders als Claude Code-subagents. Rationale: user in modus C wil beslispunten zien, geen build-logs.

### Zichtbare agents (Buzz-native, eigen pubkey)

| Agent | Verantwoordelijkheid | Activatie |
|---|---|---|
| **Orchestrator** | Intake, classificatie, taakverdeling, statusbewaking | Continu — reageert op elk bericht in home-channel waarin 'ie getagd wordt |
| **Brainstormer** | Voert `brainstorming` skill; produceert spec-doc + mockups | Non-triviale feature |
| **Planner** | Voert `writing-plans` skill; splitst in bite-sized taken | Na spec-goedkeuring |
| **Code-reviewer** | Reviewt diff tegen spec + repo-conventies | Vóór elke commit |

Elk krijgt een eigen system-prompt (in implementation plan uit te werken) met verwijzing naar de CLAUDE.md-conventies.

### Verborgen uitvoerders (Claude Code subagents)

Gedefinieerd in `.claude/agents/*.md` in de Contactbeheer-repo. Aangeroepen door de Orchestrator via het `Agent`-tool. Output wordt samengevat door de Orchestrator terug in de Buzz-thread.

- **Frontend-builder** — vanilla JS + Bootstrap; kent `js/lib.js` / `js/app.js` splitsing (pure logica vs DOM/Supabase). **Schrijft ook de tests** die uit Test-analyser volgen.
- **Supabase-expert** — SQL migraties, RLS, Edge Functions, Vault-secrets, dev→prod flow
- **Google Calendar / OAuth** — scope-gotchas, silent-refresh guard, multi-calendar read/write
- **Test-analyser** — bepaalt welke tests nodig zijn op logisch niveau (lib.js-coverage). Blijft verborgen omdat de output wordt gebundeld in het plan dat door de zichtbare Planner opgeleverd en door user goedgekeurd wordt.
- **Test-runner** — draait `node --test`, rapporteert
- **Notion-keeper** — backlog-fase-updates + doc-updates via `notion-update-page`
- **Deploy-wachter** — cache-buster bump, SQL-op-prod-check, GitHub Pages verify

**Belangrijke regel:** elke actie van een verborgen uitvoerder die onder "Harde gates" valt, wordt door de Orchestrator eerst als voorstel in de Buzz-thread gepost. Pas na user ✓ mag de uitvoerder doorgaan.

## Topologie in Buzz

- **Project:** "Contactbeheer" (`buzz projects create`)
- **Home-channel:** `#contactbeheer-dev`
- **Repo-koppeling:** `buzz repos create --id contactbeheer --name "Contactbeheer" --channel <home-channel-uuid>` (clone URL naar github.com/quaiongen/contactbeheer)
- **Notion + GitHub links:** in project-kaart voor snelle navigatie

Toekomstige uitbreidingen (later):
- Per-feature thread binnen `#contactbeheer-dev` (standaard patroon)
- Of aparte channel per major feature-lijn als de home-channel te druk wordt

## Feature-flow (non-triviaal)

1. **Intake** — User post in `#contactbeheer-dev`: *"Nieuwe feature: X"* (Orchestrator getagd) of via een Notion-backlog-item.
2. **Classificatie** — Orchestrator opent thread, classificeert (klein / feature / bug), post plan-van-aanpak.
3. **Brainstorm** — Orchestrator activeert Brainstormer. Brainstormer spart met user 1-vraag-per-keer, **biedt Visual Companion aan zodra visuele keuzes aan de orde zijn**, en produceert mockups voor UI-relevante features (zie sectie *Mockups*). Eindresultaat: spec + mockup-map.
4. **Spec-approval** — User geeft ✓. Spec gecommit naar `docs/superpowers/specs/YYYY-MM-DD-<naam>-design.md`, met verwijzing naar de mockup-map en een korte samenvatting van welke mockups zijn goedgekeurd.
5. **Plan** — Planner leest spec, produceert bite-sized taken → `docs/superpowers/plans/YYYY-MM-DD-<naam>.md`.
6. **Plan-approval** — User geeft ✓.
7. **Implementatie per taak** — Orchestrator dispatcht in volgorde: Test-analyser (bepaalt scope) → Builder (schrijft tests + implementatie: frontend/supabase/calendar) → Test-runner (draait). Test-first waar toepasbaar.
8. **Diff-review** — Code-reviewer post samenvatting per taak-diff → user ✓.
9. **Documentatie (page-content)** — Notion-keeper stelt doc-update voor → user ✓ → uitvoert.
10. **Deploy-voorbereiding & push** — Deploy-wachter bereidt cache-buster + SQL voor. `git push` wordt vervolgens **door de agent uitgevoerd** direct na jouw expliciete ✓. Prod-SQL wordt om praktische reden (Supabase SQL Editor-toegang) door de user zelf gedraaid — na dezelfde ✓.
11. **Backlog-status (property-set)** — Notion-keeper zet backlog-item op de juiste fase automatisch (Plannen → Design → Bouwen → Testen → Implementeren → Gereed). Dit is uitgezonderd van de gate; alleen page-content-mutaties vereisen ✓.

## Fast lane — kleine wijzigingen

Orchestrator classificeert intake als "klein" op basis van heuristiek:
- single-file fix
- typo, styling-tweak, tekst-wijziging
- eenvoudige bug-hunt zonder architectuurwijziging

Bij "klein" wordt Brainstorm + Plan overgeslagen:

1. Intake → Orchestrator classificeert als klein → toont classificatie aan user
2. User ✓ op "fast lane" (kan escaleren naar volledige flow als 'ie twijfelt)
3. Direct Builder → Test-runner → Code-reviewer → user ✓ → user pusht

## Harde gates (altijd user ✓ vereist)

Regel: geen enkele hard-gate-actie mag worden uitgevoerd zonder expliciete user ✓ in de thread. Na ✓ voert **de agent** de actie uit — tenzij anders vermeld.

- **SQL naar prod Supabase** — user voert zelf uit in Supabase SQL Editor na ✓ (tooling-reden, geen policy-reden)
- **`git push` naar `main`** — agent voert uit na ✓
- **Notion page-content-updates** (search-and-replace via `notion-update-page`) — agent voert uit na ✓. *Backlog-fase-property-updates zijn hiervan uitgezonderd — die gaan automatisch.*
- **Mail versturen** (weekmail-tests, Resend calls) — agent voert uit na ✓
- **Nieuwe Google OAuth-scope toevoegen** — agent bereidt voor, user voegt zelf toe in Google Cloud Console na ✓
- **Nieuwe agent aanmaken of bestaande agent-config wijzigen** — user keurt in Buzz Desktop
- **Cross-cutting refactor** (>3 bestanden geraakt zonder expliciete plan-goedkeuring) — agent voert uit na ✓

## Mockups tijdens brainstorm

Visualiseren is een expliciet onderdeel van de design-fase — niet optioneel voor UI-relevante features. De swarm volgt de bestaande repo-conventie:

- **Locatie:** `.superpowers/brainstorm/<YYYY-MM-DD-featurename>/` in de Contactbeheer-repo (bestaande convention, in `.gitignore`)
- **Vorm:** HTML-mockups (te openen in browser) en/of PNG-screenshots
- **Index:** elke sessie krijgt een kop bovenaan `brainstorm-mockups.md` (in git) met datum, sessie-map, bestandstabel en `open`-commando's
- **Spec-verwijzing:** elke spec-doc bevat een sectie *Mockups* met (a) pad naar de sessie-map, (b) korte lijst van goedgekeurde mockups en waar ze aan verwezen (welke sectie/beslissing), (c) `open`-commando's
- **Retrieval later:** `brainstorm-mockups.md` in git is de vindplaats — daar staat welke sessies er waren, en met welk pad en `open`-commando's je ze bekijkt
- **Optionele git-commit:** één sleutel-screenshot per feature (PNG) mag naast de spec gecommit worden (`docs/superpowers/specs/mockups/<featurename>.png`) — puur voor "toekomst-you leest de spec en ziet direct waar het over ging". Beslissing per feature; standaard: nee.

**Brainstormer-verantwoordelijkheid:**
1. Detecteert of visuele mockups toegevoegde waarde hebben (UI-verandering, layout-vraag, nieuwe view)
2. Zo ja: biedt Visual Companion aan (`skills/brainstorming/visual-companion.md`) en produceert mockups tijdens de sessie
3. Update `brainstorm-mockups.md` met sessie-kop
4. Voegt *Mockups*-sectie toe aan de spec-doc met paden + `open`-commando's
5. Voor niet-UI features (bijv. pure Supabase-migratie, cron-tuning): mockups niet nodig, sla over

**Fallback als Visual Companion faalt of niet past:**
- Statische HTML-mockup schrijven en pad delen
- ASCII-schets in de thread
- Verwijzing naar bestaande UI + screenshot van de huidige stand

## Foutafhandeling

- **Agent-crash / provider-timeout mid-taak** — Orchestrator pauzeert de thread en post een "gefaald op X, retry?"-melding voor user. Geen automatische retry.
- **User AFK bij pending ✓** — thread blijft open, geen SLA. Orchestrator kan na (bijv.) 24u een reminder in de thread posten, maar handelt niet zelfstandig.
- **Tegenstrijdig advies tussen specialisten** — Orchestrator vat het conflict samen en vraagt user beslist. Geen auto-resolve.
- **Failing tests bij Test-runner** — resultaat gaat terug naar Builder met de failure-output; Builder past aan; Test-runner draait opnieuw. Na 3 mislukte iteraties: escaleren naar user met samenvatting.
- **Skill-invocatie faalt (Brainstormer/Planner)** — Orchestrator neemt de vraag over met een simpele fallback-flow (in de thread), en meldt dat de skill niet beschikbaar was.

## Runtime & configuratie

- **Zichtbare agents:** Buzz-managed (zoals Fizz). Elk heeft eigen pubkey + provider/model + system-prompt. Aangemaakt via owner-reviewed draft: `buzz agents draft-create`. User keurt in Buzz Desktop.
- **Skill-toegang voor zichtbare agents:** Buzz-managed agents draaien binnen de Claude Code-harness en hebben daarmee toegang tot de `superpowers:brainstorming` en `superpowers:writing-plans` skills. Brainstormer en Planner **invoken deze skills direct** — hun system-prompt beschrijft wanneer, maar de skill-inhoud wordt niet in de prompt gebakken.
- **Verborgen uitvoerders:** Claude Code subagent-definities in `contactbeheer/.claude/agents/*.md`. Geen aparte pubkey/config; leven binnen de Claude Code-sessie van de Orchestrator wanneer die aan de repo werkt.
- **Werkdirectory:** Orchestrator werkt in een lokale checkout van de Contactbeheer-repo (in het per-user Buzz-workspace onder `REPOS/contactbeheer/` of het bestaande dev-pad van de user).
- **Trigger:** Buzz stuurt @mention → Orchestrator-agent handelt af.

## Gefaseerde rollout

**Fase 0 — spec** *(deze doc, hier)*
- Design vastgelegd, user-goedkeuring.

**Fase 1 — project + repo**
- `buzz projects create` (owner-review in Desktop)
- `buzz channels create` of `buzz projects add-channel` voor `#contactbeheer-dev`
- `buzz repos create` koppelt github.com/quaiongen/contactbeheer

**Fase 2 — Orchestrator + stub-uitvoerder**
- Owner-reviewed draft voor Orchestrator-agent, system-prompt gebaseerd op deze spec + CLAUDE.md
- User keurt goed in Buzz Desktop, kiest provider/model
- Eén minimale stub-subagent (bv. "echo-worker") in `.claude/agents/` zodat het delegatie-mechanisme werkelijk gebruikt wordt
- **Milestone:** Orchestrator herkent een intake, opent een thread, delegeert een dummy-taak naar de stub-uitvoerder, en post de teruggerapporteerde samenvatting terug in de thread. Dit valideert de kern-lus (intake → delegatie → samenvatting → user reageert) zonder domeinkennis nodig te hebben.

**Fase 3 — Design-flow (Brainstormer + Planner)**
- Owner-reviewed drafts voor beide
- User goedkeuring
- **Milestone:** One-shot een non-triviale feature door spec-goedkeuring + plan-goedkeuring krijgen

**Fase 4a — Dunne end-to-end (Frontend + Test-runner + Code-reviewer)**
- Subagent-definities voor Frontend-builder + Test-runner in `.claude/agents/`
- Code-reviewer als vierde Buzz-agent (owner-reviewed draft, user goedkeuring)
- **Milestone:** Kleine wijziging loopt volledig door: intake → fast-lane → build (met tests) → test-run → code-review → user ✓

**Fase 4b — Domein-experts (Supabase + Calendar + Test-analyser)**
- Subagent-definities voor Supabase-expert, Google-Calendar-expert, Test-analyser
- **Milestone:** Non-triviale feature met SQL óf Calendar-integratie loopt tot en met implementatie + tests (docs- en deploy-admin blijven in deze fase handmatig)

**Fase 4c — Admin (Notion-keeper + Deploy-wachter)**
- Subagent-definities toevoegen
- **Milestone:** Feature-afronding inclusief backlog-fase-update en cache-buster-bump loopt zonder handmatige tussenstappen (behoudens de gates)

**Fase 5 — Iteratie**
- Frictie-punten verzamelen tijdens pilot
- System-prompts bijstellen
- Fast-lane heuristiek kalibreren

**Fase 6 — Groei (optioneel)**
- Verborgen uitvoerder promoten naar zichtbare Buzz-agent als user meer inzicht wil
- Overwegen om naar modus B (meelezer) te schuiven zodra vertrouwen er is

## Succes-criteria

De opzet is succesvol als:

1. Een non-triviale feature loopt end-to-end door de swarm met **alleen** deze fase-overgangen door user goedgekeurd: spec ✓, plan ✓, per-taak diff ✓ (n per taak — passend bij modus C), docs page-content ✓ (indien gewijzigd), push. Modus C accepteert dat het aantal ✓'s meebeweegt met de feature-grootte; wat telt is dat elke ✓ een duidelijke, korte samenvatting krijgt.
2. Een klein wijziging (typo/UI-tweak) loopt binnen 10 minuten van intake tot ready-to-push.
3. Geen enkele destructieve of irreversibele actie is uitgevoerd zonder expliciete user ✓.
4. De existing CLAUDE.md-workflow blijft intact — spec/plan-bestanden staan op de conventionele plek, Notion-status beweegt mee, tests draaien vóór PR.
5. User kan op elk moment ingrijpen door in de thread te posten (Orchestrator luistert continu).

## Risico's & mitigaties

| Risico | Mitigatie |
|---|---|
| Te veel agents → veel notificaties | Start met alleen Orchestrator, breid gefaseerd uit |
| Verborgen uitvoerders maken keuzes die je niet ziet | Code-reviewer krijgt expliciete opdracht om architectuur-afwijkingen te melden |
| Agent-configs zijn owner-reviewed → drempel per wijziging | Accepteer dit — het is een feature, niet een bug |
| Orchestrator loopt vast tussen sessies | Persistente state via `buzz mem set` per agent (core memory) |
| Kosten lopen op | Later per-agent cost tracking via provider dashboards; nu geen automatisering |
| CLAUDE.md verandert, agents niet | Fase 5 bevat een expliciete sync-stap; toekomstige uitbreiding: Orchestrator leest CLAUDE.md bij session start |

## Open beslissingen (voor implementation plan)

- Concrete system-prompts per agent
- Exact provider + model per agent (Claude Opus 5 / Sonnet 5 / Haiku 4.5 keuze)
- Naming / bee-persona per agent (optioneel — Fizz-stijl)
- Fast-lane classificatie-heuristiek — regel-based of laten leren?
- Waar de Orchestrator z'n werk-checkout heeft (per-run worktree of persistente `REPOS/contactbeheer`)

## Referenties

- CLAUDE.md — Contactbeheer (single source of truth voor werkwijze)
- Notion doc: page `3e1c13a2-187c-81dd-ac48-d3c9d7646b43`
- Backlog: data source `3e1c13a2-187c-806f-ad64-000b351cf92f`
- Repo: github.com/quaiongen/contactbeheer
- Buzz CLI: `buzz agents draft-create`, `buzz projects create`, `buzz repos create`
