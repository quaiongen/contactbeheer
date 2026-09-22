# Contactbeheer Multi-Agent Swarm — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zet in Buzz een multi-agent framework op dat de verdere ontwikkeling van Contactbeheer ondersteunt. Vier zichtbare Buzz-agents (Orchestrator, Brainstormer, Planner, Code-reviewer) + zeven verborgen Claude Code-subagents. User in modus co-decider: elke fase-overgang vereist expliciete goedkeuring.

**Architectuur:** Hybride (aanpak 3 uit de spec). Beslissers zijn Buzz-managed agents met eigen pubkey, provider/model en system-prompt — leven in het home-channel `#contactbeheer-dev`. Uitvoerders zijn Claude Code-subagents in `.claude/agents/*.md`, aangeroepen door de Orchestrator. Cost-tracking via per-feature logboek + provider-dashboards.

**Tech stack:** Buzz CLI (`buzz projects/channels/repos/agents`), Claude Code subagents (`.claude/agents/`), git, bash. Geen wijzigingen aan de Contactbeheer-app zelf in dit plan.

**Ontwerp-referentie:** `docs/superpowers/specs/2026-09-21-contactbeheer-swarm-design.md`

**Aannames**
- `BUZZ_RELAY_URL`, `BUZZ_PRIVATE_KEY`, `BUZZ_AUTH_TAG` staan in de executor-env (aanwezig in Fizz-omgeving)
- Executor draait vanuit een shell die lezen/schrijven kan in `/Users/quaiongen/.buzz/REPOS/contactbeheer/` (symlink naar `/Users/quaiongen/Documents/ClaudeCode/visuele contacten`)
- User is bereikbaar in de DM `#8ef5a253-c1d7-46b5-b368-113597219c8b` voor ✓-momenten
- User keurt agent-drafts goed in Buzz Desktop en kiest daar provider/model
- **Elke `git` commando wordt gescoped met `git -C /Users/quaiongen/.buzz/REPOS/contactbeheer …`** of geplaatst binnen `(cd /Users/quaiongen/.buzz/REPOS/contactbeheer && …)` — het executor-harness reset cwd tussen tool-calls
- **Placeholders** in commando-blokken (bijv. `<HOME_CHANNEL_UUID>`, `<ORCHESTRATOR_PUBKEY>`) worden vastgelegd uit een eerdere step; elke step die ze introduceert markeert dat expliciet

---

## File Structure

Bestandslocaties na afronden van alle taken. Alles binnen `contactbeheer/`:

```
.claude/agents/
├── echo-worker.md              # Fase 2 — stub voor delegatie-test
├── frontend-builder.md         # Fase 4a
├── test-runner.md              # Fase 4a
├── supabase-expert.md          # Fase 4b
├── google-calendar-expert.md   # Fase 4b
├── test-analyser.md            # Fase 4b
├── notion-keeper.md            # Fase 4c
└── deploy-wachter.md           # Fase 4c

swarm/
├── README.md                   # Fase 1 — overview van de swarm
└── system-prompts/
    ├── orchestrator.md         # Fase 2
    ├── brainstormer.md         # Fase 3
    ├── planner.md              # Fase 3
    └── code-reviewer.md        # Fase 4a

docs/superpowers/costs/
├── README.md                   # Fase 1 — cost-log conventie + template
└── (per feature een file — leeg bij setup)
```

**Rationale voor deze splitsing**
- `.claude/agents/` volgt de bestaande Claude Code-conventie; hier is geen ruimte voor keuze
- `swarm/system-prompts/` in de repo maakt prompts version-controlled en reviewbaar los van hun deployment. De feitelijke prompt bij de zichtbare Buzz-agent leeft na goedkeuring in Buzz Desktop; de file in de repo is de canonieke bron waar edits van uit gaan
- `swarm/README.md` is een korte wegwijzer voor toekomstige lezers (jezelf over 3 maanden, collega die instapt)
- `docs/superpowers/costs/README.md` legt het cost-log-formaat uit; per-feature files komen automatisch

---

## Verificatie in plaats van tests

Dit plan bouwt infrastructuur, geen code. Waar in een normale TDD-flow "write failing test" zou staan, hebben tasks hier een **Verify-stap** met een concreet commando + verwachte output. Alle commits blijven expliciete stappen.

## Wait/resume-patroon voor user-goedkeuring

Meerdere tasks pauzeren tot user een actie doet (agent-draft goedkeuren in Buzz Desktop, milestone-✓ posten in de thread). Bij vervolg-invocatie:

**Voor agent-drafts** — check dat provider/model gevuld zijn:

```bash
buzz users get --pubkey "$AGENT_PUBKEY"
```

Zoek in output naar niet-lege `provider` en `model` velden. Leeg → wacht nog.

**Voor milestone ✓ door user** — check de laatste channel-berichten op een expliciete ✓-string van de user:

```bash
buzz messages get --channel <HOME_CHANNEL_UUID> --limit 30 \
  | jq -r '.[] | select(.pubkey == "<USER_PUBKEY>") | .content' \
  | grep -E '(✓|akkoord|goedgekeurd|milestone[^a-z]*[0-9])' \
  | head -5
```

Als de laatste match op een milestone-signaal *na* de post van de milestone-verify staat: milestone gepasseerd. USER_PUBKEY voor deze sessie: `767270b22b9c0bedb57a23425167e47a22877906b02ecb56fe64b0f5dda28974`.

Bij time-out (>24u zonder respons): reminder-post in de thread, geen automatische escalatie.

---

# Fase 0 — Prerequisites

## Task 0: Working-tree, dirs, gitignore

**Files:**
- Modify: `.gitignore` (add `.superpowers/brainstorm/` if missing)
- Create: `swarm/system-prompts/` `docs/superpowers/costs/` `.claude/agents/` dirs

- [ ] **Step 1: Verify repo lokaal aanwezig en op main**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer status --short
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer branch --show-current
```

Expected: clean working tree (of alleen sanctioned wijzigingen), branch `main`. Anders: pauzeer, meld in het DM-channel.

- [ ] **Step 2: Verify git user config gezet**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer config --get user.name
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer config --get user.email
```

