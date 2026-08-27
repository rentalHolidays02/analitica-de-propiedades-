import Link from "next/link";
import { ErrorConfiguracion } from "@/lib/db";
import AvisoConfig from "../componentes/AvisoConfig";
import { propiedadesActivas, historialHuecos, mensual, reservasRango } from "@/lib/consultas";
import { nochesEnVentana, hoy, sumaDias, MESES } from "@/lib/calculos";
import TablaSeguimiento, { type FilaSeguimiento, type Ocupacion } from "./TablaSeguimiento";

// Mismo criterio que Disponibilidad: sin cachear, la tendencia tiene que ser la real.
export const dynamic = "force-dynamic";

const VENTANA = 90;         // dias hacia delante para "noches libres", igual que Disponibilidad
const HISTORIAL_DIAS = 60;  // cuanto hacia atras se muestra la tendencia
const VENTANAS_OCUPACION: { clave: keyof Ocupacion; dias: number }[] = [
  { clave: "dia", dias: 1 }, { clave: "semana", dias: 7 }, { clave: "mes", dias: 30 }, { clave: "seisMeses", dias: 180 },
];

const TAMANOS_PAGINA = [10, 15, 25];
const TAMANO_DEFECTO = 15;

const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

function enlacePagina({ q, porPagina, pagina }: { q: string; porPagina: number; pagina: number }) {
  const p = new URLSearchParams();
  if (q) p.set("q", q);
  if (porPagina !== TAMANO_DEFECTO) p.set("porPagina", String(porPagina));
  if (pagina > 1) p.set("pagina", String(pagina));
  const s = p.toString();
  return s ? `/seguimiento?${s}` : "/seguimiento";
}

type Params = { q?: string; porPagina?: string; pagina?: string };

