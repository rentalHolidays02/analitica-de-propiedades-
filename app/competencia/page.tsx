import Link from "next/link";
import { ErrorConfiguracion } from "@/lib/db";
import AvisoConfig from "../componentes/AvisoConfig";
import { traerHuecos } from "@/lib/lodgify";
import {
  propiedadesActivas, referencias, apuntesCompetencia, apuntesFiltrados, apuntesPorPagina, gastoMercado,
} from "@/lib/consultas";
import { limiteMensual } from "@/lib/mercado";
import BotonMercado from "../componentes/BotonMercado";
import { MESES, euros, hoy, sumaDias, mediana, veredictoCompetencia } from "@/lib/calculos";

export const dynamic = "force-dynamic";

const VENTANA = 60; // solo se pregunta por lo que aun se puede vender

const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

type Params = { zona?: string; fuente?: string; pagina?: string };

function enlacePagina({ zona, fuente, pagina }: { zona?: string; fuente?: string; pagina: number }) {
  const q = new URLSearchParams();
  if (zona) q.set("zona", zona);
  if (fuente) q.set("fuente", fuente);
  if (pagina > 1) q.set("pagina", String(pagina));
  const s = q.toString();
  return s ? `/competencia?${s}` : "/competencia";
}

export default async function Competencia({ searchParams }: { searchParams: Promise<Params> }) {
  const { zona: filtroZona, fuente: filtroFuente, pagina: paginaTxt } = await searchParams;
  const pagina = Math.max(1, Number(paginaTxt) || 1);
  const fecha = hoy();
  const limite = sumaDias(fecha, VENTANA);
  const datos = await Promise.all([
    propiedadesActivas(),
    traerHuecos(fecha, limite),
    referencias(),
    apuntesCompetencia(),
    apuntesFiltrados({ zona: filtroZona, fuente: filtroFuente, pagina }),
    gastoMercado(`${fecha.slice(0, 8)}01`),
  ]).catch((e: unknown) => (e instanceof ErrorConfiguracion ? e : Promise.reject(e)));
  if (datos instanceof ErrorConfiguracion) return <AvisoConfig detalle={datos.message} />;
  const [propiedades, huecos, ref, apuntes, apuntesPagina, gasto] = datos;
  const hayMas = apuntesPagina.length > apuntesPorPagina;
  const apuntesMostrados = apuntesPagina.slice(0, apuntesPorPagina);

  const activas = new Map(propiedades.map((p) => [p.property_id, p]));
  const zonas = [...new Set(propiedades.map((p) => p.zona).filter(Boolean))].sort() as string[];

  // Que mirar hoy: solo las casas con hueco de verdad, agrupadas por zona.
  const porZona = new Map<string, { nombre: string; inicio: string; fin: string; noches: number }[]>();
  for (const h of huecos) {
    const casa = activas.get(h.property_id);
    if (!casa?.zona || h.fin <= fecha) continue;
    if (filtroZona && casa.zona !== filtroZona) continue;
    const lista = porZona.get(casa.zona) ?? [];
    lista.push({ nombre: casa.nombre, inicio: h.inicio, fin: h.fin, noches: h.noches });
    porZona.set(casa.zona, lista);
  }

  // Comparativa: tu mediana real contra la mediana de lo apuntado, por zona y mes.
  const apuntesPorClave = new Map<string, number[]>();
  for (const a of apuntes) {
    const k = `${a.zona}|${Number(a.fecha_estancia.slice(5, 7))}`;
    apuntesPorClave.set(k, [...(apuntesPorClave.get(k) ?? []), Number(a.precio)]);
  }
  const comparativa = [...apuntesPorClave.entries()].map(([k, precios]) => {
    const [zona, mes2] = k.split("|");
    const mes = Number(mes2);
    const vecinos = mediana(precios);
    const tuyo = ref.zonaMes.get(`${zona}|${mes}`) ?? null;
    return { zona, mes, vecinos, tuyo, apuntes: precios.length, ...veredictoCompetencia(tuyo, vecinos) };
  })
  .filter((c) => !filtroZona || c.zona === filtroZona)
  .sort((a, b) => a.zona.localeCompare(b.zona) || a.mes - b.mes);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Competencia y decisión de precio</h1>
          <p className="text-sm text-slate-500">
            Lodgify no da precios de la competencia. Se traen de Airbnb, y solo de lo que importa:
            las zonas con hueco en los próximos {VENTANA} días.
          </p>
        </div>
        <form className="flex items-center gap-2">
          <select name="zona" defaultValue={filtroZona ?? ""}
            className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
            <option value="">Todas las zonas</option>
            {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Filtrar</button>
        </form>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Qué conviene mirar hoy</h2>
        {porZona.size === 0 && (
          <p className="text-sm text-slate-500">Nada con hueco en {VENTANA} días. Nada que consultar.</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[...porZona.entries()].sort((a, b) => b[1].length - a[1].length).map(([zona, casas]) => (
            <div key={zona} className="rounded border border-slate-200 p-3">
              <p className="text-sm font-medium">{zona}</p>
              <p className="mb-2 text-xs text-slate-500">{casas.length} huecos por cubrir</p>
              <ul className="space-y-1 text-xs text-slate-600">
                {casas.sort((a, b) => a.inicio.localeCompare(b.inicio)).slice(0, 4).map((c, i) => (
                  <li key={i} className="truncate">
                    {fmtDia(c.inicio)}–{fmtDia(c.fin)} · {c.nombre}
                  </li>
                ))}
                {casas.length > 4 && <li className="text-slate-400">y {casas.length - 4} más</li>}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold">Traer precios automáticamente</h2>
        <p className="mb-3 text-xs text-slate-500">
          Una consulta por zona con hueco, para la fecha del hueco más próximo. Los datos vienen
          de Airbnb a través de omkar.cloud; el tramo gratuito son {limiteMensual} consultas al mes.
        </p>
        <BotonMercado gastadas={gasto[0]?.peticiones ?? 0} limite={limiteMensual} />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold">Traer precios de Booking</h2>
        <p className="mb-3 text-xs text-slate-500">
          Igual, pero de Booking.com via Apify. De pago (~$0.003/hotel), cubierto de sobra por
          el crédito gratis de $5 al mes de la cuenta.
        </p>
        <BotonMercado endpoint="/api/mercado-booking" fuente="Booking" />
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold">Apuntar un precio a mano</h2>
        <p className="mb-3 text-xs text-slate-500">
          Busca en Airbnb o Booking un piso parecido en esa zona para esa fecha y pega el precio por noche.
        </p>
        <form action="/api/competencia" method="post" className="grid gap-2 sm:grid-cols-5">
          <select name="zona" required className="rounded border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Zona…</option>
            {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <input name="competidor" required placeholder="Piso vecino o enlace"
                 className="rounded border border-slate-300 px-2 py-1.5 text-sm sm:col-span-2" />
          <input name="fecha_estancia" type="date" required
                 className="rounded border border-slate-300 px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <input name="precio" type="number" min="1" step="1" required placeholder="€/noche"
                   className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Guardar</button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold">Tú contra los vecinos</h2>
        {comparativa.length === 0 ? (
          <p className="text-sm text-slate-500">Aún no has apuntado ningún precio.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2">Zona</th><th className="py-2">Mes</th>
                  <th className="py-2 text-right">Tú</th><th className="py-2 text-right">Vecinos</th>
                  <th className="py-2 text-right">Apuntes</th><th className="py-2">Qué hacer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparativa.map((c) => (
                  <tr key={`${c.zona}|${c.mes}`}>
                    <td className="py-2 font-medium">{c.semaforo} {c.zona}</td>
                    <td className="py-2 text-slate-500">{MESES[c.mes - 1]}</td>
                    <td className="py-2 text-right">{euros(c.tuyo)}</td>
                    <td className="py-2 text-right">{euros(c.vecinos)}</td>
                    <td className="py-2 text-right text-slate-500">{c.apuntes}</td>
                    <td className="py-2 text-slate-600">{c.frase}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          &quot;Tú&quot; es la mediana de lo que cobraste de verdad ese mes en esa zona, según Lodgify.
          Dentro de ±10% no merece la pena mover el precio.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">Apuntes</h2>
          <form className="flex items-center gap-2">
            {filtroZona && <input type="hidden" name="zona" value={filtroZona} />}
            <select name="fuente" defaultValue={filtroFuente ?? ""}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
              <option value="">Todas las fuentes</option>
              <option value="airbnb">Airbnb</option>
              <option value="booking">Booking</option>
              <option value="manual">Manual</option>
            </select>
            <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Filtrar</button>
          </form>
        </div>
        {apuntesMostrados.length === 0 ? (
          <p className="text-sm text-slate-500">Nada apuntado todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="py-2">Estancia</th><th className="py-2">Zona</th>
                <th className="py-2">Competidor</th><th className="py-2">Fuente</th>
                <th className="py-2 text-right">€/noche</th><th className="py-2 text-right">Apuntado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {apuntesMostrados.map((a) => (
                <tr key={a.id}>
                  <td className="py-2">{fmtDia(a.fecha_estancia)}</td>
                  <td className="py-2 text-slate-500">{a.zona}</td>
                  <td className="py-2 max-w-xs truncate text-slate-600">{a.competidor}</td>
                  <td className="py-2 text-xs text-slate-400">{a.fuente}</td>
                  <td className="py-2 text-right tabular-nums">{euros(Number(a.precio))}</td>
                  <td className="py-2 text-right text-xs text-slate-400">{a.apuntado_en.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(pagina > 1 || hayMas) && (
          <div className="mt-3 flex items-center justify-between text-sm">
            <Link aria-disabled={pagina <= 1}
              href={enlacePagina({ zona: filtroZona, fuente: filtroFuente, pagina: pagina - 1 })}
              className={`rounded border border-slate-300 px-3 py-1.5 ${pagina <= 1 ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}>
              ← Anterior
            </Link>
            <span className="text-xs text-slate-500">Página {pagina}</span>
            <Link aria-disabled={!hayMas}
              href={enlacePagina({ zona: filtroZona, fuente: filtroFuente, pagina: pagina + 1 })}
              className={`rounded border border-slate-300 px-3 py-1.5 ${!hayMas ? "pointer-events-none opacity-40" : "hover:bg-slate-50"}`}>
              Siguiente →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
