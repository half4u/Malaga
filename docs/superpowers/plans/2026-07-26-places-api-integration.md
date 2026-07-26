# Places API Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull real photos, live ratings, review snippets, and reliable place_id deep links from the Google Places API (New) for the trip site's restaurants and sights, without the API key ever reaching the shipped `index.html` or git.

**Architecture:** A local Node script (`fetch-places.mjs`) runs once with the key from `gcloud.secret`, calls the Places API, resolves photos to key-free `lh3.googleusercontent.com` URLs, and writes a secret-free `places-data.json`. That JSON is pasted into `index.html` as `PLACES_DATA`, and all rating/photo/map reads are routed through one new `dataFor(n)` lookup that prefers live data and falls back to the existing `INFO` snapshot.

**Tech Stack:** Node 18+ (native `fetch`, no npm install), vanilla JS in a single static `index.html`, Google Places API (New).

## Global Constraints

- **Node 18+ only.** No `npm install`, no dependencies. Use native `fetch`.
- **The API key must never appear in `index.html`, `places-data.json`, or git history.** Key is read from `process.argv[2]`, passed as `"$(cat gcloud.secret)"`.
- **`gcloud.secret` stays git-ignored** (already configured in `.gitignore`).
- **Photo resolution must use `skipHttpRedirect=true`** so the output stores key-free `lh3.googleusercontent.com` URLs.
- **Field mask:** `places.id, places.displayName, places.rating, places.userRatingCount, places.priceLevel, places.googleMapsUri, places.photos, places.reviews`.
- **Price level mapping:** `PRICE_LEVEL_FREE→0, PRICE_LEVEL_INEXPENSIVE→1, PRICE_LEVEL_MODERATE→2, PRICE_LEVEL_EXPENSIVE→3, PRICE_LEVEL_VERY_EXPENSIVE→4`.
- **All `index.html` edits are additive:** when `PLACES_DATA` has no entry for a place, behavior must degrade to exactly what it is today. No regressions.
- **Keys are `keyOf(n)` values** — the English/Spanish name string. Both `PLACES_DATA` and `INFO` use the same key.
- **Progress to stderr, JSON to stdout.** `places-data.json` is safe to commit; the key is not in it.

---

## File Structure

- **Create: `fetch-places.mjs`** (repo root) — the one-time fetch script. Holds the `PLACES` (restaurants) and `SIGHTS` lists, the `ZONE_CENTER` map, and the fetch/resolve/output logic.
- **Create: `places-data.json`** (repo root, generated) — the fetched data. Committed (secret-free).
- **Modify: `index.html`** — add `PLACES_DATA` + `dataFor()`; rework `chips()`, `mapBtn()`, `foodCard()`, `openSheet()`.

---

## Task 1: Write `fetch-places.mjs` with restaurants + sights

**Files:**
- Create: `fetch-places.mjs`

**Interfaces:**
- Consumes: nothing (standalone script).
- Produces: `places-data.json` on stdout — an object keyed by place name, each value `{ placeId, mapsUri, rating, reviewCount, priceLevel, photo, reviewSnippet }`. `index.html` (Task 3) reads this shape.

- [ ] **Step 1: Create the script skeleton with the key guard and both input lists**

Create `fetch-places.mjs`:

