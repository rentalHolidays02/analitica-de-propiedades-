"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Fila = { zona: string; vecinos: number; medianaNoche: number | null; error?: string };

export default function BotonMercado({
  endpoint = "/api/mercado", fuente = "Airbnb", gastadas, limite,
}: { endpoint?: string; fuente?: string; gastadas?: number; limite?: number }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [resumen, setResumen] = useState<Fila[] | null>(null);
  const router = useRouter();

  async function traer() {
    setCargando(true);
    setError("");
    setResumen(null);
    const r = await fetch(endpoint, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setCargando(false);
    if (!r.ok) { setError(d.error ?? "No se pudo consultar el mercado"); return; }
    setResumen(d.resumen ?? []);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={traer} disabled={cargando}
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {cargando ? `Consultando ${fuente}…` : `Traer precios de ${fuente}`}
        </button>
        {limite != null && (
          <span className="text-xs text-slate-500">
            {gastadas} de {limite} consultas gastadas este mes · una por zona con hueco
          </span>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {resumen && (
        <ul className="space-y-1 text-xs text-slate-600">
          {resumen.map((f) => (
            <li key={f.zona}>
              <span className="font-medium">{f.zona}</span>:{" "}
              {f.error
                ? <span className="text-red-600">{f.error}</span>
                : `${f.vecinos} vecinos, mediana ${f.medianaNoche == null ? "—" : `${Math.round(f.medianaNoche)}€/noche`}`}
            </li>
          ))}
          {resumen.length === 0 && <li>Ninguna zona con hueco que consultar.</li>}
        </ul>
      )}
    </div>
  );
}
