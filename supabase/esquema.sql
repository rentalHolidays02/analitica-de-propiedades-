-- Esquema completo del panel. Pegar entero en el SQL Editor de Supabase y ejecutar.
-- Idempotente: se puede volver a lanzar sin romper nada.

-- ---------------------------------------------------------------- tablas ----

-- Propiedades sincronizadas de Lodgify (/v2/properties)
create table if not exists propiedades (
  property_id    bigint primary key,
  nombre         text not null,
  nombre_interno text,
  ref            text,
  zona           text,
  activa         boolean not null default true,
  nota           numeric,
  precio_min     numeric,
  precio_max     numeric,
  actualizado    timestamptz not null default now()
);
-- Texto de reseñas y nota por plataforma, escrito cada semana por
-- "automatizacion de valoraciones" (scraper Airbnb/Booking -> Google Sheets
-- -> Supabase), emparejado por ref. `nota` (mas arriba) es la de Lodgify;
-- estas son las de cada plataforma tal cual las da Airbnb (/5) y Booking (/10).
alter table propiedades add column if not exists comentarios_airbnb  text;
alter table propiedades add column if not exists comentarios_booking text;
alter table propiedades add column if not exists nota_airbnb  numeric;
alter table propiedades add column if not exists nota_booking numeric;

-- Reservas sincronizadas. Se cachean porque la API tarda ~50s en devolver las
-- 4.290 (86 paginas); leerlas en cada peticion no cabe en una funcion serverless.
create table if not exists reservas (
  id          bigint primary key,
  property_id bigint not null,
  llegada     date not null,
  salida      date not null,          -- exclusiva, igual que la API
  noches      int  not null,
  importe     numeric not null,       -- subtotals.stay, respaldo total_amount
  estado      text not null,          -- Booked | Declined | Open
  cancelada   boolean not null default false,
  canal       text,                   -- source_text normalizado
  creada      timestamptz,
  actualizado timestamptz not null default now()
);
create index if not exists reservas_prop_llegada_idx on reservas (property_id, llegada);
create index if not exists reservas_llegada_idx      on reservas (llegada);

-- Foto diaria de los huecos. Es la base del seguimiento: sin historico solo se
-- sabe el estado de hoy, no si una casa lleva tres semanas parada.
create table if not exists huecos_snapshot (
  fecha       date not null,
  property_id bigint not null,
  inicio      date not null,
  fin         date not null,          -- exclusiva
  noches      int  not null,
  primary key (fecha, property_id, inicio)
);

-- Precios de competencia. 'fuente' queda abierta: manual, airbnb, o lo que venga.
create table if not exists competencia (
  id             bigserial primary key,
  apuntado_en    timestamptz not null default now(),
  zona           text not null,
  competidor     text not null,
  fecha_estancia date not null,
  precio         numeric not null,
  fuente         text not null default 'manual'
);
create index if not exists competencia_zona_fecha_idx on competencia (zona, fecha_estancia);

-- El place_id de una zona no cambia nunca, y cada autocomplete gasta una de las
-- 200 peticiones mensuales del tramo gratuito: se pide una vez y se guarda.
create table if not exists zonas_mercado (
  zona        text primary key,
  consulta    text not null,   -- full_name que devuelve el autocomplete
  place_id    text,
  actualizado timestamptz not null default now()
);

-- Cuantas peticiones se han gastado este mes, para no pasarse del tramo gratuito.
create table if not exists peticiones_mercado (
  id       bigserial primary key,
  momento  timestamptz not null default now(),
  endpoint text not null,
  zona     text
);

-- Comision que se queda cada canal, en % sobre el importe que paga el huesped.
-- La clave es el nombre tal cual lo escribe canalDe() en reservas.canal, para
-- cruzar sin capa de traduccion. Se siembran tambien los canales que canalDe()
-- no normaliza y deja en crudo (Rentalia, InterHome...): sin fila aqui una
-- reserva se contaria neta = bruta, que es justo el error a corregir.
-- on conflict do nothing: volver a lanzar el esquema no pisa los ajustes a mano.
create table if not exists comisiones_canal (
  canal        text primary key,
  comision_pct numeric not null
);
insert into comisiones_canal (canal, comision_pct) values
  ('Airbnb', 15), ('Booking.com', 16.1), ('HomeAway/Vrbo', 19.5),
  ('Web propia', 2.5),   -- la web propia reserva por el motor de Lodgify (2,5%)
  ('Directo', 0),        -- reserva a mano: no pasa por ningun canal
  ('Expedia', 15), ('Homerez', 15), ('InterHome', 25), ('Lodgify', 2.5),
  ('MIR', 0), ('Rentalia', 5), ('Tripadvisor', 3), ('Your Rentals', 30)
on conflict (canal) do nothing;