```js
#!/usr/bin/env node
// fetch-places.mjs — Places API (New). Node 18+. Key used only on this machine,
// only this run; never written to output, never near git.
//
// Usage:
//   node fetch-places.mjs "$(cat gcloud.secret)" > places-data.json

const KEY = process.argv[2];
if (!KEY) {
  console.error('Usage: node fetch-places.mjs "$(cat gcloud.secret)" > places-data.json');
  process.exit(1);
}

// [key, lat, lng] — lat/lng bias the search so a same-named place elsewhere
// doesn't win. Restaurants: every real single named venue in ZONES[*].food[].
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

// Sights have no per-entry coords in the site data, so each is biased on its
// zone's town center below. Generic / non-single-place entries are excluded:
// "Altstadt von Mijas, früh oder spät", "Strände: La Cala de Mijas oder
// Carvajal", "Pedregalejo und El Palo", "Die andere Seite der Schlucht",
// "Weinregion Ronda", "Der Steg selbst", "Nasridenpaläste, Nachtbesuch"
// (dupes Generalife/Alcazaba), "Valle del Genal", "Das Dorf Benahavís".
const ZONE_CENTER = {
  home:      [36.5959, -4.6375],   // Mijas
  malaga:    [36.7213, -4.4214],   // Málaga
  ronda:     [36.7402, -5.1665],   // Ronda
  caminito:  [36.9139, -4.7561],   // El Chorro
  granada:   [37.1765, -3.5880],   // Granada
  marbella:  [36.5101, -4.8825],   // Marbella
  agua:      [36.5199, -5.0470],   // Benahavís / Istán
  axarquia:  [36.7462, -3.8760],   // Nerja / Frigiliana
  antequera: [37.0179, -4.5610],   // Antequera
  tarifa:    [36.0136, -5.6045],   // Tarifa
  genal:     [36.5537, -5.2360],   // Genalguacil
};

// [key, zone] — searchable sights only. KEY IS THE ENGLISH keyOf(n) value
// (n[1]), which is what dataFor looks up — NOT the German display string.
// Bias uses ZONE_CENTER[zone].
const SIGHTS = [
  ["Parque La Muralla and Paseo de la Muralla", "home"],
  ["Mirador del Compás", "home"],
  ["Fuengirola fishing harbour", "home"],
  ["Castillo Sohail, Fuengirola", "home"],
  ["Mercado Central de Atarazanas", "malaga"],
  ["Alcazaba", "malaga"],
  ["Castillo de Gibralfaro", "malaga"],
  ["Museo Picasso Málaga", "malaga"],
  ["Centre Pompidou Málaga", "malaga"],
  ["La Malagueta beach", "malaga"],
  ["Puente Nuevo and Alameda del Tajo", "ronda"],
  ["Plaza de Toros", "ronda"],
  ["Baños Árabes", "ronda"],
  ["Setenil de las Bodegas", "ronda"],
  ["Acinipo", "ronda"],
  ["Guadalhorce lakes", "caminito"],
  ["Mirador del Gaitanejo", "caminito"],
  ["Bobastro", "caminito"],
  ["Álora", "caminito"],
  ["Mirador de San Nicolás", "granada"],
  ["Albaicín", "granada"],
  ["Generalife and Alcazaba", "granada"],
  ["Capilla Real and the Alcaicería", "granada"],
  ["Sacromonte", "granada"],
  ["Parking Indigo, Alhambra", "granada"],
  ["Plaza de los Naranjos and the old town", "marbella"],
  ["Paseo Marítimo to Puerto Banús", "marbella"],
  ["Estepona old town", "marbella"],
  ["Ojén and Refugio de Juanar", "marbella"],
  ["Casares", "marbella"],
  ["Gibraltar", "marbella"],
  ["Charco de las Mozas, Benahavís", "agua"],
  ["Charco del Canalón, Istán", "agua"],
  ["Nacimiento del Río Molinos, Istán", "agua"],
  ["Embalse de la Concepción", "agua"],
  ["Frigiliana old town", "axarquia"],
  ["Cueva de Nerja", "axarquia"],
  ["Balcón de Europa", "axarquia"],
  ["Playa de Maro", "axarquia"],
  ["Río Chíllar", "axarquia"],
  ["Dolmen de Menga", "antequera"],
  ["Peña de los Enamorados", "antequera"],
  ["El Torcal de Antequera", "antequera"],
  ["Alcazaba and Real Colegiata", "antequera"],
  ["El Romeral and Viera", "antequera"],
  ["Baelo Claudia", "tarifa"],
  ["Duna de Bolonia", "tarifa"],
  ["Playa de Bolonia", "tarifa"],
  ["Tarifa old town", "tarifa"],
  ["Whale watching, Tarifa port", "tarifa"],
  ["Genalguacil, Pueblo Museo", "genal"],
  ["Alpandeire", "genal"],
  ["Gaucín", "genal"],
  ["Júzcar, the blue village", "genal"],
];
```

