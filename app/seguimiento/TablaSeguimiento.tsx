"use client";
import { useState } from "react";
import { sumaDias } from "@/lib/calculos";

export type Ocupacion = { dia: number | null; semana: number | null; mes: number | null; seisMeses: number | null };
export type FilaSeguimiento = {
  propertyId: number; nombre: string; zona: string | null;
  inicial: number | null; actual: number | null; delta: number | null;
  serie: number[]; ocupacion: Ocupacion;
  mensual: { anio: number; mes: number; noches: number }[];
  huecos: { inicio: string; fin: string }[];
  reservas: { inicio: string; fin: string }[];
};

const MESES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const DIAS_SEMANA_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"]; // orden de Date.getDay()
const DIAS_PERIODO: Record<keyof Ocupacion, number> = { dia: 1, semana: 7, mes: 30, seisMeses: 180 };

const pad2 = (n: number) => String(n).padStart(2, "0");
const fechaDe = (anio: number, mes: number, dia: number) => `${anio}-${pad2(mes)}-${pad2(dia)}`;
function diaSemanaDe(f: string) {
  const [y, m, d] = f.split("-").map(Number);
  return DIAS_SEMANA_CORTO[new Date(y, m - 1, d).getDay()];
}

/** Casillas del mes en orden de calendario (lunes primero), con huecos null para completar semanas. */
function celdasDelMes(anio: number, mes: number): (number | null)[] {
  const primerDia = new Date(anio, mes - 1, 1).getDay(); // 0=domingo..6=sabado
  const offset = (primerDia + 6) % 7; // lunes=0
  const ultimoDia = new Date(anio, mes, 0).getDate();
  const celdas: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= ultimoDia; d++) celdas.push(d);
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}

