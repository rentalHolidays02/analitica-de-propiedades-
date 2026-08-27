// Precios de la competencia via airbnb-scraper-api.omkar.cloud (API alojada de
// pago, tramo gratuito de 200 peticiones/mes).
//
// Presupuesto: UNA peticion por zona y fecha. El autocomplete de cada zona se
// guarda en `zonas_mercado` y no se vuelve a pedir; la busqueda devuelve 18
// alojamientos con precio de una sola vez, asi que no se pide el detalle de
// cada uno (serian 18 peticiones por zona en lugar de 1).
const BASE = "https://airbnb-scraper-api.omkar.cloud/airbnb";
const DOMINIO = "airbnb.es"; // fija idioma espanol y precios en euros
const LIMITE_MENSUAL = 200;

export type Vecino = {
  nombre: string;
  enlace: string;
  precioNoche: number;
  habitaciones: number | null;
  nota: number | null;
};

function cabeceras() {
  const key = process.env.OMKAR_API_KEY?.trim();
  if (!key) throw new Error("Falta OMKAR_API_KEY");
  return { "API-Key": key, Accept: "application/json" };
}

async function pedir(ruta: string, params: Record<string, string>) {
  const r = await fetch(`${BASE}${ruta}?${new URLSearchParams({ domain: DOMINIO, ...params })}`, {
    headers: cabeceras(),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`omkar ${ruta} devolvio ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/** Traduce el nombre del pueblo a lo que Airbnb entiende. Se llama una vez por zona. */
export async function buscarZona(zona: string): Promise<{ consulta: string; placeId: string | null } | null> {
  const d = await pedir("/rooms/autocomplete", { query: zona, num_results: "1" });
  const primero = d.results?.[0];
  if (!primero) return null;
  return { consulta: primero.full_name ?? zona, placeId: primero.google_place_id ?? null };
}

export const nochesEntre = (checkin: string, checkout: string) =>
  Math.round((Date.parse(checkout) - Date.parse(checkin)) / 86_400_000);

/**
 * Alojamientos de la zona con precio para esas fechas exactas.
 * `price.amount` es el TOTAL de la estancia ("for 5 nights"), no el precio por
 * noche: se divide por las noches que pedimos nosotros en vez de interpretar el
 * texto del `qualifier`, que viene en el idioma del dominio.
 */
export async function preciosVecinos(
  consulta: string, placeId: string | null, checkin: string, checkout: string, adultos = 4,
): Promise<Vecino[]> {
  const noches = nochesEntre(checkin, checkout);
  if (noches < 1) throw new Error("El rango de fechas no llega a una noche");

  const params: Record<string, string> = {
    query: consulta, checkin, checkout, adults: String(adultos),
  };
  if (placeId) params.place_id = placeId;
  const d = await pedir("/rooms/search", params);

  const out: Vecino[] = [];
  for (const r of d.results ?? []) {
    const total = Number(r.price?.amount);
    if (!Number.isFinite(total) || total <= 0) continue;
    out.push({
      nombre: r.name ?? r.title ?? "(sin nombre)",
      enlace: r.link ?? "",
      precioNoche: Math.round((total / noches) * 100) / 100,
      habitaciones: r.bedrooms ?? null,
      nota: r.rating ?? null,
    });
  }
  return out;
}

export const limiteMensual = LIMITE_MENSUAL;

// Precios de Booking.com via el actor de Apify factden/booking-com-scraper (de
// pago, ~$0.003/hotel). Con $5 gratis al mes de sobra para esta escala, no
// hace falta el mismo contador de gasto que tiene Airbnb.
const APIFY_ACTOR = "factden~booking-com-scraper";
const BOOKING_MAX_RESULTADOS = 5;

export async function preciosBooking(
  zona: string, checkin: string, checkout: string, adultos = 4,
): Promise<Vecino[]> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) throw new Error("Falta APIFY_TOKEN");

  const r = await fetch(
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items?token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchLocation: [zona],
        checkInDate: checkin,
        checkOutDate: checkout,
        adults: adultos,
        includePrices: true,
        maxResults: BOOKING_MAX_RESULTADOS,
      }),
      cache: "no-store",
    },
  );
  if (!r.ok) throw new Error(`apify booking devolvio ${r.status}: ${(await r.text()).slice(0, 200)}`);

  const items = await r.json();
  const out: Vecino[] = [];
  for (const it of items ?? []) {
    const precio = Number(it.perNightPrice);
    if (!Number.isFinite(precio) || precio <= 0) continue;
    out.push({
      nombre: it.hotelName ?? "(sin nombre)",
      enlace: it.url ?? "",
      precioNoche: precio,
      habitaciones: null,
      nota: it.reviewScore ?? null,
    });
  }
  return out;
}
