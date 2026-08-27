import { NextResponse } from "next/server";
import { traerPropiedades, traerReservas, traerHuecos } from "@/lib/lodgify";
import { guardar } from "@/lib/db";
import { hoy, sumaDias } from "@/lib/calculos";

// Traer las 4.290 reservas son 86 paginas; en paralelo bajan de 50s a ~6s,
// pero sigue sin caber en el tiempo de una pagina normal: por eso va aparte.
export const maxDuration = 60;

async function sincronizar() {
  const propiedades = await traerPropiedades();
  await guardar("propiedades", propiedades, "property_id");

  const reservas = await traerReservas();
  await guardar("reservas", reservas, "id");

  // Foto del dia: sin esto no hay seguimiento, solo estado de hoy.
  const fecha = hoy();
  const huecos = await traerHuecos(fecha, sumaDias(fecha, 365));
  await guardar("huecos_snapshot", huecos.map((h) => ({ ...h, fecha })), "fecha,property_id,inicio");

  return { propiedades: propiedades.length, reservas: reservas.length, huecos: huecos.length, fecha };
}

/** Lo llama el cron de Vercel. */
export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  return NextResponse.json(await sincronizar());
}

/** Lo llama el boton "Actualizar datos" (ya pasó por el login). */
export async function POST() {
  return NextResponse.json(await sincronizar());
}
