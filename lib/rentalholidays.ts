// Cliente de la API de RentalHolidays. Solo lectura.
const BASE = "https://app.rentalholidays.es/gestion/api";

export type CanalRH = {
  id: number;
  name: string;
  commission_pct: number;
};

export type PropiedadRH = {
  id: number;
  name: string;
  capacity_pax: number;
  cleaning_fee: number;
  weekend_increment: number;
  city: string;
  postal_code: string;
  address: string;
  room_type: number;
  is_active: boolean;
};

export type TarifaRH = {
  property_id: number;
  property_name: string;
  tariff_name: string;
  tariff_names: string[];
  daily_price: number;
  weekend_increment: number;
  weekend_price: number;
  min_stay_days: number;
  date_ranges: { date_from: string; date_to: string }[];
  channel_daily_price: number;
  channel_weekend_price: number;
};

export type DiaTarifa = {
  property_id: number;
  fecha: string;
  precio: number;
  min_noches: number;
  tarifa: string | null;
};

export type PeriodoOcupado = {
  from: string;
  to: string; // sin documentar si es inclusiva o exclusiva: pendiente de confirmar con RentalHolidays
  summary: string;
};

export type NocheTarifa = {
  date: string;
  day_of_week: string;
  is_weekend: boolean;
  base_rate: number;
  weekend_increment: number;
  final_rate: number;
  tariff_name: string | null;
};

export type Presupuesto = {
  property: { id: number; name: string; capacity_pax: number };
  stay: { checkin: string; checkout: string; nights: number; guests: number | null };
  pricing: {
    currency: string;
    subtotal_accommodation: number;
    cleaning_fee: number;
    total_price: number;
    nightly_rates: NocheTarifa[];
  };
  rules: { min_stay_required: number; min_stay_met: boolean };
  availability: { is_available: boolean; conflicts: PeriodoOcupado[] };
};

/** Mismos nombres de campo que ReservaApi de lodgify.ts donde coinciden, para
 *  comparar las dos fuentes sin traduccion. `comision` es el dato que Lodgify
 *  no tiene: euros reales que se quedo el canal, no un porcentaje estimado. */
export type ReservaRH = {
  id: number;
  property_id: number;
  llegada: string;
  salida: string;
  noches: number;
  importe: number;
  comision: number;
  limpieza: number;
  canal: string;
  huesped: string;
  creada: string | null;
};

/**
 * La API sirve UTF-8 declarando otro charset, asi que los textos llegan como
 * mojibake ("MiÃ©rcoles"). Solo se reinterpreta si aparece la marca Ã/Â: un
 * texto ya correcto ("Oropesa del Mar") tiene que salir intacto.
 */
export function corregirTexto(s: string): string {
  return /[ÃÂ]/.test(s) ? Buffer.from(s, "latin1").toString("utf8") : s;
}

function cabeceras() {
  const key = process.env.RENTALHOLIDAYS_API_KEY?.trim();
  if (!key) throw new Error("Falta RENTALHOLIDAYS_API_KEY");
  return { "X-API-KEY": key, Accept: "application/json" };
}

/** Los errores vienen con HTTP 400 y {"status":"error","message":"..."}. */
async function pedir(ruta: string, consulta = ""): Promise<any> {
  const r = await fetch(`${BASE}${ruta}?${consulta}`, { headers: cabeceras(), cache: "no-store" });
  const cuerpo = await r.text();
  let j: any;
  try {
    j = JSON.parse(cuerpo);
  } catch {
    throw new Error(`RentalHolidays ${ruta} devolvio ${r.status}: ${cuerpo.slice(0, 200)}`);
  }
  if (!r.ok || j.status === "error") {
    throw new Error(`RentalHolidays ${ruta}: ${corregirTexto(j.message ?? `HTTP ${r.status}`)}`);
  }
  return j;
}

const rango = (propertyId: number, desde: string, hasta: string) => ({
  property_id: String(propertyId),
  date_from: desde,
  date_to: hasta,
});

export async function traerCanales(): Promise<CanalRH[]> {
  // `channels` es un flag sin valor, no un parametro con valor vacio.
  const j = await pedir("/prices", "channels");
  return (j.channels as any[]).map((c) => ({ ...c, name: corregirTexto(c.name) }));
}

export async function traerPropiedadesRH(): Promise<PropiedadRH[]> {
  const j = await pedir("/properties");
  return (j.data as any[]).map((p) => ({
    ...p,
    name: corregirTexto(p.name ?? ""),
    city: corregirTexto(p.city ?? ""),
    address: corregirTexto(p.address ?? ""),
  }));
}

export async function traerTarifas(
  propertyId: number,
  desde: string,
  hasta: string,
): Promise<TarifaRH[]> {
  const q = new URLSearchParams({ ...rango(propertyId, desde, hasta), mode: "seasons" });
  const j = await pedir("/prices", String(q));
  return (j.data as any[]).map((t) => ({
    ...t,
    property_name: corregirTexto(t.property_name ?? ""),
    tariff_name: corregirTexto(t.tariff_name ?? ""),
    tariff_names: (t.tariff_names ?? []).map((n: string) => corregirTexto(n)),
  }));
}

/**
 * Precio configurado dia a dia, de TODAS las casas en una sola peticion (~1s,
 * 2,8 MB para un ano). Sin property_id la API devuelve un array con una entrada
 * por casa; con property_id devuelve un unico objeto.
 *
 * Solo salen los dias con tarifa cargada. La API devuelve price null cuando no
 * hay ninguna, que no es lo mismo que gratis: guardarlos como 0 haria que el
 * panel recomendara regalar la casa. Medido: solo el 19% de los dias del ano
 * tiene tarifa, y el 58% dentro de la ventana de 90 dias del panel.
 */
