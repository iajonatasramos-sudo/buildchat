-- BuildChat — painel do gestor do sistema (dono do produto)
--
-- Princípio: o operador do sistema administra ASSINATURAS e LIMITES, não o
-- conteúdo das clínicas. Por isso nada aqui abre a RLS dos inquilinos: o acesso
-- passa por funções SECURITY DEFINER que devolvem apenas dados administrativos
-- e agregados. Mensagens, contatos, anotações e conversas continuam fechados.

create table if not exists sistema_operadores (
  usuario_auth_id uuid primary key,   -- = auth.users.id
  nome            text not null,
  criado_em       timestamptz not null default now()
);

alter table sistema_operadores enable row level security;
-- Ninguém lê esta tabela pela API; só as funções abaixo (SECURITY DEFINER).
revoke all on sistema_operadores from anon, authenticated;

create or replace function app.eh_operador() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.sistema_operadores o where o.usuario_auth_id = auth.uid())
$$;

-- ──────────────────────────── Leitura agregada ────────────────────────────

-- `create or replace` não troca o tipo de retorno: derruba antes, para a
-- migração poder ser reaplicada mesmo depois de a 0009 estender a função.
drop function if exists public.sistema_empresas();
create function public.sistema_empresas()
returns table (
  id             uuid,
  nome           text,
  plano          text,
  status         text,
  trial_ate      timestamptz,
  assentos       integer,
  usuarios_ativos bigint,
  admin_email    text,
  mensagens      bigint,
  pastas         bigint,
  contatos       bigint,
  ultimo_acesso  timestamptz,
  criado_em      timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;

  return query
    select e.id, e.nome, e.plano, e.status, e.trial_ate, e.assentos,
           (select count(*) from usuarios u where u.empresa_id = e.id and u.ativo),
           (select u.email from usuarios u
             where u.empresa_id = e.id and u.papel = 'admin'
             order by u.criado_em limit 1),
           (select count(*) from respostas r where r.empresa_id = e.id and r.deleted_at is null),
           (select count(*) from pastas p where p.empresa_id = e.id and p.deleted_at is null),
           (select count(*) from contatos c where c.empresa_id = e.id and c.deleted_at is null),
           (select max(u.ultimo_acesso) from usuarios u where u.empresa_id = e.id),
           e.criado_em
      from empresas e
     order by e.criado_em desc;
end $$;

create or replace function public.sistema_resumo()
returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare r json;
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;

  select json_build_object(
    'empresas',        (select count(*) from empresas),
    'ativas',          (select count(*) from empresas where status = 'ativa'),
    'trial',           (select count(*) from empresas where status = 'trial'),
    'inadimplentes',   (select count(*) from empresas where status = 'inadimplente'),
    'canceladas',      (select count(*) from empresas where status = 'cancelada'),
    'assentos_pagos',  (select coalesce(sum(assentos), 0) from empresas where status = 'ativa'),
    'usuarios_ativos', (select count(*) from usuarios where ativo),
    'ativos_7d',       (select count(*) from usuarios where ultimo_acesso > now() - interval '7 days'),
    'contatos',        (select count(*) from contatos where deleted_at is null)
  ) into r;
  return r;
end $$;

-- ──────────────────────────── Ações do gestor ─────────────────────────────

create or replace function public.sistema_atualizar_empresa(
  p_empresa  uuid,
  p_status   text default null,
  p_plano    text default null,
  p_assentos integer default null,
  p_trial_ate timestamptz default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  if p_status is not null and p_status not in ('trial', 'ativa', 'inadimplente', 'cancelada') then
    raise exception 'status inválido';
  end if;
  if p_assentos is not null and p_assentos < 1 then
    raise exception 'a empresa precisa de pelo menos um assento';
  end if;

  update empresas
     set status    = coalesce(p_status, status),
         plano     = coalesce(p_plano, plano),
         assentos  = coalesce(p_assentos, assentos),
         trial_ate = coalesce(p_trial_ate, trial_ate)
   where id = p_empresa;
end $$;

revoke execute on function public.sistema_empresas() from public, anon;
revoke execute on function public.sistema_resumo() from public, anon;
revoke execute on function public.sistema_atualizar_empresa(uuid, text, text, integer, timestamptz) from public, anon;
grant execute on function public.sistema_empresas() to authenticated;
grant execute on function public.sistema_resumo() to authenticated;
grant execute on function public.sistema_atualizar_empresa(uuid, text, text, integer, timestamptz) to authenticated;

-- Diz se quem está logado é gestor do sistema (o painel usa para liberar a área).
create or replace function public.sou_operador() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select app.eh_operador()
$$;
revoke execute on function public.sou_operador() from public, anon;
grant execute on function public.sou_operador() to authenticated;

-- ─────────────────── Cobrança é do gestor, não do cliente ──────────────────
-- A RLS libera o admin a atualizar a própria empresa, mas ele NÃO pode mexer
-- no que é comercial (senão daria a si mesmo assentos sem pagar). Privilégio
-- por coluna resolve: só `nome` é editável pelo cliente; o resto passa pela
-- função do gestor, que roda como dono do banco.

revoke update on empresas from authenticated;
grant update (nome) on empresas to authenticated;
