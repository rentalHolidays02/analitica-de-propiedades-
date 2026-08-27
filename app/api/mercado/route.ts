import { NextResponse } from "next/server";
import { traerHuecos } from "@/lib/lodgify";
import { seleccionar, guardar, insertar, borrar } from "@/lib/db";
import { propiedadesActivas } from "@/lib/consultas";
import { buscarZona, preciosVecinos, limiteMensual } from "@/lib/mercado";
import { hoy, sumaDias } from "@/lib/calculos";

export const maxDuration = 60;

const VENTANA = 60;      // solo se consulta lo que aun se puede vender
const NOCHES_CONSULTA = 7; // estancia tipo para pedir precio comparable

export async function POST() {
  // El tramo gratuito son 200 peticiones al mes: se cuenta antes de gastar.
  const [gasto] = await seleccionar<{ mes: string; peticiones: number }>(
    "v_gasto_mercado", `mes=eq.${hoy().slice(0, 8)}01`,
  );
  const gastadas = gasto?.peticiones ?? 0;
  if (gastadas >= limiteMensual) {
    return NextResponse.json(
      { error: `Ya van ${gastadas} peticiones este mes; el tramo gratuito son ${limiteMensual}.` },
      { status: 429 },
    );
  }

  const fecha = hoy();
  const [propiedades, huecos] = await Promise.all([
    propiedadesActivas(), traerHuecos(fecha, sumaDias(fecha, VENTANA)),
  ]);
  const zonaDe = new Map(propiedades.map((p) => [p.property_id, p.zona]));

  // Un hueco por zona: el mas proximo. Es la fecha por la que interesa preguntar.
  const objetivo = new Map<string, { inicio: string; fin: string }>();
  for (const h of huecos) {
    const zona = zonaDe.get(h.property_id);
    if (!zona || h.fin <= fecha) continue;
    const previo = objetivo.get(zona);
    if (!previo || h.inicio < previo.inicio) objetivo.set(zona, { inicio: h.inicio, fin: h.fin });
  }

  const cache = new Map(
    (await seleccionar<{ zona: string; consulta: string; place_id: string | null }>("zonas_mercado"))
      .map((z) => [z.zona, z]),
  );

  const resumen: { zona: string; vecinos: number; medianaNoche: number | null; error?: string }[] = [];
  let usadas = 0;

  for (const [zona, hueco] of objetivo) {
    if (gastadas + usadas >= limiteMensual) {
      resumen.push({ zona, vecinos: 0, medianaNoche: null, error: "límite mensual alcanzado" });
      continue;
    }
    try {
      let z = cache.get(zona);
      if (!z) {
        const encontrada = await buscarZona(zona);
        usadas++;
        await insertar("peticiones_mercado", { endpoint: "autocomplete", zona });
        if (!encontrada) {
          resumen.push({ zona, vecinos: 0, medianaNoche: null, error: "Airbnb no reconoce la zona" });
          continue;
        }
        z = { zona, consulta: encontrada.consulta, place_id: encontrada.placeId };
        await guardar("zonas_mercado", [z], "zona");
        cache.set(zona, z);
      }

      const checkin = hueco.inicio < fecha ? fecha : hueco.inicio;
      const tope = sumaDias(checkin, NOCHES_CONSULTA);
      const checkout = hueco.fin < tope ? hueco.fin : tope;

      const vecinos = await preciosVecinos(z.consulta, z.place_id, checkin, checkout);
      usadas++;
      await insertar("peticiones_mercado", { endpoint: "search", zona });

      // Repetir la consulta el mismo dia no debe duplicar filas: la mediana se
      // torceria. Se reemplaza lo que ya hubiera de Airbnb para esa zona y fecha.
      await borrar("competencia",
        `zona=eq.${encodeURIComponent(zona)}&fecha_estancia=eq.${checkin}&fuente=eq.airbnb`);
      await insertar("competencia", vecinos.map((v) => ({
        zona,
        competidor: v.enlace || v.nombre,
        fecha_estancia: checkin,
        precio: v.precioNoche,
        fuente: "airbnb",
      })));
      const ordenados = vecinos.map((v) => v.precioNoche).sort((a, b) => a - b);
      const m = ordenados.length >> 1;
      resumen.push({
        zona,
        vecinos: vecinos.length,
        medianaNoche: ordenados.length
          ? (ordenados.length % 2 ? ordenados[m] : (ordenados[m - 1] + ordenados[m]) / 2)
          : null,
      });
    } catch (e) {
      resumen.push({ zona, vecinos: 0, medianaNoche: null, error: (e as Error).message });
    }
  }

  return NextResponse.json({
    zonas: resumen.length,
    peticionesUsadas: usadas,
    peticionesEsteMes: gastadas + usadas,
    limite: limiteMensual,
    resumen,
  });
}
