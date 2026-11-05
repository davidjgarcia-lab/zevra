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
