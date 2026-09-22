# Contactbeheer Swarm

Multi-agent framework dat de ontwikkeling van deze app ondersteunt.

**Design-spec:** `docs/superpowers/specs/2026-09-21-contactbeheer-swarm-design.md`
**Implementation plan:** `docs/superpowers/plans/2026-09-22-contactbeheer-swarm.md`

## Structuur

- `system-prompts/` — canonieke system-prompts voor zichtbare Buzz-agents (Orchestrator, Brainstormer, Planner, Code-reviewer). Deployment loopt via Buzz Desktop na `buzz agents draft-create`.
- Subagent-definities voor verborgen uitvoerders staan in `.claude/agents/`.

## Home-channel

`#contactbeheer-dev` in Buzz (`channel_id = 41b48b67-06cf-4f16-89ee-cc04d63c2c0e`). Alle intake, discussie, ✓-momenten en oplevering lopen daar.

## Cost tracking

Zie `docs/superpowers/costs/README.md` voor het per-feature logboek-formaat.
