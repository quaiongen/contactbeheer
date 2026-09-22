# Abonneren-flow (opt-in per user) — design

**Backlog:** "Abonneren-flow (opt-in per user)" — Categorie Weekmail, Prioriteit Middel.
**Feature-thread:** `#contactbeheer-dev`, root `f17c6b0f`.
**Status:** besluiten vastgelegd 2026-09-22, goedgekeurd door de owner in de thread.

## Probleem

De wekelijkse herinneringsmail gaat naar iedereen. `weekly-digest/index.ts` leest
alle rijen uit `weekly_digest_v`, groepeert op `user_id` en mailt elke gebruiker
met contacten in `nu_afspraak_maken`. Er is geen abonnement en geen manier om
je uit te schrijven.

## Besluiten

Dit is achteraf vastgelegd. De formele brainstorm-cyclus is bewust overgeslagen
omdat de vier open keuzes direct als multiple-choice aan de owner zijn
voorgelegd; de antwoorden staan in de thread.

**1. Nieuwe tabel `user_settings`** (niet: kolommen op een bestaande tabel).
Er was geen per-user tabel om aan te hangen. Volgt het patroon van
`user_calendar_preferences`: `user_id` als key, RLS op `auth.uid() = user_id`.
Laat ruimte voor latere voorkeuren.

**2. Cron van wekelijks naar dagelijks.** `digest_dag` per gebruiker kan niet
met een maandag-only cron; dan was die kolom dode configuratie. De cron vuurt
dagelijks, de function bepaalt per gebruiker of vandaag zijn dag is.

**3. Uitschrijflink verwijst naar de app** (`#instellingen`), geen tokenised
one-click endpoint. De mail gaat alleen naar het eigen account-adres, dus er is
geen derde partij die zich moet kunnen uitschrijven. Krijgt de app echte externe
gebruikers, dan is een token-endpoint het juiste antwoord — dat staat dan als
apart backlog-item.

**4. `digest_enabled` default false, bestaande accounts eenmalig op true.**
Puur `default false` zou de mail van bestaande gebruikers stil laten stoppen.
De backfill is begrensd op `created_at < 2026-09-22` zodat een tweede run
nieuwe accounts niet alsnog abonneert, en sluit soft-deleted en
niet-geverifieerde accounts uit.

## Bekende beperkingen

- **Geen idempotentie.** Wie mid-week zijn `digest_dag` verzet van maandag naar
  woensdag, krijgt die week twee mails. Elke handmatige invocatie op de gekozen
  dag stuurt er nog een. Met de oude wekelijkse cron was dat structureel
  onmogelijk; met een dagelijkse cron is het een reëel scenario. Idempotentie
  stond al als "komt later" in `index.ts`.
- **Geen paginatie.** `weekly_digest_v` en `user_settings` worden zonder
  `.limit()` gelezen. Boven de PostgREST-max-rows (Supabase default 1000)
  verdwijnen rijen stil uit de batch.
- **`moetDigestVandaag` bestaat twee keer** — in `js/lib.js` (getest) en in
  `index.ts` (ongetest, en dat is de kopie die bepaalt of er mail uitgaat).
  Bewuste duplicatie, zelfde afspraak als de bucket-logica in `01_view.sql`.
  Een Deno-test die dezelfde tabel spiegelt zou drift voorkomen.
- **Hash-routing bestaat alleen voor `#instellingen`.** De links `#vandaag` en
  `#contact=<id>` die de mail al jaren verstuurt hebben geen handler en openen
  de app op het standaardscherm.
