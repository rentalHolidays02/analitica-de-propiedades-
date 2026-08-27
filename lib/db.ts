// Acceso a Supabase por su API REST (PostgREST) con fetch. Sin SDK.
// La service_role key solo vive en el servidor: nada de esto llega al navegador.

/** Falta configuracion o la clave no vale. Las paginas lo distinguen de un fallo
 *  real para poder explicarlo en pantalla en vez de romper con un 500. */
export class ErrorConfiguracion extends Error {}
const URL_BASE = () => {
  const u = process.env.SUPABASE_URL?.trim();
  if (!u) throw new ErrorConfiguracion("Falta SUPABASE_URL");
  return `${u}/rest/v1`;
};

const LOTE = 500;   // filas por peticion al escribir
const PAGINA = 1000; // Supabase corta las lecturas en 1000 filas por defecto

function cabeceras(extra: Record<string, string> = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || key.startsWith("PEGA_AQUI")) throw new ErrorConfiguracion("Falta SUPABASE_SERVICE_ROLE_KEY");
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...extra };
}

/** SELECT con paginacion por Range: Supabase devuelve como mucho 1000 filas. */
export async function seleccionar<T>(recurso: string, consulta = ""): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const r = await fetch(`${URL_BASE()}/${recurso}?${consulta}`, {
      headers: cabeceras({ Range: `${desde}-${desde + PAGINA - 1}` }),
      cache: "no-store",
    });
    if (r.status === 401 || r.status === 403) {
      throw new ErrorConfiguracion(`Supabase rechaza la clave (${r.status})`);
    }
    if (!r.ok) throw new Error(`Supabase GET ${recurso}: ${r.status} ${await r.text()}`);
    const filas = (await r.json()) as T[];
    todo.push(...filas);
    if (filas.length < PAGINA) return todo;
  }
}

/** UPSERT por lotes. `conflicto` = columnas de la clave primaria. */
export async function guardar(recurso: string, filas: object[], conflicto: string) {
  for (let i = 0; i < filas.length; i += LOTE) {
    const r = await fetch(`${URL_BASE()}/${recurso}?on_conflict=${conflicto}`, {
      method: "POST",
      headers: cabeceras({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(filas.slice(i, i + LOTE)),
    });
    if (!r.ok) throw new Error(`Supabase POST ${recurso}: ${r.status} ${await r.text()}`);
  }
}

/** INSERT simple, de una fila o de varias. Para tablas con id autogenerado. */
export async function insertar(recurso: string, filas: object | object[]) {
  if (Array.isArray(filas) && !filas.length) return;
  const r = await fetch(`${URL_BASE()}/${recurso}`, {
    method: "POST",
    headers: cabeceras({ Prefer: "return=minimal" }),
    body: JSON.stringify(filas),
  });
  if (!r.ok) throw new Error(`Supabase POST ${recurso}: ${r.status} ${await r.text()}`);
}

/** DELETE con filtro PostgREST. `consulta` nunca puede ir vacia: borraria la tabla. */
export async function borrar(recurso: string, consulta: string) {
  if (!consulta.trim()) throw new Error("borrar() sin filtro borraria la tabla entera");
  const r = await fetch(`${URL_BASE()}/${recurso}?${consulta}`, {
    method: "DELETE",
    headers: cabeceras({ Prefer: "return=minimal" }),
  });
  if (!r.ok) throw new Error(`Supabase DELETE ${recurso}: ${r.status} ${await r.text()}`);
}
