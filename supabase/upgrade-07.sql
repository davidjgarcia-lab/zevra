-- =====================================================================
-- ZEVRA · actualización 07: avisos de captura de pantalla
-- Cuando la app de Android detecta un intento de captura mientras alguien mira tu perfil,
-- tus fotos/vídeos o tu chat, te llega un aviso. Se puede repetir.
-- =====================================================================
create table if not exists public.screenshot_alerts (
  id         bigint generated always as identity primary key,
  owner      uuid not null references public.profiles(id) on delete cascade,  -- a quien se le intentó capturar
  actor      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  context    text not null check (context in ('profile', 'photo', 'chat', 'call', 'live')),
  created_at timestamptz not null default now(),
  check (owner <> actor)
);
create index if not exists screenshot_alerts_owner_idx on public.screenshot_alerts (owner, created_at desc);
alter table public.screenshot_alerts enable row level security;
grant select, insert on public.screenshot_alerts to authenticated;
grant usage on sequence public.screenshot_alerts_id_seq to authenticated;
drop policy if exists shot_insert on public.screenshot_alerts;
create policy shot_insert on public.screenshot_alerts for insert to authenticated
  with check (actor = auth.uid() and not public.is_blocked(actor, owner));
drop policy if exists shot_select on public.screenshot_alerts;
create policy shot_select on public.screenshot_alerts for select to authenticated using (owner = auth.uid());

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'screenshot_alerts') then
    alter publication supabase_realtime add table public.screenshot_alerts;
  end if;
end $$;
