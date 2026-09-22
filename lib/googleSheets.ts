// Comentarios de Airbnb/Booking desde la hoja de valoraciones (Google Sheets).
// Sin SDK, igual que lib/db.ts con Supabase: JWT firmado a mano (RS256) para
// pedir un access token de OAuth2, y fetch directo a la API de Sheets.
import { createSign } from "crypto";
import { ErrorConfiguracion } from "./db";

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

// Layout de la hoja: igual al que escribe "automatizacion de valoraciones"
// (src/sheets.py). Fila 1-2 cabeceras, datos desde fila 3. Bloque AIRBNB
// cols B..R (17 columnas: 12 meses + TOTAL + %val + Nº Reseñas + VALORACION
// + COMENTARIOS), bloque BOOKING cols S..AI con el mismo layout.
const N_MESES = 12;
const N_EXTRAS = 5;
const BLOQUE = N_MESES + N_EXTRAS;
const OFF_VALOR = N_MESES + 3;
const OFF_COMENT = N_MESES + 4;
const COL_AIR = 1;
const COL_BKG = COL_AIR + BLOQUE;

export type ComentarioSheet = {
  ref: string;
  comentarios_airbnb: string | null; comentarios_booking: string | null;
  nota_airbnb: number | null; nota_booking: number | null;
};

/** '4,5' / '4.5' -> 4.5. Los datos vienen a mano y mezclan coma y punto decimal. */
function numeroDe(v: string | undefined): number | null {
  if (!v?.trim()) return null;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function tokenAcceso(): Promise<string> {
  const email = process.env.GOOGLE_SHEETS_CLIENT_EMAIL?.trim();
  const clave = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.trim();
  if (!email || !clave) throw new ErrorConfiguracion("Falta GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY");

  const ahora = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({
    iss: email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600,
  }));
  const firma = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(clave.replace(/\\n/g, "\n"));
  const jwt = `${header}.${claims}.${base64url(firma)}`;

  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  if (!r.ok) throw new Error(`Google OAuth token: ${r.status} ${await r.text()}`);
  const { access_token } = (await r.json()) as { access_token: string };
  return access_token;
}

/** '... REF. 022' / 'REF 035' / ' 005' -> '022'. Mismo criterio que matcher.extrae_ref en Python. */
function refDeFila(nombre: string): string | null {
  const m = /ref\.?\s*0*(\d{1,3})/i.exec(nombre) ?? /\b0*(\d{2,3})\s*$/.exec(nombre.trim());
  return m ? m[1].padStart(3, "0") : null;
}

/** Comentarios del año en curso: es lo único que escribe el scraper (no hay histórico de reseñas). */
export async function traerComentarios(anio = new Date().getFullYear()): Promise<ComentarioSheet[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID?.trim();
  if (!sheetId) throw new ErrorConfiguracion("Falta GOOGLE_SHEET_ID");
  const token = await tokenAcceso();
  const hoja = `RESERVAS ${anio}`;
  // Datos desde la fila 4: 3 filas de cabecera (plataforma, columnas, meses).
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(hoja)}!A4:AI3000`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!r.ok) throw new Error(`Google Sheets '${hoja}': ${r.status} ${await r.text()}`);
  const { values } = (await r.json()) as { values?: string[][] };

  const out: ComentarioSheet[] = [];
  for (const fila of values ?? []) {
    const nombre = fila[0]?.trim();
    const ref = nombre ? refDeFila(nombre) : null;
    if (!ref) continue;
    out.push({
      ref,
      comentarios_airbnb: fila[COL_AIR + OFF_COMENT]?.trim() || null,
      comentarios_booking: fila[COL_BKG + OFF_COMENT]?.trim() || null,
      nota_airbnb: numeroDe(fila[COL_AIR + OFF_VALOR]),
      nota_booking: numeroDe(fila[COL_BKG + OFF_VALOR]),
    });
  }
  return out;
}
