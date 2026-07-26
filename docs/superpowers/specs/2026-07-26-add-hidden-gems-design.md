# Add hidden-gem restaurants to Málaga & Marbella — design

Date: 2026-07-26
Status: approved, ready for implementation plan

## Goal

Add hidden-gem restaurants to the two restaurant-heavy zones the user felt were
thin — **Málaga city** and **Marbella + west coast** — using the exact same
systematic pipeline as every other entry, so they get real photos, live ratings,
review snippets, and reliable labelled map markers.

## Decisions (from brainstorming)

1. **Count:** verify ALL 20 researched candidates via the Places API; keep every
   one that confirms with a strong rating (≥4.4) and a meaningful review count.
   No fixed cap — quality gate decides.
2. **Character:** hidden gems (lesser-known, locally-loved), not tourist-famous.
3. **Source + verify:** researched from web (local guides / live Google Maps),
   then each is verified by the same `fetch-places.mjs` Places API fetch. Only
   API-confirmed spots are written into the site.
4. **Marbella geography:** the zone is "Marbella and the west coast", so San
   Pedro and Estepona spots are in scope (that's where several 4.9★ gems are).

## Candidate pool (to be API-verified, then filtered)

**Málaga city:** Uvedoble, Mesón Ibérico, Buenavista Gastrobar, Refectorium
Catedral, Vertical Málaga, Los Patios de Beatas, Gastroteca Can Emma, Temple,
Cávala, Palodú.

**Marbella + west coast:** Taberna El Bordón, Tempora Restaurante, El Patio de
Mariscal, La revuelta tapas y mas, Paladar taberna, La Bodeguita Del Paris I
(San Pedro), D'Aquinos (San Pedro), El rincón de BUSID (San Pedro), Restaurante
Kuvo (Estepona), La Cozzeria (Estepona).

Approx coordinates for each were gathered during research and are used only to
bias the Places API search; the API returns the authoritative place.

## Verification gate (what "confirms" means)

For each candidate, the Places API Text Search (biased on the research coords)
must return a place with:
- `rating >= 4.4`, AND
- `userRatingCount >= 100` (meaningful review volume — filters out brand-new or
  thinly-reviewed places), AND
- a resolvable name that matches the candidate (not a same-named place elsewhere).

Candidates failing any gate are dropped and reported, not written. This is why
we over-researched (20) to land on a strong final set.

## The systematic pipeline (unchanged — this is the "stays the same" guarantee)

Every kept restaurant is added identically to existing entries:

1. **`fetch-places.mjs`:** each kept spot is added to the `PLACES` list with its
   research coords, so it flows through the exact same Text Search + photo
   resolve + review pipeline. Re-running regenerates `places-data.json`.
2. **`index.html` food entry:** written into the correct zone's `food:[]` array
   as a bilingual object matching the existing schema EXACTLY:
   `{n:[de,en], tier:"street|mid|splurge", closed:[days], d:[de,en], meta:[de,en], url}`.
   - `n`: name (same string EN/DE unless a natural German rendering exists).
   - `tier`: assigned from the candidate's character.
   - `closed`: closed-days array (from the API/opening hours where known, else `[]`).
   - `d`: a terse, specific, opinionated 1-3 sentence description in the guide's
     existing voice, DE + EN. Written to match neighbouring entries' tone.
   - `meta`: hours + phone in the existing format, DE + EN, where known.
   - `url`: `https://maps.google.com/?q=<Name>+<City>` (text-query fallback; the
     real place_id/mapsUri comes from PLACES_DATA at render time).
3. **No new machinery.** `dataFor`, `catFor`, `chips`, `mapBtn`, `foodCard`,
   `openSheet` all already handle these entries. `catFor` auto-assigns the
   category placeholder image; PLACES_DATA supplies the real photo once fetched.

## Where entries go

- Málaga → the `malaga` zone `food:[]` array (currently 9 entries).
- Marbella/west coast → the `marbella` zone `food:[]` array (currently ~7).

Insertion is appended after existing food entries in each zone (order within a
zone is not semantically sorted in the source; render handles tiers/badges).

## Cost

Re-running the full fetch is ~106 existing + up to 20 new ≈ ~126 place lookups
(Text Search + one Photo each ≈ ~250 calls). Still within free tier; the
tightest ceiling (Photo, 1,000/mo) is fine. The user's $1 budget alert remains
the safety net. Guardrails already confirmed set in a prior session.

## Verification

- `node --check fetch-places.mjs` after editing the PLACES list.
- Re-run fetch; confirm new entries appear in `places-data.json` with real
  rating/photo/placeId; report which candidates were dropped by the gate.
- Confirm key still absent from output.
- Browser: open the Málaga and Marbella zone cards, confirm new cards render
  with photos/chips; open a new spot's map sheet, confirm labelled marker at the
  right location; DE/EN toggle intact.
- Confirm key absent from index.html and git history before push.

## Acceptance

- New restaurants appear in the Málaga and Marbella zone cards, each with the
  same photo/rating/review/place-marker treatment as existing entries.
- Every kept spot passed the ≥4.4 / ≥100-reviews API gate.
- No schema drift: new entries are structurally identical to existing ones.
- No key anywhere; no regressions to existing entries.
