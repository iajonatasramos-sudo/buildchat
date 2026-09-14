-- BuildChat — perfil do gestor do sistema
--
-- A tabela sistema_operadores não é legível pela API (só as funções do
-- gestor). Para o painel mostrar com que conta o gestor está logado e deixar
-- ele ajustar o próprio nome, duas funções: uma lê, outra renomeia — sempre
-- a conta autenticada, nunca outra.

create or replace function public.sistema_meu_perfil()
returns table (nome text, email text, desde timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select o.nome, u.email::text, o.criado_em
    from sistema_operadores o
    join auth.users u on u.id = o.usuario_auth_id
   where o.usuario_auth_id = auth.uid()
$$;

create or replace function public.sistema_renomear_me(p_nome text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'informe o nome';
  end if;
  update sistema_operadores set nome = trim(p_nome) where usuario_auth_id = auth.uid();
end $$;

do $$
declare f text;
begin
  foreach f in array array['sistema_meu_perfil()', 'sistema_renomear_me(text)'] loop
    execute format('revoke execute on function public.%s from public, anon;', f);
    execute format('grant execute on function public.%s to authenticated;', f);
  end loop;
end $$;