export async function traerPreciosDiarios(desde: string, hasta: string): Promise<DiaTarifa[]> {
  const j = await pedir("/prices", String(new URLSearchParams({ date_from: desde, date_to: hasta, mode: "daily" })));
  const casas: any[] = Array.isArray(j.data) ? j.data : [j.data];
  return casas.flatMap((c) =>
    (c.days as any[])
      .filter((d) => d.price != null)
      .map((d) => ({
        property_id: c.property_id,
        fecha: d.date,
        precio: Number(d.price),
        min_noches: Number(d.min_stay_days) || 1,
        tarifa: d.tariff_name == null ? null : corregirTexto(d.tariff_name),
      })),
  );
}

/** Lista vacia = casa libre en ese rango: es una respuesta valida, no un fallo. */
export async function traerOcupacion(
  propertyId: number,
  desde: string,
  hasta: string,
): Promise<PeriodoOcupado[]> {
  const j = await pedir("/availability", String(new URLSearchParams(rango(propertyId, desde, hasta))));
  return (j.occupied_periods as any[]).map((p) => ({ ...p, summary: corregirTexto(p.summary ?? "") }));
}

export async function traerPresupuesto(
  propertyId: number,
  checkin: string,
  checkout: string,
  guests?: number,
): Promise<Presupuesto> {
  const q = new URLSearchParams({ property_id: String(propertyId), checkin, checkout });
  if (guests !== undefined) q.set("guests", String(guests));
  const j = await pedir("/quote", String(q));
  return {
    property: { ...j.property, name: corregirTexto(j.property.name ?? "") },
    stay: j.stay,
    pricing: {
      ...j.pricing,
      nightly_rates: (j.pricing.nightly_rates as any[]).map((n) => ({
        ...n,
        day_of_week: corregirTexto(n.day_of_week ?? ""),
        tariff_name: n.tariff_name == null ? null : corregirTexto(n.tariff_name),
      })),
    },
    rules: j.rules,
    availability: j.availability,
  };
}

/**
 * Gestion nombra los canales a su manera. Se traducen al vocabulario que ya
 * escribe canalDe() en lodgify.ts para que las dos fuentes agrupen igual y
 * crucen con comisiones_canal sin una tabla de equivalencias aparte.
 */
const CANALES: Record<string, string> = {
  BookingCom: "Booking.com",
  AirbnbIntegration: "Airbnb",
  Manual: "Directo",
  OH: "Web propia",
  HomeAway: "HomeAway/Vrbo",
};

/** Contabilidad ya cerrada por propiedad y mes: la fuente autoritativa, no una
 *  estimacion. Verificado sobre 19 filas reales que la identidad se cumple
 *  exacta: gross_income - channel_commissions - vat - expenses -
 *  it_general_fees - owner_payout = net_benefit. `it_general_fees` no esta
 *  documentado que impuesto/tasa es exactamente. */
export type RendimientoRH = {
  property_id: number;
  property_name: string;
  owner_name: string;
  occupied_days: number;
  occupancy_pct: number; // occupancy_rate_available_pct: sobre dias disponibles, no sobre dias del periodo
  gross_income: number;
  owner_payout: number;
  channel_commissions: number;
  vat: number;
  expenses: number;
  it_general_fees: number;
  net_benefit: number;
};

/**
 * Un mes calendario por llamada: /rendimiento devuelve HTTP 500 (sin cuerpo
 * JSON) para rangos por encima de ~180 dias, verificado en vivo (6 meses
 * funciona, 7 y 9 fallan). Pedir mas de un mes de golpe no es seguro.
 */
export async function traerRendimiento(anio: number, mes: number): Promise<RendimientoRH[]> {
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const hasta = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10); // ultimo dia del mes
  const j = await pedir("/rendimiento", String(new URLSearchParams({ date_from: desde, date_to: hasta })));
  return (j.data as any[]).map((d) => ({
    property_id: d.property_id,
    property_name: corregirTexto(d.property_name ?? ""),
    owner_name: corregirTexto(d.owner_name ?? ""),
    occupied_days: Number(d.occupied_days) || 0,
    occupancy_pct: Number(d.occupancy_rate_available_pct) || 0,
    gross_income: Number(d.gross_income) || 0,
    owner_payout: Number(d.owner_payout) || 0,
    channel_commissions: Number(d.channel_commissions) || 0,
    vat: Number(d.vat) || 0,
    expenses: Number(d.expenses) || 0,
    it_general_fees: Number(d.it_general_fees) || 0,
    net_benefit: Number(d.net_benefit) || 0,
  }));
}

/**
 * Reservas del sistema de gestion. Se descartan las filas de limpieza
 * (status_lodgify = "Cleaning", 132 de 2989) y las que no tienen fechas: no son
 * estancias. Email y telefono del huesped NO se traen: son datos personales que
 * el panel no usa para nada.
 * net_income viene siempre a 0 en la API, asi que el neto se calcula fuera
 * restando `comision`.
 */
export async function traerReservasRH(): Promise<ReservaRH[]> {
  const j = await pedir("/bookings");
  const n = (x: unknown) => Number(x) || 0;
  return (j.data as any[])
    .filter((b) => b.status_lodgify === "Booked" && b.arrival && b.departure)
    .map((b) => ({
      id: b.id,
      property_id: b.property_id,
      llegada: String(b.arrival).slice(0, 10),
      salida: String(b.departure).slice(0, 10),
      noches: n(b.nights),
      importe: n(b.total_amount),
      comision: n(b.channel_fees),
      limpieza: n(b.cleaning_cost),
      canal: CANALES[b.source] ?? corregirTexto(b.source ?? ""),
      huesped: corregirTexto(b.guest_name ?? ""),
      creada: b.created_at ?? null,
    }));
}
