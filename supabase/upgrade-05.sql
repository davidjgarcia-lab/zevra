-- =====================================================================
-- ZEVRA · actualización 05: país, identidad y deseos (estilo Feeld), filtros de búsqueda,
-- personas conectadas, tienda de códigos y Showroom en directo. Se puede repetir.
-- =====================================================================

-- ---------- Perfil: identidad, país, deseos, filtros y presencia ----------
alter table public.profiles add column if not exists country text check (country ~ '^[A-Z]{2}$');
alter table public.profiles add column if not exists sexuality text;
alter table public.profiles add column if not exists desires text[] not null default '{}';
alter table public.profiles add column if not exists showroom boolean not null default false;
alter table public.profiles add column if not exists last_seen_at timestamptz;
-- Filtros de búsqueda
alter table public.profiles add column if not exists f_country text check (f_country ~ '^[A-Z]{2}$');
alter table public.profiles add column if not exists f_age_min int not null default 18 check (f_age_min between 18 and 99);
alter table public.profiles add column if not exists f_age_max int not null default 99 check (f_age_max between 18 and 99);
alter table public.profiles add column if not exists f_desires text[] not null default '{}';

-- Más identidades de género y parejas
alter table public.profiles drop constraint if exists profiles_gender_check;
alter table public.profiles add constraint profiles_gender_check check (gender in (
  'mujer', 'hombre', 'no_binario', 'agenero', 'androgino', 'bigenero', 'genero_fluido', 'genero_no_conforme',
  'genderqueer', 'cuestionamiento', 'intersexual', 'pangenero', 'transfemenina', 'transmasculina', 'persona_trans',
  'otro', 'pareja_hm', 'pareja_hh', 'pareja_mm'));

grant select (country, sexuality, desires, showroom, last_seen_at, f_country, f_age_min, f_age_max, f_desires) on public.profiles to authenticated;
grant update (country, sexuality, desires, showroom, f_country, f_age_min, f_age_max, f_desires) on public.profiles to authenticated;

-- Tarjeta pública ampliada
drop view if exists public.profile_cards;
create view public.profile_cards as
  select p.id, p.alias, p.bio, p.pronouns, p.interests, p.avatar_path,
         (p.age_verified_at is not null) as verified,
         date_part('year', age(current_date, p.birthdate))::int as age,
         round(avg(r.score)::numeric, 1) as respect_score,
         count(r.score)::int as respect_count,
         (select count(*) from public.calls c where c.user_a = p.id or c.user_b = p.id)::int as connections,
         p.gender, p.seeking,
         p.country, p.sexuality, p.desires, p.showroom,
         (p.last_seen_at > now() - interval '5 minutes') as online,
         (select count(*) from public.likes l where l.likee = p.id)::int as likes_received,
         p.created_at
    from public.profiles p
    left join public.ratings r on r.ratee = p.id
   group by p.id;
revoke all on public.profile_cards from anon;
grant select on public.profile_cards to authenticated;

