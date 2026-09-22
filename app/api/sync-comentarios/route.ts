import { NextResponse } from "next/server";
import { traerComentarios } from "@/lib/googleSheets";
import { seleccionar, actualizar } from "@/lib/db";

/** Lo llama el boton "Sincronizar comentarios". */
export async function POST() {
  const comentarios = await traerComentarios();
  // Solo activas: Lodgify reutiliza el REF de una casa de baja para una nueva,
  // asi que un ref puede tener dos propiedades. Sin este filtro, cual de las
  // dos "gana" el mapa depende del orden de la respuesta.
  const propiedades = await seleccionar<{ property_id: number; ref: string | null }>(
    "propiedades", "select=property_id,ref&activa=eq.true",
  );
  const idPorRef = new Map(propiedades.filter((p) => p.ref).map((p) => [p.ref, p.property_id]));

  const cambios = comentarios
    .map((c) => {
      const property_id = idPorRef.get(c.ref);
      if (!property_id) return null;
      const cuerpo: Record<string, string | number> = {};
      if (c.comentarios_airbnb) cuerpo.comentarios_airbnb = c.comentarios_airbnb;
      if (c.comentarios_booking) cuerpo.comentarios_booking = c.comentarios_booking;
      if (c.nota_airbnb != null) cuerpo.nota_airbnb = c.nota_airbnb;
      if (c.nota_booking != null) cuerpo.nota_booking = c.nota_booking;
      return Object.keys(cuerpo).length ? { property_id, cuerpo } : null;
    })
    .filter((c): c is { property_id: number; cuerpo: Record<string, string | number> } => c !== null);

  // PATCH por propiedad (no upsert): guardar() arrastraría las columnas NOT
  // NULL que no van en `cuerpo` (nombre, etc.) y rompería el insert.
  await Promise.all(
    cambios.map((c) => actualizar("propiedades", `property_id=eq.${c.property_id}`, c.cuerpo)),
  );

  return NextResponse.json({ actualizadas: cambios.length, leidas: comentarios.length });
}
