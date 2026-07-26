# Places API integration — handoff spec

## What this site is

A single-file, static travel-planning site for a Costa del Sol trip (Mijas base,
27 Jul – 3 Aug 2026). One `index.html`, no build step, no dependencies beyond
Google Fonts, deployed to GitHub Pages at `half4u/Malaga`. Bilingual DE/EN via
a runtime language toggle (default German).

Structurally the file is CSS in one `<style>` block, then one `<script>` block
containing, in this order: static bilingual UI strings, the day/zone data
(`ZONES`, `RANK`, `WEEK`, `BOARD`), a manual Google-ratings snapshot (`INFO`),
render functions (`chips`, `mapBtn`, `foodCard`, `zoneCard`, `drawMap`,
`drawRank`, `renderAll`), and a bottom-sheet "map popup" component
(`openSheet`/`closeSheet`) that opens when any "Map" button is tapped.

## The task

Wire in the user's own Google Places API key so restaurant cards (and ideally
sight cards) show **real photos**, a **real review snippet**, and a **reliable
deep link**, instead of the current manual/partial state:

- `INFO` — a hand-typed snapshot object keyed by place name:
  `[rating, reviewCount, priceLevel, lat, lng, tel]`. Static, will drift.
- `REALFOOD` — 6 restaurant photos found and verified by hand (og:image pulled
  from each restaurant's own website). Everything else shows no photo.
- Map links are built from `lat,lng` or a decoded text query — workable, but
  not as reliable as a real Google `place_id`.

Google's own Places API is the correct fix for all three at once: it returns
a `place_id` (for a bulletproof deep link), a photo reference (for a real
image), and review text (for a real snippet) — for both restaurants and
sights.

## Hard constraint: the API key must never reach the shipped file

This is a public static site with no backend (GitHub Pages). Anything in
`index.html` is visible to anyone — view source, `curl`, or a repo clone.
**Do not** put the API key in the site's JS, even "restricted." The correct
pattern for a static site is:

1. A **one-time script runs locally**, on the user's own machine, using the
   key directly (never committed, never pasted into chat).
2. It calls the Places API, and **resolves photo references to public,
   key-free `lh3.googleusercontent.com` URLs** using the Places API (New)
   photo endpoint's `skipHttpRedirect=true` parameter, which returns
   `{ photoUri }` as JSON instead of redirecting — so the final site never
   needs the key at all.
3. It writes one JSON file with everything the site needs: `place_id`,
   `googleMapsUri`, `rating`, `reviewCount`, `priceLevel`, the resolved photo
   URL, and a short review snippet.
4. That JSON (zero secrets in it) gets merged into the site as a
   `PLACES_DATA` object, replacing/augmenting `INFO` + `REALFOOD` at each
   lookup site.

If the user would rather call the API live from the browser instead of doing
a one-time fetch, that's possible with Places API (New), which does support
CORS — but it requires locking the key down hard in Google Cloud Console
(HTTP referrer restriction to `half4u.github.io/*`, API restricted to "Places
API (New)" only, and a billing budget alert), and it still means the key sits
in public source. **Recommend the one-time-script approach above as the
default**; only do live client-side calls if the user explicitly asks for it
after understanding that tradeoff.

## The fetch script

Already written and syntax-checked. Node 18+ only (native `fetch`, no
`npm install`). Create this as `fetch-places.mjs` at the repo root:

```js
#!/usr/bin/env node
// fetch-places.mjs
//
// Pulls a real photo, the actual Google place_id, live rating/price, and one
// short review snippet for every restaurant in the trip site, using the
// Places API (New). Requires Node 18+ (native fetch, no npm install needed).
//
// Your API key is only ever used on THIS machine, in this one run. It never
// gets written to the output file and never goes near the GitHub repo.
//
// Usage:
//   node fetch-places.mjs YOUR_API_KEY > places-data.json
//
// Enable first in Google Cloud Console (console.cloud.google.com):
//   APIs & Services -> Library -> enable "Places API (New)"
//   Then, on the key itself: Credentials -> your key -> API restrictions
//   -> restrict to "Places API (New)" only. Do NOT skip this step.

const KEY = process.argv[2];
if (!KEY) {
  console.error("Usage: node fetch-places.mjs YOUR_API_KEY > places-data.json");
  process.exit(1);
}

// [site key, lat, lng] -- lat/lng bias the search so "El Lago" in Marbella
// doesn't resolve to a restaurant of the same name in Buenos Aires.
// This list is every restaurant currently in ZONES[*].food[] that is a real,
// single, named venue (a handful of generic entries like "any chiringuito
// with a smoking boat" or "the ventas around Álora" are deliberately excluded
// -- they aren't a specific searchable place).
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

async function findPlace(query, lat, lng) {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.rating",
        "places.userRatingCount",
        "places.priceLevel",
        "places.googleMapsUri",
        "places.photos",
        "places.reviews"
      ].join(",")
    },
    body: JSON.stringify({
      textQuery: query,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 3000 } }
    })
  });
  if (!res.ok) throw new Error(`searchText ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.places?.[0] || null;
}

// Resolves a photo reference to a public, key-free lh3.googleusercontent.com
// URL using skipHttpRedirect, so the final site never needs your key.
async function resolvePhoto(photoName, maxWidthPx = 640) {
  const url = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${KEY}&skipHttpRedirect=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`photo ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.photoUri || null;
}

const PRICE_MAP = {
  PRICE_LEVEL_FREE: 0, PRICE_LEVEL_INEXPENSIVE: 1, PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3, PRICE_LEVEL_VERY_EXPENSIVE: 4
};

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

    // One short, real review snippet, trimmed. Google's ToS allows surfacing
    // review text returned by the API on your own site.
    const reviewText = place.reviews?.[0]?.text?.text || null;

    out[key] = {
      placeId: place.id,
      mapsUri: place.googleMapsUri || null,
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? null,
      priceLevel: PRICE_MAP[place.priceLevel] ?? null,
      photo,
      reviewSnippet: reviewText ? reviewText.slice(0, 180) : null
    };
    console.error("OK:", key);
    ok++;
  } catch (e) {
    console.error("ERROR:", key, "-", e.message);
    missed++;
  }
  await sleep(150); // gentle pacing, not a real rate limit requirement
}

console.error(`\nDone. ${ok} resolved, ${missed} missed, out of ${PLACES.length}.`);
console.log(JSON.stringify(out, null, 2));
```

Run it once:

```
node fetch-places.mjs AIzaSy...yourkey... > places-data.json
```

`places-data.json` contains zero secrets and is safe to commit.

## Merging the result into the site

Replace the current empty stub with the fetched data, and thread a single
lookup through the three places that currently read `INFO` directly.

**1. Add the data, with INFO/REALFOOD kept as a fallback layer:**

```js
// Paste the contents of places-data.json here (or import it if the repo
// moves to a small build step later).
const PLACES_DATA = { /* ...from places-data.json... */ };

// Unified lookup: prefer live Places data, fall back to the manual snapshot,
// fall back to nothing. Every caller should use this instead of touching
// INFO or REALFOOD directly.
function dataFor(n) {
  const key = keyOf(n);
  const p = PLACES_DATA[key];
  if (p) return {
    rating: p.rating, reviews: p.reviewCount, price: p.priceLevel,
    tel: null, placeId: p.placeId, mapsUri: p.mapsUri,
    photo: p.photo, review: p.reviewSnippet
  };
  const i = INFO[key];
  if (i) return {
    rating: i[0] || null, reviews: i[1] || null, price: i[2] || null,
    tel: i[5] || null, placeId: null, mapsUri: null,
    photo: REALFOOD[key] || null, review: null
  };
  return { rating: null, reviews: null, price: null, tel: null,
    placeId: null, mapsUri: null, photo: REALFOOD[key] || null, review: null };
}
```

**2. `chips()` and `mapBtn()` — current code, for reference:**

```js
function chips(n){
  const key=keyOf(n);
  const i=INFO[key]; if(!i) return "";
  const out=[];
  if(i[0]) out.push(`<span class="gchip star">★ ${dec(i[0])} <b>${num(i[1])}</b></span>`);
  if(i[2]) out.push(`<span class="gchip">${"€".repeat(i[2])}</span>`);
  return out.length?`<span class="gchips">${out.join("")}</span>`:"";
}
function mapBtn(n,url){
  const key=keyOf(n), label=T(n);
  const i=INFO[key]||[];
  const q=(i[3]!=null&&i[3]!==0)?i[3]+","+i[4]:(url?decodeURIComponent(url.split("?q=")[1]||key).replace(/\+/g," "):key);
  return `<button class="mapbtn" data-n="${esc(key)}" data-label="${esc(label)}" data-q="${esc(q)}" data-tel="${esc(i[5]||"")}" data-url="${esc(url||"")}">${T(UI.btnMap)}</button>`;
}
```

Rework both to read through `dataFor(n)` instead of `INFO[key]` directly, so
rating/price chips reflect live data when present. `mapBtn` should also stash
`placeId` and `mapsUri` as extra `data-*` attributes on the button (e.g.
`data-pid`, `data-mapsuri`) so `openSheet` can build a precise deep link.

**3. `foodCard()` — photo preference order:**

Currently:
```js
const real=REALFOOD[keyOf(f.n)];
```
Change to `dataFor(f.n).photo`, which already encodes the fallback chain
(live API photo → hand-found REALFOOD photo → no image, card gets the
`noimg` class exactly as today).

**4. The popup itself — current implementation, for reference:**

Markup (already in the page, `id="sheet"`, hidden by default):
```html
<div class="sheet" id="sheet" hidden>
  <div class="sheet-back" data-close></div>
  <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
    <button class="sheet-x" data-close aria-label="Karte schließen">✕</button>
    <p class="sheet-sub" id="sheetSub"></p>
    <h3 id="sheetTitle"></h3>
    <div class="sheet-map"><iframe id="sheetFrame" title="Map" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
    <div class="sheet-acts" id="sheetActs"></div>
    <p class="sheet-note" data-t="sheetNote"></p>
  </div>
</div>
```

Logic:
```js
const SHEET=document.getElementById("sheet");
let lastFocus=null;
function openSheet(b){
  const n=b.dataset.n,label=b.dataset.label||n,q=b.dataset.q,tel=b.dataset.tel,url=b.dataset.url;
  const i=INFO[n];
  lastFocus=b;
  document.getElementById("sheetTitle").textContent=label;
  const bits=[];
  if(i&&i[0]) bits.push("★ "+dec(i[0])+" · "+num(i[1])+" "+T(UI.reviews));
  if(i&&i[2]) bits.push("€".repeat(i[2]));
  document.getElementById("sheetSub").textContent=bits.join("  ·  ");
  document.getElementById("sheetFrame").src=
    "https://www.google.com/maps?q="+encodeURIComponent(q)+"&z=16&hl="+(LANG===0?"de":"en")+"&output=embed";
  const acts=[`<a class="primary" href="${url||"https://maps.google.com/?q="+encodeURIComponent(q)}" target="_blank" rel="noopener">${T(UI.sheetOpen)}</a>`,
    `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}" target="_blank" rel="noopener">${T(UI.sheetDir)}</a>`];
  if(tel) acts.push(`<a href="tel:${tel}">${T(UI.sheetCall)}</a>`);
  document.getElementById("sheetActs").innerHTML=acts.join("");
  SHEET.hidden=false;
  document.body.classList.add("locked");
  SHEET.querySelector(".sheet-x").focus();
}
```

Extend `openSheet` to:

- Read `data-pid` / `data-mapsuri` off the button (added in step 2 above).
- If `photo` is present in `dataFor(n)`, render it above (or beside) the map
  iframe — a simple `<img>` or background-image div, same visual treatment as
  the existing `.pick-img`/`.zhero` thumbnails elsewhere in the site.
- If `review` is present, show it as a short labeled block, e.g. "From a
  Google review" + the trimmed snippet — real API data meant for exactly this
  display use case, so no copyright concern, but keep it short (the fetch
  script already trims to 180 chars) and don't stack more than one.
- Prefer `mapsUri` (or a `place_id`-built link,
  `https://www.google.com/maps/place/?q=place_id:` + placeId) for the
  "primary" action instead of the current text-query URL, when available —
  meaningfully more reliable than today's decoded-query fallback.
