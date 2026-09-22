import { NextResponse } from "next/server";
import { traerPropiedades, traerReservas, traerHuecos } from "@/lib/lodgify";
import { traerReservasRH, traerPreciosDiarios, traerRendimiento } from "@/lib/rentalholidays";
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

  // Gestion aporta el precio real de venta y la comision real en euros. Es
  // opcional: si falla o falta la clave, lo ya sincronizado de Lodgify sigue
  // siendo valido y el panel cae a su historico.
  let gestion: { reservas: number; tarifas: number; rendimiento: number } | string;
  try {
    const [deGestion, tarifas] = await Promise.all([
      traerReservasRH(),
      traerPreciosDiarios(fecha, sumaDias(fecha, 365)),
    ]);
    await guardar("reservas_gestion", deGestion, "id");
    await guardar("tarifas_gestion", tarifas, "property_id,fecha");

    // /rendimiento da 500 sin JSON por encima de ~180 dias de rango (probado en
    // vivo), asi que se pide un mes calendario por llamada. Secuencial, no en
    // paralelo: no hay confirmacion de que la API aguante 12 peticiones a la vez.
    const ahora = new Date();
    let filasRendimiento = 0;
    for (let i = 0; i < 12; i++) {
      const anio = ahora.getUTCFullYear();
      const mes = ahora.getUTCMonth() + 1 - i;
      const [a, m] = mes < 1 ? [anio - 1, mes + 12] : [anio, mes];
      const filas = await traerRendimiento(a, m);
      await guardar("rendimiento_gestion", filas.map((r) => ({
        property_id: r.property_id, anio: a, mes: m,
        dias_ocupados: r.occupied_days, ocupacion_pct: r.occupancy_pct,
        ingreso_bruto: r.gross_income, pago_propietario: r.owner_payout,
        comision: r.channel_commissions, iva: r.vat, gastos: r.expenses,
        tasas: r.it_general_fees, beneficio_neto: r.net_benefit,
      })), "property_id,anio,mes");
      filasRendimiento += filas.length;
    }

    gestion = { reservas: deGestion.length, tarifas: tarifas.length, rendimiento: filasRendimiento };
  } catch (e) {
    gestion = e instanceof Error ? e.message : String(e);
  }

  return { propiedades: propiedades.length, reservas: reservas.length, huecos: huecos.length, gestion, fecha };
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
