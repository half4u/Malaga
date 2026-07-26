# Places API integration — handoff spec

> **Refactor note (2026-07-26):** This doc was revised against the *actual*
> current `index.html`. The original referenced a `REALFOOD` object (6
> hand-found restaurant photos) that no longer exists in the file — food cards
> now use a generic per-category placeholder (`commonsImg(FOODIMG[catFor(f)])`).
> All merge instructions below reflect the real code. See **Merging** step 3.

## TL;DR

Run one local script with your Google Places key → it writes a **secret-free**
`places-data.json` → paste that into `index.html` as `PLACES_DATA` → restaurant
cards get real photos, live ratings, review snippets, and reliable `place_id`
deep links. The key never touches the shipped site or git.

- **Key file:** `gcloud.secret` (local only, git-ignored — never commit it).
- **One run ≈ 106 API calls. Comfortably free.** See [Cost & safety](#cost--safety).

---

## 1. What this site is

A single-file, static travel-planning site for a Costa del Sol trip (Mijas base,
27 Jul – 3 Aug 2026). One `index.html`, no build step, no dependencies beyond
Google Fonts, deployed to GitHub Pages at `half4u/Malaga`. Bilingual DE/EN via a
runtime language toggle (default German).

Layout of the file: one `<style>` block, then one `<script>` containing, in
order — static bilingual UI strings; the day/zone data (`ZONES`, `RANK`, `WEEK`,
`BOARD`); a manual Google-ratings snapshot (`INFO`); render functions (`chips`,
`mapBtn`, `foodCard`, `zoneCard`, `drawMap`, `drawRank`, `renderAll`); and a
bottom-sheet "map popup" (`openSheet`/`closeSheet`) triggered by any "Map" button.

Key data structures the integration touches:

- `INFO` (`index.html:1200`) — hand-typed snapshot keyed by place name:
  `[rating, reviewCount, priceLevel, lat, lng, tel]`. Static, drifts over time.
- `keyOf(n)` (`index.html:1282`) — the stable name identifier used for all
  `INFO`/map lookups. Reuse it; don't invent a second key scheme.
- `FOODIMG` + `commonsImg(...)` — how food cards get their image **today**: a
  generic Wikimedia Commons photo *per food category*, not per restaurant.

## 2. The goal

Give each restaurant card a **real photo**, a **real review snippet**, and a
**reliable deep link** — replacing the current mix of a static `INFO` snapshot
and generic category placeholders. Google's Places API (New) delivers all three
in one shot: a `place_id` (bulletproof deep link), a photo reference, and review
text, for restaurants (and, as a stretch, sights).

---

## 3. Hard constraint: the key must never reach the shipped file

This is a public static site with no backend. Anything in `index.html` is
visible via view-source, `curl`, or a repo clone. **Do not** put the key in the
site's JS, even "restricted." The correct static-site pattern:

1. A **one-time script runs locally** with the key (from `gcloud.secret`, never
   committed, never pasted into chat).
2. It calls the Places API and **resolves photo references to public, key-free
   `lh3.googleusercontent.com` URLs** via the photo endpoint's
   `skipHttpRedirect=true` param, which returns `{ photoUri }` as JSON instead
   of redirecting — so the final site never needs the key.
3. It writes one JSON file with everything the site needs: `place_id`,
   `googleMapsUri`, `rating`, `reviewCount`, `priceLevel`, resolved photo URL,
   and a short review snippet.
4. That JSON (**zero secrets**) is merged into the site as `PLACES_DATA`,
   augmenting `INFO` at each lookup site.

> **Live client-side calls?** Places API (New) supports CORS, so calling it from
> the browser is technically possible — but it requires a hard key lockdown
> (HTTP-referrer restriction to `half4u.github.io/*`, API restricted to Places
> API (New) only, budget alert) *and still leaves the key in public source*.
> **Default to the one-time-script approach.** Only go live client-side if you
> explicitly choose that tradeoff.

---

## 4. Cost & safety

**One full run ≈ 106 calls:** one Text Search + up to one Photo call for each of
the 53 restaurants. Every free monthly quota dwarfs this:

| Call | Per run | Free / month | Above free |
|------|---------|--------------|------------|
| Text Search (`searchText`) | 53 | 5,000–10,000 | $5–$32 / 1k |
| Place Photo (`resolvePhoto`) | ≤ 53 | **1,000** | $7 / 1k |

A normal run — even several re-runs — **costs $0**. The tightest ceiling is the
**Photo quota (1,000/mo)**: you'd need ~9 full runs in one month to reach it.

> **Why the higher SKU tiers apply:** the field mask requests `reviews` and
> `photos`, which bill at the Pro/Enterprise tiers (5,000 / 1,000 free), not the
> cheap Essentials tier (10,000). Still free for one run — just why 1,000 is the
> real ceiling to watch.

**Before running (in Cloud Console — these are yours to click, ~5 min):**

- **Budget tripwire:** Billing → Budgets & alerts → create a **$1 budget** with
  alerts at 50/90/100%. Pricing terms change; a budget alert is the real
  guardrail, not any number in this doc.
- **Restrict the key:** Credentials → your key → API restrictions → **Places API
  (New) only.** Do not skip this.
- *(Optional)* **Quota cap:** Places API → Quotas → cap requests/day (e.g. 300)
  so a runaway loop can't cost anything.

---

## 5. The fetch script

Node 18+ only (native `fetch`, no `npm install`). Save as `fetch-places.mjs` at
the repo root. It reads the key from **`process.argv[2]`** — pass it from
`gcloud.secret` at the shell so the key never lands in a committed file:

```
node fetch-places.mjs "$(cat gcloud.secret)" > places-data.json
```

`places-data.json` contains zero secrets and is safe to commit. Progress prints
to stderr; JSON to stdout.

```js
#!/usr/bin/env node
// fetch-places.mjs — Places API (New). Node 18+. Key used only on this machine,
// only this run; never written to output, never near git.

const KEY = process.argv[2];
if (!KEY) {
  console.error('Usage: node fetch-places.mjs "$(cat gcloud.secret)" > places-data.json');
  process.exit(1);
}

// [site key, lat, lng] — lat/lng bias the search so a same-named place elsewhere
// doesn't win. This is every restaurant in ZONES[*].food[] that is a real, single
// named venue; generic entries ("any chiringuito", "the ventas around Álora") are
// excluded — they aren't a specific searchable place.
const PLACES = [
  ["Zafir · CasaBlu", 36.5890341, -4.6457546],
  ["Los Marinos José", 36.5712776, -4.5907292],
  ["Freiduría El Cenachero", 36.5390429, -4.6185684],
  ["Tomillo Limón", 36.5973662, -4.6366592],
  ["Pampa Tablas y Tapas", 36.5969993, -4.636896],
  ["Koco Bistró", 36.5967162, -4.6374007],
  ["Restaurante La Reja", 36.5953494, -4.6381157],
  ["The Secret Garden", 36.5953718, -4.6390835],
  ["Viento Sur Brunch Café", 36.5949282, -4.638673],
  ["Restaurante El Higuerón", 36.5870167, -4.5996649],
  ["Chupytira", 36.537396, -4.6233639],
  ["Los Tacos Málaga", 36.7232669, -4.4201677],
  ["La Taquería Méx", 36.7244729, -4.4191266],
  ["Itacate Taquería, Malagueta", 36.71969, -4.40869],
  ["Bar La Tranca", 36.7242405, -4.4210356],
  ["Antigua Casa de Guardia", 36.7178003, -4.4233936],
  ["La Tasquita de en Medio", 36.7225252, -4.4206605],
  ["Los Marangós, Molina Lario", 36.721111, -4.4202586],
  ["Kraken Centro", 36.7206429, -4.4219789],
  ["El Lechuguita", 36.741452, -5.1646101],
  ["Bardal · two Michelin stars", 36.7415641, -5.1665637],
  ["Pura Cepa", 36.7398574, -5.1656634],
  ["Las Maravillas", 36.742268, -5.165983],
  ["Bar Frasquito, Setenil", 36.8623182, -5.1784001],
  ["La Cueva de Isabelina, Setenil", 36.8621675, -5.1781727],
  ["Bar La Riviera", 37.177339, -3.597503],
  ["La Buena Vida", 37.1768732, -3.5972288],
  ["Bar Ávila", 37.1700083, -3.5990722],
  ["Restaurante Carmen El Agua", 37.1799806, -3.5930139],
  ["El Rincón de Julio", 37.1737173, -3.5984221],
  ["La Telefónica", 37.1745953, -3.599724],
  ["Candeal", 36.5096998, -4.8821173],
  ["Restaurante Skina · two stars", 36.5115375, -4.9013967],
  ["Messina", 36.5083945, -4.8805895],
  ["El Lago", 36.505871, -4.7792753],
  ["Chiringuito Basilio", 36.5073008, -4.8953707],
  ["Trocadero Playa", 36.505383, -4.913861],
  ["Los Abanicos, Benahavís", 36.5235684, -5.0456016],
  ["Karas Grill, Benahavís", 36.5245208, -5.046584],
  ["Restaurante Sabor, Benahavís", 36.5239564, -5.0463846],
  ["The Village, La Heredia", 36.5213981, -5.006158],
  ["Old Town Restaurant & Bar, Frigiliana", 36.7890338, -3.8952828],
  ["Mar de Gloria", 37.0190197, -4.5623331],
  ["Mesón Adarve", 37.0208588, -4.5611014],
  ["Abrasador El Cortijo La Martina", 37.0244055, -4.5635861],
  ["Otero Bolonia", 36.0885333, -5.7742978],
  ["Chiringuito Los Troncos", 36.085835, -5.7676194],
  ["Miramar Bolonia", 36.0883085, -5.774252],
  ["El Guapo, Tarifa", 36.0125424, -5.6022755],
  ["El Lola, Tarifa", 36.0124283, -5.6020441],
  ["Casa Grande de Alpandeire", 36.6343307, -5.2031107],
  ["Restaurante Camping Genal, Algatocín", 36.5666251, -5.2466968],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PRICE_MAP = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

async function findPlace(query, lat, lng) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": [
        "places.id", "places.displayName", "places.rating",
        "places.userRatingCount", "places.priceLevel",
        "places.googleMapsUri", "places.photos", "places.reviews",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 3000 } },
    }),
  });
  if (!res.ok) throw new Error(`searchText ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.places?.[0] || null;
}