Expected: beide gevuld. Als leeg: pauzeer, vraag user.

- [ ] **Step 3: Verify env vars**

```bash
[ -n "$BUZZ_RELAY_URL" ] && [ -n "$BUZZ_PRIVATE_KEY" ] && [ -n "$BUZZ_AUTH_TAG" ] && echo "env OK" || echo "env MISSING"
```

Expected: `env OK`. Anders: pauzeer, meld dat draft-create niet gaat werken.

- [ ] **Step 4: Directories aanmaken**

```bash
mkdir -p /Users/quaiongen/.buzz/REPOS/contactbeheer/swarm/system-prompts
mkdir -p /Users/quaiongen/.buzz/REPOS/contactbeheer/docs/superpowers/costs
mkdir -p /Users/quaiongen/.buzz/REPOS/contactbeheer/.claude/agents
```

- [ ] **Step 5: Verifieer `.gitignore` bevat `.superpowers/brainstorm/`**

```bash
grep -q '^\.superpowers/brainstorm/' /Users/quaiongen/.buzz/REPOS/contactbeheer/.gitignore \
  && echo "already ignored" \
  || echo "MISSING — voeg toe"
```

Als MISSING:

```bash
echo '.superpowers/brainstorm/' >> /Users/quaiongen/.buzz/REPOS/contactbeheer/.gitignore
(cd /Users/quaiongen/.buzz/REPOS/contactbeheer && git add .gitignore && git commit -m "chore: negeer lokale brainstorm-sessies")
```

---

# Fase 1 — Foundation

## Task 1: Home-channel `#contactbeheer-dev` aanmaken

**Files:** geen (relay-operatie)

- [ ] **Step 1: Channel aanmaken**

```bash
buzz channels create \
  --name contactbeheer-dev \
  --type stream \
  --visibility open \
  --description "Contactbeheer swarm — home channel voor Orchestrator + agents"
```

Bewaar de teruggegeven `channel_id` (UUID) — hierna nodig als `<HOME_CHANNEL_UUID>` in alle volgende commando's.

- [ ] **Step 2: Verify**

```bash
buzz channels list | jq '.[] | select(.name=="contactbeheer-dev")'
```

Expected: één object met `name`, `channel_id`, `description` velden. Als leeg: retry step 1.

## Task 2: Project "Contactbeheer" aanmaken

**Files:** geen (relay-operatie)

- [ ] **Step 1: Project aanmaken, gebonden aan home-channel**

```bash
buzz projects create contactbeheer \
  --name "Contactbeheer" \
  --description "Persoonlijke contact-management web-app; multi-agent development swarm" \
  --channel <HOME_CHANNEL_UUID>
```

De `--repo` parameter wordt bewust weggelaten: dat creëert automatisch een default repo gebonden aan het channel, wat we in Task 3 overschrijven met de echte contactbeheer-repo.

- [ ] **Step 2: Verify — noteer de `link` uit de output**

```bash
buzz projects list | jq '.[] | select(.slug=="contactbeheer")'
```

Expected: één object. Als de aanmaak conflict gaf, project bestond al → gebruik bestaand.

## Task 3: Repo `contactbeheer` announcen

**Files:** geen (relay-operatie)

- [ ] **Step 1: Repo koppelen aan home-channel**

```bash
buzz repos create \
  --id contactbeheer \
  --name "Contactbeheer" \
  --description "Persoonlijke contact-management web-app" \
  --clone https://github.com/quaiongen/contactbeheer.git \
  --web https://github.com/quaiongen/contactbeheer \
  --channel <HOME_CHANNEL_UUID>
```

Bewaar de `link` uit de output — gebruikt in later te posten channel-berichten.

- [ ] **Step 2: Verify**

```bash
buzz repos list | jq '.[] | select(.id=="contactbeheer")'
```

Expected: één object met matching `id`, `name`, `channel` velden.

## Task 4: Swarm-directory + cost-log conventie in de repo

**Files:**
- Create: `swarm/README.md`
- Create: `docs/superpowers/costs/README.md`

- [ ] **Step 1: Schrijf `swarm/README.md`**

```markdown
# Contactbeheer Swarm

Multi-agent framework dat de ontwikkeling van deze app ondersteunt.

**Design-spec:** `docs/superpowers/specs/2026-09-21-contactbeheer-swarm-design.md`
**Implementation plan:** `docs/superpowers/plans/2026-09-22-contactbeheer-swarm.md`

## Structuur

- `system-prompts/` — canonieke system-prompts voor zichtbare Buzz-agents (Orchestrator, Brainstormer, Planner, Code-reviewer). Deployment loopt via Buzz Desktop na `buzz agents draft-create`.
- Subagent-definities voor verborgen uitvoerders staan in `.claude/agents/`.

## Home-channel

`#contactbeheer-dev` in Buzz. Alle intake, discussie, ✓-momenten en oplevering lopen daar.

## Cost tracking

Zie `docs/superpowers/costs/README.md` voor het per-feature logboek-formaat.
```

- [ ] **Step 2: Schrijf `docs/superpowers/costs/README.md`**

```markdown
# Cost tracking — per feature

Hybride aanpak (spec-sectie *Cost tracking*): per-feature logboek als schatting + provider-dashboards als ground truth + maandelijkse reconciliatie.

## Per-feature logboek

**Locatie:** `docs/superpowers/costs/YYYY-MM-DD-<featurename>.md`
**Aangemaakt door:** Orchestrator, op het moment dat een feature-thread wordt geopend.
**Bijgewerkt door:** elke agent na afsluiting van zijn fase (voegt één regel toe).
**Afgesloten door:** Orchestrator na push van de feature (voegt `Totaal:`-regel toe).

## Regel-formaat

Markdown-tabel; één regel per fase-completion:

