export const metadata = { title: "Ayuda — Rental panel" };

function Ejemplo({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-slate-300 bg-slate-50 p-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        Ejemplo (datos de muestra, no es una captura real)
      </p>
      {children}
    </div>
  );
}

function tonoVerde(v: number, max: number) {
  const a = 0.08 + 0.82 * (v / max);
  return { background: `rgba(16,120,86,${a.toFixed(3)})`, color: a > 0.55 ? "#fff" : "#0f172a" };
}

const EJEMPLO_DISPONIBILIDAD = [
  { casa: "Villa Azul", zona: "Costa", hueco: "12 dic – 20 dic", noches: 8, tuPrecio: 95, sugerido: 78, semaforo: "🔴", motivo: "hueco largo, zona floja" },
  { casa: "Piso Centro 3", zona: "Centro", hueco: "5 ene – 7 ene", noches: 2, tuPrecio: 60, sugerido: 62, semaforo: "🟡", motivo: "dentro de rango" },
  { casa: "Ático Sur", zona: "Costa", hueco: "22 dic – 24 dic", noches: 2, tuPrecio: 110, sugerido: 140, semaforo: "🟢", motivo: "puente, demanda alta" },
];

const EJEMPLO_HISTORICO = [
  { anio: 2025, valores: [12, 18, 22, 9] },
  { anio: 2024, valores: [8, 14, 20, 15] },
];

const EJEMPLO_COMPETENCIA = [
  { zona: "Costa", mes: "Dic", tuyo: 95, vecinos: 78, semaforo: "🔴", frase: "bajar, vas caro" },
  { zona: "Centro", mes: "Ene", tuyo: 60, vecinos: 63, semaforo: "🟡", frase: "en línea, no toques" },
];

const EJEMPLO_SEGUIMIENTO = [
  { casa: "Villa Azul", serie: [30, 26, 24, 18, 14], delta: 16, ocupacionMes: 72 },
  { casa: "Piso Centro 3", serie: [10, 11, 13, 15, 17], delta: -7, ocupacionMes: 41 },
];

