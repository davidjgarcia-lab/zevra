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
