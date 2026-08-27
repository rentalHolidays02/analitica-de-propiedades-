"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const router = useRouter();

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setEnviando(false);
    if (r.ok) { router.push("/"); router.refresh(); }
    else setError((await r.json().catch(() => ({}))).error ?? "No se pudo entrar");
  }

  return (
    <form onSubmit={entrar} className="mx-auto mt-24 max-w-sm rounded-lg border border-slate-200 bg-white p-6">
      <h1 className="mb-1 text-lg font-semibold">Panel de alquileres</h1>
      <p className="mb-4 text-sm text-slate-500">Introduce la contraseña para entrar.</p>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        autoFocus className="w-full rounded border border-slate-300 px-3 py-2 text-sm" placeholder="Contraseña" />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <button disabled={enviando}
        className="mt-4 w-full rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
        {enviando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