| timestamp | agent | fase | model | tokens_in | tokens_out | est_eur |
|---|---|---|---|---|---|---|
| 2026-09-22T10:15Z | Brainstormer | spec | claude-sonnet-5 | 12500 | 3200 | ~0.08 |
| 2026-09-22T10:41Z | Planner | plan | claude-opus-5 | 18000 | 5400 | ~0.63 |
| ... | ... | ... | ... | ... | ... | ... |
| **Totaal** | | | | **N** | **N** | **~0.XX** |

- Kolom `est_eur` in euro's. Providerprijzen zijn meestal USD; reken om via vaste koers (default USD→EUR = **0.92**, hier bij te stellen als de koers structureel afwijkt).
- Schattingen krijgen prefix `~` zodat ze bij reconciliatie herkenbaar zijn.
- Timestamps in UTC (ISO-8601, minuut-precisie is genoeg).

## Aggregatie per maand

```bash
awk -F'|' '/\| ~?[0-9]/ {gsub(/~/, ""); gsub(/ /, "", $8); sum+=$8} END {print sum}' \
  docs/superpowers/costs/2026-09-*.md
```

## Backlog-titel bij afronding

Zodra Notion-keeper de backlog-status op **Gereed** zet, werkt hij in dezelfde operatie de titel bij:

- Lees het `Totaal:`-bedrag uit dit cost-log-bestand (kolom `est_eur`)
- Rond af op hele euro's
- Nieuwe titel = originele titel + ` (N euro)`
- Als er al een `(N euro)`-suffix stond (re-open + re-close): vervang de bestaande suffix, niet stapelen

Voorbeeld: `Toevoegen outlook agenda koppeling` → `Toevoegen outlook agenda koppeling (30 euro)`.

## Reconciliatie (1e van de maand)

1. Lees per zichtbare Buzz-agent het maandtotaal in Anthropic Console (of andere provider-dashboard, in USD).
2. Reken maandtotalen om naar EUR met dezelfde koers als het logboek.
3. Som de `Totaal:`-regels uit `docs/superpowers/costs/YYYY-MM-*.md`.
4. Correctiefactor = provider ÷ logboek. Bij > 1.2 of < 0.8: agents recalibreren via een prompt-note. Bij structurele koersafwijking: stel de default-koers hier bij.
```

- [ ] **Step 3: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add swarm/README.md docs/superpowers/costs/README.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): swarm-directory + cost-log conventie"
```

---

# Fase 2 — Orchestrator + stub-uitvoerder

## Task 5: Orchestrator system-prompt schrijven

**Files:**
- Create: `swarm/system-prompts/orchestrator.md`

- [ ] **Step 1: Schrijf het prompt**

Vereiste inhoud (in het Nederlands, waarin de agent zichzelf leest bij elke turn):

1. **Rol** — één alinea. "Je bent de Orchestrator van de Contactbeheer-swarm. Je ontvangt intake in `#contactbeheer-dev` en verdeelt werk over specialisten."
2. **Repo-kennis** — verwijzing naar `CLAUDE.md`, `docs/superpowers/specs/`, `docs/superpowers/plans/`, `.superpowers/brainstorm/`, `brainstorm-mockups.md`. De agent leest `CLAUDE.md` bij session start.
3. **Werkwijze — non-triviaal**
   - Open thread per feature.
   - Classificeer intake: klein / feature / bug.
   - Roep Brainstormer aan voor feature-flow, wachten op spec-goedkeuring.
   - Roep Planner aan, wachten op plan-goedkeuring.
   - Dispatch verborgen uitvoerders per taak (in volgorde: Test-analyser → Builder → Test-runner).
   - Roep Code-reviewer aan per taak-diff.
4. **Werkwijze — fast-lane** — voor typo/UI-tweak/single-file-fix: skip brainstorm+plan, direct Builder → Code-reviewer → user ✓.
5. **Hard gates** — som ze op (zie spec-sectie *Harde gates*). Voor elke gate-actie: eerst voorstel in de thread, wachten op user ✓, dan uitvoeren.
6. **Foutafhandeling** — bij subagent-fail: pauze, meld in thread. Bij tegenstrijdig advies: samenvat, vraag user. Bij failing tests na 3 iteraties: escaleren naar user.
7. **Cost-log verantwoordelijkheid** — bij thread-opening voor een nieuwe feature, maak `docs/superpowers/costs/YYYY-MM-DD-<featurename>.md` met exact deze structuur:

    ```markdown
    # <Featurename> — cost log

    Feature-thread: <link naar thread-root>
    Started: <ISO-timestamp UTC>

    | timestamp | agent | fase | model | tokens_in | tokens_out | est_eur |
    |---|---|---|---|---|---|---|
    ```

    Elke keer een subagent klaar is: lees `<usage>` uit completion, reken kosten om naar EUR (USD-prijzen × 0.92), voeg één regel toe. Bij eigen turns: schrijf conservatieve schatting (prefix `~`). Bij feature-afronding (na push):

    ```markdown
    | **Totaal** | | | | **N** | **N** | **~N.NN** |
    ```

    Committen samen met de laatste feature-commit. Notion-keeper gebruikt dit totaal om de backlog-titel aan te vullen met `(N euro)` — zie Task 23.
8. **Communicatie** — publiek waar het teamzichtbaarheid vraagt (pickup/blocker/done), stil waar niet. Nederlands. Beknopt.
9. **Callback-mention regel** — bij deliverable of blocker altijd de user (of delegator) `@mention`-en.

- [ ] **Step 2: Verify het prompt**

Lees het bestand terug en check:
- [ ] Alle 9 secties aanwezig
- [ ] Nederlands
- [ ] Verwijst naar de spec-doc

- [ ] **Step 3: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add swarm/system-prompts/orchestrator.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): Orchestrator system-prompt"
```

## Task 6: Orchestrator-agent draft opsturen ter goedkeuring

**Files:** geen (relay-operatie)

- [ ] **Step 1: Draft aanmaken (leest het prompt van stdin)**

```bash
cd /Users/quaiongen/.buzz/REPOS/contactbeheer
cat swarm/system-prompts/orchestrator.md | \
  buzz agents draft-create \
    --channel <HOME_CHANNEL_UUID> \
    --display-name "Orchestrator" \
    --system-prompt - \
  | tee /tmp/orchestrator-draft.json
