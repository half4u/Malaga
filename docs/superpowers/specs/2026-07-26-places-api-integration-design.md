# Places API integration — implementation design

Date: 2026-07-26
Status: approved, ready for implementation plan

## Goal

Give each restaurant card a real photo, a real review snippet, and a reliable
`place_id` deep link, and give sight entries live ratings + reliable deep links,
by pulling data once from the Google Places API (New) — without the API key ever
reaching the shipped `index.html` or git.

Builds on the handoff spec in `places-api-integration.md`. This document records
the decisions made during brainstorming that go beyond that spec.

## Decisions (from brainstorming)

1. **Run timing:** run `fetch-places.mjs` together against the live key now,
   after the user confirms Cloud Console guardrails ($1 budget alert + key
   restricted to Places API (New)).
2. **Photo fallback:** `foodCard` prefers the real Places photo, falls back to
   the existing `commonsImg(FOODIMG[catFor(f)])` category placeholder. No
   visual marker distinguishing real vs placeholder.
3. **Scope:** restaurants **and** sights in this first implementation.

## Architecture

Two artifacts, one data file:

- **`fetch-places.mjs`** — local Node 18+ script. Reads key from
  `process.argv[2]` (passed as `"$(cat gcloud.secret)"`). Holds **two** input
  lists — `PLACES` (53 restaurants, coords from the handoff spec) and `SIGHTS`
  (~51 searchable sights, see below) — and writes both into one
  `places-data.json`, keyed by `keyOf` name. Zero secrets in the output.
- **`index.html` merge** — paste JSON as `PLACES_DATA`; route all reads through
  a single `dataFor(n)` lookup that serves restaurants and sights alike.

The key never appears in `index.html`, `places-data.json`, or git. `gcloud.secret`
is already git-ignored and was never committed.

## Sights handling

Sights have **no lat/lng** in the data (only text-query URLs), and several are
generic. Two rules:

- **Bias per zone town, not per sight.** Hardcode one center coordinate per zone
  and bias every sight's Text Search on its parent zone's town. Tight enough to
  disambiguate (e.g. Alcazaba Málaga vs Almería).
- **Exclude generic / non-single-place entries.** They aren't one searchable
  venue — same rationale the handoff spec uses to drop "any chiringuito".
  Excluded: "Altstadt von Mijas, früh oder spät"; "Strände: La Cala de Mijas
  oder Carvajal"; "Pedregalejo und El Palo"; "Die andere Seite der Schlucht";
  "Weinregion Ronda"; "Der Steg selbst"; "Ventas rund um Álora und Ardales";
  "Nasridenpaläste, Nachtbesuch" (dupes Generalife/Alcazaba); "Valle del Genal";
  "Das Dorf Benahavís"; "Den Abend fürs Dorf aufheben"; and any similar
  region/timing note surfaced during extraction.

Zone → town centers (approximate, for search bias only):

| zone | town | zone | town |
|------|------|------|------|
| home | Mijas | agua | Istán/Benahavís |
| malaga | Málaga | axarquia | Nerja/Frigiliana |
| ronda | Ronda | antequera | Antequera |
| caminito | El Chorro | tarifa | Tarifa/Bolonia |
| granada | Granada | genal | Genalguacil |
| marbella | Marbella | | |

Sights that resolve poorly simply get no `PLACES_DATA` entry and degrade to
today's behavior — no harm.

## index.html merge points (5 edits, all additive)

1. **`PLACES_DATA` + `dataFor(n)`** after `INFO` (~line 1200). `dataFor` prefers
   live data → `INFO` snapshot → empty. Photo falls back to `null` (not the
   nonexistent `REALFOOD`); the card placeholder handles no-photo.
2. **`chips()`** (`:1284`) — read `dataFor(n)` not `INFO[key]`.
3. **`mapBtn()`** (`:1292`) — read `dataFor(n)`; stash `data-pid` +
   `data-mapsuri` on the button.
4. **`foodCard()`** (`:1331`) —
   `const thumb = dataFor(f.n).photo || commonsImg(FOODIMG[catFor(f)], 220);`
   Sight cards (`zoneCard`) get live chips + better links via `chips`/`mapBtn`
   automatically; they have no photo slot, so no photo change there.
5. **`openSheet()`** (`:1535`) — read `dataFor(n)`; render photo above the
   iframe if present, one review snippet if present, prefer `mapsUri` /
   `place_id` link for the primary action. Degrade exactly to current behavior
   when data absent.

## Cost

One full run ≈ 53 + 51 ≈ **~208 calls** (Text Search + one Photo each). Photo
free quota (1,000/mo) is the ceiling — ~4.8 full runs before any charge. A run,
even a few re-runs, costs $0. Guardrails ($1 budget alert, key restriction) are
the safety net and are the user's to set in Cloud Console.

## Verification

- **Script:** `node --check fetch-places.mjs`; live run → expect ~208 resolved,
  few missed, valid JSON on stdout; grep the JSON for the key to prove absence.
- **Site:** open `index.html` locally — a data-backed restaurant shows real
  photo + live chips + place_id link; a no-data/generic entry looks exactly as
  before; DE/EN toggle still works in the popup; grep `index.html` for the key
  to prove absence.

## Acceptance

Per the checklist in `places-api-integration.md` §8, extended to sights:
sights with a `PLACES_DATA` entry show live chips and open to a place_id-based
link; sights without one are unchanged.
