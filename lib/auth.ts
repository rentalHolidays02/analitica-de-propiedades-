// Login de una sola contrasena. Suficiente para un panel interno; lo unico que
// hay que evitar es que la URL publica de Vercel ensene ingresos a cualquiera.
export const COOKIE = "sesion";

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparacion sin fugas de tiempo: no revela cuantos caracteres acerto. */
export function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

/** Valor de la cookie: hash de la contrasena, nunca la contrasena en claro. */
export function tokenSesion(): Promise<string> {
  const pass = process.env.APP_PASSWORD;
  if (!pass) throw new Error("Falta APP_PASSWORD");
  return sha256(`rental_v2|${pass}`);
}
