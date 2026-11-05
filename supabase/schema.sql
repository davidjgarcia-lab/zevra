-- =====================================================================
-- ZEVRA · esquema de base de datos para Supabase
-- Cómo usarlo: Supabase › SQL Editor › New query › pega todo › Run.
-- Se puede ejecutar varias veces: no borra datos existentes.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Perfiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  alias            text not null default 'Nuevo usuario' check (char_length(alias) between 2 and 20),
  bio              text not null default '' check (char_length(bio) <= 160),
  pronouns         text not null default '',
  interests        text[] not null default '{}',
  avatar_path      text,
  birthdate        date,                -- privado: solo lo ve la base de datos
  dni_hash         text unique,         -- privado: huella del nº de documento, impide cuentas duplicadas
  age_verified_at  timestamptz,
  created_at       timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- Columnas visibles y editables (birthdate y dni_hash quedan fuera)
revoke all on public.profiles from anon, authenticated;
grant select (id, alias, bio, pronouns, interests, avatar_path, age_verified_at, created_at) on public.profiles to authenticated;
grant update (alias, bio, pronouns, interests, avatar_path) on public.profiles to authenticated;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Crear el perfil automáticamente al registrarse (email o Google)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_alias text;
begin
  v_alias := coalesce(nullif(new.raw_user_meta_data->>'alias', ''),
                      split_part(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), ' ', 1),
                      '');
  if char_length(v_alias) < 2 then v_alias := 'Usuario' || substr(replace(new.id::text, '-', ''), 1, 4); end if;
  insert into public.profiles (id, alias) values (new.id, left(v_alias, 20)) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_verified(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = p_user and age_verified_at is not null)
$$;

-- Verificación de edad con DNI. La app lee la zona MRZ del reverso del DNI,
-- comprueba los dígitos de control y envía fecha de nacimiento, caducidad y la huella del nº.
create or replace function public.verify_age(p_birthdate date, p_expiry date, p_doc_hash text)
returns json language plpgsql security definer set search_path = public as $$
declare v_age int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_birthdate is null or p_doc_hash is null or char_length(p_doc_hash) < 32 then raise exception 'invalid_document'; end if;
  if p_expiry is not null and p_expiry < current_date then raise exception 'document_expired'; end if;
  v_age := date_part('year', age(current_date, p_birthdate));
  if v_age < 18 then raise exception 'underage'; end if;
  if v_age > 120 then raise exception 'invalid_document'; end if;
  if exists (select 1 from profiles where dni_hash = p_doc_hash and id <> auth.uid()) then
    raise exception 'document_in_use';
  end if;
  update profiles set birthdate = p_birthdate, dni_hash = p_doc_hash, age_verified_at = now()
   where id = auth.uid();
  return json_build_object('ok', true, 'age', v_age);
end $$;

-- ---------------------------------------------------------------------
-- Bloqueos y denuncias
-- ---------------------------------------------------------------------
create table if not exists public.blocks (
  blocker    uuid not null references public.profiles(id) on delete cascade,
  blocked    uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.blocks enable row level security;
grant select, insert, delete on public.blocks to authenticated;
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks for all to authenticated
  using (blocker = auth.uid()) with check (blocker = auth.uid());

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a))
$$;