- [ ] **Step 2: Add the fetch/resolve helpers and price map**

Append to `fetch-places.mjs`:

```js
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
```

- [ ] **Step 3: Add the main loop that processes both lists and prints JSON**

Append to `fetch-places.mjs`:

```js
// Build the unified work list: restaurants (own coords) + sights (zone center).
const WORK = [
  ...PLACES.map(([key, lat, lng]) => [key, lat, lng]),
  ...SIGHTS.map(([key, zone]) => {
    const c = ZONE_CENTER[zone];
    if (!c) { console.error("NO ZONE CENTER for", key, "zone", zone); return null; }
    return [key, c[0], c[1]];
  }).filter(Boolean),
];

const out = {};
let ok = 0, missed = 0;

for (const [key, lat, lng] of WORK) {
  try {
    const place = await findPlace(key, lat, lng);
    if (!place) { console.error("NOT FOUND:", key); missed++; await sleep(120); continue; }

    let photo = null;
    if (place.photos?.[0]?.name) {
      try { photo = await resolvePhoto(place.photos[0].name); }
      catch (e) { console.error("  photo failed for", key, "-", e.message); }
    }

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
  await sleep(150); // gentle pacing
}

console.error(`\nDone. ${ok} resolved, ${missed} missed, out of ${WORK.length}.`);
console.log(JSON.stringify(out, null, 2));
```

- [ ] **Step 4: Verify the script parses**

Run: `node --check fetch-places.mjs`
Expected: no output, exit code 0 (syntax OK). If it errors, fix the reported line.

- [ ] **Step 5: Verify the key guard works without calling the API**

Run: `node fetch-places.mjs`
Expected: prints the usage line to stderr and exits non-zero (no network call, because no key was passed).

- [ ] **Step 6: Commit the script**

```bash
git add fetch-places.mjs
git commit -m "feat: add fetch-places.mjs for restaurants and sights"
```

---

## Task 2: Run the fetch and generate `places-data.json`

**Files:**
- Create: `places-data.json`

**Interfaces:**
- Consumes: `fetch-places.mjs` (Task 1), `gcloud.secret` (user-provided, git-ignored).
- Produces: `places-data.json` — the data Task 3 pastes into `index.html`.

> **GATE — user action first.** Do not run this task until the user confirms they have set, in Google Cloud Console: (1) a billing budget alert (e.g. $1) and (2) the key restricted to "Places API (New)" only. Ask and wait for explicit confirmation.

- [ ] **Step 1: Confirm guardrails with the user**

Ask: "Have you set the $1 budget alert and restricted the key to Places API (New) in Cloud Console? I'll run the fetch once you confirm." Wait for "yes".

- [ ] **Step 2: Run the fetch**

Run: `node fetch-places.mjs "$(cat gcloud.secret)" > places-data.json`
Expected on stderr: a stream of `OK: <name>` lines, possibly a few `NOT FOUND` / `photo failed`, ending with `Done. N resolved, M missed, out of ~105.` Most should resolve.

- [ ] **Step 3: Verify the JSON is valid and non-empty**

Run: `node -e "const d=require('./places-data.json'); console.log(Object.keys(d).length+' entries'); console.log(Object.keys(d).slice(0,3))"`
Expected: a count well above 0 (target ~90+) and three sample keys.

- [ ] **Step 4: PROVE the key is not in the output**

Run: `grep -F "$(cat gcloud.secret)" places-data.json && echo "!!! KEY LEAKED — STOP" || echo "OK: key absent from places-data.json"`
Expected: `OK: key absent from places-data.json`. If it says LEAKED, do not commit; investigate `resolvePhoto` (the `photoUri` should be an `lh3.googleusercontent.com` URL with no key).