// skipHttpRedirect=true → returns { photoUri } JSON (a key-free lh3.* URL)
// instead of a redirect, so the final site never needs the key.
async function resolvePhoto(photoName, maxWidthPx = 640) {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${KEY}&skipHttpRedirect=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.photoUri || null;
}

const out = {};
let ok = 0, missed = 0;

for (const [key, lat, lng] of PLACES) {
  try {
    const place = await findPlace(key, lat, lng);
    if (!place) { console.error("NOT FOUND:", key); missed++; await sleep(120); continue; }

    let photo = null;
    if (place.photos?.[0]?.name) {
      try { photo = await resolvePhoto(place.photos[0].name); }
      catch (e) { console.error("  photo failed for", key, "-", e.message); }
    }

    // One short, real review snippet. Google's ToS allows surfacing API-returned
    // review text on your own site; keep it short.
    const reviewText = place.reviews?.[0]?.text?.text || null;

    out[key] = {
      placeId: place.id,
      mapsUri: place.googleMapsUri || null,
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? null,
      priceLevel: PRICE_MAP[place.priceLevel] ?? null,
      photo,
      reviewSnippet: reviewText ? reviewText.slice(0, 180) : null,
    };
    console.error("OK:", key);
    ok++;
  } catch (e) {
    console.error("ERROR:", key, "-", e.message);
    missed++;
  }
  await sleep(150); // gentle pacing, not a hard rate-limit requirement
}