```

**Vastleggen uit output:**
- `link` → `ORCHESTRATOR_LINK` (deep-link voor Buzz Desktop)
- `pubkey` → `ORCHESTRATOR_PUBKEY` (nodig voor Step 3 verify)

```bash
ORCHESTRATOR_LINK=$(jq -r .link /tmp/orchestrator-draft.json)
ORCHESTRATOR_PUBKEY=$(jq -r .pubkey /tmp/orchestrator-draft.json)
```

- [ ] **Step 2: Post link in home-channel voor user-actie**

Let op: gebruik onquoted heredoc (`<<EOF`) zodat `$ORCHESTRATOR_LINK` uitgeklopt wordt:

```bash
buzz messages send --channel <HOME_CHANNEL_UUID> --content - <<EOF
Orchestrator-draft klaar voor review in Buzz Desktop: ${ORCHESTRATOR_LINK}
Kies provider + model bij goedkeuring (aanbeveling: Claude Sonnet 5).
EOF
```

- [ ] **Step 3: Wacht op user-goedkeuring en verify**

Executor pauzeert. Bij vervolg-invocatie: check of de agent bestaat en geconfigureerd is:

```bash
buzz users get --pubkey "$ORCHESTRATOR_PUBKEY"
```

Expected: `display_name: "Orchestrator"` en de user-managed fields (`provider`, `model`) gevuld. Zolang die leeg zijn wacht de executor nog. Bij time-out (>24u): reminder in het channel.

## Task 7: Stub-subagent `echo-worker` toevoegen

**Files:**
- Create: `.claude/agents/echo-worker.md`

- [ ] **Step 1: Schrijf minimale subagent-definitie**

```markdown
---
name: echo-worker
description: Trivial delegation stub. Given a prompt, echo it back with "processed:" prefix and a random 5-char id. Used to validate the Orchestrator's delegation loop end-to-end before real specialists exist.
---

You are a stub subagent. When invoked, respond with exactly this format:

processed: <the input prompt, verbatim>
run-id: <5 random alphanumeric characters>

Do not add explanation, commentary, or additional formatting.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add .claude/agents/echo-worker.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): echo-worker stub subagent voor Fase 2 verify"
```

## Task 8: Fase 2 milestone-verify

**Files:** geen (integration check)

- [ ] **Step 1: Post een dummy-intake in het home-channel**

```bash
buzz messages send --channel <HOME_CHANNEL_UUID> --content \
  "@Orchestrator dummy-intake voor verify: delegeer een test-taak aan echo-worker en post de output hier terug."
```

- [ ] **Step 2: Verify — Orchestrator reageert binnen 60s met**

- Een classificatie (kort)
- Delegatie aan echo-worker (kan hidden zijn, maar Orchestrator moet expliciet noemen dat 'ie 'm heeft aangeroepen)
- De teruggegeven `processed: … / run-id: …` output samengevat in het channel
- Callback-`@mention` van user

Als een van deze ontbreekt: prompt bijstellen (Task 5 iteratie) en retry.

- [ ] **Step 3: Milestone ✓ door user in de thread**

User post: "Fase 2 ✓" (of expliciete goedkeuring) → executor gaat door naar Fase 3.

---

# Fase 3 — Design-flow (Brainstormer + Planner)

## Task 9: Brainstormer system-prompt schrijven

**Files:**
- Create: `swarm/system-prompts/brainstormer.md`

- [ ] **Step 1: Schrijf het prompt**

Vereiste inhoud:

1. **Rol** — "Je bent de Brainstormer van de Contactbeheer-swarm. Je runt de `superpowers:brainstorming` skill met user tot een goedgekeurde spec-doc."
2. **Skill-invocatie** — invoke `superpowers:brainstorming` bij session start. Volg die skill exact.
3. **Repo-conventies** — spec-doc naar `docs/superpowers/specs/YYYY-MM-DD-<naam>-design.md`. Committen na goedkeuring.
4. **Mockup-verantwoordelijkheid** *(uit spec-sectie Mockups)*
   - Detecteer of UI-mockups toegevoegde waarde hebben.
   - Zo ja: bied Visual Companion aan (`skills/brainstorming/visual-companion.md`).
   - Mockups in `.superpowers/brainstorm/<YYYY-MM-DD-featurename>/` (lokaal, in `.gitignore`).
   - Update `brainstorm-mockups.md` met sessie-kop.
   - Voeg *Mockups*-sectie toe aan de spec met paden + `open`-commando's.
5. **Werkwijze** — 1 vraag per keer, multiple-choice waar kan.
6. **Cost-log** — schrijf één regel in de feature-cost-log wanneer spec goedgekeurd.
7. **Nederlands, beknopt.**

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add swarm/system-prompts/brainstormer.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): Brainstormer system-prompt"
```

## Task 10: Brainstormer-agent draft opsturen

**Files:** geen (relay-operatie)

- [ ] **Step 1: Draft aanmaken en pubkey/link vastleggen**

```bash
cd /Users/quaiongen/.buzz/REPOS/contactbeheer
cat swarm/system-prompts/brainstormer.md | \
  buzz agents draft-create \
    --channel <HOME_CHANNEL_UUID> \
    --display-name "Brainstormer" \
    --system-prompt - \
  | tee /tmp/brainstormer-draft.json

BRAINSTORMER_LINK=$(jq -r .link /tmp/brainstormer-draft.json)
BRAINSTORMER_PUBKEY=$(jq -r .pubkey /tmp/brainstormer-draft.json)
```

- [ ] **Step 2: Link in channel + wait-for-approval**

```bash
buzz messages send --channel <HOME_CHANNEL_UUID> --content - <<EOF
Brainstormer-draft klaar voor review: ${BRAINSTORMER_LINK}
EOF
```

Verify na user-actie (analoog aan Task 6 Step 3):

```bash
buzz users get --pubkey "$BRAINSTORMER_PUBKEY"
```