- [ ] **Step 5: Spot-check a photo URL is key-free**

Run: `node -e "const d=require('./places-data.json'); const p=Object.values(d).find(v=>v.photo); console.log(p?p.photo:'no photos resolved')"`
Expected: a `https://lh3.googleusercontent.com/...` URL (no `key=` param), or `no photos resolved` (acceptable but note it).

- [ ] **Step 6: Commit the data**

```bash
git add places-data.json
git commit -m "feat: add fetched places-data.json (secret-free)"
```

---

## Task 3: Add `PLACES_DATA` + `dataFor()` to `index.html`

**Files:**
- Modify: `index.html` (insert immediately after the `INFO` object, which ends near line 1281, before `const keyOf=`)

**Interfaces:**
- Consumes: `keyOf(n)` (existing, `index.html:1282`), `INFO` (existing, `:1200`), the contents of `places-data.json` (Task 2).
- Produces: `PLACES_DATA` (object) and `dataFor(n)` returning `{ rating, reviews, price, tel, placeId, mapsUri, photo, review }`. Tasks 4–7 call `dataFor(n)`.

- [ ] **Step 1: Insert `PLACES_DATA` and `dataFor` after `INFO`, before `keyOf`**

Find the line `const keyOf=n=>Array.isArray(n)?n[1]:n;` (`index.html:1282`). Insert **above** it:

```js
// Live Google Places data, generated by fetch-places.mjs (no secrets in here).
// Paste the full contents of places-data.json as the value below.
const PLACES_DATA = { /* ...paste places-data.json here... */ };

// Unified lookup: prefer live Places data, fall back to the manual INFO
// snapshot, else empty. Every caller uses this instead of touching INFO.
function dataFor(n){
  const key=keyOf(n);
  const p=PLACES_DATA[key];
  if(p) return {rating:p.rating, reviews:p.reviewCount, price:p.priceLevel,
    tel:null, placeId:p.placeId, mapsUri:p.mapsUri, photo:p.photo, review:p.reviewSnippet};
  const i=INFO[key];
  if(i) return {rating:i[0]||null, reviews:i[1]||null, price:i[2]||null,
    tel:i[5]||null, placeId:null, mapsUri:null, photo:null, review:null};
  return {rating:null, reviews:null, price:null, tel:null,
    placeId:null, mapsUri:null, photo:null, review:null};
}
```

> Note: `keyOf` is used inside `dataFor` but defined just below it. That is fine — `dataFor` is only *called* at render time, long after both are defined.

- [ ] **Step 2: Paste the real data**

