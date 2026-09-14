-- BuildChat — Row Level Security (isolamento entre empresas)
--
-- Regra de ouro: NENHUMA linha é visível fora da empresa do usuário autenticado.
-- Além disso:
--   * registros com escopo 'pessoal' só aparecem para o dono;
--   * registros com escopo 'empresa' só podem ser criados/alterados por admin;
--   * dados operacionais (vínculos de pasta e anotações) são de toda a empresa.
--
-- As funções auxiliares são SECURITY DEFINER para não recursar na política de
-- `usuarios` (uma policy que consultasse `usuarios` sem isso entraria em loop).

create schema if not exists app;

create or replace function app.empresa_atual() returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select u.empresa_id from public.usuarios u where u.id = auth.uid() and u.ativo
$$;

create or replace function app.eh_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select u.papel = 'admin' from public.usuarios u where u.id = auth.uid() and u.ativo),
    false)
$$;

-- Pode ver este registro? (empresa bate E — se pessoal — é meu)
create or replace function app.pode_ver(p_empresa uuid, p_escopo text, p_owner uuid)
returns boolean language sql stable as $$
  select p_empresa = app.empresa_atual()
     and (p_escopo = 'empresa' or p_owner = auth.uid())
$$;

-- Pode escrever este registro? (pessoal: só o dono; da empresa: só admin)
create or replace function app.pode_escrever(p_empresa uuid, p_escopo text, p_owner uuid)
returns boolean language sql stable as $$
  select p_empresa = app.empresa_atual()
     and case
           when p_escopo = 'pessoal' then p_owner = auth.uid()
           else app.eh_admin()
         end
$$;

-- ───────────────────────────── Habilita RLS ───────────────────────────────────

alter table empresas        enable row level security;
alter table usuarios        enable row level security;
alter table convites        enable row level security;
alter table pastas          enable row level security;
alter table pasta_conversas enable row level security;
alter table categorias      enable row level security;
alter table respostas       enable row level security;
alter table resposta_acoes  enable row level security;
alter table anotacoes       enable row level security;
alter table config_usuario  enable row level security;

-- ───────────────────────────── Tenant e acesso ────────────────────────────────

drop policy if exists empresas_ver on empresas;
create policy empresas_ver on empresas for select
  using (id = app.empresa_atual());

drop policy if exists empresas_admin on empresas;
create policy empresas_admin on empresas for update
  using (id = app.empresa_atual() and app.eh_admin())
  with check (id = app.empresa_atual() and app.eh_admin());

drop policy if exists usuarios_ver on usuarios;
create policy usuarios_ver on usuarios for select
  using (empresa_id = app.empresa_atual());

drop policy if exists usuarios_admin_escreve on usuarios;
create policy usuarios_admin_escreve on usuarios for all
  using (empresa_id = app.empresa_atual() and app.eh_admin())
  with check (empresa_id = app.empresa_atual() and app.eh_admin());

drop policy if exists usuarios_edita_a_si on usuarios;
create policy usuarios_edita_a_si on usuarios for update
  using (id = auth.uid())
  with check (id = auth.uid() and empresa_id = app.empresa_atual());

drop policy if exists convites_admin on convites;
create policy convites_admin on convites for all
  using (empresa_id = app.empresa_atual() and app.eh_admin())
  with check (empresa_id = app.empresa_atual() and app.eh_admin());

-- ──────────────── Dados com escopo (empresa × pessoal) ────────────────────────
-- pastas, categorias e respostas seguem exatamente a mesma regra.

do $$
declare t text;
begin
  foreach t in array array['pastas', 'categorias', 'respostas'] loop
    execute format('drop policy if exists %1$s_ver on %1$I;', t);
    execute format(
      'create policy %1$s_ver on %1$I for select
         using (app.pode_ver(empresa_id, escopo, owner_id));', t);

    execute format('drop policy if exists %1$s_escreve on %1$I;', t);
    execute format(
      'create policy %1$s_escreve on %1$I for all
         using (app.pode_escrever(empresa_id, escopo, owner_id))
         with check (app.pode_escrever(empresa_id, escopo, owner_id));', t);
  end loop;
end $$;

-- Ações herdam a permissão da resposta-mãe.
drop policy if exists acoes_ver on resposta_acoes;
create policy acoes_ver on resposta_acoes for select
  using (exists (
    select 1 from respostas r
     where r.id = resposta_id
       and app.pode_ver(r.empresa_id, r.escopo, r.owner_id)));

drop policy if exists acoes_escreve on resposta_acoes;
create policy acoes_escreve on resposta_acoes for all
  using (exists (
    select 1 from respostas r
     where r.id = resposta_id
       and app.pode_escrever(r.empresa_id, r.escopo, r.owner_id)))
  with check (exists (
    select 1 from respostas r
     where r.id = resposta_id
       and app.pode_escrever(r.empresa_id, r.escopo, r.owner_id)));

-- ──────────── Dados operacionais: de toda a empresa (por número) ──────────────

drop policy if exists pconv_empresa on pasta_conversas;
create policy pconv_empresa on pasta_conversas for all
  using (empresa_id = app.empresa_atual())
  with check (empresa_id = app.empresa_atual());

drop policy if exists anotacoes_empresa on anotacoes;
create policy anotacoes_empresa on anotacoes for all
  using (empresa_id = app.empresa_atual())
  with check (empresa_id = app.empresa_atual());

-- ─────────────────────── Preferências: só o dono ──────────────────────────────

drop policy if exists config_dono on config_usuario;
create policy config_dono on config_usuario for all
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid() and empresa_id = app.empresa_atual());

-- ─────────────────────────────── Privilégios ──────────────────────────────────
-- No Supabase o papel do usuário logado é `authenticated`. Sem estes grants a
-- RLS nem chega a ser avaliada (o acesso é negado antes).

grant usage on schema public, app to authenticated;
grant execute on all functions in schema app to authenticated;
grant select, insert, update, delete on
  empresas, usuarios, convites, pastas, pasta_conversas,
  categorias, respostas, resposta_acoes, anotacoes, config_usuario
  to authenticated;