console.error(`\nDone. ${ok} resolved, ${missed} missed, out of ${PLACES.length}.`);
console.log(JSON.stringify(out, null, 2));
```

---

## 6. Merging the result into the site

Add the fetched data, then route **one** lookup through the places that read
`INFO` (and the food-photo path) today.

### Step 1 — Add data + a single unified lookup

```js
// Paste the contents of places-data.json here.
const PLACES_DATA = { /* ...from places-data.json... */ };

// Prefer live Places data, fall back to the manual INFO snapshot, else nothing.
// Every caller uses this instead of touching INFO directly.
function dataFor(n) {
  const key = keyOf(n);
  const p = PLACES_DATA[key];
  if (p) return {
    rating: p.rating, reviews: p.reviewCount, price: p.priceLevel,
    tel: null, placeId: p.placeId, mapsUri: p.mapsUri,
    photo: p.photo, review: p.reviewSnippet,
  };
  const i = INFO[key];
  if (i) return {
    rating: i[0] || null, reviews: i[1] || null, price: i[2] || null,
    tel: i[5] || null, placeId: null, mapsUri: null,
    photo: null, review: null,
  };
  return { rating: null, reviews: null, price: null, tel: null,
    placeId: null, mapsUri: null, photo: null, review: null };
}
```

> Note: `photo` falls back to `null` (not `REALFOOD`, which no longer exists).
> The card's own placeholder logic in step 3 handles the no-photo case.

### Step 2 — `chips()` and `mapBtn()`

Current code (`index.html:1284`, `:1292`) reads `INFO[key]` directly. Rework both
to read through `dataFor(n)` so chips reflect live data when present. `mapBtn`
should also stash `placeId` and `mapsUri` as extra `data-*` attributes (e.g.
`data-pid`, `data-mapsuri`) so `openSheet` can build a precise deep link.

### Step 3 — `foodCard()` photo (the drift-corrected part)

`foodCard` (`index.html:1331`) currently sets the image from a **generic
category placeholder**:

```js
const thumb = commonsImg(FOODIMG[catFor(f)], 220);
```

Change the source to **prefer the real per-restaurant photo, fall back to the
existing category placeholder**:

```js
const thumb = dataFor(f.n).photo || commonsImg(FOODIMG[catFor(f)], 220);
```

This is strictly additive: restaurants with a `PLACES_DATA` photo get a real
one; everyone else keeps today's exact placeholder — no regression, no `noimg`
state needed since a placeholder always exists.

### Step 4 — the popup (`openSheet`, `index.html:1535`)

Sheet markup already in the page (`id="sheet"`, hidden): a `sheetSub`, `sheetTitle`,
a `sheetFrame` iframe, `sheetActs`, and a `sheetNote`. `openSheet(b)` currently
reads `INFO[n]` for the rating/price sub-line and builds a text-query map link.

Extend it to:

- Read through `dataFor(n)` (not `INFO[n]`) for the rating/price sub-line.
- Read `data-pid` / `data-mapsuri` off the button (added in step 2).
- If `photo` is present, render it above/beside the map iframe — same visual
  treatment as the existing `.pick-img` / `.zhero` thumbnails.
- If `review` is present, show it as one short labeled block ("From a Google
  review" + snippet). Already trimmed to 180 chars; never stack more than one.
- Prefer `mapsUri`, or a `place_id` link
  (`https://www.google.com/maps/place/?q=place_id:` + placeId), for the primary
  action over the text-query fallback — more reliable.