-- ¿Encajan las preferencias y filtros de ambas personas? (solo responde a una de las dos)
create or replace function public.prefs_match(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() in (a, b)
     and (cardinality(pa.seeking) = 0 or pb.gender = any(pa.seeking))
     and (cardinality(pb.seeking) = 0 or pa.gender = any(pb.seeking))
     and (pa.f_country is null or pb.country = pa.f_country)
     and (pb.f_country is null or pa.country = pb.f_country)
     and coalesce(date_part('year', age(current_date, pb.birthdate)) between pa.f_age_min and pa.f_age_max, true)
     and coalesce(date_part('year', age(current_date, pa.birthdate)) between pb.f_age_min and pb.f_age_max, true)
     and (cardinality(pa.f_desires) = 0 or pa.f_desires && pb.desires)
     and (cardinality(pb.f_desires) = 0 or pb.f_desires && pa.desires)
    from profiles pa, profiles pb where pa.id = a and pb.id = b
$$;

-- ---------- Presencia y estadísticas ----------
create or replace function public.touch_presence() returns void
language sql security definer set search_path = public as $$
  update profiles set last_seen_at = now() where id = auth.uid()
$$;

-- ---------- Tienda: códigos de descuento de empresas colaboradoras ----------
create table if not exists public.shop_offers (
  id          uuid primary key default gen_random_uuid(),
  brand       text not null,
  title       text not null,
  description text not null default '',
  discount    text not null default '',      -- p. ej. «-20 %»
  code        text,
  url         text check (url is null or url ~ '^https://'),
  category    text not null default 'Bienestar',
  logo_url    text check (logo_url is null or logo_url ~ '^https://'),
  sort        int not null default 100,
  active      boolean not null default true,
  expires_at  date,
  created_at  timestamptz not null default now()
);
alter table public.shop_offers enable row level security;
grant select on public.shop_offers to authenticated;
drop policy if exists shop_select on public.shop_offers;
create policy shop_select on public.shop_offers for select to authenticated
  using (active and (expires_at is null or expires_at >= current_date));

-- ---------- Showroom: emisiones en directo ----------
create table if not exists public.lives (
  id           uuid primary key default gen_random_uuid(),
  host         uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title        text not null default '' check (char_length(title) <= 80),
  peer_id      text not null,
  intimate     boolean not null default false,   -- contenido +18 (solo lo ve quien lo ha consentido)
  started_at   timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  ended_at     timestamptz
);
create index if not exists lives_active_idx on public.lives (ended_at, heartbeat_at desc);
alter table public.lives enable row level security;
grant select on public.lives to authenticated;
drop policy if exists lives_select on public.lives;
create policy lives_select on public.lives for select to authenticated
  using (host = auth.uid() or (ended_at is null and not public.is_blocked(auth.uid(), host)));

create table if not exists public.live_views (
  live_id   uuid not null references public.lives(id) on delete cascade,
  viewer    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (live_id, viewer)
);
alter table public.live_views enable row level security;  -- solo vía funciones

create or replace function public.start_live(p_title text, p_peer_id text, p_intimate boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not is_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  if not exists (select 1 from profiles where id = auth.uid() and showroom) then raise exception 'showroom_disabled'; end if;
  update lives set ended_at = now() where host = auth.uid() and ended_at is null;
  insert into lives (host, title, peer_id, intimate) values (auth.uid(), left(coalesce(p_title, ''), 80), p_peer_id, coalesce(p_intimate, false))
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.live_heartbeat(p_live uuid, p_peer_id text default null) returns void
language sql security definer set search_path = public as $$
  update lives set heartbeat_at = now(), peer_id = coalesce(p_peer_id, peer_id)
   where id = p_live and host = auth.uid() and ended_at is null
$$;

create or replace function public.end_live(p_live uuid) returns void
language sql security definer set search_path = public as $$
  update lives set ended_at = now() where id = p_live and host = auth.uid() and ended_at is null
$$;

-- Personas conectadas en las últimas 12 h (total y por modalidad)
create or replace function public.stats_12h() returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'online_12h', (select count(*) from profiles where last_seen_at > now() - interval '12 hours'),
    'online_now', (select count(*) from profiles where last_seen_at > now() - interval '5 minutes'),
    'social',   (select count(distinct u) from calls, unnest(array[user_a, user_b]) u where mode = 'social'   and started_at > now() - interval '12 hours'),
    'voice',    (select count(distinct u) from calls, unnest(array[user_a, user_b]) u where mode = 'voice'    and started_at > now() - interval '12 hours'),
    'intimate', (select count(distinct u) from calls, unnest(array[user_a, user_b]) u where mode = 'intimate' and started_at > now() - interval '12 hours'),
    'lives',    (select count(*) from lives where ended_at is null and heartbeat_at > now() - interval '1 minute')
  )
$$;

-- Entrar a ver un directo: devuelve el identificador de conexión de quien emite
create or replace function public.join_live(p_live uuid) returns json
language plpgsql security definer set search_path = public as $$
declare l record;
begin
  if not is_verified(auth.uid()) then raise exception 'age_not_verified'; end if;
  select * into l from lives where id = p_live and ended_at is null and heartbeat_at > now() - interval '1 minute';
  if not found then raise exception 'live_ended'; end if;
  if is_blocked(auth.uid(), l.host) then raise exception 'blocked'; end if;
  insert into live_views (live_id, viewer) values (p_live, auth.uid()) on conflict do nothing;
  return json_build_object('peer_id', l.peer_id, 'host', l.host);
end $$;

-- Quien ha visto un directo puede escribir o proponer una videollamada a quien emite (y al revés)
create or replace function public.have_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() in (a, b) and (
    exists (select 1 from calls where (user_a = a and user_b = b) or (user_a = b and user_b = a))
    or exists (select 1 from live_views v join lives l on l.id = v.live_id
                where (l.host = a and v.viewer = b) or (l.host = b and v.viewer = a))
  )
$$;

-- Conversaciones: personas con las que has hablado por llamada, directo o mensajes
create or replace function public.my_conversations()
returns table (partner uuid, alias text, avatar_path text, last_kind text, last_body text,
               last_at timestamptz, last_from_me boolean, unread int, last_call_at timestamptz)
language sql stable security definer set search_path = public as $$
  with partners as (
    select partner, max(at) as last_call_at from (
      select case when user_a = auth.uid() then user_b else user_a end as partner, started_at as at
        from calls where auth.uid() in (user_a, user_b)
      union all
      select case when sender = auth.uid() then recipient else sender end, created_at
        from messages where auth.uid() in (sender, recipient)

    ) x group by partner
  )
  select pr.partner, p.alias, p.avatar_path, lm.kind, case when lm.kind = 'text' then lm.body end,
         coalesce(lm.created_at, pr.last_call_at), lm.sender = auth.uid(),
         (select count(*) from messages u where u.sender = pr.partner and u.recipient = auth.uid() and u.read_at is null)::int,
         pr.last_call_at
    from partners pr
    join profiles p on p.id = pr.partner
    left join lateral (
      select * from messages m
       where (m.sender = auth.uid() and m.recipient = pr.partner) or (m.sender = pr.partner and m.recipient = auth.uid())
       order by m.created_at desc limit 1
    ) lm on true
   where not is_blocked(auth.uid(), pr.partner)
   order by coalesce(lm.created_at, pr.last_call_at) desc
$$;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'lives') then
    alter publication supabase_realtime add table public.lives;
  end if;
end $$;

revoke execute on function public.touch_presence(), public.stats_12h(), public.start_live(text, text, boolean),
  public.live_heartbeat(uuid, text), public.end_live(uuid), public.join_live(uuid) from public, anon;
grant execute on function public.touch_presence(), public.stats_12h(), public.start_live(text, text, boolean),
  public.live_heartbeat(uuid, text), public.end_live(uuid), public.join_live(uuid), public.prefs_match(uuid, uuid),
  public.have_connected(uuid, uuid), public.my_conversations() to authenticated;
