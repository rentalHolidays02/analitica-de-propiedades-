// Lecturas que comparten las paginas. Todo servidor: nada llega al navegador.
import { seleccionar } from "./db";
import { hoy } from "./calculos";
import type { Referencias } from "./calculos";

export type Propiedad = {
  property_id: number; nombre: string; ref: string | null; zona: string | null;
  activa: boolean; nota: number | null; precio_min: number | null; precio_max: number | null;
  comentarios_airbnb: string | null; comentarios_booking: string | null;
  nota_airbnb: number | null; nota_booking: number | null;
};

export type FilaMensual = {
  property_id: number; nombre: string; zona: string | null;
  anio: number; mes: number; reservas: number; noches: number;
  ingresos: number; adr: number | null;
  /** Lo que de verdad cobra el propietario (gestion) o, si ese mes no esta
   *  cerrado en gestion todavia, la estimacion que solo resta comision. */
  ingresos_reales: number;
  /** true = ingresos_reales viene de /rendimiento (RentalHolidays), la fuente
   *  autoritativa; false = es la estimacion de v_reservas_validas. */
  ingresos_de_gestion: boolean;
};

export type Apunte = {
  id: number; apuntado_en: string; zona: string; competidor: string;
  fecha_estancia: string; precio: number; fuente: string;
};

export const propiedadesActivas = () =>
  seleccionar<Propiedad>("propiedades", "activa=eq.true&order=nombre");

export const mensual = (propertyId?: number) =>
  seleccionar<FilaMensual>(
    "v_mensual",
    `order=anio.desc,mes.asc${propertyId ? `&property_id=eq.${propertyId}` : ""}`,
  );

export const canales = (propertyId?: number) =>
  seleccionar<{ property_id: number; canal: string; reservas: number; noches: number; ingresos: number }>(
    "v_canales", propertyId ? `property_id=eq.${propertyId}` : "",
  );

export const seguimiento = () =>
  seleccionar<{ property_id: number; visto_desde: string; visto_hasta: string; dias_con_hueco: number }>(
    "v_seguimiento", "",
  );

export const resumenSnapshots = (n = 2) =>
  seleccionar<{ fecha: string; casas: number; noches_libres: number; huecos: number }>(
    "v_resumen_snapshot", `order=fecha.desc&limit=${n}`,
  );

export type SnapshotHueco = { fecha: string; property_id: number; inicio: string; fin: string; noches: number };

/** Fotos diarias desde `desde`: de aqui sale la tendencia de dias libres por casa. */
export const historialHuecos = (desde: string) =>
  seleccionar<SnapshotHueco>("huecos_snapshot", `fecha=gte.${desde}&order=fecha.asc`);

export const gastoMercado = (mes: string) =>
  seleccionar<{ mes: string; peticiones: number }>("v_gasto_mercado", `mes=eq.${mes}`);

/** Fecha de llegada de cada reserva valida: v_mensual no baja a nivel de dia. */
export const llegadasValidas = () =>
  seleccionar<{ property_id: number; llegada: string; anio: number }>(
    "v_reservas_validas", "select=property_id,llegada,anio&order=llegada.asc",
  );

/** Rango llegada-salida de cada reserva valida: para pintar dias ya pasados en el calendario de Seguimiento. */
export const reservasRango = () =>
  seleccionar<{ property_id: number; llegada: string; salida: string }>(
    "v_reservas_validas", "select=property_id,llegada,salida&order=llegada.asc",
  );

export const apuntesCompetencia = () =>
  seleccionar<Apunte>("competencia", "order=fecha_estancia.asc,apuntado_en.desc");

const APUNTES_POR_PAGINA = 40;
export const apuntesPorPagina = APUNTES_POR_PAGINA;

/** Pide una fila de mas para saber si hay pagina siguiente sin contar el total. */
export function apuntesFiltrados(
  { zona, fuente, desde, hasta, pagina = 1 }:
  { zona?: string; fuente?: string; desde?: string; hasta?: string; pagina?: number },
) {
  const filtros = [
    zona ? `zona=eq.${encodeURIComponent(zona)}` : "",
    fuente ? `fuente=eq.${encodeURIComponent(fuente)}` : "",
    desde ? `fecha_estancia=gte.${desde}` : "",
    hasta ? `fecha_estancia=lte.${hasta}` : "",
  ].filter(Boolean).map((f) => `${f}&`).join("");
  const offset = (pagina - 1) * APUNTES_POR_PAGINA;
  return seleccionar<Apunte>("competencia",
    `${filtros}order=fecha_estancia.asc,apuntado_en.desc&limit=${APUNTES_POR_PAGINA + 1}&offset=${offset}`);
}

/** Los niveles de respaldo del precio de referencia, ya en memoria. El primero
 *  es el precio de venta configurado en gestion; los otros tres, el historico. */
export async function referencias(): Promise<Referencias> {
  const [gestion, casaMes, casa, zonaMes] = await Promise.all([
    seleccionar<{ property_id: number; fecha: string; precio: number }>(
      "tarifas_gestion", `fecha=gte.${hoy()}&select=property_id,fecha,precio`),
    seleccionar<{ property_id: number; mes: number; adr: number }>("v_adr_casa_mes"),
    seleccionar<{ property_id: number; adr: number }>("v_adr_casa"),
    seleccionar<{ zona: string; mes: number; adr: number }>("v_adr_zona_mes"),
  ]);
  return {
    gestion: new Map(gestion.map((r) => [`${r.property_id}|${r.fecha}`, Number(r.precio)])),
    casaMes: new Map(casaMes.map((r) => [`${r.property_id}|${r.mes}`, Number(r.adr)])),
    casa: new Map(casa.map((r) => [r.property_id, Number(r.adr)])),
    zonaMes: new Map(zonaMes.map((r) => [`${r.zona}|${r.mes}`, Number(r.adr)])),
  };
}