- **Keep every existing fallback working** when `PLACES_DATA` has no entry
  (before the script is run, or for generic/non-searchable entries). The sheet
  must degrade to exactly its current behavior, never break.

---

## 7. Stretch: sights

The same pattern extends to the 63 **sight** entries (Alcazaba, Puente Nuevo,
Caminito walkway, …) — a second `PLACES` list and a second merge pass for real
photos and precise deep links. Not required; a good fast follow.

---

## 8. Acceptance checklist

- [ ] `fetch-places.mjs` runs via `node fetch-places.mjs "$(cat gcloud.secret)"`
      → valid JSON on stdout, progress on stderr.
- [ ] No API key anywhere in `index.html`, `places-data.json`, or git history.
      (`gcloud.secret` is git-ignored and was never committed.)
- [ ] Restaurants with a `PLACES_DATA` entry show a real photo, live
      rating/price, and open to a `place_id`-based Maps link.
- [ ] Restaurants without one keep today's category placeholder and existing
      map-link behavior — no regressions.
- [ ] The popup shows a review snippet only when one exists; layout survives
      photo/review/placeId all being absent.
- [ ] DE/EN toggle still works inside the popup (`sheetNote`, `sheetOpen`,
      `sheetDir`, `sheetCall`, `reviews` strings all still used).
