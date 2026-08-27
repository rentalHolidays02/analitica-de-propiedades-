export default function AvisoConfig({ detalle }: { detalle: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-5">
      <h2 className="text-base font-semibold text-amber-900">Falta configurar la base de datos</h2>
      <p className="mt-2 text-sm text-amber-900">
        La app no puede leer de Supabase todavía: <code className="rounded bg-amber-100 px-1">{detalle}</code>
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-amber-900">
        <li>
          Abre{" "}
          <a className="underline"
             href="https://supabase.com/dashboard/project/yvwxkaeruajbvqlydwfc/settings/api-keys"
             target="_blank" rel="noreferrer">
            Supabase → rental-v2 → API Keys
          </a>{" "}
          y copia la clave secreta (<code>service_role</code>, o una <code>sb_secret_…</code>).
        </li>
        <li>
          Pégala en <code className="rounded bg-amber-100 px-1">.env.local</code> en la línea{" "}
          <code>SUPABASE_SERVICE_ROLE_KEY=</code>
        </li>
        <li>Guarda el archivo y recarga esta página.</li>
      </ol>
      <p className="mt-3 text-xs text-amber-800">
        La disponibilidad de Lodgify ya funciona; lo único que falta es dónde guardar el histórico.
      </p>
    </div>
  );
}
