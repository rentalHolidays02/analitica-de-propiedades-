import { NextResponse } from "next/server";
import { COOKIE, igualSeguro, tokenSesion } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: "" }));
  const esperada = process.env.APP_PASSWORD ?? "";
  if (!esperada || !igualSeguro(String(password ?? ""), esperada)) {
    return NextResponse.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, await tokenSesion(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