Expected: `provider` + `model` gevuld.

## Task 11: Planner system-prompt schrijven

**Files:**
- Create: `swarm/system-prompts/planner.md`

- [ ] **Step 1: Schrijf het prompt**

Vereiste inhoud:

1. **Rol** — "Je bent de Planner van de Contactbeheer-swarm. Je vertaalt een goedgekeurde spec naar een bite-sized implementation plan via `superpowers:writing-plans`."
2. **Skill-invocatie** — invoke `superpowers:writing-plans` bij start.
3. **Repo-conventies** — plan-doc naar `docs/superpowers/plans/YYYY-MM-DD-<naam>.md`. Bite-sized taken (test → fail → implement → pass → commit).
4. **Test-scope** — includeert output van Test-analyser (verborgen subagent) in het plan als expliciete test-taken.
5. **Reviewer-loop** — na plan draft: dispatcht een plan-document-reviewer subagent; itereer max 3 keer.
6. **Cost-log** — schrijf regel na plan-goedkeuring.
7. **Nederlands, beknopt.**

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add swarm/system-prompts/planner.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): Planner system-prompt"
```

## Task 12: Planner-agent draft opsturen

**Files:** geen (relay-operatie)

- [ ] **Step 1: Draft aanmaken en pubkey/link vastleggen**

```bash
cd /Users/quaiongen/.buzz/REPOS/contactbeheer
cat swarm/system-prompts/planner.md | \
  buzz agents draft-create \
    --channel <HOME_CHANNEL_UUID> \
    --display-name "Planner" \
    --system-prompt - \
  | tee /tmp/planner-draft.json

PLANNER_LINK=$(jq -r .link /tmp/planner-draft.json)
PLANNER_PUBKEY=$(jq -r .pubkey /tmp/planner-draft.json)
```

- [ ] **Step 2: Link in channel + wait-for-approval**

```bash
buzz messages send --channel <HOME_CHANNEL_UUID> --content - <<EOF
Planner-draft klaar voor review: ${PLANNER_LINK}
EOF
```

Verify:

```bash
buzz users get --pubkey "$PLANNER_PUBKEY"
```

Expected: `provider` + `model` gevuld.

## Task 13: Fase 3 milestone-verify

**Files:** geen (integration check)

- [ ] **Step 1: Post non-triviale intake**

Kies één backlog-item uit Notion met status "Niet gestart" — bij voorkeur een middelgroot item met UI-aspecten (zodat mockup-flow getest wordt). Post in het home-channel:

```
@Orchestrator nieuwe feature: <backlog-title uit Notion>
Beschrijving: <kort>
Backlog-link: <notion-URL>
```

- [ ] **Step 2: Verify — de flow tot en met plan-goedkeuring**

Verwacht:
- [ ] Orchestrator classificeert als "feature (non-triviaal)"
- [ ] Roept Brainstormer aan
- [ ] Brainstormer voert brainstorming skill uit, sparren-flow met user, biedt Visual Companion aan bij UI-vragen
- [ ] Spec-doc verschijnt in `docs/superpowers/specs/` met correct naampatroon en Mockups-sectie
- [ ] User ✓ → spec gecommit
- [ ] Orchestrator roept Planner aan
- [ ] Plan-doc verschijnt in `docs/superpowers/plans/`
- [ ] Reviewer-loop draait door (max 3 iteraties)
- [ ] User ✓ → plan gecommit
- [ ] Cost-log-file bestaat met minimaal 2 regels (Brainstormer, Planner)

**Uitvoering stopt hier bewust** — Fase 3 valideert design-flow, niet build. In Fase 4a wordt de rest van de flow live gezet.

- [ ] **Step 3: Milestone ✓ door user**

---

# Fase 4a — Dunne end-to-end (Frontend + Test-runner + Code-reviewer)

## Task 14: Frontend-builder subagent toevoegen

**Files:**
- Create: `.claude/agents/frontend-builder.md`

- [ ] **Step 1: Schrijf subagent-definitie**

```markdown
---
name: frontend-builder
description: Vanilla JS + Bootstrap 5.3 developer for the Contactbeheer app. Knows the js/lib.js (pure logic, testable) vs js/app.js (DOM + Supabase + Google Calendar) split. Writes both the tests specified by test-analyser and the implementation code. Follows the file-and-commit conventions in CLAUDE.md.
---

You are the frontend implementer for Contactbeheer.

## What you know
- Repo layout: index.html + index-dev.html, js/lib.js (pure, node --test-baar), js/app.js (DOM/Supabase/GCal), css/styles.css.
- Dual-export pattern in js/lib.js: both browser globals and node module exports via IIFE.
- Bootstrap 5.3, no build step. All script includes go in both index.html AND index-dev.html.
- Cache-buster convention: `?v=YYYYMMDD?` bumped in both index files after CSS changes.

## What you do per invocation
1. Read the task from your invoker (usually Orchestrator).
2. If given a test spec from test-analyser: write the failing test FIRST in test/<name>.test.js.
3. Run node --test to confirm the failure.
4. Write the minimal implementation in js/lib.js (pure) or js/app.js (DOM/Supabase).
5. Run node --test to confirm pass.
6. Return summary: files touched, test result, any surprises. DO NOT commit — Orchestrator handles commits after code-reviewer approval.