Replace `{ /* ...paste places-data.json here... */ }` with the full JSON object from `places-data.json`. Do this with an edit that reads the file content in — the object literal must be valid JS (it is, since it's JSON).

Run to get the content to paste: `cat places-data.json`

- [ ] **Step 3: Verify the page still parses (no JS syntax error)**

Run: `node -e "const fs=require('fs'); const h=fs.readFileSync('index.html','utf8'); const m=h.match(/const PLACES_DATA = (\{[\s\S]*?\});/); if(!m){console.error('PLACES_DATA not found'); process.exit(1);} JSON.parse(m[1].replace(/\/\*[\s\S]*?\*\//,'')); console.log('PLACES_DATA is valid JSON');"`
Expected: `PLACES_DATA is valid JSON`. (If the placeholder comment is still there this will fail — meaning Step 2 wasn't done.)

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: add PLACES_DATA and dataFor() lookup"
```

---

## Task 4: Route `chips()` through `dataFor()`

**Files:**
- Modify: `index.html:1284-1291` (the `chips` function)

**Interfaces:**
- Consumes: `dataFor(n)` (Task 3), `dec()`, `num()` (existing helpers).
- Produces: unchanged `chips(n)` signature and HTML output shape.

- [ ] **Step 1: Replace the `chips` function body**

Current (`index.html:1284`):

```js
function chips(n){
  const key=keyOf(n);
  const i=INFO[key]; if(!i) return "";
  const out=[];
  if(i[0]) out.push(`<span class="gchip star">★ ${dec(i[0])} <b>${num(i[1])}</b></span>`);
  if(i[2]) out.push(`<span class="gchip">${"€".repeat(i[2])}</span>`);
  return out.length?`<span class="gchips">${out.join("")}</span>`:"";
}
```

Replace with:

```js
function chips(n){
  const d=dataFor(n);
  const out=[];
  if(d.rating) out.push(`<span class="gchip star">★ ${dec(d.rating)} <b>${num(d.reviews)}</b></span>`);
  if(d.price) out.push(`<span class="gchip">${"€".repeat(d.price)}</span>`);
  return out.length?`<span class="gchips">${out.join("")}</span>`:"";
}
```

- [ ] **Step 2: Verify a data-backed place still yields chips and an unknown place yields nothing**

Run: `node -e "$(node -e "const fs=require('fs');let h=fs.readFileSync('index.html','utf8');const grab=re=>h.match(re)[0];process.stdout.write(grab(/const PLACES_DATA = \{[\s\S]*?\};/)+'\n'+'const INFO='+h.match(/const INFO=\{[\s\S]*?\};/)[0].slice(10)+'\n'+'const keyOf=n=>Array.isArray(n)?n[1]:n;\n'+'const dec=x=>String(x);const num=x=>String(x);\n'+grab(/function dataFor\(n\)\{[\s\S]*?\n\}/)+'\n'+grab(/function chips\(n\)\{[\s\S]*?\n\}/)+'\n'+'console.log(JSON.stringify({known:chips(\"Los Marinos José\"),unknown:chips(\"Not A Real Place XYZ\")}));')")"`
Expected: JSON where `known` contains a `★` chip and `unknown` is `""`. (This extracts the relevant functions and runs them in isolation.)

> If the extraction one-liner is awkward in your shell, instead open `index.html` in a browser, and in the console run `chips("Los Marinos José")` (non-empty) and `chips("Not A Real Place XYZ")` (empty string).

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: chips() reads live data via dataFor()"
```

---

## Task 5: Route `mapBtn()` through `dataFor()` and add place_id/mapsUri attrs

**Files:**
- Modify: `index.html:1292-1298` (the `mapBtn` function)

**Interfaces:**
- Consumes: `dataFor(n)` (Task 3), `keyOf()`, `T()`, `esc()`, `UI` (existing).
- Produces: `mapBtn(n,url)` now also emits `data-pid` and `data-mapsuri` attributes on the button. Task 7 (`openSheet`) reads `b.dataset.pid` and `b.dataset.mapsuri`.

- [ ] **Step 1: Replace the `mapBtn` function body**

Current (`index.html:1292`):

```js
function mapBtn(n,url){
  const key=keyOf(n), label=T(n);
  const i=INFO[key]||[];
  const q=(i[3]!=null&&i[3]!==0)?i[3]+","+i[4]:(url?decodeURIComponent(url.split("?q=")[1]||key).replace(/\+/g," "):key);
  return `<button class="mapbtn" data-n="${esc(key)}" data-label="${esc(label)}" data-q="${esc(q)}" data-tel="${esc(i[5]||"")}" data-url="${esc(url||"")}">${T(UI.btnMap)}</button>`;
}
```

Replace with (keeps the `INFO` lat/lng for the map query `q` — Places data has no lat/lng — but adds pid/mapsuri and uses `dataFor` for tel):

```js
function mapBtn(n,url){
  const key=keyOf(n), label=T(n);
  const i=INFO[key]||[];
  const d=dataFor(n);
  const q=(i[3]!=null&&i[3]!==0)?i[3]+","+i[4]:(url?decodeURIComponent(url.split("?q=")[1]||key).replace(/\+/g," "):key);
  return `<button class="mapbtn" data-n="${esc(key)}" data-label="${esc(label)}" data-q="${esc(q)}" data-tel="${esc(d.tel||"")}" data-url="${esc(url||"")}" data-pid="${esc(d.placeId||"")}" data-mapsuri="${esc(d.mapsUri||"")}">${T(UI.btnMap)}</button>`;
}
```

- [ ] **Step 2: Verify the button HTML includes the new attributes**

Open `index.html` in a browser, console: `mapBtn("Los Marinos José","")`
Expected: the returned string contains `data-pid="..."` (non-empty if resolved) and `data-mapsuri="..."`. For an unknown place, both are `data-pid=""` / `data-mapsuri=""` and the rest is unchanged.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: mapBtn() emits place_id/mapsUri and uses dataFor() for tel"
```

---

## Task 6: `foodCard()` prefers the real photo

**Files:**
- Modify: `index.html:1335` (the `thumb` line inside `foodCard`)

**Interfaces:**
- Consumes: `dataFor(n)` (Task 3), `commonsImg()`, `FOODIMG`, `catFor()` (existing).
- Produces: unchanged `foodCard` output shape; `.pick-img` background is the real photo when present.

- [ ] **Step 1: Replace the thumb line**

Current (`index.html:1335`):

```js
  const thumb=commonsImg(FOODIMG[catFor(f)],220);
```

Replace with:

```js
  const thumb=dataFor(f.n).photo||commonsImg(FOODIMG[catFor(f)],220);
```

- [ ] **Step 2: Verify fallback logic**

Open `index.html` in a browser, console:
`dataFor("Los Marinos José").photo` → expect an `lh3.googleusercontent.com` URL (if resolved).
`dataFor("Chiringuito Basilio").photo || "PLACEHOLDER"` → expect a URL or `"PLACEHOLDER"`.
Then visually load the page: every food card still shows an image (real or category placeholder), none broken.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: foodCard prefers real Places photo, falls back to placeholder"
```

---

## Task 7: Extend `openSheet()` — photo, review, better primary link

**Files:**
- Modify: `index.html:1535-1555` (the `openSheet` function)

**Interfaces:**
- Consumes: `dataFor(n)` (Task 3), `b.dataset.pid` / `b.dataset.mapsuri` (Task 5), `dec()`, `num()`, `T()`, `UI`, `LANG`, `esc()`, `SHEET` (existing).
- Produces: unchanged `openSheet(b)` signature; richer sheet content when data present.

- [ ] **Step 1: Replace the `openSheet` function body**

Current (`index.html:1535`):

```js
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

Replace with:

```js
function openSheet(b){
  const n=b.dataset.n,label=b.dataset.label||n,q=b.dataset.q,tel=b.dataset.tel,url=b.dataset.url;
  const pid=b.dataset.pid||"",mapsuri=b.dataset.mapsuri||"";
  const d=dataFor(n);
  lastFocus=b;
  document.getElementById("sheetTitle").textContent=label;
  const bits=[];
  if(d.rating) bits.push("★ "+dec(d.rating)+" · "+num(d.reviews)+" "+T(UI.reviews));
  if(d.price) bits.push("€".repeat(d.price));
  document.getElementById("sheetSub").textContent=bits.join("  ·  ");
  // Photo + review injected above the map, only when present. Removed on each
  // open so a data-less place shows nothing.
  const map=document.getElementById("sheetFrame").closest(".sheet-map");
  const oldExtra=document.getElementById("sheetExtra"); if(oldExtra) oldExtra.remove();
  if(d.photo||d.review){
    const extra=document.createElement("div");
    extra.id="sheetExtra";
    extra.innerHTML=(d.photo?`<div class="sheet-photo" style="background-image:url('${esc(d.photo)}')" role="img" aria-label=""></div>`:"")
      +(d.review?`<p class="sheet-review"><b>${LANG===0?"Aus einer Google-Bewertung":"From a Google review"}</b> ${esc(d.review)}</p>`:"");
    map.parentNode.insertBefore(extra,map);
  }
  document.getElementById("sheetFrame").src=
    "https://www.google.com/maps?q="+encodeURIComponent(q)+"&z=16&hl="+(LANG===0?"de":"en")+"&output=embed";
  const primary=mapsuri||(pid?"https://www.google.com/maps/place/?q=place_id:"+encodeURIComponent(pid):(url||"https://maps.google.com/?q="+encodeURIComponent(q)));
  const acts=[`<a class="primary" href="${primary}" target="_blank" rel="noopener">${T(UI.sheetOpen)}</a>`,
    `<a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(q)}" target="_blank" rel="noopener">${T(UI.sheetDir)}</a>`];
  if(tel) acts.push(`<a href="tel:${tel}">${T(UI.sheetCall)}</a>`);
  document.getElementById("sheetActs").innerHTML=acts.join("");
  SHEET.hidden=false;
  document.body.classList.add("locked");
  SHEET.querySelector(".sheet-x").focus();
}
```

- [ ] **Step 2: Add CSS for `.sheet-photo` and `.sheet-review`**

Find the `.sheet-map{...}` rule (`index.html:204`). Insert **after** it:

```css
.sheet-photo{height:30vh;min-height:160px;background:#E7E9EC center/cover no-repeat;border:1px solid var(--line);border-radius:3px;margin:12px 0 0}
.sheet-review{font-size:13px;line-height:1.5;color:var(--ink);margin:10px 0 0}
.sheet-review b{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--stone);display:block;margin-bottom:3px}
```

> If `--ink` or `--stone` are not defined in this file, substitute the nearest existing text-color variable (check `:root`). `--stone` is used by `.sheet-sub` (`:202`), so it exists.

- [ ] **Step 3: Verify in the browser**

Open `index.html`, click a Map button on a data-backed restaurant (e.g. Los Marinos José): the sheet shows a photo above the map, a "From a Google review" line, live rating/price in the sub, and the primary "Open in Google Maps" link points to a `place_id` or `maps.app`/`google.com/maps` URI.
Click a Map button on a generic/no-data sight: no photo, no review block, sub-line may be empty, primary link falls back to the query URL — i.e. exactly today's behavior. Toggle DE/EN: the review label switches language, sheet strings still translate.

- [ ] **Step 4: Confirm the key is absent from the shipped file**

Run: `grep -F "$(cat gcloud.secret)" index.html && echo "!!! KEY IN INDEX.HTML — STOP" || echo "OK: key absent from index.html"`
Expected: `OK: key absent from index.html`.

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: openSheet shows photo, review snippet, place_id primary link"
```

---

## Task 8: Final verification pass

**Files:** none (verification only)

- [ ] **Step 1: Prove no secret anywhere in tracked files or history**

Run: `git grep -F "$(cat gcloud.secret)" $(git rev-list --all) 2>/dev/null && echo "!!! KEY IN HISTORY" || echo "OK: key absent from all git history"`
Expected: `OK: key absent from all git history`.

- [ ] **Step 2: Confirm `gcloud.secret` is still ignored and untracked**

Run: `git check-ignore gcloud.secret && git ls-files gcloud.secret | grep . && echo "!!! TRACKED" || echo "OK: ignored and untracked"`
Expected: prints `gcloud.secret` (ignored) then `OK: ignored and untracked`.

- [ ] **Step 3: Walk the acceptance checklist**

Open `index.html` in a browser and confirm each item in `places-api-integration.md` §8 plus sights:
- Restaurant with data → real photo, live chips, place_id link.
- Restaurant/sight without data → unchanged (placeholder photo for food, existing map behavior).
- Popup review snippet only when present; layout intact when photo/review/pid all absent.
- DE/EN toggle works in the popup.
- Sight with data → live chips + place_id link; sight without → unchanged.

- [ ] **Step 4: Final commit if any doc updates were needed**

```bash
git add -A
git commit -m "docs: mark Places API integration acceptance verified" || echo "nothing to commit"
```
