"use client";
import { useState } from "react";
import { euros, MESES } from "@/lib/calculos";

// Una barra por año = un ramp ORDINAL (el orden importa: es una linea de tiempo),
// no colores categoricos sueltos: un solo tono, mas claro cuanto mas antiguo.
// Anclas validadas con el validador de paletas del skill de dataviz (H del verde
// de la app, C constante): extremo claro a 2:1+ de contraste sobre fondo blanco,
// paso de claridad por encima del minimo de "escalon visible" (0.06).
const H_VERDE = 164.3;
const C_VERDE = 0.115;
const L_CLARO = 0.74;
const L_OSCURO_SUELO = 0.15;
const PASO_L = 0.065;
function colorAnio(indice: number, total: number): string {
  if (total <= 1) return `oklch(${L_CLARO} ${C_VERDE} ${H_VERDE})`;
  const lOscuro = Math.max(L_OSCURO_SUELO, L_CLARO - PASO_L * (total - 1));
  const l = L_CLARO - (indice / (total - 1)) * (L_CLARO - lOscuro);
  return `oklch(${l.toFixed(3)} ${C_VERDE} ${H_VERDE})`;
}

export type AnioResumen = { anio: number; reservas: number; noches: number; ingresos: number };

export type DetalleAnio = {
  anio: number;
  top: {
    nombre: string; zona: string | null; reservas: number; noches: number; ingresos: number;
    desde: string | null; hasta: string | null;
  }[];
};

const fmtFecha = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;

/** Barras de reservas por año, con noches e ingresos al pasar el ratón y el
 *  top 5 de casas de ese año (con su rango ocupado) al pulsar la barra. */
export default function GraficaAnual({ datos, detalle }: { datos: AnioResumen[]; detalle?: DetalleAnio[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);

  if (datos.length === 0) return null;

  const alto = 180;
  const anchoBarra = 28;
  const hueco = 14;
  const margenIzq = 32;
  const ancho = margenIzq + datos.length * (anchoBarra + hueco);
  const maxReservas = Math.max(1, ...datos.map((d) => d.reservas));
  // Ticks del eje en numeros redondos, no en el maximo exacto. El tope del eje
  // (no el ultimo tick, que puede quedar por debajo del maximo real) es lo que
  // fija la escala: si no, la barra mas alta se sale por arriba y el numero
  // que la corona queda recortado por el overflow:hidden del svg.
  const pasoTick = Math.ceil(maxReservas / 4 / 5) * 5 || 1;
  const topeEje = Math.ceil(maxReservas / pasoTick) * pasoTick;
  const ticks = Array.from({ length: topeEje / pasoTick + 1 }, (_, i) => i * pasoTick);
  const escala = (v: number) => (v / (topeEje || 1)) * (alto - 24);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="text-sm font-semibold">Reservas por año</h2>
      <p className="mb-3 text-xs text-slate-500">
        Todo el histórico disponible. Pasa el ratón por una barra para ver noches e ingresos, o pulsa
        para ver el top 5 de casas de ese año.
      </p>
      <div className="overflow-x-auto">
        <svg width={ancho} height={alto + 24} viewBox={`0 0 ${ancho} ${alto + 24}`} className="mx-auto block max-w-full">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={margenIzq} x2={ancho} y1={alto - escala(t)} y2={alto - escala(t)}
                    stroke="#e2e8f0" strokeWidth={1} />
              <text x={margenIzq - 6} y={alto - escala(t)} textAnchor="end" dominantBaseline="middle"
                    className="fill-slate-400" fontSize={10}>{t}</text>
            </g>
          ))}
          {datos.map((d, i) => {
            const x = margenIzq + i * (anchoBarra + hueco);
            const h = escala(d.reservas);
            const y = alto - h;
            const foco = activo === d.anio || seleccionado === d.anio;
            return (
              <g key={d.anio}
                 onMouseEnter={() => setActivo(d.anio)} onMouseLeave={() => setActivo(null)}
                 onFocus={() => setActivo(d.anio)} onBlur={() => setActivo(null)}
                 onClick={() => setSeleccionado(seleccionado === d.anio ? null : d.anio)}
                 onKeyDown={(e) => {
                   if (e.key !== "Enter" && e.key !== " ") return;
                   e.preventDefault();
                   setSeleccionado(seleccionado === d.anio ? null : d.anio);
                 }}
                 tabIndex={0} role="button"
                 aria-label={`${d.anio}: ${d.reservas} reservas, ${d.noches} noches, ${euros(d.ingresos)}. Pulsa para ver el top 5.`}
                 style={{ cursor: "pointer", outline: "none" }}>
                <rect x={x - 6} y={0} width={anchoBarra + 12} height={alto} fill="transparent" />
                <rect x={x} y={y} width={anchoBarra} height={Math.max(h, 1)} rx={4}
                      fill={colorAnio(i, datos.length)} opacity={foco ? 1 : 0.85} />
                <text x={x + anchoBarra / 2} y={y - 6} textAnchor="middle" className="fill-slate-700 font-medium" fontSize={11}>
                  {d.reservas}
                </text>
                <text x={x + anchoBarra / 2} y={alto + 16} textAnchor="middle" className="fill-slate-500" fontSize={11}>
                  {d.anio}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {activo != null && (() => {
        const d = datos.find((x) => x.anio === activo)!;
        return (
          <div className="mt-2 flex gap-4 text-xs text-slate-600">
            <span className="font-medium text-slate-900">{d.anio}</span>
            <span>{d.reservas} reservas</span>
            <span>{d.noches} noches</span>
            <span>{euros(d.ingresos)}</span>
          </div>
        );
      })()}
      {seleccionado != null && (() => {
        const d = detalle?.find((x) => x.anio === seleccionado);
        return (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-xs font-medium text-slate-500">Top 5 casas en {seleccionado}, por reservas</p>
            {!d || d.top.length === 0 ? (
              <p className="text-sm text-slate-500">Sin desglose por casa para {seleccionado}.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2">Casa</th><th className="py-2">Zona</th>
                      <th className="py-2 text-right">Reservas</th>
                      <th className="py-2 text-right">Noches</th>
                      <th className="py-2 text-right">Ingresos</th>
                      <th className="py-2 pl-4">Ocupada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {d.top.map((c, i) => (
                      <tr key={i}>
                        <td className="py-2 font-medium">{c.nombre}</td>
                        <td className="py-2 text-slate-500">{c.zona ?? "—"}</td>
                        <td className="py-2 text-right text-slate-500">{c.reservas}</td>
                        <td className="py-2 text-right">{c.noches}</td>
                        <td className="py-2 text-right">{euros(c.ingresos)}</td>
                        <td className="py-2 pl-4 text-xs text-slate-500 whitespace-nowrap">
                          {c.desde && c.hasta ? `${fmtFecha(c.desde)} – ${fmtFecha(c.hasta)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}
    </section>
  );
}
