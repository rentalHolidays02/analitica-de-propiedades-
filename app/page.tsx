import { ErrorConfiguracion } from "@/lib/db";
import AvisoConfig from "./componentes/AvisoConfig";
import { traerHuecos } from "@/lib/lodgify";
import { propiedadesActivas, referencias, seguimiento, resumenSnapshots } from "@/lib/consultas";
import { precioSugerido, nochesEnVentana, hoy, sumaDias, MESES, euros } from "@/lib/calculos";
import BotonSync from "./componentes/BotonSync";

// La disponibilidad se lee en vivo de Lodgify (0,6s) y no se cachea: es el dato
// que no puede estar desfasado, porque de el salen las recomendaciones de precio.
export const dynamic = "force-dynamic";

const VENTANA = 90; // dias hacia delante para "noches libres"

const fmtDia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

async function cargar(fecha: string, hastaFetch: string) {
  return Promise.all([
    propiedadesActivas(),
    traerHuecos(fecha, hastaFetch),
    referencias(),
    seguimiento(),
    resumenSnapshots(2),
  ]);
}

const COLORES = [
  { valor: "🔴", etiqueta: "🔴 Bajar precio" },
  { valor: "🟡", etiqueta: "🟡 Mantener" },
  { valor: "🟢", etiqueta: "🟢 Pico de demanda" },
  { valor: "⚪", etiqueta: "⚪ Sin histórico" },
];

