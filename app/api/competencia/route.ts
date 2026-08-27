import { NextResponse } from "next/server";
import { insertar } from "@/lib/db";

export async function POST(req: Request) {
  const f = await req.formData();
  const precio = Number(f.get("precio"));
  const zona = String(f.get("zona") ?? "").trim();
  const competidor = String(f.get("competidor") ?? "").trim();
  const fecha_estancia = String(f.get("fecha_estancia") ?? "");

  if (!zona || !competidor || !fecha_estancia || !Number.isFinite(precio) || precio <= 0) {
    return NextResponse.json({ error: "Faltan datos o el precio no es válido" }, { status: 400 });
  }
  await insertar("competencia", { zona, competidor, fecha_estancia, precio, fuente: "manual" });
  return NextResponse.redirect(new URL("/competencia", req.url), 303);
}
