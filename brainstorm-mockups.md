# Brainstorm mockups

Overzicht van alle mockup-sessies uit de brainstorm-fase per feature. Handig voor naslag: "hoe zag die eerste opzet er ook alweer uit?" of "welke variant hadden we vergeleken?".

Mockups zelf staan lokaal in `.superpowers/brainstorm/` (in `.gitignore`, wordt dus niet mee gepusht).

## Hoe openen

Snelste manier — direct in je default browser:

```bash
open ".superpowers/brainstorm/<sessie-map>/<file>.html"
```

De keuze-knoppen in de mockups zijn statisch (brainstorm-server draait niet mee), maar visueel gewoon te bekijken. Voor een live server-flow zie onderaan dit document.

---

## Sessie 2026-09-23 — Contacten importeren uit telefoon

**Map:** `.superpowers/brainstorm/99648-1790172307/`

Ontwerpsessie voor de wizard die opent na eerste login (of via menu) om vCard-contacten uit een telefoon-export te importeren. 4 stappen: platform kiezen → export-instructies per platform → inlezen → selecteren wat je wil importeren.

| File | Wat het toont |
|------|---------------|
| `00-index.html` | Index met kaarten naar alle schermen |
| `01-platform.html` | Stap 1 — iPhone / Android / eigen `.vcf`, met auto-detect-badge |
| `02-export.html` | Stap 2 iPhone v1 (verkeerde stappen — vervangen door v2) |
| `02-export-v2.html` | Stap 2 iPhone v2 — instructies bevestigd door owner (gekozen richting) |
| `02-export-android.html` | Stap 2 Android/Google via contacts.google.com — concept, nog te verifiëren |
| `02-export-vcf.html` | Stap 2 skip-flow bij "ik heb al een `.vcf`" |
| `03-loading.html` | Stap 3 — spinner met "247 gevonden"-teller |
| `04-selectie.html` | Stap 4 — lijst met slimme defaults, zoek, "al aanwezig"-badge, uit-gevinkte contacten zonder tel/mail |
| `wizard-shape.html` | Vergelijking A (meerstaps-modal) vs B (accordion). Keuze: A |

```bash
open ".superpowers/brainstorm/99648-1790172307/00-index.html"
open ".superpowers/brainstorm/99648-1790172307/01-platform.html"
open ".superpowers/brainstorm/99648-1790172307/02-export-v2.html"
open ".superpowers/brainstorm/99648-1790172307/02-export-android.html"
open ".superpowers/brainstorm/99648-1790172307/02-export-vcf.html"
open ".superpowers/brainstorm/99648-1790172307/03-loading.html"
open ".superpowers/brainstorm/99648-1790172307/04-selectie.html"
```

**Spec:** `docs/superpowers/specs/2026-09-23-contacten-importeren-design.md`

---

## Sessie 2026-09-19 — Slot-zoeker wizard

**Map:** `.superpowers/brainstorm/45817-1789811966/`

Ontwerpsessie voor de wizard die opent bij "Nu afspraak maken". Preset-keuze (Lunch/Diner/Anders), zoeken via Google Calendar naar 5 vrije dagen, mini-dag-agenda per voorstel.

| File | Wat het toont |
|------|---------------|
| `wizard.html` | Eerste opzet van het preset-scherm en results-view |
| `wizard-v2.html` | Verfijnde versie met agenda-mini-view (gekozen richting) |
| `waiting.html` | Loading-scherm tussen preset-pick en results |

```bash
open ".superpowers/brainstorm/45817-1789811966/wizard-v2.html"
open ".superpowers/brainstorm/45817-1789811966/wizard.html"
open ".superpowers/brainstorm/45817-1789811966/waiting.html"
```

**Spec + plan:** `docs/superpowers/specs/2026-09-19-slot-zoeker-design.md` + `docs/superpowers/plans/2026-09-19-slot-zoeker.md`

---

## Sessie 2026-09-15/16 — GUI-refactor + Vandaag/Overzicht

**Map:** `.superpowers/brainstorm/6172-1789480434/`

Ontwerpsessie voor de Vandaag/Overzicht/Contacten-redesign met bucket-logica. Meerdere varianten vergeleken (labels vs kleurcontrast), details-modal opnieuw ontworpen, gepagineerde historie.

| File | Wat het toont |
|------|---------------|
| `current-state.html` | Uitgangspunt: hoe het toen was |
| `overzicht-varianten.html` | Overzicht-tab varianten naast elkaar |
| `overzicht-a-labels.html` | Variant A — met tekst-labels per bucket |
| `overzicht-a-contrast.html` | Variant A — met kleurcontrast per bucket |
| `all-tabs-unified.html` | Alle 3 tabs met gedeelde avatar-list stijl |
| `details-modal.html` | Eerste opzet contact-details modal |
| `details-modal-v2.html` | Verfijnde versie (gekozen richting) |
| `history-paged.html` | Paginatie van interactie-historie in de details-modal |
| `waiting.html` | Loading-scherm tussen brainstorm-vragen |

```bash
open ".superpowers/brainstorm/6172-1789480434/all-tabs-unified.html"
open ".superpowers/brainstorm/6172-1789480434/details-modal-v2.html"
open ".superpowers/brainstorm/6172-1789480434/overzicht-varianten.html"
open ".superpowers/brainstorm/6172-1789480434/history-paged.html"
open ".superpowers/brainstorm/6172-1789480434/current-state.html"
```

**Spec:** `docs/implementatie-brief.md`

---

## Live server-flow (optioneel)

Als je een sessie interactief wil doorlopen (bijv. de keuze-knoppen weer laten werken):

```bash
~/.claude/skills/brainstorming/scripts/stop-server.sh

# Kies één sessie om te openen, bijvoorbeeld de slot-zoeker:
cp -r ".superpowers/brainstorm/45817-1789811966/"*.html \
      ".superpowers/brainstorm/$(ls -t .superpowers/brainstorm/ | head -1)/"

~/.claude/skills/brainstorming/scripts/start-server.sh \
    --project-dir "/Users/quaiongen/Documents/ClaudeCode/visuele contacten"
```

De server toont dan de nieuwste .html-file uit z'n eigen sessie-dir en watched wijzigingen live.

---

*Voor toekomstige brainstorm-sessies: voeg een nieuwe kop bovenaan toe met datum, onderwerp, sessie-map, tabel met files, en snelle `open`-commando's. Verwijs naar de bijbehorende spec/plan-doc onder `docs/superpowers/`.*
