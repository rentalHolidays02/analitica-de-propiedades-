import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "Rental — panel", description: "Disponibilidad, histórico y competencia" };

const PESTANAS = [
  { href: "/", texto: "Disponibilidad" },
  { href: "/historico", texto: "Histórico de reservas" },
  { href: "/competencia", texto: "Nuestra competencia" },
  { href: "/seguimiento", texto: "Seguimiento" },
  { href: "/ayuda", texto: "Ayuda" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <header className="border-b border-slate-200 bg-white">
          <nav className="mx-auto flex max-w-7xl gap-1 px-4">
            {PESTANAS.map((p) => (
              <Link key={p.href} href={p.href}
                className="border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-600 hover:border-slate-300 hover:text-slate-900">
                {p.texto}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
