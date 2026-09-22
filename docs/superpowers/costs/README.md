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

- Kolom `est_eur` in euro's. Providerprijzen zijn meestal USD; reken om via vaste koers (default **USD→EUR = 0.92**, hier bij te stellen als de koers structureel afwijkt).
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