export default async function Seguimiento({ searchParams }: { searchParams: Promise<Params> }) {
  const { q: qParam, porPagina: porPaginaTxt, pagina: paginaTxt } = await searchParams;
  const q = (qParam ?? "").trim().toLowerCase();
  const porPagina = TAMANOS_PAGINA.includes(Number(porPaginaTxt)) ? Number(porPaginaTxt) : TAMANO_DEFECTO;
  const fecha = hoy();
  const desde = sumaDias(fecha, -HISTORIAL_DIAS);
  const datos = await Promise.all([propiedadesActivas(), historialHuecos(desde), mensual(), reservasRango()])
    .catch((e: unknown) => (e instanceof ErrorConfiguracion ? e : Promise.reject(e)));
  if (datos instanceof ErrorConfiguracion) return <AvisoConfig detalle={datos.message} />;
  const [propiedades, historial, filasMensuales, reservas] = datos;

  const mensualPorCasa = new Map<number, { anio: number; mes: number; noches: number }[]>();
  for (const f of filasMensuales) {
    const lista = mensualPorCasa.get(f.property_id) ?? [];
    lista.push({ anio: f.anio, mes: f.mes, noches: f.noches });
    mensualPorCasa.set(f.property_id, lista);
  }

  // Reservas ya cerradas: huecos_snapshot solo mira hacia delante, esto es lo
  // unico que sabe que paso en dias que ya pasaron.
  const reservasPorCasa = new Map<number, { inicio: string; fin: string }[]>();
  for (const r of reservas) {
    const lista = reservasPorCasa.get(r.property_id) ?? [];
    lista.push({ inicio: r.llegada, fin: r.salida });
    reservasPorCasa.set(r.property_id, lista);
  }

  // Fotos que de verdad se tomaron (dias en los que corrio el sync), en orden.
  const fechas = [...new Set(historial.map((h) => h.fecha))].sort();
  const ultimaFecha = fechas[fechas.length - 1];

  const porCasa = new Map<number, typeof historial>();
  for (const h of historial) {
    const lista = porCasa.get(h.property_id) ?? [];
    lista.push(h);
    porCasa.set(h.property_id, lista);
  }

  const filas: FilaSeguimiento[] = propiedades.map((p) => {
    const huecos = porCasa.get(p.property_id) ?? [];
    // Sin hueco ese dia = casa llena en la ventana: cuenta como 0, no como "sin dato".
    const serie = fechas.map((f) => huecos.filter((h) => h.fecha === f)
      .reduce((s, h) => s + nochesEnVentana(h.inicio, h.fin, f, sumaDias(f, VENTANA)), 0));
    const actual = serie.length ? serie[serie.length - 1] : null;
    const inicial = serie.length ? serie[0] : null;
    const delta = actual != null && inicial != null ? inicial - actual : null;

    // Ocupacion = 1 - noches libres / noches totales de la ventana, con la foto mas reciente.
    const huecosHoy = ultimaFecha ? huecos.filter((h) => h.fecha === ultimaFecha) : [];
    const ocupacion = Object.fromEntries(VENTANAS_OCUPACION.map(({ clave, dias }) => {
      if (!ultimaFecha) return [clave, null];
      const libres = huecosHoy.reduce(
        (s, h) => s + nochesEnVentana(h.inicio, h.fin, ultimaFecha, sumaDias(ultimaFecha, dias)), 0,
      );
      return [clave, Math.max(0, Math.min(100, Math.round((1 - libres / dias) * 100)))];
    })) as Ocupacion;

    return {
      propertyId: p.property_id, nombre: p.nombre, zona: p.zona,
      inicial, actual, delta, serie, ocupacion,
      mensual: mensualPorCasa.get(p.property_id) ?? [],
      huecos: huecosHoy.map((h) => ({ inicio: h.inicio, fin: h.fin })),
      reservas: reservasPorCasa.get(p.property_id) ?? [],
    };
  }).sort((a, b) => (a.delta ?? 999) - (b.delta ?? 999));

  const refPorId = new Map(propiedades.map((p) => [p.property_id, p.ref]));
  const filasFiltradas = q
    ? filas.filter((f) =>
        f.nombre.toLowerCase().includes(q) || (refPorId.get(f.propertyId) ?? "").toLowerCase().includes(q))
    : filas;
  const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / porPagina));
  const pagina = Math.min(Math.max(1, Number(paginaTxt) || 1), totalPaginas);
  const filasPagina = filasFiltradas.slice((pagina - 1) * porPagina, pagina * porPagina);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Seguimiento de disponibilidad</h1>
          <p className="text-sm text-slate-500">
            Evolución de las noches libres en los próximos {VENTANA} días, casa por casa.
            Últimos {HISTORIAL_DIAS} días de fotos ({fechas.length ? `${fmtDia(fechas[0])} – ${fmtDia(fechas[fechas.length - 1])}` : "sin fotos aún"}).
            Toca una casa para ver su ratio de ocupación.
          </p>
        </div>
        <form className="flex items-center gap-2">
          <input type="text" name="q" defaultValue={qParam ?? ""} placeholder="Buscar por nombre o ref…"
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
          <select name="porPagina" defaultValue={String(porPagina)}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
            {TAMANOS_PAGINA.map((n) => <option key={n} value={n}>{n} por página</option>)}
          </select>
          <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Buscar</button>
        </form>
      </div>

      <TablaSeguimiento filas={filasPagina} historialDias={HISTORIAL_DIAS} ultimaFecha={ultimaFecha ?? null} />

      {filasFiltradas.length === 0 && q && (
        <p className="text-sm text-slate-500">Ninguna casa coincide con &quot;{qParam}&quot;.</p>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Link aria-disabled={pagina <= 1}
            href={enlacePagina({ q, porPagina, pagina: pagina - 1 })}
            className={`rounded border border-slate-300 px-3 py-1.5 ${pagina <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}>
            ← Anterior
          </Link>
          <span className="text-xs text-slate-500">
            Página {pagina} de {totalPaginas} · {filasFiltradas.length} casas
          </span>
          <Link aria-disabled={pagina >= totalPaginas}
            href={enlacePagina({ q, porPagina, pagina: pagina + 1 })}
            className={`rounded border border-slate-300 px-3 py-1.5 ${pagina >= totalPaginas ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}>
            Siguiente →
          </Link>
        </div>
      )}

      <p className="text-xs text-slate-400">
        &quot;Diferencia&quot; es cuánto bajaron (verde, se está vendiendo) o subieron (rojo, se está
        enfriando) las noches libres desde la primera foto hasta hoy. Sin fotos de sync no hay tendencia
        que mostrar — pulsa &quot;Actualizar datos&quot; en Disponibilidad varios días seguidos para que se rellene.
      </p>
    </div>
  );
}
