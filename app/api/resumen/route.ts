import { NextResponse } from "next/server";

const MODELO = "openai/gpt-oss-20b";

// El resumen no inventa numeros: solo redacta en una frase los hechos que ya
// calculo quien llama (Seguimiento con tendencia/ocupacion, Historico con
// reservas/ingresos/pico de venta, etc).
export async function POST(req: Request) {
  const datos = await req.json().catch(() => null);
  const hechos = typeof datos?.hechos === "string" ? datos.hechos.trim() : "";
  if (!hechos) return NextResponse.json({ error: "Faltan los datos a resumir" }, { status: 400 });

  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return NextResponse.json({ error: "Falta GROQ_API_KEY" }, { status: 500 });

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODELO,
      temperature: 0.3,
      max_tokens: 200,
      // gpt-oss piensa antes de contestar: con esfuerzo alto se comía los
      // tokens en el razonamiento y no dejaba nada para la respuesta.
      reasoning_effort: "low",
      messages: [
        { role: "system", content: "Analizas en español los datos de una casa de alquiler vacacional que te da "
          + "el usuario. Contesta en dos frases cortas: la primera con lo BUENO (el dato más fuerte), la segunda "
          + "con lo MALO o lo que menos convence (el dato más débil o lo que falta). Si de verdad todo es bueno, "
          + "dilo en la segunda frase en vez de inventar un defecto. No inventes números que no te den. "
          + "Sin rodeos ni saludos." },
        { role: "user", content: hechos },
      ],
    }),
    cache: "no-store",
  });
  if (!r.ok) {
    return NextResponse.json({ error: `Groq devolvió ${r.status}: ${(await r.text()).slice(0, 200)}` }, { status: 502 });
  }
  const data = await r.json();
  const resumen: string = data.choices?.[0]?.message?.content?.trim() ?? "";
  return NextResponse.json({ resumen });
}