- Keep every existing fallback path working when `PLACES_DATA` has no entry
  for a given place (i.e. before the script has been run, or for the small
  number of generic/non-searchable food entries) — the sheet should degrade
  exactly to its current behavior, never break.

## Nice-to-have / stretch

The same script pattern works for the 63 **sight** entries too (Alcazaba,
Puente Nuevo, Caminito walkway, etc.) — real photos and precise deep links
there would be an equally good improvement, just a second `PLACES` list and
a second merge pass. Not required for this task; mention it as a fast follow.

## Cost and quota

Roughly 50–100 Places API (New) requests total for one run (Text Search +
one Photo call per resolved place). Free-tier/monthly-credit terms change,
so have the user check current pricing and set a budget alert in Cloud
Console before running it, rather than trusting any number here. Restrict
the key to "Places API (New)" only regardless of which integration path is
chosen.

## Acceptance checklist

- [ ] `fetch-places.mjs` runs standalone with `node fetch-places.mjs KEY`
      and produces valid JSON on stdout, progress on stderr.
- [ ] No API key anywhere in `index.html`, `places-data.json`, or git history.
- [ ] Restaurants with a `PLACES_DATA` entry show a real photo, live
      rating/price, and open to a `place_id`-based Maps link.
- [ ] Restaurants without one still behave exactly as today (REALFOOD photo
      or none, existing map-link behavior) — no regressions.
- [ ] The popup shows a review snippet only when one exists; layout doesn't
      break when photo/review/placeId are all absent.
- [ ] DE/EN toggle still works inside the popup (existing `sheetNote`,
      `sheetOpen`, `sheetDir`, `sheetCall`, `reviews` strings all still used).