-- Reservas del sistema de gestion (app.rentalholidays.es), la otra mitad de la
-- foto: trae `comision` en EUROS reales cobrados por el canal, que Lodgify no
-- da. Su `id` no tiene nada que ver con el de Lodgify (0 coincidencias de
-- 2.857), asi que el cruce va por (property_id, llegada).
-- Sin email ni telefono del huesped a proposito: datos personales que el panel
-- no necesita.
create table if not exists reservas_gestion (
  id          bigint primary key,
  property_id bigint not null,
  llegada     date not null,
  salida      date not null,          -- exclusiva, como en `reservas`
  noches      int  not null,
  importe     numeric not null,       -- total_amount: lo que paga el huesped
  comision    numeric not null,       -- channel_fees: euros que se queda el canal
  limpieza    numeric not null,
  canal       text,                   -- source: BookingCom, AirbnbIntegration, Manual...
  huesped     text,
  creada      timestamptz,
  actualizado timestamptz not null default now()
);
create index if not exists reservas_gestion_cruce_idx on reservas_gestion (property_id, llegada);

-- Precio configurado en gestion para cada dia. Es el precio REAL de venta, no
-- una media de lo que se cobro antes: manda sobre el historico de Lodgify
-- siempre que exista.
-- Solo se guardan los dias con tarifa cargada. La API devuelve price null
-- cuando no hay ninguna, y guardarlo como 0 haria que el panel recomendase
-- regalar la casa. Por eso la cobertura es parcial (58% de los dias en la
-- ventana de 90 dias del panel, 9 casas sin ningun precio) y el historico
-- sigue haciendo falta como respaldo.
create table if not exists tarifas_gestion (
  property_id bigint not null,
  fecha       date   not null,
  precio      numeric not null,
  min_noches  int    not null default 1,
  tarifa      text,
  actualizado timestamptz not null default now(),
  primary key (property_id, fecha)
);

-- Contabilidad ya cerrada por casa y mes, sacada de /rendimiento. Es la fuente
-- AUTORITATIVA (identidad contable exacta, verificado en 19/19 filas reales),
-- no una estimacion como importe_neto de v_reservas_validas: aqui ya estan
-- restados comision, IVA, gastos y la tasa/gestion (it_general_fees, sin
-- documentar cual es exactamente).
create table if not exists rendimiento_gestion (
  property_id  bigint not null,
  anio         int    not null,
  mes          int    not null,
  dias_ocupados int   not null,
  ocupacion_pct numeric not null,   -- sobre dias disponibles, no sobre dias del mes
  ingreso_bruto numeric not null,
  pago_propietario numeric not null,
  comision      numeric not null,
  iva           numeric not null,
  gastos        numeric not null,
  tasas         numeric not null,   -- it_general_fees
  beneficio_neto numeric not null,
  actualizado   timestamptz not null default now(),
  primary key (property_id, anio, mes)
);

-- ------------------------------------------------------------------ RLS ----
-- Solo entra el servidor de Next.js con la service_role key. RLS activo sin
-- politicas = la clave anonima no lee nada aunque se filtre.
alter table propiedades        enable row level security;
alter table reservas           enable row level security;
alter table huecos_snapshot    enable row level security;
alter table competencia        enable row level security;
alter table zonas_mercado      enable row level security;
alter table peticiones_mercado enable row level security;
alter table comisiones_canal   enable row level security;
alter table reservas_gestion   enable row level security;
alter table tarifas_gestion    enable row level security;
alter table rendimiento_gestion enable row level security;

-- --------------------------------------------------------------- vistas ----
-- security_invoker: respetan el RLS de las tablas en vez de saltarselo con los
-- permisos del dueno.

-- Reservas que cuentan de verdad. Declined (1.053 de 4.290) y canceladas fuera:
-- meterlas en el historico de precios inventa ingresos que nunca existieron.
-- OJO al orden: r.* trae reservas.canal, el de Lodgify. La columna `canal` que
-- vale es la de mas abajo (canal_real), porque Lodgify no distingue Airbnb de
-- una reserva directa: las 300 reservas de Airbnb llegan sin source_text y
-- canalDe() las llama "Directo" con 0% de comision cuando cuestan un 15%.
create or replace view v_reservas_validas with (security_invoker = true) as
select r.*, p.nombre, p.zona,
       extract(year  from r.llegada)::int as anio,
       extract(month from r.llegada)::int as mes,
       r.importe / nullif(r.noches, 0) as adr,
       -- importe es lo que paga el huesped; el propietario cobra menos comision:
       -- 100 EUR de Airbnb son 85. left join + coalesce 0 para que un canal sin
       -- tarifa no haga desaparecer la reserva (solo se quedaria sin descuento).
       -- lower() porque los canales que canalDe() no normaliza llegan en crudo.
       coalesce(c.comision_pct, 0) as comision_pct,
       -- Neto por orden de fiabilidad: la comision REAL medida en gestion gana
       -- al porcentaje de catalogo, que es una estimacion (HomeAway cobra 15,4%
       -- real contra 19,5% de catalogo). Solo cruza el 84% de las reservas.
       --
       -- Se aplica como TASA, no restando los euros de g.comision: las dos
       -- fuentes no miden lo mismo. `importe` es subtotals.stay de Lodgify (sin
       -- limpieza ni extras) y es de media el 80,7% del total_amount de gestion;
       -- restar la comision de un total mayor a una base menor daba netos
       -- negativos. La tasa no puede pasar de 1 (comprobado: ninguna comision
       -- supera su total), asi que el neto nunca sale negativo.
       r.importe * (1 - coalesce(g.comision / nullif(g.importe, 0),
                                 coalesce(c.comision_pct, 0) / 100)) as importe_neto,
       case when g.comision is null then 'estimado' else 'gestion' end as origen_neto,
       coalesce(g.canal, r.canal) as canal_real
