// Cliente de la API de Lodgify. Solo lectura: la app nunca escribe en Lodgify.
const BASE = "https://api.lodgify.com/v2";
const TAM_PAGINA = 50;
const CONCURRENCIA = 12; // 86 paginas secuenciales tardan ~50s; en paralelo ~6s
const MAX_NOCHES_REALES = 31; // mas noches = bloqueo del propietario, no estancia

export type PropiedadApi = {
  property_id: number;
  nombre: string;
  nombre_interno: string | null;
  ref: string | null;
  zona: string | null;
  activa: boolean;
  nota: number | null;
  precio_min: number | null;
  precio_max: number | null;
};

export type ReservaApi = {
  id: number;
  property_id: number;
  llegada: string;
  salida: string; // exclusiva
  noches: number;
  importe: number;
  estado: string;
  cancelada: boolean;
  canal: string;
  creada: string | null;
};

export type Hueco = {
  property_id: number;
  inicio: string;
  fin: string; // exclusiva
  noches: number;
};

function cabeceras() {
  const key = process.env.LODGIFY_API_KEY?.trim();
  if (!key) throw new Error("Falta LODGIFY_API_KEY");
  return { "X-ApiKey": key, Accept: "application/json" };
}

async function pagina(ruta: string, page: number, extra: Record<string, string>) {
  const q = new URLSearchParams({ page: String(page), size: String(TAM_PAGINA), ...extra });
  const r = await fetch(`${BASE}${ruta}?${q}`, { headers: cabeceras(), cache: "no-store" });
  if (!r.ok) throw new Error(`Lodgify ${ruta} devolvio ${r.status}: ${await r.text()}`);
  return (await r.json()).items ?? [];
}

/** Pagina en lotes paralelos hasta que un lote vuelve incompleto. */
async function paginarTodo(ruta: string, extra: Record<string, string> = {}) {
  const todo: Record<string, unknown>[] = [];
  for (let base = 1; ; base += CONCURRENCIA) {
    const lote = await Promise.all(
      Array.from({ length: CONCURRENCIA }, (_, i) => pagina(ruta, base + i, extra)),
    );
    todo.push(...lote.flat());
    if (lote.some((p) => p.length < TAM_PAGINA)) return todo;
  }
}

function refDe(nombreInterno: string | null): string | null {
  const m = /ref\.?\s*(\d{1,4})/i.exec(nombreInterno ?? "");
  return m ? m[1] : null;
}

/** El source_text de Lodgify viene a mano y sucio: "MANUAL CATY", "manual cati "... */
function canalDe(sourceText: string | null): string {
  const t = (sourceText ?? "").toLowerCase().trim();
  // Booking.com no manda nombre, manda su par de ids "4179551550|4682572628".
  // Sin esto caian al return de abajo y cada reserva se contaba como un canal
  // distinto: 1.202 de 2.592 reservas (46% de los ingresos) sin canal. Que son
  // de Booking esta verificado contra el sistema de gestion: de las 1.042 que
  // cruzan, las 1.042 salen como BookingCom.
  if (/^\d{9,}\|\d{9,}$/.test(t)) return "Booking.com";
  if (t.includes("airbnb")) return "Airbnb";
  if (t.includes("booking")) return "Booking.com";
  if (t.includes("homeaway") || t.includes("vrbo") || t.includes("expedia")) return "HomeAway/Vrbo";
  if (t.includes("rentalholidays")) return "Web propia";
  if (t === "" || t.includes("manual")) return "Directo";
  return (sourceText ?? "").trim();
}

const esPrueba = (n: string) => /prueba|test/i.test(n);

/**
 * El campo city de Lodgify llega como lo escribio quien dio de alta la casa.
 * Entre las 51 activas conviven "Castellon de la Plana", "Castello",
 * "Municipality of Castello de la Plana" y "Oropesa del Mar, Oropesa del Mar":
 * sin unificarlos, el precio de respaldo por zona se calcula sobre una sola casa.
 */
