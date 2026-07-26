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
