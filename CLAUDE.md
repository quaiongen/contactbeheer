# CLAUDE.md — Contactbeheer

**Voor Claude Code sessies: lees dit eerst.**

Deze file is de single source of truth voor "hoe werken we in dit project".
Live app: [quaiongen.github.io/contactbeheer](https://quaiongen.github.io/contactbeheer/)

---

## Project

Persoonlijke contact-management web-app. Bijhouden wanneer je iemand voor het laatst sprak; dagelijks max 3 kaarten met "wie heeft aandacht nodig". Vanilla JS + Bootstrap 5.3 + Supabase (Postgres + RLS) + Google Calendar API v3 + Resend (weekmail via Supabase Edge Function) + GitHub Pages.

**Documentatie (rijk, met tabellen/callouts):** [Notion — Contactbeheer Documentatie](https://app.notion.com/p/3e1c13a2187c81ddac48d3c9d7646b43) (page ID `3e1c13a2-187c-81dd-ac48-d3c9d7646b43`)

**Backlog:** [Notion — Backlog Catch-up](https://app.notion.com/p/3e1c13a2187c80d987e7f90afc8355e3) (data source `3e1c13a2-187c-806f-ad64-000b351cf92f`). Filter altijd op `Project = "Contactbeheer"`. Status-fases: Niet gestart · Plannen · Design/mockup · Bouwen · Testen · Implementeren · Gereed.

**Repo:** [github.com/quaiongen/contactbeheer](https://github.com/quaiongen/contactbeheer)

---

## Werkwijze

Nederlands als default (code-comments, commits, user-facing text). Beknopt in antwoorden. Als de user zegt "doe zelfstandig door" of soortgelijk: minimale bevestiging, alleen pauzeren voor destructieve/irreversibele acties.

**Feature-flow (voor niet-triviale features):**
1. **Brainstorm** — `brainstorming` skill. Vragen 1-voor-1, multiple-choice waar kan. Vraag naar visual companion als upcoming vragen visueel zijn (mockups). Eindresultaat: goedgekeurd design in `docs/superpowers/specs/YYYY-MM-DD-<naam>-design.md`.
2. **Plan** — `writing-plans` skill. Bite-sized taken (test → fail → implement → pass → commit). Eindresultaat: `docs/superpowers/plans/YYYY-MM-DD-<naam>.md`. Reviewer-loop (max 3 iteraties).
3. **Bouwen** — twee opties, laat user kiezen:
   - **A) subagent-driven-development** — implementer + spec-reviewer + code-quality-reviewer per taak. Hoge kwaliteit, veel tokens/tijd. Voor grote features.
   - **B) In-session direct** — Claude implementeert zelf per taak, commits, test. Sneller, minder vangnet. Prima voor middelgrote features waar spec+plan grondig zijn.

**Voor kleine wijzigingen** (single-file fix, UI-tweak, bug-hunt): direct implementeren zonder brainstorm-cyclus.

**Notion-status meebewegen:** zet backlog-item op de juiste fase tijdens de rit (Plannen → Design/mockup → Bouwen → Testen → Implementeren → Gereed) via `notion-update-page`.

---

## Documentatie-regels

**Na elke user-facing wijziging: Notion-doc bijwerken** vóór taak als klaar rapporteren. Gebruik `notion-update-page` met `content_updates` search-and-replace. Update de "Laatst bijgewerkt"-datum onderaan. Voor backend-only wijzigingen: alleen updaten als het gedrag voor de gebruiker zichtbaar is.

**README.md** in de repo is puur wegwijzer naar Notion + minimale developer-context. Niet daar de details bijwerken.

**Nieuwe brainstorm-sessie?** Voeg kopje bovenaan `brainstorm-mockups.md` toe met datum, sessie-map, file-tabel, `open`-commando's. Mockups zelf staan in `.superpowers/brainstorm/` (in `.gitignore`).

---

## Structuur

```
├── index.html + index-dev.html   # Prod & dev entrypoint (dev = ander Supabase project)
├── js/
│   ├── lib.js                    # Pure logic (test-baar via node --test)
│   ├── app.js                    # DOM + Supabase + Google Calendar code
│   ├── supabase-config.js        # Prod-config (URL + publishable key)
│   └── supabase-config-dev.js    # Dev-config
├── css/styles.css                # Alle styling
├── test/*.test.js                # node --test (geen dependencies)
├── docs/
│   ├── superpowers/specs/        # Design-docs per feature (van brainstorming)
│   ├── superpowers/plans/        # Implementatie-plannen per feature
│   ├── runbook-productie.md      # Uitrol dev → prod
│   └── backlog.md                # Wegwijzer naar Notion-backlog
├── brainstorm-mockups.md         # Index van mockup-sessies
├── supabase/functions/weekly-digest/  # Deno Edge Function + view + cron
└── SUPABASE_*.sql                # Setup-scripts per feature
```

**Pure logica → `js/lib.js`** met tests in `test/`. **DOM/Supabase/Google-code → `js/app.js`**. Alle exports uit lib.js zijn browser-globals én module-exports (dual export IIFE).

---

## Deploy-flow

- **Dev testen**: `python3 -m http.server 8765` → `http://localhost:8765/index-dev.html`
- **Prod deploy**: `git push origin main` → GitHub Pages redeployt binnen 1–2 min → live op `https://quaiongen.github.io/contactbeheer`
- **Direct op main committen** is OK (personal project). Feature-branches optioneel.

**Vóór push naar main bij nieuwe SQL-tabel**:
1. Draai SQL op **dev-Supabase** eerst → E2E testen
2. Draai SQL op **prod-Supabase** vóór of gelijk met push, anders crasht de live app zodra iemand de feature gebruikt
3. SQL-bestanden altijd in repo-root als `SUPABASE_*.sql`

**Cache-buster:** bij CSS-wijziging bump `?v=YYYYMMDD?` in **beide** `index.html` en `index-dev.html`. Anders zien users oude styling.

---

## Tests

```bash
npm test          # of: node --test
node --check js/lib.js && node --check js/app.js
```

`node --test` draait alle `test/*.test.js`. Alleen pure functies uit `js/lib.js` zijn getest — DOM/Supabase-flows worden manueel geverifieerd (E2E in dev, dan prod). GitHub Actions draait dezelfde suite bij elke push. Pre-commit hook activeren: `git config core.hooksPath .githooks`.

---

## Google Calendar-integratie — gotchas

- **Scopes** staan in `GOOGLE_SCOPES` (`js/app.js:52`). Bij toevoegen van een nieuwe scope: user moet ontkoppelen én opnieuw verbinden — bestaande token krijgt geen scope-upgrade.
- **OAuth-client** is gedeeld tussen dev en prod. Als je op nieuwe origin test (bijv. mobile IP), moet die in Google Cloud Console → Credentials → Authorized JavaScript origins. Google accepteert alleen `localhost` of publieke domeinen — geen IP-adressen.
- **Silent-refresh guard**: `sessionStorage.google_recent_connect` cooldown van 60 sec voorkomt OAuth-loop (bijv. in Chrome incognito waar redirect-based OAuth de app-tab herlaadt).
- **Multi-calendar**: user configureert per-kalender modus via menu "Google Calendar" → modal. Read-flow (`listCalendarEventsForDay`, `checkGoogleAvailability`) loopt over configured set. Write-flow (create/update/delete event) altijd naar `primary`.

---

## Weekmail (Supabase Edge Function + cron)

- Function heet `dynamic-responder` (auto-naam bij deploy). **Te verifiëren** — de broncode staat in `supabase/functions/weekly-digest/` en de vault-secret wijst naar `/functions/v1/weekly-digest`. Check in het dashboard welke naam live staat vóór een deploy.
- Op prod via cron **elke dag** `0 8 * * *` UTC (was maandag). Sinds de abonneren-flow kiest elke user zijn dag in `user_settings.digest_dag`; de function filtert daarop. Omzetten met `SUPABASE_DIGEST_CRON_DAILY.sql`.
- Abonnement is opt-in: geen rij in `user_settings` = geen mail. Tabel aanmaken met `SUPABASE_USER_SETTINGS.sql` vóór de function-deploy, anders faalt de function met HTTP 500.
- Geen idempotentie: wie mid-week zijn `digest_dag` verzet krijgt die week twee mails. Bekende beperking.
- Cron triggert `pg_net.http_post` met Bearer = secret-key uit Vault (`weekly_digest_service_key`).
- **Bij Supabase-key rotation moet de Vault-secret handmatig bij** — anders faalt de cron met 401. Update via `SELECT vault.update_secret(id, 'sb_secret_...')`.
- Debug: `SELECT * FROM net._http_response ORDER BY created DESC LIMIT 3;` toont laatste responses.
- Vault-URL kan `?dryRun=true&userId=<uuid>&forceTo=<email>` bevatten voor test-modus.

---

## Notion-conventies

**Backlog nieuw item aanmaken:**
```
notion-create-pages met parent.data_source_id = 3e1c13a2-187c-806f-ad64-000b351cf92f
properties: {Naam, Project: "Contactbeheer", Categorie, Prioriteit, Status: "Niet gestart"}
content: markdown met uitleg (waarom, hoe, code-snippets)
```

**Doc bijwerken bij feature:**
```
notion-update-page page_id = 3e1c13a2-187c-81dd-ac48-d3c9d7646b43
command: "update_content", content_updates: [{old_str, new_str}]
```
Bij mismatch (bijv. table cells): fetch eerst met `notion-fetch` om exacte huidige tekst te zien. Doe elk edit als aparte call zodat een mismatch niet de hele batch faalt.

---

## Externe systemen

- **Supabase dev**: `rzhfwknedklqunrdimvb.supabase.co` (in `js/supabase-config-dev.js`, gebruikt door `index-dev.html`)
- **Supabase prod**: `ddifqouirbnmozaxkxwy.supabase.co` (in `js/supabase-config.js`, gebruikt door `index.html` op GitHub Pages)
- **Google Cloud Console**: OAuth client `427383300995-560ndb1vs21i1a8idhm4cm2m1u0h495v.apps.googleusercontent.com` (gedeeld dev+prod)
- **Resend**: nu `onboarding@resend.dev` (dev-modus, alleen naar geverifieerd account); eigen domein staat op backlog

---

## Overdragen naar nieuwe Claude-installatie

1. Deze `CLAUDE.md` staat in repo → gaat automatisch mee
2. `.claude/settings.local.json` bevat permission-allowlist (nu in `.gitignore`; overwegen te committen als `settings.json` voor team-brede regels)
3. Notion MCP opnieuw connecten met dezelfde workspace-toegang
4. Auto-memory files (feedback-rules) staan in `~/.claude/projects/-Users-quaiongen-.../memory/` — belangrijkste zijn al in deze CLAUDE.md verwerkt

**Bij lange conversaties**: nieuwe sessie starten per feature/task. Memory + CLAUDE.md + Notion vangen "wat weet ik van dit project" op zonder dat alles in één sessie hoeft.

---

*Voor `updates aan deze CLAUDE.md`: houd 'm compact. Details horen in Notion doc.*