## Boundaries
- Do NOT touch SQL, Supabase config, or Edge Functions. Return "needs supabase-expert" if asked.
- Do NOT touch Google Calendar OAuth/scope logic. Return "needs google-calendar-expert" if asked.
- Do NOT modify CLAUDE.md.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add .claude/agents/frontend-builder.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): frontend-builder subagent"
```

## Task 15: Test-runner subagent toevoegen

**Files:**
- Create: `.claude/agents/test-runner.md`

- [ ] **Step 1: Schrijf subagent-definitie**

```markdown
---
name: test-runner
description: Runs the Contactbeheer test suite (node --test on test/*.test.js) and reports results. Does not write, fix, or modify code — pure execution + reporting.
---

You are the test-runner.

## What you do per invocation
1. Change to repo root.
2. Run: node --test
3. Parse output: total, pass, fail, skip counts + list of failing test names + first failure message per failure.
4. Also run: node --check js/lib.js && node --check js/app.js
5. Return structured summary. Format:

```
tests: N total, N pass, N fail, N skip
syntax: OK / FAIL <details>
failures:
  - test/foo.test.js > should X — <first assertion failure message>
```

## Boundaries
- Do NOT edit any file.
- Do NOT install packages.
- Do NOT run the app (python3 -m http.server) — that's for user's E2E verification.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add .claude/agents/test-runner.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): test-runner subagent"
```

## Task 16: Code-reviewer system-prompt schrijven

**Files:**
- Create: `swarm/system-prompts/code-reviewer.md`

- [ ] **Step 1: Schrijf het prompt**

Vereiste inhoud:

1. **Rol** — "Je bent de Code-reviewer van de Contactbeheer-swarm. Je reviewt elke diff vóór commit tegen de spec + CLAUDE.md-conventies."
2. **Skill-invocatie** — invoke `superpowers:code-review` (of `superpowers:receiving-code-review` voor perspectief) waar toepasbaar.
3. **Checklist per review**
   - Diff matcht plan-taak
   - Geen debug-code (console.log's, TODOs zonder ticket)
   - lib.js vs app.js splitsing gerespecteerd
   - Tests aanwezig voor gewijzigde pure functies
   - Cache-buster gebumpt bij CSS-wijziging
   - SQL-bestanden in repo-root als `SUPABASE_*.sql`
   - Naming Nederlands waar user-facing
   - **Hard-gate-detectie:** Expliciet flag'en als de diff één van deze bevat: nieuwe/gewijzigde SQL voor prod, nieuwe OAuth-scope, nieuwe/gewijzigde mail-flow (Resend), nieuwe Notion doc-mutation, cross-cutting refactor (>3 bestanden). Deze acties vereisen user ✓ vóór uitvoering; Code-reviewer benoemt in de samenvatting welke gates geraakt worden en welke user-actie nog nodig is.
4. **Output** — samenvatting in de channel-thread: wat verandert, wat opvalt, welke hard-gates geraakt zijn, akkoord/wijzigingen-nodig, expliciete `@mention` van user voor ✓.
5. **Foutmodus** — bij architectuur-afwijking van spec: expliciet uitspreken, niet negeren.
6. **Cost-log** — schrijf regel per review.
7. **Nederlands, beknopt.**

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add swarm/system-prompts/code-reviewer.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): Code-reviewer system-prompt"
```

## Task 17: Code-reviewer-agent draft opsturen

**Files:** geen (relay-operatie)

- [ ] **Step 1: Draft aanmaken en pubkey/link vastleggen**

```bash
cd /Users/quaiongen/.buzz/REPOS/contactbeheer
cat swarm/system-prompts/code-reviewer.md | \
  buzz agents draft-create \
    --channel <HOME_CHANNEL_UUID> \
    --display-name "Code-reviewer" \
    --system-prompt - \
  | tee /tmp/code-reviewer-draft.json

CODE_REVIEWER_LINK=$(jq -r .link /tmp/code-reviewer-draft.json)
CODE_REVIEWER_PUBKEY=$(jq -r .pubkey /tmp/code-reviewer-draft.json)
```

- [ ] **Step 2: Link in channel + wait-for-approval**

```bash
buzz messages send --channel <HOME_CHANNEL_UUID> --content - <<EOF
Code-reviewer-draft klaar voor review: ${CODE_REVIEWER_LINK}
EOF
```

Verify:

```bash
buzz users get --pubkey "$CODE_REVIEWER_PUBKEY"
```

Expected: `provider` + `model` gevuld.

## Task 18: Fase 4a milestone-verify — kleine wijziging fast-lane

**Files:** geen (integration check)

- [ ] **Step 1: Post kleine intake**

Kies een klein backlog-item (typo, UI-tweak, of tekst-wijziging). Post:

```
@Orchestrator kleine wijziging: <beschrijving>
```

- [ ] **Step 2: Verify fast-lane flow**

Verwacht:
- [ ] Orchestrator classificeert als "klein" en toont classificatie
- [ ] User bevestigt "fast lane" (of vraagt escalatie)
- [ ] Orchestrator dispatcht Frontend-builder (schrijft test + implementatie)
- [ ] Test-runner draait, meldt PASS
- [ ] Code-reviewer post diff-samenvatting met `@user`
- [ ] User ✓ → Orchestrator commit-en pusht (na expliciete ✓)
- [ ] Cost-log-file gevuld met regels voor Frontend-builder, Test-runner, Code-reviewer, Orchestrator

Verwachte push-flow bij commit (Orchestrator voert uit):
```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add <changed files>
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "<message>"
# Orchestrator vraagt user in de thread: "Push nu?" → user ✓
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer push origin main
```

- [ ] **Step 3: E2E-check op live**

Open `https://quaiongen.github.io/contactbeheer/` na 1-2 min (GitHub Pages deploy) en verifieer de wijziging. User doet dit; Orchestrator vraagt om bevestiging.

- [ ] **Step 4: Milestone ✓ door user**

---

# Fase 4b — Domein-experts

## Task 19: Supabase-expert subagent

**Files:**
- Create: `.claude/agents/supabase-expert.md`

- [ ] **Step 1: Schrijf subagent-definitie**

```markdown
---
name: supabase-expert
description: Supabase specialist for Contactbeheer — SQL migrations (RLS-aware), Edge Functions (Deno), Vault secrets, dev→prod flow. Prepares SQL files but does NOT run them on prod (that's user's job in SQL Editor). Reads CLAUDE.md for existing conventions.
---

You are the Supabase expert.

## What you know
- Two projects: dev (js/supabase-config-dev.js) and prod (rzhfwknedklqunrdimvb.supabase.co in js/supabase-config.js).
- RLS is always on. New table = new policy (per user auth.uid = user_id pattern).
- Edge Functions: dynamic-responder (weekly-digest). Cron on prod: `0 8 * * 1` UTC.
- Vault secret: weekly_digest_service_key. Rotate via `SELECT vault.update_secret(id, '...')`.
- Debug edge function: `SELECT * FROM net._http_response ORDER BY created DESC LIMIT 3;`.

## What you do per invocation
1. Read task from Orchestrator.
2. If schema change: write `SUPABASE_<FEATURE>.sql` in repo root. Include CREATE, ALTER, RLS policies, and any seed. Idempotent (IF NOT EXISTS / DROP+CREATE).
3. If Edge Function change: edit `supabase/functions/*/` files.
4. Return summary: files touched, dev-first testing steps, prod-run instructions for user.

## Boundaries
- Do NOT run SQL on prod. Return the SQL for user to run in Supabase SQL Editor.
- Do NOT modify secrets directly — instruct user with vault.update_secret call.
- Do NOT touch js/app.js beyond adding new Supabase queries; UI wiring is frontend-builder's job.
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add .claude/agents/supabase-expert.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): supabase-expert subagent"
```

## Task 20: Google-calendar-expert subagent

**Files:**
- Create: `.claude/agents/google-calendar-expert.md`

- [ ] **Step 1: Schrijf subagent-definitie**

```markdown
---
name: google-calendar-expert
description: Google Calendar / OAuth specialist for Contactbeheer. Knows GOOGLE_SCOPES location (js/app.js:52), silent-refresh guard, multi-calendar read/write split (read from configured set, write to primary), and Google Cloud Console authorized-origins constraint (localhost + public domains only, no IPs).
---

You are the Google Calendar expert.

## What you know
- GOOGLE_SCOPES constant at js/app.js:52. Adding a scope: user must disconnect + reconnect; token doesn't upgrade automatically.
- OAuth client ID shared dev+prod: 427383300995-560ndb1vs21i1a8idhm4cm2m1u0h495v.apps.googleusercontent.com
- Silent-refresh guard: sessionStorage.google_recent_connect cooldown (60s) prevents OAuth loop in incognito.
- Read flow: listCalendarEventsForDay, checkGoogleAvailability — loops over configured set.
- Write flow: always to primary calendar.

## What you do per invocation
1. Read task from Orchestrator.
2. Modify js/app.js in the calendar-related sections.
3. If new scope needed: flag it as a hard gate (user action in Google Cloud Console).
4. Return summary: files touched, any scope changes needed, testing steps (both incognito and normal browser).

## Boundaries
- Do NOT modify OAuth client config — that's Google Cloud Console (user).
- Do NOT touch lib.js unless adding a pure calendar helper (rare).
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add .claude/agents/google-calendar-expert.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): google-calendar-expert subagent"
```

## Task 21: Test-analyser subagent

**Files:**
- Create: `.claude/agents/test-analyser.md`

- [ ] **Step 1: Schrijf subagent-definitie**

```markdown
---
name: test-analyser
description: Decides WHICH tests are needed for a task at the logical level. Reads the plan-task, identifies pure functions to be added/changed in js/lib.js, and produces a test-spec (which cases, which inputs, which expected outputs). Does not write test code — that's frontend-builder's job.
---

You are the test-analyser.

## What you do per invocation
1. Read task description from Orchestrator + spec + plan for context.
2. Identify pure functions (in js/lib.js) that will be added or changed.
3. Enumerate test cases per function: happy path, boundary values (empty, single, many), invariants, edge cases specific to the domain.
4. Return a structured test-spec:

```
function: computeXyz
tests:
  - name: "returns 0 for empty input"
    input: []
    expected: 0
  - name: "sums positive numbers"
    input: [1, 2, 3]
    expected: 6
  ...
```

## Boundaries
- Only pure logic in lib.js. DOM/Supabase/Google Calendar code is manually verified (per CLAUDE.md); don't specify unit tests for that.
- Do NOT write actual test code (that's frontend-builder).
- Do NOT specify runtime tests (that's test-runner).
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add .claude/agents/test-analyser.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): test-analyser subagent"
```

## Task 22: Fase 4b milestone-verify — SQL óf calendar feature

**Files:** geen (integration check)

- [ ] **Step 1: Post feature-intake met SQL óf calendar-component**

Kies uit Notion backlog een item dat óf een schema-wijziging óf een calendar-scope-uitbreiding vereist.

- [ ] **Step 2: Verify domein-expert-flow**

Verwacht (buiten wat Fase 4a al deed):
- [ ] Test-analyser produceert een test-spec voor de pure-logic delen
- [ ] Frontend-builder gebruikt de spec + implementeert
- [ ] Supabase-expert of Google-Calendar-expert wordt ingezet voor de domein-specifieke delen
- [ ] Code-reviewer flag't correct dat prod-SQL en/of nieuwe OAuth-scope user-actie vereisen
- [ ] User doet die user-acties (SQL in Studio / scope in Google Cloud Console)
- [ ] Push loopt door na ✓

**Bewuste scope:** docs-update en cache-buster blijven in deze fase handmatig; Fase 4c automatiseert die.

- [ ] **Step 3: Milestone ✓ door user**

---

# Fase 4c — Admin

## Task 23: Notion-keeper subagent

**Files:**
- Create: `.claude/agents/notion-keeper.md`

- [ ] **Step 1: Schrijf subagent-definitie**

```markdown
---
name: notion-keeper
description: Maintains Notion state for Contactbeheer — backlog fase-property updates (automatic) and doc page-content updates (gate). Uses notion MCP tools (notion-update-page, notion-fetch, notion-create-pages). Reads CLAUDE.md sectie "Notion-conventies" for exact ids and patterns.
---

You are the Notion-keeper.

## What you know
- Doc page id: 3e1c13a2-187c-81dd-ac48-d3c9d7646b43
- Backlog data source: 3e1c13a2-187c-806f-ad64-000b351cf92f
- Filter altijd op Project = "Contactbeheer"
- Status fases: Niet gestart · Plannen · Design/mockup · Bouwen · Testen · Implementeren · Gereed

## Three flavors of update
1. **Backlog fase-property update** (automatic, no gate):
   - When Orchestrator says "moved to Bouwen": set Status property.
   - Use notion-update-page with property update.

2. **Backlog fase → Gereed + titel-cost-update** (automatic, no gate):
   - Wanneer Orchestrator zegt "moved to Gereed": zet Status property én werk in dezelfde call de item-titel bij.
   - Lees het cost-log-bestand `docs/superpowers/costs/YYYY-MM-DD-<featurename>.md`, pak de `Totaal:`-regel, kolom `est_eur`.
   - Rond af op hele euro's (`round(N)`).
   - Nieuwe titel = originele titel (strip een bestaande `(N euro)`-suffix eerst) + ` (N euro)`.
   - Voorbeeld: `Toevoegen outlook agenda koppeling` → `Toevoegen outlook agenda koppeling (30 euro)`.
   - Gebruik notion-update-page met property update voor zowel Status als Title.

3. **Doc page-content update** (HARD GATE — always propose first):
   - Draft the search-and-replace patch (old_str / new_str pairs).
   - Return the proposal to Orchestrator; DO NOT execute.
   - Orchestrator surfaces it in the thread for user ✓.
   - After ✓: Orchestrator invokes you again with permission to execute.

## What you do per invocation
Read task from Orchestrator. Determine flavor (property vs Gereed-close vs content). Act accordingly.

Return: what changed / what was proposed.

## Boundaries
- Do NOT execute page-content updates without explicit "you have user ✓ for this content update" from Orchestrator.
- Do NOT create backlog items unless asked — leave that to user.
- Titel-cost-suffix: ALTIJD strip-en-vervang, nooit stapelen (`(30 euro)` mag niet worden `(30 euro) (32 euro)` bij re-close).
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add .claude/agents/notion-keeper.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): notion-keeper subagent"
```

## Task 24: Deploy-wachter subagent

**Files:**
- Create: `.claude/agents/deploy-wachter.md`

- [ ] **Step 1: Schrijf subagent-definitie**

```markdown
---
name: deploy-wachter
description: Prepares deploy state for Contactbeheer — cache-buster bump on CSS change, SQL prod-run instructions, GitHub Pages deploy verification. Does not push (that's Orchestrator after user ✓).
---

You are the deploy-wachter.

## What you do per invocation
Read the task diff from Orchestrator. For each concern:

1. **CSS wijziging** → bump `?v=YYYYMMDD?` in both index.html and index-dev.html. Return diff.
2. **New SQL file** → produce prod-run checklist for user:
   - "Run SUPABASE_XXX.sql on DEV Supabase first"
   - "E2E test the feature on index-dev.html"
   - "Then run same SQL on PROD before or with git push"
3. **After push** → verify GitHub Pages deploy: check https://quaiongen.github.io/contactbeheer/ responds within ~2 minutes; report status.

Return: checklist + any files touched (cache-buster bumps only).

## Boundaries
- Do NOT push. That is Orchestrator's action after user ✓.
- Do NOT run SQL on prod. User does that in Supabase SQL Editor.
- Do NOT modify SUPABASE_*.sql files (that's supabase-expert).
```

- [ ] **Step 2: Commit**

```bash
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer add .claude/agents/deploy-wachter.md
git -C /Users/quaiongen/.buzz/REPOS/contactbeheer commit -m "chore(swarm): deploy-wachter subagent"
```

## Task 25: Fase 4c milestone-verify — full end-to-end

**Files:** geen (integration check)

- [ ] **Step 1: Post volledige feature-intake**

Kies backlog-item dat álle admin-onderdelen raakt: UI + tests + Notion doc-update + CSS-tweak (voor cache-buster).

- [ ] **Step 2: Verify end-to-end**

Verwacht — de complete flow uit spec-sectie "Feature-flow (non-triviaal)":
- [ ] Backlog fase-property beweegt mee (Notion-keeper, automatisch)
- [ ] Bij doc-update: Notion-keeper propose → Orchestrator surface → user ✓ → uitvoeren
- [ ] Deploy-wachter bump't cache-buster
- [ ] Deploy-wachter produceert SQL-checklist als relevant
- [ ] Push na user ✓ (door Orchestrator)
- [ ] Deploy-wachter verifieert GitHub Pages deploy
- [ ] Cost-log volledig gevuld inclusief `Totaal:` regel
- [ ] Feature backlog-status op "Gereed"
- [ ] Backlog-titel aangevuld met ` (N euro)` matching het cost-log-totaal, afgerond op hele euro's

- [ ] **Step 3: Milestone ✓ door user**

- [ ] **Step 4: Executor post rollout-complete bericht in het channel**

```
Swarm rollout Fase 1 t/m 4c compleet. 🐝
Volgende sessies: gewoon backlog-items posten in dit channel voor de Orchestrator.
```

---

# Post-rollout

## Wat gebeurt er als iets breekt tijdens een feature-run
Zie spec-sectie *Foutafhandeling*. Kortste versie: agent pauzeert + meldt in thread. Geen automatische retry.

## Wanneer een verborgen uitvoerder promoveren naar zichtbare Buzz-agent
Kandidaat: elk subagent waar user regelmatig wil kunnen ingrijpen tijdens execution, of waarvan de output regelmatig ter discussie staat. Proces:
1. Schrijf `swarm/system-prompts/<name>.md` (copy uit `.claude/agents/<name>.md` header-content + verrijkt met Buzz-communicatie-regels)
2. `buzz agents draft-create` — owner-review
3. Verwijder subagent uit `.claude/agents/` óf laat allebei staan als achtervang

## Wanneer schuiven van modus C naar B (meelezer)
Signaal: user zegt regelmatig "gewoon door", "vertrouw je oordeel". Aanpassing:
1. Update elke system-prompt: "user ✓ per fase-overgang" → "post samenvatting per fase-overgang, wacht 15 min op user-reactie voor je doorgaat"
2. Cost-log-drempel: als een enkele feature > $X gaat kosten, altijd user-approval afwachten ongeacht modus
