import Link from "next/link";
import { ErrorConfiguracion } from "@/lib/db";
import AvisoConfig from "../componentes/AvisoConfig";
import { propiedadesActivas, mensual, llegadasValidas } from "@/lib/consultas";
import { MESES, euros } from "@/lib/calculos";
import SelectorCasa from "./SelectorCasa";
import ComparadorCasas from "./ComparadorCasas";

export const dynamic = "force-dynamic";

const ANIOS_POR_PAGINA = 5;
const COMPARA_POR_PAGINA = 15;

/** Verde mas fuerte cuanto mayor es el valor respecto al maximo de la rejilla. */
function tono(v: number | null, max: number): React.CSSProperties {
  if (v == null || max <= 0) return { background: "#f8fafc" };
  const a = 0.08 + 0.82 * (v / max);
  return { background: `rgba(16,120,86,${a.toFixed(3)})`, color: a > 0.55 ? "#fff" : "#0f172a" };
}

function Rejilla({ titulo, pie, datos, anios, formato }: {
  titulo: string; pie: string;
  datos: Map<string, number>; anios: number[]; formato: (v: number) => string;
}) {
  const max = Math.max(0, ...datos.values());
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <p className="mb-3 text-xs text-slate-500">{pie}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-[2px] text-center text-xs">
          <thead>
            <tr className="text-slate-500">
              <th className="w-12 text-left font-normal" />
              {MESES.map((m) => <th key={m} className="font-normal">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {anios.map((anio) => (
              <tr key={anio}>
                <th className="text-left text-slate-500 font-normal">{anio}</th>
                {MESES.map((_, i) => {
                  const v = datos.get(`${anio}|${i + 1}`) ?? null;
                  return (
                    <td key={i} className="rounded px-1 py-1.5 tabular-nums" style={tono(v, max)}>
                      {v == null ? "" : formato(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {anios.length === 0 && <p className="text-sm text-slate-500">Sin datos todavía. Pulsa &quot;Actualizar datos&quot; en Disponibilidad.</p>}
    </section>
  );
}

export default async function Historico(
  { searchParams }: {
    searchParams: Promise<{ casa?: string; pagina?: string; comparaPagina?: string }>,
  },
) {
  const { casa, pagina: paginaTxt, comparaPagina: comparaPaginaTxt } = await searchParams;
  const pagina = Math.max(1, Number(paginaTxt) || 1);
  const comparaPagina = Math.max(1, Number(comparaPaginaTxt) || 1);
  const id = casa ? Number(casa) : undefined;
  const datos = await Promise.all([propiedadesActivas(), mensual(), llegadasValidas()])
    .catch((e: unknown) => (e instanceof ErrorConfiguracion ? e : Promise.reject(e)));
  if (datos instanceof ErrorConfiguracion) return <AvisoConfig detalle={datos.message} />;
  const [propiedades, filasCompletas, llegadas] = datos;
  // El comparador de dos casas necesita el mensual de TODAS, aunque arriba se
  // haya filtrado a una sola: se filtra aqui en vez de pedirlo dos veces.
  const filas = id ? filasCompletas.filter((f) => f.property_id === id) : filasCompletas;

  const noches = new Map<string, number>();
  const adr = new Map<string, number>();
  const reservas = new Map<string, number>();
  for (const f of filas) {
    const k = `${f.anio}|${f.mes}`;
    noches.set(k, (noches.get(k) ?? 0) + f.noches);
    reservas.set(k, (reservas.get(k) ?? 0) + f.reservas);
    if (f.adr != null) {
      // Sin casa elegida la rejilla de precio es la media de las medianas por casa.
      const previo = adr.get(k);
      adr.set(k, previo == null ? Number(f.adr) : (previo + Number(f.adr)) / 2);
    }
  }

  const ingresos = filas.reduce((s, f) => s + Number(f.ingresos), 0);
  const totalNoches = filas.reduce((s, f) => s + f.noches, 0);
  const totalReservas = filas.reduce((s, f) => s + f.reservas, 0);

  // Mes a mes de cada casa (todos los años), para el comparador.
  const mensualPorCasa = new Map<number, { anio: number; mes: number; noches: number; reservas: number; ingresos: number }[]>();
  for (const f of filasCompletas) {
    const lista = mensualPorCasa.get(f.property_id) ?? [];
    lista.push({ anio: f.anio, mes: f.mes, noches: f.noches, reservas: f.reservas, ingresos: Number(f.ingresos) });
    mensualPorCasa.set(f.property_id, lista);
  }

  // Dia de la semana de llegada, por casa y año: v_mensual no baja a ese detalle.
  const diaSemanaPorCasa = new Map<number, Map<number, number[]>>();
  for (const r of llegadas) {
    const dia = new Date(`${r.llegada}T00:00:00Z`).getUTCDay();
    const porAnio = diaSemanaPorCasa.get(r.property_id) ?? new Map<number, number[]>();
    const conteos = porAnio.get(r.anio) ?? [0, 0, 0, 0, 0, 0, 0];
    conteos[dia]++;
    porAnio.set(r.anio, conteos);
    diaSemanaPorCasa.set(r.property_id, porAnio);
  }

  // Este año, casa por casa. Sin comparar con el año pasado: para eso esta el
  // comparador de dos casas, que ya deja elegir año a cada lado.
  const anioActual = new Date().getFullYear();
  function agregarAnioActual(lista: typeof filas) {
    const porCasa = new Map<number, { nombre: string; zona: string | null; noches: number; reservas: number; ingresos: number }>();
    for (const f of lista) {
      if (f.anio !== anioActual) continue;
      const previo = porCasa.get(f.property_id) ?? { nombre: f.nombre, zona: f.zona, noches: 0, reservas: 0, ingresos: 0 };
      previo.noches += f.noches;
      previo.reservas += f.reservas;
      previo.ingresos += Number(f.ingresos);
      porCasa.set(f.property_id, previo);
    }
    return [...porCasa.entries()].map(([id, v]) => ({ propertyId: id, ...v }))
      .sort((a, b) => a.noches - b.noches);
  }
  const comparativaAnual = agregarAnioActual(filas);
  // El comparador siempre elige entre TODAS las casas, aunque arriba se haya
  // filtrado a una sola: si no, los dos selectores solo tienen esa casa para elegir.
  // Cada lado elige su propio año, asi que no se limita a las dos ultimas temporadas.
  const notaPorCasa = new Map(propiedades.map((p) => [p.property_id, p.nota]));
  const casasComparativa = propiedades
    .filter((p) => mensualPorCasa.has(p.property_id))
    .map((p) => ({
      propertyId: p.property_id, nombre: p.nombre, zona: p.zona, nota: notaPorCasa.get(p.property_id) ?? null,
      mensual: mensualPorCasa.get(p.property_id) ?? [],
      diasSemana: [...(diaSemanaPorCasa.get(p.property_id) ?? new Map()).entries()]
        .map(([anio, conteos]) => ({ anio, conteos })),
    }));
  const comparativaPagina = comparativaAnual.slice(
    (comparaPagina - 1) * COMPARA_POR_PAGINA, comparaPagina * COMPARA_POR_PAGINA,
  );
  const hayMasCompara = comparativaAnual.length > comparaPagina * COMPARA_POR_PAGINA;

  // Paginacion por año: con muchas temporadas las rejillas no caben en una pantalla.
  const todosAnios = [...new Set(filas.map((f) => f.anio))].sort((a, b) => b - a);
  const aniosPagina = todosAnios.slice((pagina - 1) * ANIOS_POR_PAGINA, pagina * ANIOS_POR_PAGINA);
  const hayMasAnios = todosAnios.length > pagina * ANIOS_POR_PAGINA;
  const enlacePagina = (p: number) => {
    const q = new URLSearchParams();
    if (casa) q.set("casa", casa);
    if (p > 1) q.set("pagina", String(p));
    if (comparaPagina > 1) q.set("comparaPagina", String(comparaPagina));
    const s = q.toString();
    return s ? `/historico?${s}` : "/historico";
  };
  const enlaceComparaPagina = (p: number) => {
    const q = new URLSearchParams();
    if (casa) q.set("casa", casa);
    if (pagina > 1) q.set("pagina", String(pagina));
    if (p > 1) q.set("comparaPagina", String(p));
    const s = q.toString();
    return s ? `/historico?${s}` : "/historico";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Histórico de precios y reservas</h1>
          <p className="text-sm text-slate-500">
            Solo reservas confirmadas: las canceladas y las rechazadas quedan fuera.
          </p>
        </div>
        <form className="flex items-center gap-2">
          <SelectorCasa propiedades={propiedades} valorInicial={casa ?? ""} />
          <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Ver</button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Caja titulo="Reservas" valor={totalReservas.toLocaleString("es-ES")} />
        <Caja titulo="Noches vendidas" valor={totalNoches.toLocaleString("es-ES")} />
        <Caja titulo="Ingresos" valor={euros(ingresos)} />
        <Caja titulo="Precio medio/noche" valor={euros(totalNoches ? ingresos / totalNoches : null)} />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold">Este año, casa por casa</h2>
        <p className="mb-3 text-xs text-slate-500">
          Reservas, noches e ingresos de {anioActual}. Las que menos han vendido, arriba.
        </p>
        {comparativaAnual.length === 0 ? (
          <p className="text-sm text-slate-500">Sin datos de {anioActual} todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2">Casa</th><th className="py-2">Zona</th>
                  <th className="py-2 text-right">Reservas</th>
                  <th className="py-2 text-right">Noches</th>
                  <th className="py-2 text-right">Ingresos</th>
                  <th className="py-2 text-right">Precio medio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparativaPagina.map((c) => (
                  <tr key={c.propertyId}>
                    <td className="py-2 font-medium">{c.nombre}</td>
                    <td className="py-2 text-slate-500">{c.zona ?? "—"}</td>
                    <td className="py-2 text-right text-slate-500">{c.reservas}</td>
                    <td className="py-2 text-right">{c.noches}</td>
                    <td className="py-2 text-right">{euros(c.ingresos)}</td>
                    <td className="py-2 text-right text-slate-500">{euros(c.noches ? c.ingresos / c.noches : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(comparaPagina > 1 || hayMasCompara) && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <Link aria-disabled={comparaPagina <= 1} href={enlaceComparaPagina(comparaPagina - 1)}
              className={`rounded border border-slate-300 px-3 py-1.5 ${comparaPagina <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}>
              ← Anterior
            </Link>
            <span className="text-xs text-slate-500">Página {comparaPagina}</span>
            <Link aria-disabled={!hayMasCompara} href={enlaceComparaPagina(comparaPagina + 1)}
              className={`rounded border border-slate-300 px-3 py-1.5 ${!hayMasCompara ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}>
              Siguiente →
            </Link>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold">Comparar dos casas</h2>
        <p className="mb-3 text-xs text-slate-500">
          Elige casa y año en cada lado — reservas, mes fuerte, precio medio y nota, lado a lado.
        </p>
        <ComparadorCasas casas={casasComparativa} />
      </section>

      <Rejilla titulo="Noches vendidas por mes" pie="Cuanto más oscuro, más lleno. Los huecos claros son los meses que nunca se venden."
               datos={noches} anios={aniosPagina} formato={(v) => String(Math.round(v))} />
      <Rejilla titulo="Precio por noche (€)" pie="Mediana de lo cobrado ese mes. Comparando filas ves si este año vas por encima o por debajo."
               datos={adr} anios={aniosPagina} formato={(v) => String(Math.round(v))} />
      <Rejilla titulo="Reservas por mes" pie="Número de reservas, no de noches: sirve para ver si vendes muchas estancias cortas o pocas largas."
               datos={reservas} anios={aniosPagina} formato={(v) => String(Math.round(v))} />

      {(pagina > 1 || hayMasAnios) && (
        <div className="flex items-center justify-between text-sm">
          <Link aria-disabled={pagina <= 1} href={enlacePagina(pagina - 1)}
            className={`rounded border border-slate-300 bg-white px-3 py-1.5 ${pagina <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}>
            ← Años más recientes
          </Link>
          <span className="text-xs text-slate-500">
            {aniosPagina[0]}–{aniosPagina[aniosPagina.length - 1]}
          </span>
          <Link aria-disabled={!hayMasAnios} href={enlacePagina(pagina + 1)}
            className={`rounded border border-slate-300 bg-white px-3 py-1.5 ${!hayMasAnios ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}>
            Años más antiguos →
          </Link>
        </div>
      )}

    </div>
  );
}

function Caja({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
    </div>
  );
}
