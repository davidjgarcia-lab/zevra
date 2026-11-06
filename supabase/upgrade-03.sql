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
declare v_id text; v_token text;
begin
  -- Tolerar errores al pegar: espacios, comillas o letras sueltas alrededor de los valores
  v_id := substring(lower(p_key_id) from '[0-9a-f]{32}');
  v_token := substring(lower(p_token) from '[0-9a-f]{64}');
  if v_id is null then raise exception 'El Turn Token ID debe tener 32 caracteres (0-9, a-f).'; end if;
  if v_token is null then raise exception 'El API Token debe tener 64 caracteres (0-9, a-f).'; end if;
  insert into app_settings (key, value) values ('cloudflare_turn', jsonb_build_object('key_id', v_id, 'token', v_token))
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