function CalendarioCasa({ huecos, reservas, mensual, periodo, ultimaFecha, anio, mes, setAnio, setMes }: {
  huecos: { inicio: string; fin: string }[]; reservas: { inicio: string; fin: string }[];
  mensual: { anio: number; mes: number; noches: number }[];
  periodo: keyof Ocupacion; ultimaFecha: string | null;
  anio: number; mes: number; setAnio: (v: number) => void; setMes: (v: number) => void;
}) {
  function mover(delta: number) {
    let m = mes + delta, a = anio;
    if (m < 1) { m = 12; a -= 1; } else if (m > 12) { m = 1; a += 1; }
    setAnio(a); setMes(m);
  }

  // Futuro: huecos_snapshot (calendario real de Lodgify, incluye bloqueos).
  // Pasado: huecos_snapshot no guarda historial, asi que se mira si hubo una
  // reserva de verdad ese dia.
  const libreFuturo = (f: string) => huecos.some((h) => h.inicio <= f && f < h.fin);
  const reservadoPasado = (f: string) => reservas.some((r) => r.inicio <= f && f < r.fin);
  const libre = (f: string) => (f < ultimaFecha! ? !reservadoPasado(f) : libreFuturo(f));

  if (!ultimaFecha) return <p className="text-xs text-slate-400">Sin foto reciente para mostrar el calendario.</p>;

  // "1 día"/"1 semana" no caben (ni tienen sentido) en un mes entero: se
  // muestran solo esos dias, la misma ventana exacta que usa la ocupación de arriba.
  if (periodo === "dia" || periodo === "semana") {
    const dias = DIAS_PERIODO[periodo];
    const fechas = Array.from({ length: dias }, (_, i) => sumaDias(ultimaFecha, i));
    return (
      <div>
        <div className={`grid gap-1 ${dias === 1 ? "max-w-[72px] grid-cols-1" : "grid-cols-7"}`}>
          {fechas.map((f) => {
            const esLibre = libre(f);
            return (
              <div key={f} className={`flex aspect-square flex-col items-center justify-center rounded text-xs ${
                esLibre ? "bg-slate-100 text-slate-500" : "bg-emerald-600 text-white"
              }`}>
                <span className="text-[10px] opacity-70">{diaSemanaDe(f)}</span>
                <span className="tabular-nums">{Number(f.slice(8, 10))}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> reservado</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-100" /> libre</span>
          <span>{PERIODOS.find((p) => p.clave === periodo)?.etiqueta} desde hoy</span>
        </p>
      </div>
    );
  }

  const finPeriodo = sumaDias(ultimaFecha, DIAS_PERIODO[periodo]);
  const enPeriodo = (f: string) => f >= ultimaFecha && f < finPeriodo;
  const celdas = celdasDelMes(anio, mes);
  const totalMesPasado = mensual.find((x) => x.anio === anio && x.mes === mes);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => mover(-1)} aria-label="Mes anterior"
          className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">‹</button>
        <span className="text-sm font-medium">{MESES_CORTO[mes - 1]} {anio}</span>
        <button type="button" onClick={() => mover(1)} aria-label="Mes siguiente"
          className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">›</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400">
        {DIAS_SEMANA.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {celdas.map((dia, i) => {
          if (dia == null) return <div key={i} />;
          const f = fechaDe(anio, mes, dia);
          const esLibre = libre(f);
          return (
            <div key={i} className={`flex aspect-square items-center justify-center rounded text-xs tabular-nums ${
                esLibre ? "bg-slate-100 text-slate-500" : "bg-emerald-600 text-white"
              } ${enPeriodo(f) ? "ring-2 ring-inset ring-slate-900" : ""}`}>
              {dia}
            </div>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" /> reservado</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-100" /> libre</span>
        <span>recuadro = {PERIODOS.find((p) => p.clave === periodo)?.etiqueta} desde hoy</span>
      </p>
      {totalMesPasado && (
        <p className="mt-1 text-[11px] text-slate-400">
          Ese mes se vendieron {totalMesPasado.noches} noches según el histórico.
        </p>
      )}
    </div>
  );
}

const PERIODOS: { clave: keyof Ocupacion; etiqueta: string }[] = [
  { clave: "dia", etiqueta: "1 día" },
  { clave: "semana", etiqueta: "1 semana" },
  { clave: "mes", etiqueta: "1 mes" },
  { clave: "seisMeses", etiqueta: "6 meses" },
];

function Sparkline({ valores, alto = 32 }: { valores: number[]; alto?: number }) {
  if (valores.length < 2) return <span className="text-xs text-slate-400">sin histórico</span>;
  const w = 120, h = alto, pad = 2;
  const max = Math.max(...valores, 1);
  const min = Math.min(...valores, 0);
  const rango = max - min || 1;
  const paso = (w - pad * 2) / (valores.length - 1);
  const puntos = valores.map((v, i) => {
    const x = pad + i * paso;
    const y = h - pad - ((v - min) / rango) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const mejora = valores[valores.length - 1] <= valores[0];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={puntos} fill="none" stroke={mejora ? "#16a34a" : "#dc2626"} strokeWidth="1.5" />
    </svg>
  );
}

const anioActual = new Date().getFullYear();
const mesActual = new Date().getMonth() + 1;

export default function TablaSeguimiento({ filas, historialDias, ultimaFecha }: {
  filas: FilaSeguimiento[]; historialDias: number; ultimaFecha: string | null;
}) {
  const [abierta, setAbierta] = useState<FilaSeguimiento | null>(null);
  const [periodo, setPeriodo] = useState<keyof Ocupacion>("semana");
  const [anio, setAnio] = useState(anioActual);
  const [mes, setMes] = useState(mesActual);
  const [resumen, setResumen] = useState<string | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [errorResumen, setErrorResumen] = useState<string | null>(null);

  function abrir(f: FilaSeguimiento) {
    setAbierta(f);
    setPeriodo("semana");
    setAnio(anioActual);
    setMes(mesActual);
    setResumen(null);
    setErrorResumen(null);
  }

  function cambiarPeriodo(p: keyof Ocupacion) {
    setPeriodo(p);
    setAnio(anioActual);
    setMes(mesActual);
  }

  async function pedirResumen() {
    if (!abierta) return;
    setCargandoResumen(true);
    setErrorResumen(null);
    const { nombre, zona, delta, ocupacion } = abierta;
    const tendencia = delta == null ? "Sin foto anterior para comparar la tendencia."
      : delta > 0 ? `Se vendieron ${delta} noches libres en los últimos ${historialDias} días.`
      : delta < 0 ? `Aparecieron ${-delta} noches libres nuevas en los últimos ${historialDias} días.`
      : `Sin cambios en los últimos ${historialDias} días.`;
    const hechos = [
      `Casa: ${nombre}${zona ? ` (${zona})` : ""}.`,
      tendencia,
      `Ocupación de las próximas fechas: ${ocupacion.dia ?? "sin dato"}% en 1 día, `
        + `${ocupacion.semana ?? "sin dato"}% en 1 semana, ${ocupacion.mes ?? "sin dato"}% en 1 mes, `
        + `${ocupacion.seisMeses ?? "sin dato"}% en 6 meses.`,
    ].join(" ");
    try {
      const r = await fetch("/api/resumen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hechos }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Error al pedir el resumen");
      setResumen(data.resumen);
    } catch (e) {
      setErrorResumen(e instanceof Error ? e.message : "Error al pedir el resumen");
    } finally {
      setCargandoResumen(false);
    }
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Casa</th>
              <th className="px-3 py-2">Zona</th>
              <th className="px-3 py-2 text-right">Hace {historialDias} d</th>
              <th className="px-3 py-2 text-right">Hoy</th>
              <th className="px-3 py-2 text-right">Diferencia</th>
              <th className="px-3 py-2">Tendencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filas.map((f) => (
              <tr key={f.propertyId} onClick={() => abrir(f)}
                className="cursor-pointer hover:bg-slate-50">
                <td className="px-3 py-2 font-medium">{f.nombre}</td>
                <td className="px-3 py-2 text-slate-500">{f.zona ?? "—"}</td>
                <td className="px-3 py-2 text-right text-slate-500">{f.inicial ?? "—"}</td>
                <td className="px-3 py-2 text-right font-medium">{f.actual ?? "—"}</td>
                <td className={`px-3 py-2 text-right font-medium ${
                  f.delta == null ? "text-slate-400" : f.delta > 0 ? "text-emerald-600" : f.delta < 0 ? "text-red-600" : "text-slate-500"
                }`}>
                  {f.delta == null ? "—" : f.delta > 0 ? `−${f.delta} noches` : f.delta < 0 ? `+${-f.delta} noches` : "sin cambios"}
                </td>
                <td className="px-3 py-2"><Sparkline valores={f.serie} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length === 0 && (
          <p className="px-3 py-6 text-sm text-slate-500">No hay propiedades activas.</p>
        )}
      </div>

      {abierta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
             onClick={() => setAbierta(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{abierta.nombre}</h3>
                <p className="text-xs text-slate-500">{abierta.zona ?? "—"}</p>
              </div>
              <button onClick={() => setAbierta(null)} aria-label="Cerrar"
                className="text-slate-400 hover:text-slate-700">✕</button>
            </div>

            <div className="my-3 flex gap-1">
              {PERIODOS.map((p) => (
                <button key={p.clave} onClick={() => cambiarPeriodo(p.clave)}
                  className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                    periodo === p.clave ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {p.etiqueta}
                </button>
              ))}
            </div>

            <div className="rounded border border-slate-200 p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-slate-500">Ocupación</p>
              <p className="mt-1 text-3xl font-semibold">
                {abierta.ocupacion[periodo] == null ? "—" : `${abierta.ocupacion[periodo]}%`}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {abierta.ocupacion[periodo] == null
                  ? "Sin foto reciente para calcularlo."
                  : `de las noches de los próximos ${PERIODOS.find((p) => p.clave === periodo)?.etiqueta}`}
              </p>
            </div>

            <div className="mt-3">
              <p className="mb-1 text-xs text-slate-500">Tendencia de noches libres</p>
              <Sparkline valores={abierta.serie} alto={40} />
            </div>

            <div className="mt-3">
              <button type="button" onClick={pedirResumen} disabled={cargandoResumen}
                className="rounded bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50">
                {cargandoResumen ? "Pensando…" : "Resumir con IA"}
              </button>
              {errorResumen && <p className="mt-1 text-xs text-red-600">{errorResumen}</p>}
              {resumen && <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700">{resumen}</p>}
            </div>

            <div className="mt-4">
              <p className="mb-1 text-xs text-slate-500">Calendario</p>
              <CalendarioCasa huecos={abierta.huecos} reservas={abierta.reservas} mensual={abierta.mensual} periodo={periodo}
                ultimaFecha={ultimaFecha} anio={anio} mes={mes} setAnio={setAnio} setMes={setMes} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
