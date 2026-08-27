# Panel de alquileres

Tres pantallas sobre los datos de Lodgify: disponibilidad con seguimiento, histórico de
precios y reservas, y comparación con la competencia.

## Puesta en marcha

1. Rellena `.env.local`:

   | Variable | De dónde sale |
   |---|---|
   | `LODGIFY_API_KEY` | ya copiada del proyecto anterior |
   | `SUPABASE_URL` | ya puesta: `https://yvwxkaeruajbvqlydwfc.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → proyecto `rental-v2` → Project Settings → API Keys → `service_role` (**secreta**) |
   | `APP_PASSWORD` | la eliges tú; es la contraseña para entrar al panel |
   | `OMKAR_API_KEY` | omkar.cloud → registro gratuito → API key. Tramo gratis: 200 consultas/mes, sin tarjeta |
   | `CRON_SECRET` | solo en Vercel; lo genera Vercel al añadir el cron |

2. `npm run dev` y entra en http://localhost:3000

3. Pulsa **Actualizar datos** en la pestaña Disponibilidad. Ese botón trae de Lodgify las
   propiedades, las ~4.290 reservas y la foto del día, y las guarda en Supabase. Hasta que
   no lo pulses una vez, el histórico sale vacío.

## Cómo está montado

```
lib/lodgify.ts    cliente de la API de Lodgify (solo lectura)
lib/db.ts         Supabase por su API REST, con fetch: sin SDK
lib/consultas.ts  las lecturas que comparten las páginas
lib/calculos.ts   reglas de precio y veredicto de competencia (puras)
app/              tres páginas + login + tres rutas de API
proxy.ts          exige sesión en todo menos /login
```

Las agregaciones (medianas de precio, noches por mes, canales) son **vistas de Postgres**,
no bucles en JavaScript: `v_mensual`, `v_adr_casa_mes`, `v_adr_casa`, `v_adr_zona_mes`,
`v_canales`, `v_seguimiento`, `v_resumen_snapshot`.

### Qué se lee en vivo y qué se cachea

La disponibilidad se pide a Lodgify en cada carga: son 0,6 s y es el dato que no puede
estar desfasado, porque de él salen las recomendaciones de precio.

Las reservas **no**: son 86 páginas y ~50 s en serie. Se traen en paralelo (~6 s) desde
`/api/sync` y se guardan en Supabase; las páginas leen de ahí. El cron de `vercel.json`
lo ejecuta cada día a las 6:00, y el botón "Actualizar datos" lo dispara a mano.

## Precios de la competencia

Lodgify no los tiene y PriceLabs no los expone por API (su Customer API solo da precios y
alojamientos propios, y el Revenue Estimator cuesta 75 $/mes por 100 búsquedas). Se traen
de Airbnb a través de la API alojada `airbnb-scraper-api.omkar.cloud`.

El presupuesto manda el diseño: el tramo gratuito son **200 consultas al mes**, así que se
gasta **una por zona con hueco**, no una por casa ni una por alojamiento vecino. El
`place_id` de cada zona se guarda en `zonas_mercado` y no se vuelve a pedir; la búsqueda
devuelve 18 vecinos con precio de una sola vez, así que nunca se pide el detalle de cada
uno. Con cinco zonas y una pasada semanal salen unas 20 consultas al mes.

Cada consulta queda registrada en `peticiones_mercado` y la pestaña enseña el gasto del mes.
`price.amount` de Airbnb es el **total de la estancia**, no el precio por noche: se divide
entre las noches que pedimos nosotros, sin interpretar el texto del `qualifier`.

Repetir la consulta el mismo día no duplica filas: se borra lo que hubiera de esa zona,
fecha y fuente antes de insertar, o la mediana quedaría torcida.

La columna `fuente` distingue `manual` de `airbnb`. El formulario a mano sigue ahí y no
gasta consultas.

## Cosas que no hay que romper

- Los huecos salen **solo** de `/v2/availability`. Los cierres de propietario no aparecen
  en `/reservations/bookings`; deducir la disponibilidad de las reservas hace que el panel
  recomiende bajar el precio de fechas que están bloqueadas.
- `/v2/availability` da el último día **incluido**; las reservas dan salida **exclusiva**.
  `traerHuecos` suma un día para que todo cuente noches igual.
- `stayFilter=All` es obligatorio en reservas: sin él llegan ~178 en vez de 4.290.
- Se descartan las estancias de más de 31 noches (son bloqueos, no reservas) y las de
  estado `Declined` u `Open`, y las canceladas. De 4.290 filas quedan 2.830 reales.
- El precio de referencia es la **mediana**, no la media.
- El campo `city` de Lodgify viene a mano: `normalizaZona()` unifica Castellón/Castelló/
  "Municipality of Castelló de la Plana" y "Oropesa del Mar, Oropesa del Mar". Sin eso,
  el precio de respaldo por zona se calcularía sobre una sola casa.

## Desplegar en Vercel

```bash
npx vercel link
npx vercel env add LODGIFY_API_KEY production
npx vercel env add SUPABASE_URL production
npx vercel env add SUPABASE_SERVICE_ROLE_KEY production
npx vercel env add APP_PASSWORD production
npx vercel --prod
```

El cron de `vercel.json` necesita plan Pro. En Hobby, pulsa "Actualizar datos" a mano o
llama a `GET /api/sync` desde cualquier programador externo con la cabecera
`Authorization: Bearer $CRON_SECRET`.
