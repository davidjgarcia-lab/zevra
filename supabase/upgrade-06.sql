-- =====================================================================
-- ZEVRA · actualización 06: vídeos en el perfil, foto de portada, miniatura de los directos,
-- acceso a fotos privadas durante 12 h y emparejamiento que premia el respeto. Se puede repetir.
-- =====================================================================

-- Fotos y vídeos del perfil
alter table public.photos add column if not exists kind text not null default 'image' check (kind in ('image', 'video'));
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
 where id = 'photos';

-- Foto de portada
alter table public.profiles add column if not exists cover_path text;
grant select (cover_path) on public.profiles to authenticated;
grant update (cover_path) on public.profiles to authenticated;

-- Miniatura de los directos (captura de la emisión, se renueva cada 15 min)
alter table public.lives add column if not exists thumb_path text;
create or replace function public.set_live_thumb(p_live uuid, p_path text) returns void
language sql security definer set search_path = public as $$
  update lives set thumb_path = p_path
   where id = p_live and host = auth.uid() and ended_at is null
     and split_part(p_path, '/', 1) = auth.uid()::text and split_part(p_path, '/', 2) = 'live'
$$;

-- Carpetas visibles para cualquier usuario verificado: public, avatar, cover y live
drop policy if exists "zevra photos read" on storage.objects;
create policy "zevra photos read" on storage.objects for select to authenticated using (
  bucket_id = 'photos' and (
    (storage.foldername(name))[2] in ('public', 'avatar', 'cover', 'live')
    or ((storage.foldername(name))[2] = 'private' and public.can_see_private(((storage.foldername(name))[1])::uuid))
  )
);

-- El permiso para ver fotos privadas dura 12 horas desde que se concede
create or replace function public.can_see_private(p_owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_owner = auth.uid() or exists (
    select 1 from photo_access a
     where a.owner = p_owner and a.viewer = auth.uid() and a.status = 'approved'
       and a.decided_at > now() - interval '12 hours'
  )
$$;

-- Tarjeta pública con la portada
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
         p.created_at,
         p.cover_path
    from public.profiles p
    left join public.ratings r on r.ratee = p.id
   group by p.id;
revoke all on public.profile_cards from anon;
grant select on public.profile_cards to authenticated;

-- Emparejamiento: primero gente nueva; entre ellas, las de mejor puntuación de respeto
create or replace function public.find_match(p_mode text, p_peer_id text)
returns json language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); other record; v_call uuid;
begin
  if me is null then raise exception 'not_authenticated'; end if;
  if not is_verified(me) then raise exception 'age_not_verified'; end if;
  delete from match_queue where user_id = me or created_at < now() - interval '3 minutes';

  select q.* into other from match_queue q
   where q.mode = p_mode and q.user_id <> me
     and not is_blocked(me, q.user_id)
     and coalesce(prefs_match(me, q.user_id), true)
   order by exists (select 1 from calls c where c.started_at > now() - interval '10 minutes'
                       and ((c.user_a = me and c.user_b = q.user_id) or (c.user_b = me and c.user_a = q.user_id))),
            coalesce((select avg(r.score) from ratings r where r.ratee = q.user_id), 4) desc,
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

revoke execute on function public.set_live_thumb(uuid, text) from public, anon;
grant execute on function public.set_live_thumb(uuid, text), public.can_see_private(uuid), public.find_match(text, text) to authenticated;