from reservas r
join propiedades p using (property_id)
-- distinct on: una casa con dos reservas el mismo dia de llegada duplicaria la
-- fila y doblaria sus ingresos. Hay 1 caso asi en gestion.
left join (
  select distinct on (property_id, llegada) property_id, llegada, comision, importe, canal
  from reservas_gestion order by property_id, llegada, id desc
) g on g.property_id = r.property_id and g.llegada = r.llegada
-- El % de catalogo se busca por el canal corregido, no por el de Lodgify: si no,
-- las 300 de Airbnb mal etiquetadas "Directo" seguirian cobrando 0%.
left join comisiones_canal c on lower(c.canal) = lower(coalesce(g.canal, r.canal))
where r.estado = 'Booked' and not r.cancelada;

-- Precio de referencia = mediana, no media: una reserva rara no arrastra el numero.
create or replace view v_adr_casa_mes with (security_invoker = true) as
select property_id, mes,
       percentile_cont(0.5) within group (order by adr) as adr
from v_reservas_validas where importe > 0 group by property_id, mes;

create or replace view v_adr_casa with (security_invoker = true) as
select property_id,
       percentile_cont(0.5) within group (order by adr) as adr
from v_reservas_validas where importe > 0 group by property_id;

create or replace view v_adr_zona_mes with (security_invoker = true) as
select zona, mes,
       percentile_cont(0.5) within group (order by adr) as adr
from v_reservas_validas where importe > 0 and zona is not null group by zona, mes;

-- Detalle mes a mes por casa: alimenta la pestana de historico.
create or replace view v_mensual with (security_invoker = true) as
select v.property_id, v.nombre, v.zona, v.anio, v.mes,
       count(*)::int    as reservas,
       sum(v.noches)::int as noches,
       sum(v.importe)     as ingresos,
       percentile_cont(0.5) within group (order by v.adr) filter (where v.importe > 0) as adr,
       -- al final a proposito: create or replace view solo deja anadir columnas.
       sum(v.importe_neto) as ingresos_netos,
       -- Lo que de verdad cobra el propietario: rendimiento_gestion ya resta
       -- comision, IVA, gastos y tasas (identidad contable exacta). Solo cubre
       -- casas y meses que gestion ya cerro (62 casas, ult. 12 meses); donde
       -- falta, se cae a la estimacion de ingresos_netos (solo resta comision).
       coalesce(rg.pago_propietario, sum(v.importe_neto)) as ingresos_reales,
       (rg.pago_propietario is not null) as ingresos_de_gestion
from v_reservas_validas v
left join rendimiento_gestion rg
  on rg.property_id = v.property_id and rg.anio = v.anio and rg.mes = v.mes
group by v.property_id, v.nombre, v.zona, v.anio, v.mes, rg.pago_propietario;

-- Agrupa por canal_real, no por el canal de Lodgify: agrupar por el de Lodgify
-- metia 188.374 EUR de Airbnb dentro de "Directo".
create or replace view v_canales with (security_invoker = true) as
select property_id, canal_real as canal,
       count(*)::int    as reservas,
       sum(noches)::int as noches,
       sum(importe)     as ingresos,
       sum(importe_neto) as ingresos_netos
from v_reservas_validas group by property_id, canal_real;

-- Cuantos dias seguidos lleva cada casa apareciendo con hueco.
create or replace view v_seguimiento with (security_invoker = true) as
select property_id,
       min(fecha)                 as visto_desde,
       max(fecha)                 as visto_hasta,
       count(distinct fecha)::int as dias_con_hueco
from huecos_snapshot group by property_id;

-- Una fila por foto diaria. Comparar las dos ultimas da el ritmo de venta.
create or replace view v_resumen_snapshot with (security_invoker = true) as
select fecha,
       count(distinct property_id)::int as casas,
       sum(noches)::int                 as noches_libres,
       count(*)::int                    as huecos
from huecos_snapshot group by fecha;

create or replace view v_gasto_mercado with (security_invoker = true) as
select date_trunc('month', momento)::date as mes, count(*)::int as peticiones
from peticiones_mercado group by 1;
