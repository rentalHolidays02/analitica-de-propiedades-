"use client";
import { useState } from "react";

type Prop = { property_id: number; nombre: string; ref: string | null };

export default function SelectorCasa({ propiedades, valorInicial, name = "casa", placeholder = "Todas las casas" }: {
  propiedades: Prop[]; valorInicial: string; name?: string; placeholder?: string;
}) {
  const [busqueda, setBusqueda] = useState("");
  const [seleccion, setSeleccion] = useState(valorInicial);

  const q = busqueda.trim().toLowerCase();
  const coincide = (p: Prop) => p.nombre.toLowerCase().includes(q) || (p.ref ?? "").toLowerCase().includes(q);
  const filtradas = q ? propiedades.filter((p) => coincide(p) || String(p.property_id) === seleccion) : propiedades;
  // Al buscar, la seleccion tiene que ser una de las que se ven: si la casa
  // marcada quedo fuera del filtro, se pasa a la primera que coincide. Sin eso
  // "Ver" mandaba la seleccion vieja (o "Todas") y parecia que la busqueda no cargaba nada.
  const siguen = filtradas.some((p) => String(p.property_id) === seleccion);
  const valor = q ? (siguen ? seleccion : String(filtradas[0]?.property_id ?? "")) : seleccion;

  return (
    <>
      <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o ref…"
        className="w-48 rounded border border-slate-300 bg-white px-2 py-1.5 text-sm" />
      <select name={name} value={valor} onChange={(e) => setSeleccion(e.target.value)}
        className="rounded border border-slate-300 bg-white px-2 py-1.5 text-sm">
        <option value="">{placeholder}</option>
        {filtradas.map((p) => (
          <option key={p.property_id} value={p.property_id}>
            {p.nombre}{p.ref ? ` (ref ${p.ref})` : ""}
          </option>
        ))}
      </select>
    </>
  );
}