function normalizaZona(city: string | null | undefined): string | null {
  let z = (city ?? "").trim();
  if (!z) return null;
  z = z.replace(/^municipality of\s+/i, "").split(",")[0].trim();
  const clave = z.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (clave.startsWith("castell")) return "Castellón";
  if (clave.startsWith("oropesa")) return "Oropesa del Mar";
  if (clave.startsWith("penisc")) return "Peñíscola";
  if (clave.startsWith("alcoceber") || clave.startsWith("alcossebre")) return "Alcossebre";
  return z;
}

export async function traerPropiedades(): Promise<PropiedadApi[]> {
  const items = (await paginarTodo("/properties")) as any[];
  return items
    .filter((p) => !esPrueba(`${p.name} ${p.internal_name ?? ""}`))
    .map((p) => ({
      property_id: p.id,
      nombre: p.internal_name?.trim() || p.name,
      nombre_interno: p.internal_name ?? null,
      ref: refDe(p.internal_name ?? null),
      zona: normalizaZona(p.city),
      activa: !!p.is_active,
      nota: p.rating ?? null,
      precio_min: p.min_price ?? null,
      precio_max: p.max_price ?? null,
    }));
}

export async function traerReservas(): Promise<ReservaApi[]> {
  // stayFilter=All es obligatorio: sin el, la API solo devuelve las ~178 proximas.
  const items = (await paginarTodo("/reservations/bookings", { stayFilter: "All" })) as any[];
  const vistas = new Set<number>();
  const out: ReservaApi[] = [];
  for (const b of items) {
    if (vistas.has(b.id)) continue;
    vistas.add(b.id);
    const noches = Math.round(
      (Date.parse(b.departure) - Date.parse(b.arrival)) / 86_400_000,
    );
    if (noches < 1 || noches > MAX_NOCHES_REALES) continue;
    out.push({
      id: b.id,
      property_id: b.property_id,
      llegada: b.arrival,
      salida: b.departure,
      noches,
      // subtotals.stay es el alojamiento sin tasas ni extras: es el precio por
      // noche de verdad. total_amount viene a 0 mas veces (467 vs 98).
      importe: Number(b.subtotals?.stay || b.total_amount || 0),
      estado: b.status,
      cancelada: !!b.canceled_at,
      canal: canalDe(b.source_text),
      creada: b.created_at ?? null,
    });
  }
  return out;
}

/**
 * Huecos reales del calendario. UNICA fuente valida de disponibilidad: los
 * cierres de propietario no aparecen en /reservations/bookings, solo aqui como
 * closed_period. Deducirlos de las reservas hace que la app recomiende bajar el
 * precio de fechas bloqueadas.
 */
export async function traerHuecos(desde: string, hasta: string): Promise<Hueco[]> {
  const q = new URLSearchParams({ start: desde, end: hasta });
  const r = await fetch(`${BASE}/availability?${q}`, { headers: cabeceras(), cache: "no-store" });
  if (!r.ok) throw new Error(`Lodgify /availability devolvio ${r.status}`);
  const calendarios = (await r.json()) as any[];

  const unicos = new Map<string, Hueco>();
  for (const cal of calendarios) {
    for (const p of cal.periods ?? []) {
      if (p.available !== 1) continue;
      // /availability da el ultimo dia INCLUIDO; las reservas dan salida
      // exclusiva. Se suma 1 dia para que todo cuente noches igual.
      const fin = new Date(Date.parse(p.end) + 86_400_000).toISOString().slice(0, 10);
      const noches = Math.round((Date.parse(fin) - Date.parse(p.start)) / 86_400_000);
      if (noches < 1) continue;
      const clave = `${cal.property_id}|${p.start}|${fin}`;
      if (!unicos.has(clave)) {
        unicos.set(clave, { property_id: cal.property_id, inicio: p.start, fin, noches });
      }
    }
  }
  return [...unicos.values()];
}
