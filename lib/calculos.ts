// Reglas de negocio puras: precio sugerido y veredicto frente a la competencia.
// Sin fetch, sin React: se pueden probar sueltas.

export const MESES = ["ene", "feb", "mar", "abr", "may", "jun",
                      "jul", "ago", "sep", "oct", "nov", "dic"];

const NOCHES_LARGAS = 10;   // racha asi de larga sin vender = no se esta vendiendo
const DESCUENTO_LARGO = 0.92;
const RECARGO_PICO = 1.05;
const MARGEN_COMPETENCIA = 0.10; // dentro de +-10% no vale la pena mover el precio

export type Semaforo = "🔴" | "🟡" | "🟢" | "⚪";

export type Referencias = {
  casaMes: Map<string, number>;  // `${property_id}|${mes}`
  casa: Map<number, number>;
  zonaMes: Map<string, number>;  // `${zona}|${mes}`
};

const aCinco = (x: number) => Math.round(x / 5) * 5;
const noches = (n: number) => (n === 1 ? "1 noche" : `${n} noches`);

/** La 1a quincena de agosto es pico de demanda: ahi no se regala precio. */
function tocaPico(inicio: string, fin: string): boolean {
  const anio = Number(inicio.slice(0, 4));
  return Date.parse(inicio) <= Date.parse(`${anio}-08-15`)
      && Date.parse(fin)    >= Date.parse(`${anio}-08-01`);
}

/**
 * Precio para un hueco, siempre a partir de lo que ESA casa ya cobro.
 * Tres respaldos, de mas preciso a mas general: casa+mes -> casa -> zona+mes.
 */
export function precioSugerido(
  hueco: { property_id: number; inicio: string; fin: string; noches: number },
  zona: string | null,
  ref: Referencias,
): { precio: number | null; semaforo: Semaforo; motivo: string; tuPrecio: number | null } {
  const mes = Number(hueco.inicio.slice(5, 7));
  let base = ref.casaMes.get(`${hueco.property_id}|${mes}`);
  let origen = `Tú cobraste en ${MESES[mes - 1]}`;
  if (base == null) { base = ref.casa.get(hueco.property_id); origen = "Tu precio medio"; }
  if (base == null && zona) {
    base = ref.zonaMes.get(`${zona}|${mes}`);
    origen = `Tus casas de ${zona} en ${MESES[mes - 1]}`;
  }

  if (base == null) {
    return {
      precio: null, semaforo: "⚪", tuPrecio: null,
      motivo: `${noches(hueco.noches)} libres. Esta casa aún no tiene histórico de precios, así que no puedo sugerir tarifa.`,
    };
  }

  const tuPrecio = Math.round(base);
  if (tocaPico(hueco.inicio, hueco.fin) && hueco.noches < NOCHES_LARGAS) {
    const precio = aCinco(base * RECARGO_PICO);
    return { precio, semaforo: "🟢", tuPrecio,
      motivo: `${origen} ${tuPrecio}€ · ${noches(hueco.noches)} en pleno agosto → puedes pedir ${precio}€.` };
  }
  if (hueco.noches >= NOCHES_LARGAS) {
    const precio = aCinco(base * DESCUENTO_LARGO);
    return { precio, semaforo: "🔴", tuPrecio,
      motivo: `${origen} ${tuPrecio}€ · ${noches(hueco.noches)} sin vender → baja a ${precio}€ para llenar.` };
  }
  const precio = aCinco(base);
  return { precio, semaforo: "🟡", tuPrecio,
    motivo: `${origen} ${tuPrecio}€ · ${noches(hueco.noches)} libres → mantén tu precio: ${precio}€.` };
}

export const mediana = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Tu precio contra la mediana de lo apuntado de los vecinos. */
export function veredictoCompetencia(tuyo: number | null, vecinos: number | null) {
  if (tuyo == null || vecinos == null) {
    return { accion: "—", semaforo: "⚪" as Semaforo, frase: "Faltan datos para comparar." };
  }
  const dif = (tuyo - vecinos) / vecinos;
  const pct = Math.abs(Math.round(dif * 100));
  if (dif > MARGEN_COMPETENCIA) {
    return { accion: "BAJAR", semaforo: "🔴" as Semaforo,
      frase: `Tú ${Math.round(tuyo)}€, vecinos ${Math.round(vecinos)}€ — estás ${pct}% más caro → baja.` };
  }
  if (dif < -MARGEN_COMPETENCIA) {
    return { accion: "SUBIR", semaforo: "🟢" as Semaforo,
      frase: `Tú ${Math.round(tuyo)}€, vecinos ${Math.round(vecinos)}€ — estás ${pct}% más barato → puedes subir.` };
  }
  return { accion: "MANTENER", semaforo: "🟡" as Semaforo,
    frase: `Tú ${Math.round(tuyo)}€, vecinos ${Math.round(vecinos)}€ — estás en precio de mercado.` };
}

/** Noches de un hueco que caen dentro de la ventana [desde, hasta). */
export function nochesEnVentana(inicio: string, fin: string, desde: string, hasta: string) {
  const i = Math.max(Date.parse(inicio), Date.parse(desde));
  const f = Math.min(Date.parse(fin), Date.parse(hasta));
  return Math.max(0, Math.round((f - i) / 86_400_000));
}

export const hoy = () => new Date().toISOString().slice(0, 10);
export const sumaDias = (fecha: string, dias: number) =>
  new Date(Date.parse(fecha) + dias * 86_400_000).toISOString().slice(0, 10);
export const euros = (n: number | null | undefined) =>
  n == null ? "—" : `${Math.round(n).toLocaleString("es-ES")} €`;
