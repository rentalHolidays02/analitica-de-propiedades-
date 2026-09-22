"use client";
import { useState } from "react";
import { euros, MESES } from "@/lib/calculos";

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export type CasaComparativa = {
  propertyId: number; nombre: string; zona: string | null; nota: number | null;
  comentariosAirbnb: string | null; comentariosBooking: string | null;
  notaAirbnb: number | null; notaBooking: number | null;
  mensual: { anio: number; mes: number; noches: number; reservas: number; ingresos: number }[];
  diasSemana: { anio: number; conteos: number[] }[];
};

/** Verde mas fuerte cuanto mayor es el valor respecto al maximo de la rejilla. */
function tono(v: number | undefined, max: number): React.CSSProperties {
  if (v == null || max <= 0) return { background: "#f8fafc" };
  const a = 0.08 + 0.82 * (v / max);
  return { background: `rgba(16,120,86,${a.toFixed(3)})`, color: a > 0.55 ? "#fff" : "#0f172a" };
}

function CalendarioAnio({ mensual, anio }: { mensual: CasaComparativa["mensual"]; anio: number }) {
  const deEseAnio = mensual.filter((m) => m.anio === anio);
  const datos = new Map(deEseAnio.map((m) => [m.mes, m.noches]));
  const max = Math.max(0, ...deEseAnio.map((m) => m.noches));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] border-separate border-spacing-[2px] text-center text-[11px]">
        <thead>
          <tr className="text-slate-500">{MESES.map((m) => <th key={m} className="font-normal">{m}</th>)}</tr>
        </thead>
        <tbody>
          <tr>
            {MESES.map((_, i) => {
              const v = datos.get(i + 1);
              return (
                <td key={i} className="rounded px-1 py-1 tabular-nums" style={tono(v, max)}>{v ?? ""}</td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/** Reservas, mes mas fuerte, precio medio y dia de la semana top, para una casa+año. */
function statsDe(c: CasaComparativa, anio: number) {
  const meses = c.mensual.filter((m) => m.anio === anio);
  const noches = meses.reduce((s, m) => s + m.noches, 0);
  const reservas = meses.reduce((s, m) => s + m.reservas, 0);
  const ingresos = meses.reduce((s, m) => s + m.ingresos, 0);
  const precioMedio = noches ? ingresos / noches : null;
  const mesMasReservado = meses.length ? meses.reduce((a, b) => (b.reservas > a.reservas ? b : a)) : null;
  const picoVenta = meses.length ? meses.reduce((a, b) => (b.noches > a.noches ? b : a)) : null;
  const conteos = c.diasSemana.find((d) => d.anio === anio)?.conteos ?? null;
  const maxDia = conteos ? Math.max(...conteos) : 0;
  const diaTop = conteos && maxDia > 0 ? conteos.indexOf(maxDia) : null;
  return { noches, reservas, ingresos, precioMedio, mesMasReservado, picoVenta, diaTop, diaTopN: maxDia };
}

function Tarjeta({ casas, casaId, setCasaId, anio, setAnio }: {
  casas: CasaComparativa[]; casaId: string; setCasaId: (v: string) => void;
  anio: number | null; setAnio: (v: number) => void;
}) {
  // Buscar filtra la lista sin perder la seleccion: si la marcada ya no
  // coincide, se cae a la primera que si coincide (igual que SelectorCasa).
  const [buscarCasa, setBuscarCasa] = useState("");
  const qc = buscarCasa.trim().toLowerCase();
  const casasFiltradas = qc ? casas.filter((x) => x.nombre.toLowerCase().includes(qc)) : casas;
  const siguenCasa = casasFiltradas.some((x) => String(x.propertyId) === casaId);
  const casaIdEfectivo = qc ? (siguenCasa ? casaId : String(casasFiltradas[0]?.propertyId ?? "")) : casaId;

  const c = casas.find((x) => String(x.propertyId) === casaIdEfectivo);
  const aniosDisponibles = [...new Set(c?.mensual.map((m) => m.anio) ?? [])].sort((a, b) => b - a);
  const anioEfectivo = anio != null && aniosDisponibles.includes(anio) ? anio : aniosDisponibles[0];

  const s = c && anioEfectivo != null ? statsDe(c, anioEfectivo) : null;

  const [resumen, setResumen] = useState<string | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [errorResumen, setErrorResumen] = useState<string | null>(null);

  async function pedirResumen() {
    if (!c || !s || anioEfectivo == null) return;
    setCargandoResumen(true);
    setErrorResumen(null);
    const hechos = [
      `Casa: ${c.nombre}${c.zona ? ` (${c.zona})` : ""}, año ${anioEfectivo}.`,
      `Reservas: ${s.reservas}. Noches vendidas: ${s.noches}. Ingresos: ${Math.round(s.ingresos)}€. `
        + `Precio medio por noche: ${s.precioMedio ? Math.round(s.precioMedio) : "sin dato"}€.`,
      s.mesMasReservado && s.mesMasReservado.reservas > 0
        ? `Mes más reservado: ${MESES[s.mesMasReservado.mes - 1]} (${s.mesMasReservado.reservas} reservas).` : "",
      s.picoVenta && s.picoVenta.noches > 0
        ? `Pico de venta: ${MESES[s.picoVenta.mes - 1]} (${s.picoVenta.noches} noches).` : "",
      s.diaTop != null ? `Día que más se reserva: ${DIAS_SEMANA[s.diaTop]}.` : "",
      c.nota != null ? `Nota media en Lodgify: ${c.nota.toFixed(1)}.` : "Sin nota media registrada.",
    ].filter(Boolean).join(" ");
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
    <div className="flex-1 rounded border border-slate-200 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input type="text" value={buscarCasa} onChange={(e) => setBuscarCasa(e.target.value)}
          placeholder="Buscar casa…" className="w-28 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
        <select value={casaIdEfectivo} onChange={(e) => setCasaId(e.target.value)}
          className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {casasFiltradas.length === 0
            ? <option value="">Sin coincidencias</option>
            : casasFiltradas.map((x) => <option key={x.propertyId} value={x.propertyId}>{x.nombre}</option>)}
        </select>
        <select value={anioEfectivo ?? ""} onChange={(e) => setAnio(Number(e.target.value))}
          disabled={aniosDisponibles.length === 0}
          className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
          {aniosDisponibles.length === 0
            ? <option>sin datos</option>
            : aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      {c && <p className="mb-2 text-xs text-slate-500">{c.zona ?? "—"}</p>}

      {!s ? (
        <p className="text-sm text-slate-500">Sin reservas registradas.</p>
      ) : (
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Reservas</dt>
            <dd className="font-medium">{s.reservas}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Noches vendidas</dt>
            <dd className="font-medium">{s.noches}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Ingresos</dt>
            <dd className="font-medium">{euros(s.ingresos)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Precio medio/noche</dt>
            <dd className="font-medium">{euros(s.precioMedio)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Mes más reservado</dt>
            <dd className="font-medium">
              {s.mesMasReservado && s.mesMasReservado.reservas > 0
                ? `${MESES[s.mesMasReservado.mes - 1]} (${s.mesMasReservado.reservas})` : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Pico de venta (noches)</dt>
            <dd className="font-medium">
              {s.picoVenta && s.picoVenta.noches > 0
                ? `${MESES[s.picoVenta.mes - 1]} (${s.picoVenta.noches} noches)` : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Día que más se reserva</dt>
            <dd className="font-medium">
              {s.diaTop != null ? `${DIAS_SEMANA[s.diaTop]} (${s.diaTopN})` : "—"}
            </dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Nota media (Lodgify)</dt>
            <dd className="font-medium">{c!.nota != null ? c!.nota.toFixed(1) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Nota Airbnb</dt>
            <dd className="font-medium">{c!.notaAirbnb != null ? `${c!.notaAirbnb.toFixed(1)}/5` : "—"}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-slate-500">Nota Booking</dt>
            <dd className="font-medium">{c!.notaBooking != null ? `${c!.notaBooking.toFixed(1)}/10` : "—"}</dd>
          </div>
        </dl>
      )}

      {c && (c.comentariosAirbnb || c.comentariosBooking) && (
        <div className="mt-3 space-y-2 text-sm">
          {c.comentariosAirbnb && (
            <div>
              <p className="text-xs font-medium text-slate-500">Comentarios Airbnb</p>
              <p className="whitespace-pre-line text-slate-700">{c.comentariosAirbnb}</p>
            </div>
          )}
          {c.comentariosBooking && (
            <div>
              <p className="text-xs font-medium text-slate-500">Comentarios Booking</p>
              <p className="whitespace-pre-line text-slate-700">{c.comentariosBooking}</p>
            </div>
          )}
        </div>
      )}

      {s && (
        <div className="mt-3">
          <button type="button" onClick={pedirResumen} disabled={cargandoResumen}
            className="rounded bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50">
            {cargandoResumen ? "Pensando…" : "Resumir con IA"}
          </button>
          {errorResumen && <p className="mt-1 text-xs text-red-600">{errorResumen}</p>}
          {resumen && <p className="mt-2 rounded bg-slate-50 p-2 text-sm text-slate-700">{resumen}</p>}
        </div>
      )}

      {c && anioEfectivo != null && (
        <>
          <p className="mb-1 mt-3 text-xs text-slate-500">Noches por mes, {anioEfectivo}</p>
          <CalendarioAnio mensual={c.mensual} anio={anioEfectivo} />
        </>
      )}
    </div>
  );
}

export default function ComparadorCasas({ casas }: { casas: CasaComparativa[] }) {
  const [aId, setAId] = useState(String(casas[0]?.propertyId ?? ""));
  const [bId, setBId] = useState(String(casas[1]?.propertyId ?? casas[0]?.propertyId ?? ""));
  const [aAnio, setAAnio] = useState<number | null>(null);
  const [bAnio, setBAnio] = useState<number | null>(null);

  if (casas.length < 2) {
    return <p className="text-sm text-slate-500">Hacen falta al menos dos casas con reservas para comparar.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Cada casa con su propio año — así se compara cualquier temporada contra cualquier otra.
        Comentarios y nota media se actualizan cada semana desde las hojas de valoraciones.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Tarjeta casas={casas} casaId={aId} setCasaId={setAId} anio={aAnio} setAnio={setAAnio} />
        <Tarjeta casas={casas} casaId={bId} setCasaId={setBId} anio={bAnio} setAnio={setBAnio} />
      </div>
    </div>
  );
}
