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

-- ------------------------------------------------------------------ RLS ----
-- Solo entra el servidor de Next.js con la service_role key. RLS activo sin
-- politicas = la clave anonima no lee nada aunque se filtre.
alter table propiedades        enable row level security;
alter table reservas           enable row level security;
alter table huecos_snapshot    enable row level security;
alter table competencia        enable row level security;
alter table zonas_mercado      enable row level security;
alter table peticiones_mercado enable row level security;

-- --------------------------------------------------------------- vistas ----
-- security_invoker: respetan el RLS de las tablas en vez de saltarselo con los
-- permisos del dueno.

-- Reservas que cuentan de verdad. Declined (1.053 de 4.290) y canceladas fuera:
-- meterlas en el historico de precios inventa ingresos que nunca existieron.
create or replace view v_reservas_validas with (security_invoker = true) as
select r.*, p.nombre, p.zona,
       extract(year  from r.llegada)::int as anio,
       extract(month from r.llegada)::int as mes,
       r.importe / nullif(r.noches, 0) as adr
from reservas r
join propiedades p using (property_id)
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
select property_id, nombre, zona, anio, mes,
       count(*)::int    as reservas,
       sum(noches)::int as noches,
       sum(importe)     as ingresos,
       percentile_cont(0.5) within group (order by adr) filter (where importe > 0) as adr
from v_reservas_validas group by property_id, nombre, zona, anio, mes;

create or replace view v_canales with (security_invoker = true) as
select property_id, canal,
       count(*)::int    as reservas,
       sum(noches)::int as noches,
       sum(importe)     as ingresos
from v_reservas_validas group by property_id, canal;

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
