-- BuildChat — integração com o Supabase Auth e onboarding
--
-- Este arquivo assume que `auth.users` existe (no Supabase, existe; nos testes,
-- o harness cria um equivalente mínimo).

-- Um usuário do produto é sempre um usuário autenticado.
alter table usuarios
  drop constraint if exists usuarios_id_auth_fk;
alter table usuarios
  add constraint usuarios_id_auth_fk
  foreign key (id) references auth.users(id) on delete cascade;

-- ─────────────────────────── Cadastro da empresa ──────────────────────────────
-- Chamada logo após o signup: cria a empresa em teste grátis e promove quem
-- está autenticado a admin dela. SECURITY DEFINER porque, neste instante, o
-- usuário ainda não existe em `usuarios` e a RLS o barraria.

create or replace function public.criar_empresa_e_admin(p_empresa text, p_nome text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_empresa uuid;
  v_email   text;
begin
  if auth.uid() is null then
    raise exception 'sem sessão autenticada';
  end if;
  if exists (select 1 from usuarios where id = auth.uid()) then
    raise exception 'usuário já pertence a uma empresa';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into empresas (nome, status, trial_ate)
       values (p_empresa, 'trial', now() + interval '14 days')
    returning id into v_empresa;

  insert into usuarios (id, empresa_id, nome, email, papel)
       values (auth.uid(), v_empresa, p_nome, v_email, 'admin');

  insert into config_usuario (usuario_id, empresa_id)
       values (auth.uid(), v_empresa);

  return v_empresa;
end $$;

-- ────────────────────────────── Aceite de convite ─────────────────────────────
-- Consome um assento da empresa. Quem convida é sempre admin (política de RLS).

create or replace function public.aceitar_convite(p_token text, p_nome text)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_convite convites%rowtype;
  v_usados  integer;
  v_limite  integer;
  v_email   text;
begin
  if auth.uid() is null then
    raise exception 'sem sessão autenticada';
  end if;
  if exists (select 1 from usuarios where id = auth.uid()) then
    raise exception 'usuário já pertence a uma empresa';
  end if;

  select * into v_convite from convites
   where token = p_token and aceito_em is null and expira_em > now();
  if not found then
    raise exception 'convite inválido ou expirado';
  end if;

  select count(*), max(e.assentos) into v_usados, v_limite
    from usuarios u join empresas e on e.id = u.empresa_id
   where u.empresa_id = v_convite.empresa_id and u.ativo;
  if v_usados >= v_limite then
    raise exception 'limite de assentos da empresa atingido';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into usuarios (id, empresa_id, nome, email, papel)
       values (auth.uid(), v_convite.empresa_id, p_nome, v_email, v_convite.papel);
  insert into config_usuario (usuario_id, empresa_id)
       values (auth.uid(), v_convite.empresa_id);
  update convites set aceito_em = now() where id = v_convite.id;

  return v_convite.empresa_id;
end $$;

-- Estas duas são chamadas pela extensão via PostgREST (`rpc`), por isso vivem em
-- `public`. As auxiliares de permissão continuam em `app`, fora da API.
-- SECURITY DEFINER + acesso restrito: anônimo não executa.
revoke execute on function public.criar_empresa_e_admin(text, text) from public, anon;
revoke execute on function public.aceitar_convite(text, text) from public, anon;
grant execute on function public.criar_empresa_e_admin(text, text) to authenticated;
grant execute on function public.aceitar_convite(text, text) to authenticated;

-- Limpa versões anteriores que ficaram no schema app.
drop function if exists app.criar_empresa_e_admin(text, text);
drop function if exists app.aceitar_convite(text, text);