create table if not exists public.reports (
  id         bigint generated always as identity primary key,
  reporter   uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  reported   uuid not null references public.profiles(id) on delete cascade,
  call_id    uuid,
  reason     text not null check (char_length(reason) <= 300),
  details    text check (char_length(details) <= 1000),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
grant insert on public.reports to authenticated;
grant usage on sequence public.reports_id_seq to authenticated;
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert to authenticated with check (reporter = auth.uid());

-- ---------------------------------------------------------------------
-- Emparejamiento y llamadas
-- ---------------------------------------------------------------------
create table if not exists public.calls (
  id         uuid primary key default gen_random_uuid(),
  user_a     uuid not null references public.profiles(id) on delete cascade, -- quien esperaba
  user_b     uuid not null references public.profiles(id) on delete cascade, -- quien llama
  mode       text not null check (mode in ('social', 'voice', 'intimate')),
  a_peer     text,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);
create index if not exists calls_a_idx on public.calls (user_a, started_at desc);
create index if not exists calls_b_idx on public.calls (user_b, started_at desc);
alter table public.calls enable row level security;
grant select on public.calls to authenticated;
drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls for select to authenticated
  using (auth.uid() in (user_a, user_b));

create table if not exists public.match_queue (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  mode       text not null check (mode in ('social', 'voice', 'intimate')),
  peer_id    text not null,
  created_at timestamptz not null default now()
);
alter table public.match_queue enable row level security;  -- sin políticas: solo vía funciones

create or replace function public.find_match(p_mode text, p_peer_id text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other record; v_call uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not is_verified(me) then raise exception 'age_not_verified'; end if;
  delete from match_queue where user_id = me or created_at < now() - interval '3 minutes';

  select q.* into other from match_queue q
   where q.mode = p_mode and q.user_id <> me and not is_blocked(me, q.user_id)
   order by q.created_at
   for update skip locked limit 1;

  if found then
    delete from match_queue where user_id = other.user_id;
    insert into calls (user_a, user_b, mode, a_peer) values (other.user_id, me, p_mode, other.peer_id)
      returning id into v_call;
    return json_build_object('call_id', v_call, 'peer_id', other.peer_id, 'partner_id', other.user_id);
  end if;

  insert into match_queue (user_id, mode, peer_id) values (me, p_mode, p_peer_id);
  return null;
end $$;

create or replace function public.leave_queue() returns void
language sql security definer set search_path = public as $$
  delete from match_queue where user_id = auth.uid()
$$;

create or replace function public.end_call(p_call uuid) returns json
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  update calls set ended_at = coalesce(ended_at, now())
   where id = p_call and auth.uid() in (user_a, user_b)
  returning * into c;
  if not found then raise exception 'call_not_found'; end if;
  return json_build_object('seconds', extract(epoch from (c.ended_at - c.started_at))::int);
end $$;

-- Llamar de nuevo a alguien con quien ya conectaste (desde el chat)
create table if not exists public.call_invites (
  id         uuid primary key default gen_random_uuid(),
  caller     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  callee     uuid not null references public.profiles(id) on delete cascade,
  mode       text not null check (mode in ('social', 'voice', 'intimate')),
  peer_id    text not null,
  status     text not null default 'ringing' check (status in ('ringing', 'accepted', 'declined', 'cancelled')),
  call_id    uuid references public.calls(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.call_invites enable row level security;
grant select on public.call_invites to authenticated;
drop policy if exists invites_select on public.call_invites;
create policy invites_select on public.call_invites for select to authenticated
  using (auth.uid() in (caller, callee));

create or replace function public.have_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from calls where (user_a = a and user_b = b) or (user_a = b and user_b = a))
$$;

create or replace function public.invite_call(p_callee uuid, p_mode text, p_peer_id text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not have_connected(auth.uid(), p_callee) then raise exception 'not_connected'; end if;
  if is_blocked(auth.uid(), p_callee) then raise exception 'blocked'; end if;
  update call_invites set status = 'cancelled' where caller = auth.uid() and status = 'ringing';
  insert into call_invites (caller, callee, mode, peer_id) values (auth.uid(), p_callee, p_mode, p_peer_id)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.answer_invite(p_invite uuid, p_accept boolean, p_peer_id text default null)
returns json language plpgsql security definer set search_path = public as $$
declare i record; v_call uuid;
begin
  select * into i from call_invites where id = p_invite and callee = auth.uid() and status = 'ringing'
     and created_at > now() - interval '2 minutes' for update;
  if not found then raise exception 'invite_expired'; end if;
  if not p_accept then
    update call_invites set status = 'declined' where id = p_invite;
    return null;
  end if;
  insert into calls (user_a, user_b, mode, a_peer) values (i.caller, auth.uid(), i.mode, i.peer_id)
    returning id into v_call;
  update call_invites set status = 'accepted', call_id = v_call where id = p_invite;
  return json_build_object('call_id', v_call, 'peer_id', i.peer_id, 'partner_id', i.caller, 'mode', i.mode);
end $$;

create or replace function public.cancel_invite(p_invite uuid) returns void
language sql security definer set search_path = public as $$
  update call_invites set status = 'cancelled' where id = p_invite and caller = auth.uid() and status = 'ringing'
$$;

-- ---------------------------------------------------------------------
-- Puntuación de respeto: solo tras llamadas de 4 minutos o más
-- ---------------------------------------------------------------------
create table if not exists public.ratings (
  call_id    uuid not null references public.calls(id) on delete cascade,
  rater      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  ratee      uuid not null references public.profiles(id) on delete cascade,
  score      smallint not null check (score between 1 and 5),
  created_at timestamptz not null default now(),
  primary key (call_id, rater)
);
alter table public.ratings enable row level security;
grant insert on public.ratings to authenticated;
grant select (call_id, rater) on public.ratings to authenticated;
drop policy if exists ratings_insert on public.ratings;
create policy ratings_insert on public.ratings for insert to authenticated with check (
  rater = auth.uid() and ratee <> auth.uid() and exists (
    select 1 from calls c
     where c.id = call_id
       and ((c.user_a = auth.uid() and c.user_b = ratee) or (c.user_b = auth.uid() and c.user_a = ratee))
       and c.ended_at is not null
       and c.ended_at - c.started_at >= interval '4 minutes'
       and c.ended_at > now() - interval '7 days'
  )
);
-- cada persona solo ve qué llamadas ya ha valorado ella (nunca quién le valoró a ella)
drop policy if exists ratings_select on public.ratings;
create policy ratings_select on public.ratings for select to authenticated using (rater = auth.uid());

-- Tarjeta pública de perfil (incluye edad y respeto; nunca la fecha exacta ni el DNI)
drop view if exists public.profile_cards;
create view public.profile_cards as
  select p.id, p.alias, p.bio, p.pronouns, p.interests, p.avatar_path,
         (p.age_verified_at is not null) as verified,
         date_part('year', age(current_date, p.birthdate))::int as age,
         round(avg(r.score)::numeric, 1) as respect_score,
         count(r.score)::int as respect_count,
         (select count(*) from public.calls c where c.user_a = p.id or c.user_b = p.id)::int as connections
    from public.profiles p
    left join public.ratings r on r.ratee = p.id
   group by p.id;
revoke all on public.profile_cards from anon;
grant select on public.profile_cards to authenticated;

-- ---------------------------------------------------------------------
-- Fotos públicas y privadas
-- ---------------------------------------------------------------------
create table if not exists public.photos (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  path       text not null unique,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists photos_owner_idx on public.photos (owner, created_at desc);
alter table public.photos enable row level security;
grant select, insert, delete on public.photos to authenticated;
drop policy if exists photos_select on public.photos;
create policy photos_select on public.photos for select to authenticated using (true);
drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos for insert to authenticated with check (
  owner = auth.uid()
  and split_part(path, '/', 1) = auth.uid()::text
  and split_part(path, '/', 2) = case when is_private then 'private' else 'public' end
);
drop policy if exists photos_delete on public.photos;
create policy photos_delete on public.photos for delete to authenticated using (owner = auth.uid());

create table if not exists public.photo_access (
  owner      uuid not null references public.profiles(id) on delete cascade,
  viewer     uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (owner, viewer),
  check (owner <> viewer)
);
alter table public.photo_access enable row level security;
grant select, insert, delete on public.photo_access to authenticated;
grant update (status, decided_at) on public.photo_access to authenticated;
drop policy if exists access_select on public.photo_access;
create policy access_select on public.photo_access for select to authenticated
  using (auth.uid() in (owner, viewer));
drop policy if exists access_request on public.photo_access;
create policy access_request on public.photo_access for insert to authenticated
  with check (viewer = auth.uid() and status = 'pending' and not public.is_blocked(owner, viewer));
drop policy if exists access_decide on public.photo_access;
create policy access_decide on public.photo_access for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists access_delete on public.photo_access;
create policy access_delete on public.photo_access for delete to authenticated
  using (auth.uid() in (owner, viewer));

create or replace function public.can_see_private(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid() or exists (
    select 1 from photo_access a where a.owner = p_owner and a.viewer = auth.uid() and a.status = 'approved'
  )
$$;

-- ---------------------------------------------------------------------
-- Chat con personas con las que ya has conectado
-- Fotos: se destruyen a los 10 s de abrirse. Vídeos: al terminar de verse.
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  sender     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  recipient  uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('text', 'image', 'video')),
  body       text check (char_length(body) <= 2000),
  media_path text,
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  viewed_at  timestamptz,
  check ((kind = 'text' and body is not null and media_path is null) or (kind <> 'text' and media_path is not null))
);
create index if not exists messages_pair_idx on public.messages (sender, recipient, created_at desc);
create index if not exists messages_recipient_idx on public.messages (recipient, created_at desc);
alter table public.messages enable row level security;
grant select, insert on public.messages to authenticated;
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (auth.uid() in (sender, recipient));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated with check (
  sender = auth.uid() and recipient <> auth.uid()
  and public.have_connected(sender, recipient)
  and not public.is_blocked(sender, recipient)
  and read_at is null and viewed_at is null
  and (media_path is null or split_part(media_path, '/', 1) = auth.uid()::text)
);

create or replace function public.mark_read(p_partner uuid) returns void
language sql security definer set search_path = public as $$
  update messages set read_at = now() where recipient = auth.uid() and sender = p_partner and read_at is null
$$;

-- Abrir una foto o vídeo efímero: solo una vez, solo quien lo recibe.
create or replace function public.open_media(p_message uuid) returns text
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  update messages set viewed_at = now(), read_at = coalesce(read_at, now())
   where id = p_message and recipient = auth.uid() and kind <> 'text' and viewed_at is null
  returning * into m;
  if not found then raise exception 'media_already_viewed'; end if;
  return m.media_path;
end $$;

-- Lista de conversaciones: todas las personas con las que has conectado
create or replace function public.my_conversations()
returns table (partner uuid, alias text, avatar_path text, last_kind text, last_body text,
               last_at timestamptz, last_from_me boolean, unread int, last_call_at timestamptz)
language sql stable security definer set search_path = public as $$
  with partners as (
    select case when user_a = auth.uid() then user_b else user_a end as partner, max(started_at) as last_call_at
      from calls where auth.uid() in (user_a, user_b) group by 1
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

-- Llamadas recientes con la valoración pendiente
create or replace function public.my_calls(p_limit int default 30)
returns table (call_id uuid, partner uuid, alias text, avatar_path text, mode text,
               started_at timestamptz, seconds int, can_rate boolean)
language sql stable security definer set search_path = public as $$
  select c.id, case when c.user_a = auth.uid() then c.user_b else c.user_a end, p.alias, p.avatar_path, c.mode,
         c.started_at, extract(epoch from (coalesce(c.ended_at, c.started_at) - c.started_at))::int,
         (c.ended_at is not null and c.ended_at - c.started_at >= interval '4 minutes'
           and c.ended_at > now() - interval '7 days'
           and not exists (select 1 from ratings r where r.call_id = c.id and r.rater = auth.uid()))
    from calls c
    join profiles p on p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
   where auth.uid() in (c.user_a, c.user_b)
   order by c.started_at desc limit p_limit
$$;

-- Borrar mi cuenta y todos mis datos
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from auth.users where id = auth.uid();
end $$;

-- ---------------------------------------------------------------------
-- Almacenamiento de archivos (Storage)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
       ('chat-media', 'chat-media', false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- photos: <uid>/public/<archivo> (cualquier usuario) · <uid>/private/<archivo> (con permiso)
drop policy if exists "zevra photos read" on storage.objects;
create policy "zevra photos read" on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    (storage.foldername(name))[2] in ('public', 'avatar')
    or ((storage.foldername(name))[2] = 'private' and public.can_see_private(((storage.foldername(name))[1])::uuid))
  )
);
drop policy if exists "zevra photos write" on storage.objects;
create policy "zevra photos write" on storage.objects for insert to authenticated with check (
  bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "zevra photos delete" on storage.objects;
create policy "zevra photos delete" on storage.objects for delete to authenticated using (
  bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text
);

-- chat-media: solo el destinatario, solo en los 2 minutos siguientes a abrirlo
drop policy if exists "zevra chat upload" on storage.objects;
create policy "zevra chat upload" on storage.objects for insert to authenticated with check (
  bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text
);
drop policy if exists "zevra chat read once" on storage.objects;
create policy "zevra chat read once" on storage.objects for select to authenticated using (
  bucket_id = 'chat-media' and exists (
    select 1 from public.messages m
     where m.media_path = storage.objects.name and m.recipient = auth.uid()
       and m.viewed_at is not null and m.viewed_at > now() - interval '2 minutes'
  )
);
drop policy if exists "zevra chat delete" on storage.objects;
create policy "zevra chat delete" on storage.objects for delete to authenticated using (
  bucket_id = 'chat-media' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.messages m where m.media_path = storage.objects.name
                and m.recipient = auth.uid() and m.viewed_at is not null)
  )
);

-- ---------------------------------------------------------------------
-- Tiempo real (chat, llamadas, solicitudes)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages', 'calls', 'call_invites', 'photo_access'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Permisos de ejecución de funciones
revoke execute on all functions in schema public from anon, public;
grant execute on function public.verify_age(date, date, text), public.find_match(text, text), public.leave_queue(),
  public.end_call(uuid), public.invite_call(uuid, text, text), public.answer_invite(uuid, boolean, text),
  public.cancel_invite(uuid), public.mark_read(uuid), public.open_media(uuid), public.my_conversations(),
  public.my_calls(int), public.delete_my_account(), public.is_blocked(uuid, uuid), public.can_see_private(uuid),
  public.have_connected(uuid, uuid), public.is_verified(uuid)
  to authenticated;


-- =====================================================================
-- ZEVRA · actualización 02: filtros de género, «me gusta» y emparejamiento por preferencias
-- Ejecuta este archivo en Supabase › SQL Editor (después de schema.sql). Se puede repetir.
-- =====================================================================

-- Género y a quién quiero conocer (vacío = a todo el mundo)
alter table public.profiles add column if not exists gender text check (gender in ('mujer', 'hombre', 'no_binario'));
alter table public.profiles add column if not exists seeking text[] not null default '{}';
grant select (gender, seeking) on public.profiles to authenticated;
grant update (gender, seeking) on public.profiles to authenticated;

-- Tarjeta pública con el género (se añade al final para no romper la vista)
drop view if exists public.profile_cards;
create view public.profile_cards as
  select p.id, p.alias, p.bio, p.pronouns, p.interests, p.avatar_path,
         (p.age_verified_at is not null) as verified,
         date_part('year', age(current_date, p.birthdate))::int as age,
         round(avg(r.score)::numeric, 1) as respect_score,
         count(r.score)::int as respect_count,
         (select count(*) from public.calls c where c.user_a = p.id or c.user_b = p.id)::int as connections,
         p.gender, p.seeking
    from public.profiles p
    left join public.ratings r on r.ratee = p.id
   group by p.id;
revoke all on public.profile_cards from anon;
grant select on public.profile_cards to authenticated;

-- ¿Encajan las preferencias de ambas personas?
create or replace function public.prefs_match(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (cardinality(pa.seeking) = 0 or pb.gender = any(pa.seeking))
     and (cardinality(pb.seeking) = 0 or pa.gender = any(pb.seeking))
    from profiles pa, profiles pb where pa.id = a and pb.id = b
$$;

create or replace function public.find_match(p_mode text, p_peer_id text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other record; v_call uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not is_verified(me) then raise exception 'age_not_verified'; end if;
  delete from match_queue where user_id = me or created_at < now() - interval '3 minutes';

  -- Prioriza gente nueva (no repetir con quien acabas de hablar) y a quien lleva más esperando
  select q.* into other from match_queue q
   where q.mode = p_mode and q.user_id <> me
     and not is_blocked(me, q.user_id)
     and coalesce(prefs_match(me, q.user_id), true)
   order by exists (select 1 from calls c where c.started_at > now() - interval '10 minutes'
                       and ((c.user_a = me and c.user_b = q.user_id) or (c.user_b = me and c.user_a = q.user_id))),
            q.created_at
   for update skip locked limit 1;

  if found then
    delete from match_queue where user_id = other.user_id;
    insert into calls (user_a, user_b, mode, a_peer) values (other.user_id, me, p_mode, other.peer_id)
      returning id into v_call;
    return json_build_object('call_id', v_call, 'peer_id', other.peer_id, 'partner_id', other.user_id);
  end if;

  insert into match_queue (user_id, mode, peer_id) values (me, p_mode, p_peer_id);
  return null;
end $$;

-- «Me gusta» (estilo Tinder): si es mutuo, os avisamos
create table if not exists public.likes (
  liker      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  likee      uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (liker, likee),
  check (liker <> likee)
);
alter table public.likes enable row level security;
grant select on public.likes to authenticated;
drop policy if exists likes_select on public.likes;
create policy likes_select on public.likes for select to authenticated using (auth.uid() in (liker, likee));

create or replace function public.like_user(p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not have_connected(auth.uid(), p_user) then raise exception 'not_connected'; end if;
  if is_blocked(auth.uid(), p_user) then raise exception 'blocked'; end if;
  insert into likes (liker, likee) values (auth.uid(), p_user) on conflict do nothing;
  return exists (select 1 from likes where liker = p_user and likee = auth.uid());
end $$;

-- Cerrar llamadas que se quedaron abiertas (alguien cerró la app sin colgar)
create or replace function public.close_stale_calls() returns void
language sql security definer set search_path = public as $$
  update calls set ended_at = started_at + interval '1 minute'
   where ended_at is null and started_at < now() - interval '3 hours'
     and auth.uid() in (user_a, user_b)
$$;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'likes') then
    alter publication supabase_realtime add table public.likes;
  end if;
end $$;

revoke execute on function public.prefs_match(uuid, uuid), public.like_user(uuid), public.close_stale_calls() from anon, public;
grant execute on function public.prefs_match(uuid, uuid), public.like_user(uuid), public.close_stale_calls(), public.find_match(text, text) to authenticated;


-- =====================================================================
-- ZEVRA · actualización 03: servidores TURN para que el vídeo funcione con datos móviles
-- Ejecuta este archivo en Supabase › SQL Editor. Se puede repetir.
--
-- Después, guarda tus credenciales de Cloudflare TURN (ver README) con:
--   select public.set_turn_config('TU_TURN_KEY_ID', 'TU_API_TOKEN');
-- =====================================================================

create extension if not exists http with schema extensions;

-- Ajustes privados: nadie puede leerlos desde la app (RLS sin políticas)
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

-- Guardar las credenciales de Cloudflare TURN (solo desde el SQL Editor)
create or replace function public.set_turn_config(p_key_id text, p_token text) returns text
language plpgsql security definer set search_path = public as $$
begin
  insert into app_settings (key, value) values ('cloudflare_turn', jsonb_build_object('key_id', p_key_id, 'token', p_token))
  on conflict (key) do update set value = excluded.value, updated_at = now();
  delete from app_settings where key = 'ice_cache';
  return 'Credenciales de TURN guardadas';
end $$;
revoke execute on function public.set_turn_config(text, text) from public, anon, authenticated;

-- Alternativa: servidores TURN fijos de otro proveedor (Metered, ExpressTURN…)
-- select public.set_static_ice('[{"urls":["turn:servidor:3478"],"username":"u","credential":"c"}]');
create or replace function public.set_static_ice(p_servers jsonb) returns text
language plpgsql security definer set search_path = public as $$
begin
  insert into app_settings (key, value) values ('ice_servers', p_servers)
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return 'Servidores ICE guardados';
end $$;
revoke execute on function public.set_static_ice(jsonb) from public, anon, authenticated;

-- La app pide aquí los servidores para cada llamada. Las credenciales de Cloudflare
-- se generan en el servidor (la clave nunca llega al móvil) y se reutilizan 12 h.
create or replace function public.get_ice_servers() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare cfg jsonb; cache_val jsonb; cache_at timestamptz; resp record; servers jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select value, updated_at into cache_val, cache_at from app_settings where key = 'ice_cache';
  if cache_at is not null and cache_at > now() - interval '12 hours' then
    servers := cache_val;
  else
    select value into cfg from app_settings where key = 'cloudflare_turn';
    if cfg is not null then
      begin
        select status, content into resp from extensions.http((
          'POST',
          'https://rtc.live.cloudflare.com/v1/turn/keys/' || (cfg->>'key_id') || '/credentials/generate-ice-servers',
          array[extensions.http_header('Authorization', 'Bearer ' || (cfg->>'token'))],
          'application/json',
          '{"ttl": 86400}'
        )::extensions.http_request);
        if resp.status between 200 and 299 then
          servers := coalesce((resp.content::jsonb)->'iceServers', '[]'::jsonb);
          if jsonb_typeof(servers) = 'object' then servers := jsonb_build_array(servers); end if; -- ambos formatos de respuesta
          insert into app_settings (key, value) values ('ice_cache', servers)
          on conflict (key) do update set value = excluded.value, updated_at = now();
        end if;
      exception when others then
        servers := coalesce(cache_val, '[]'::jsonb); -- si Cloudflare falla, usar lo último que funcionó
      end;
    end if;
  end if;

  select servers || coalesce((select value from app_settings where key = 'ice_servers'), '[]'::jsonb) into servers;
  return servers;
end $$;
revoke execute on function public.get_ice_servers() from public, anon;
grant execute on function public.get_ice_servers() to authenticated;


-- =====================================================================
-- ZEVRA · actualización 04: privacidad de las funciones auxiliares
-- Las funciones auxiliares solo responden si quien pregunta es una de las dos personas
-- (antes cualquier usuario podía consultar si otras dos personas habían hablado o se habían bloqueado).
-- Se puede repetir.
-- =====================================================================

create or replace function public.have_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() in (a, b) and exists (
    select 1 from calls where (user_a = a and user_b = b) or (user_a = b and user_b = a)
  )
$$;

create or replace function public.is_blocked(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() in (a, b) and exists (
    select 1 from blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  )
$$;

create or replace function public.prefs_match(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() in (a, b)
     and (cardinality(pa.seeking) = 0 or pb.gender = any(pa.seeking))
     and (cardinality(pb.seeking) = 0 or pa.gender = any(pb.seeking))
    from profiles pa, profiles pb where pa.id = a and pb.id = b
$$;

-- La función del disparador de registro no debe poder llamarse desde la app
revoke execute on function public.handle_new_user() from public, anon, authenticated;