const SECCIONES = [
  {
    id: "disponibilidad",
    titulo: "Disponibilidad (portada)",
    cuerpo: (
      <>
        <p>Huecos reales de Lodgify, en vivo, sin caché: ventana de 90 días por defecto, ajustable con los
        filtros de fecha, zona, color y orden.</p>
        <p>El semáforo compara tu precio con el histórico de esa zona y mes: 🔴 bajar precio, 🟡 mantener,
        🟢 pico de demanda, ⚪ sin histórico para comparar.</p>
        <p>&quot;Días seguidos&quot; cuenta cuántas fotos diarias seguidas salió esa casa con hueco — necesita
        varios días de &quot;Actualizar datos&quot; para decir algo.</p>
        <p><b>Actualizar datos:</b> trae propiedades y reservas de Lodgify y RentalHolidays, y guarda la foto
        del día (huecos_snapshot) que alimenta Seguimiento. Puede tardar decenas de segundos.
        <b> Sincronizar comentarios:</b> trae reseñas de Airbnb/Booking desde Google Sheets.</p>
        <Ejemplo>
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1 pr-2">Casa</th><th className="py-1 pr-2">Hueco</th>
                <th className="py-1 pr-2 text-right">Tu precio</th><th className="py-1 pr-2 text-right">Sugerido</th>
                <th className="py-1">Motivo</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {EJEMPLO_DISPONIBILIDAD.map((f) => (
                <tr key={f.casa}>
                  <td className="py-1 pr-2">{f.semaforo} {f.casa}</td>
                  <td className="py-1 pr-2 whitespace-nowrap">{f.hueco}</td>
                  <td className="py-1 pr-2 text-right">{f.tuPrecio}€</td>
                  <td className="py-1 pr-2 text-right font-semibold">{f.sugerido}€</td>
                  <td className="py-1 text-slate-500">{f.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Villa Azul lleva 8 noches sin venderse en zona floja → precio sugerido por debajo del tuyo (🔴).
            Ático Sur coincide con un puente → sugerido por encima (🟢).
          </p>
        </Ejemplo>
      </>
    ),
  },
  {
    id: "historico",
    titulo: "Histórico de reservas",
    cuerpo: (
      <>
        <p>Solo reservas confirmadas — canceladas y rechazadas quedan fuera de reservas, noches e ingresos.</p>
        <p>Gráfica anual con detalle de las 5 casas que más vendieron ese año al pulsar una barra;
        comparador para poner dos casas lado a lado, cada una con su propio año.</p>
        <p>Rejillas mes × año de noches vendidas, precio (mediana) y reservas — más oscuro, más lleno.
        Paginadas de 5 años en 5.</p>
        <Ejemplo>
          <table className="border-separate border-spacing-[2px] text-center text-xs">
            <thead>
              <tr className="text-slate-500"><th className="w-10 text-left font-normal" />
                <th className="font-normal">Oct</th><th className="font-normal">Nov</th>
                <th className="font-normal">Dic</th><th className="font-normal">Ene</th></tr>
            </thead>
            <tbody>
              {EJEMPLO_HISTORICO.map((fila) => (
                <tr key={fila.anio}>
                  <th className="text-left text-slate-500 font-normal">{fila.anio}</th>
                  {fila.valores.map((v, i) => (
                    <td key={i} className="rounded px-2 py-1 tabular-nums" style={tonoVerde(v, 22)}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">Noches vendidas por mes: diciembre 2025 (22) fue el mes más lleno de la muestra.</p>
        </Ejemplo>
      </>
    ),
  },
  {
    id: "competencia",
    titulo: "Nuestra competencia",
    cuerpo: (
      <>
        <p>Solo mira zonas con hueco en los próximos 60 días: lo que todavía se puede vender.</p>
        <p>Precios de la competencia se traen automático de Airbnb (omkar.cloud, cupo mensual gratis) o de
        Booking (Apify, de pago pero cubierto por el crédito gratis mensual), o se apuntan a mano.</p>
        <p>&quot;Tú contra los vecinos&quot; compara tu mediana real de venta (Lodgify) contra la mediana de
        lo apuntado, por zona y mes. Dentro de ±10% no compensa tocar el precio.</p>
        <Ejemplo>
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1 pr-2">Zona</th><th className="py-1 pr-2">Mes</th>
                <th className="py-1 pr-2 text-right">Tú</th><th className="py-1 pr-2 text-right">Vecinos</th>
                <th className="py-1">Qué hacer</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {EJEMPLO_COMPETENCIA.map((c) => (
                <tr key={`${c.zona}${c.mes}`}>
                  <td className="py-1 pr-2 font-medium">{c.semaforo} {c.zona}</td>
                  <td className="py-1 pr-2">{c.mes}</td>
                  <td className="py-1 pr-2 text-right">{c.tuyo}€</td>
                  <td className="py-1 pr-2 text-right">{c.vecinos}€</td>
                  <td className="py-1 text-slate-500">{c.frase}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Costa en diciembre: cobrás 95€, los vecinos 78€ → 22% por encima, conviene bajar.
            Centro en enero está dentro del ±10%, no se toca.
          </p>
        </Ejemplo>
      </>
    ),
  },
  {
    id: "seguimiento",
    titulo: "Seguimiento",
    cuerpo: (
      <>
        <p>Tendencia de noches libres a 90 días, con 60 días de fotos hacia atrás — se va llenando cada vez
        que se pulsa &quot;Actualizar datos&quot; en Disponibilidad.</p>
        <p>Ocupación (día/semana/mes/6 meses) calculada sobre la foto más reciente. &quot;Diferencia&quot;
        baja en verde (se vendió) o sube en rojo (se enfría) desde la primera foto hasta hoy.</p>
        <Ejemplo>
          <table className="w-full text-xs">
            <thead className="text-left text-slate-500">
              <tr><th className="py-1 pr-2">Casa</th><th className="py-1 pr-2">Noches libres (5 fotos)</th>
                <th className="py-1 pr-2 text-right">Diferencia</th><th className="py-1 text-right">Ocupación mes</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {EJEMPLO_SEGUIMIENTO.map((f) => (
                <tr key={f.casa}>
                  <td className="py-1 pr-2">{f.casa}</td>
                  <td className="py-1 pr-2">
                    <span className="inline-flex items-end gap-0.5 align-middle">
                      {f.serie.map((v, i) => (
                        <span key={i} className="inline-block w-1.5 bg-slate-400"
                          style={{ height: `${4 + v}px` }} />
                      ))}
                    </span>
                  </td>
                  <td className={`py-1 pr-2 text-right font-medium ${f.delta > 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {f.delta > 0 ? "−" : "+"}{Math.abs(f.delta)}
                  </td>
                  <td className="py-1 text-right">{f.ocupacionMes}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            Villa Azul: bajó de 30 a 14 noches libres (barras descendentes, −16 en verde) → se está vendiendo.
            Piso Centro 3 subió de 10 a 17 (+7 en rojo) → se está enfriando.
          </p>
        </Ejemplo>
      </>
    ),
  },
  {
    id: "fuentes",
    titulo: "De dónde vienen los datos",
    cuerpo: (
      <>
        <p><b>Lodgify:</b> propiedades, reservas, disponibilidad en vivo.</p>
        <p><b>RentalHolidays (gestión):</b> precio real de venta y rendimiento; opcional — si falla, el panel
        cae al histórico de Lodgify.</p>
        <p><b>Supabase:</b> guarda todo lo sincronizado, incluida la foto diaria que hace posible Seguimiento.</p>
        <p><b>Google Sheets:</b> reseñas de Airbnb y Booking.</p>
        <p><b>Omkar / Apify:</b> precios de la competencia.</p>
      </>
    ),
  },
  {
    id: "acceso",
    titulo: "Acceso",
    cuerpo: <p>Sin contraseña: el panel es de acceso libre para quien tenga la URL.</p>,
  },
];

export default function Ayuda() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Ayuda</h1>
        <p className="text-sm text-slate-500">Qué hace cada pestaña y de dónde sale cada dato. Toca un tema para abrirlo.</p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {SECCIONES.map((s) => (
          <a key={s.id} href={`#${s.id}`}
            className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
            {s.titulo}
          </a>
        ))}
      </nav>

      {SECCIONES.map((s) => (
        <details key={s.id} id={s.id} open
          className="group scroll-mt-4 rounded-lg border border-slate-200 bg-white open:pb-4">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold">
            {s.titulo}
            <span className="text-slate-400 transition-transform group-open:rotate-180">⌄</span>
          </summary>
          <div className="space-y-2 px-4 text-sm text-slate-600">{s.cuerpo}</div>
        </details>
      ))}
    </div>
  );
}
