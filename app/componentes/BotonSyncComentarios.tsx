"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function BotonSyncComentarios() {
  const [estado, setEstado] = useState<"listo" | "cargando" | string>("listo");
  const router = useRouter();

  async function actualizar() {
    setEstado("cargando");
    const r = await fetch("/api/sync-comentarios", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setEstado(d.error ?? "Falló la sincronización"); return; }
    setEstado(`${d.actualizadas} comentarios · ${d.leidas} filas leídas`);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={actualizar} disabled={estado === "cargando"}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
        {estado === "cargando" ? "Sincronizando…" : "Sincronizar comentarios"}
      </button>
      {estado !== "listo" && estado !== "cargando" && (
        <span className="text-xs text-slate-500">{estado}</span>
      )}
    </div>
  );
}