export default async function Disponibilidad(
  { searchParams }: {
    searchParams: Promise<{ zona?: string; color?: string; orden?: string; desde?: string; hasta?: string }>,
  },
) {
  const { zona, color, orden, desde, hasta } = await searchParams;
  const fecha = hoy();
  // No se mira hacia atras: si piden un "desde" pasado, se recorta a hoy.
  const inicioVentana = desde && desde > fecha ? desde : fecha;
  const finVentana = hasta && hasta > inicioVentana ? hasta : sumaDias(inicioVentana, VENTANA);
  const diasVentana = Math.round((Date.parse(finVentana) - Date.parse(inicioVentana)) / 86_400_000);
  // Lodgify se pide hasta 365 dias o hasta la fecha elegida, lo que sea mas lejos.
  const datos = await cargar(fecha, finVentana > sumaDias(fecha, 365) ? finVentana : sumaDias(fecha, 365))
    .catch((e: unknown) => (e instanceof ErrorConfiguracion ? e : Promise.reject(e)));
  if (datos instanceof ErrorConfiguracion) return <AvisoConfig detalle={datos.message} />;
  const [propiedades, huecos, ref, seg, snaps] = datos;

  const activas = new Map(propiedades.map((p) => [p.property_id, p]));
  const diasHueco = new Map(seg.map((s) => [s.property_id, s.dias_con_hueco]));
  const zonas = [...new Set(propiedades.map((p) => p.zona).filter(Boolean))].sort() as string[];

  const porCasa = new Map<number, typeof huecos>();
  for (const h of huecos) {
    if (!activas.has(h.property_id)) continue;
    if (h.fin <= inicioVentana) continue;
    const lista = porCasa.get(h.property_id) ?? [];
    lista.push(h);
    porCasa.set(h.property_id, lista);
  }

  const filas = [...porCasa.entries()].map(([id, hs]) => {
    const casa = activas.get(id)!;
    const proximo = hs.reduce((a, b) => (a.inicio <= b.inicio ? a : b));
    const nochesVentana = hs.reduce((s, h) => s + nochesEnVentana(h.inicio, h.fin, inicioVentana, finVentana), 0);
    // El hueco puede ser mas largo que la ventana elegida (p.ej. 366 noches con
    // solo 4 dias filtrados): las fechas mostradas ya se recortan a la ventana,
    // así que las noches mostradas junto a ellas tienen que recortarse igual.
    // El motivo/precio sugerido sigue usando el hueco entero: la racha real sin
    // vender no cambia solo porque se filtre la vista.
    const proximoNoches = nochesEnVentana(proximo.inicio, proximo.fin, inicioVentana, finVentana);
    return { casa, proximo, proximoNoches, nochesVentana, dias: diasHueco.get(id) ?? 0,
             ...precioSugerido(proximo, casa.zona, ref) };
  })
  .filter((f) => f.nochesVentana > 0 && (!zona || f.casa.zona === zona) && (!color || f.semaforo === color))
  .sort((a, b) => {
    // Con un color elegido ya son todas iguales: el orden manda entero.
    if (!color) {
      const porSemaforo = "🔴🟡🟢⚪".indexOf(a.semaforo) - "🔴🟡🟢⚪".indexOf(b.semaforo);
      if (porSemaforo !== 0) return porSemaforo;
    }
    return orden === "asc" ? a.nochesVentana - b.nochesVentana : b.nochesVentana - a.nochesVentana;
  });

  const [ultima, previa] = snaps;
  const delta = ultima && previa ? previa.noches_libres - ultima.noches_libres : null;
  const totalNoches = filas.reduce((s, f) => s + f.nochesVentana, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Disponibilidad y seguimiento</h1>
          <p className="text-sm text-slate-500">
            Calendario real de Lodgify a día de hoy. {fmtDia(inicioVentana)} – {fmtDia(finVentana)} ({diasVentana} días).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form className="flex flex-wrap items-center gap-2">
            <input type="date" name="desde" defaultValue={desde ?? ""} min={fecha}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
            <span className="text-xs text-slate-400">a</span>
            <input type="date" name="hasta" defaultValue={hasta ?? ""} min={desde || fecha}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
            <select name="zona" defaultValue={zona ?? ""}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
              <option value="">Todas las zonas</option>
              {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <select name="color" defaultValue={color ?? ""}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
              <option value="">Todos los colores</option>
              {COLORES.map((c) => <option key={c.valor} value={c.valor}>{c.etiqueta}</option>)}
            </select>
            <select name="orden" defaultValue={orden ?? "desc"}
              className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
              <option value="desc">Más noches libres primero</option>
              <option value="asc">Menos noches libres primero</option>
            </select>
            <button className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Ver</button>
          </form>
          <BotonSync />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Caja titulo="Casas con hueco" valor={String(filas.length)} pie={`de ${propiedades.length} activas`} />
        <Caja titulo={`Noches sin vender (${diasVentana} d)`} valor={String(totalNoches)}
              pie={filas[0] ? `la peor: ${filas[0].casa.nombre}` : "—"} />
        <Caja titulo="Desde la foto anterior"
              valor={delta == null ? "—" : `${delta > 0 ? "−" : "+"}${Math.abs(delta)}`}
              pie={delta == null
                ? "hace falta una segunda foto"
                : delta > 0 ? `se vendieron ${delta} noches desde el ${fmtDia(previa.fecha)}`
                            : delta < 0 ? `${-delta} noches nuevas libres desde el ${fmtDia(previa.fecha)}`
                                        : "sin cambios"} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Casa</th>
              <th className="px-3 py-2">Zona</th>
              <th className="px-3 py-2">Próximo hueco</th>
              <th className="px-3 py-2 text-right">Noches</th>
              <th className="px-3 py-2 text-right">Libres {diasVentana} d</th>
              <th className="px-3 py-2 text-right">Días seguidos</th>
              <th className="px-3 py-2 text-right">Tu precio</th>
              <th className="px-3 py-2 text-right">Sugerido</th>
              <th className="px-3 py-2">Motivo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((f) => (
              <tr key={f.casa.property_id} className="align-top">
                <td className="px-3 py-2">
                  <span className="mr-1">{f.semaforo}</span>
                  <span className="font-medium">{f.casa.nombre}</span>
                </td>
                <td className="px-3 py-2 text-slate-500">{f.casa.zona ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {fmtDia(f.proximo.inicio < inicioVentana ? inicioVentana : f.proximo.inicio)}
                  {" – "}
                  {fmtDia(f.proximo.fin > finVentana ? finVentana : f.proximo.fin)}
                </td>
                <td className="px-3 py-2 text-right">{f.proximoNoches}</td>
                <td className="px-3 py-2 text-right font-medium">{f.nochesVentana}</td>
                <td className="px-3 py-2 text-right text-slate-500">{f.dias || "—"}</td>
                <td className="px-3 py-2 text-right text-slate-500">{euros(f.tuPrecio)}</td>
                <td className="px-3 py-2 text-right font-semibold">{euros(f.precio)}</td>
                <td className="px-3 py-2 text-slate-600">{f.motivo}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && (
          <p className="px-3 py-6 text-sm text-slate-500">
            Ninguna casa activa tiene huecos entre el {fmtDia(inicioVentana)} y el {fmtDia(finVentana)}.
          </p>
        )}
      </div>

      <p className="text-xs text-slate-400">
        &quot;Días seguidos&quot; cuenta las fotos diarias en las que esa casa ya salía con hueco;
        empieza a tener sentido a partir de la segunda actualización.
      </p>
    </div>
  );
}

function Caja({ titulo, valor, pie }: { titulo: string; valor: string; pie: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold">{valor}</p>
      <p className="mt-1 text-xs text-slate-500">{pie}</p>
    </div>
  );
}
