-- BuildChat — integrações externas (APIs) administradas pelo gestor
--
-- Uma linha por integração. `empresa_id` nulo = vale para todas as clínicas
-- (padrão do sistema); preenchido = configuração específica daquela clínica,
-- que tem prioridade sobre o padrão.
--
-- ATENÇÃO ao token: quem usa o recurso na extensão precisa lê-lo, então ele
-- chega ao navegador do usuário. Para clínicas de terceiros, prefira um token
-- por empresa em vez do global.

create table if not exists integracoes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid references empresas(id) on delete cascade,
  chave         text not null,          -- 'propostas' | próximas integrações
  nome          text not null,
  url           text,
  token         text,
  ativo         boolean not null default true,
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Uma configuração por chave: uma global e, no máximo, uma por empresa.
create unique index if not exists idx_integracao_global
  on integracoes (chave) where empresa_id is null;
create unique index if not exists idx_integracao_empresa
  on integracoes (empresa_id, chave) where empresa_id is not null;

drop trigger if exists trg_integracoes_atualizado on integracoes;
create trigger trg_integracoes_atualizado before update on integracoes
for each row execute function public.tocar_atualizado_em();

alter table integracoes enable row level security;

-- A clínica LÊ o que vale para ela (a sua e a global); escrever é só do gestor.
drop policy if exists integracoes_ver on integracoes;
create policy integracoes_ver on integracoes for select
  using (ativo and (empresa_id is null or empresa_id = app.empresa_atual()));

grant select on integracoes to authenticated;

-- ─────────────────── Leitura efetiva para a extensão ───────────────────

/** Integrações que valem para a minha empresa (a específica vence a global). */
create or replace function public.minhas_integracoes()
returns table (chave text, nome text, url text, token text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare emp uuid;
begin
  emp := app.empresa_atual();
  if emp is null then return; end if;

  return query
    select distinct on (i.chave) i.chave, i.nome, i.url, i.token
      from integracoes i
     where i.ativo and (i.empresa_id is null or i.empresa_id = emp)
     order by i.chave, (i.empresa_id is not null) desc;  -- específica primeiro
end $$;
revoke execute on function public.minhas_integracoes() from public, anon;
grant execute on function public.minhas_integracoes() to authenticated;

-- ─────────────────────── Administração pelo gestor ─────────────────────

create or replace function public.sistema_integracoes()
returns table (
  id uuid, empresa_id uuid, empresa text, chave text, nome text,
  url text, token text, ativo boolean, observacao text, atualizado_em timestamptz
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  return query
    select i.id, i.empresa_id, e.nome, i.chave, i.nome, i.url, i.token, i.ativo,
           i.observacao, i.atualizado_em
      from integracoes i
      left join empresas e on e.id = i.empresa_id
     order by i.chave, e.nome nulls first;
end $$;

create or replace function public.sistema_salvar_integracao(
  p_chave      text,
  p_nome       text,
  p_url        text default null,
  p_token      text default null,
  p_empresa    uuid default null,
  p_ativo      boolean default true,
  p_observacao text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  if coalesce(trim(p_chave), '') = '' then
    raise exception 'informe a chave da integração';
  end if;

  -- Token vazio não apaga o que já existe (o painel mostra mascarado).
  select id into v_id from integracoes
   where chave = p_chave and empresa_id is not distinct from p_empresa;

  if v_id is null then
    insert into integracoes (empresa_id, chave, nome, url, token, ativo, observacao)
         values (p_empresa, trim(p_chave), p_nome, p_url, p_token, p_ativo, p_observacao)
      returning id into v_id;
  else
    update integracoes
       set nome = p_nome,
           url = p_url,
           token = coalesce(nullif(p_token, ''), token),
           ativo = p_ativo,
           observacao = p_observacao
     where id = v_id;
  end if;
  return v_id;
end $$;

create or replace function public.sistema_apagar_integracao(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  delete from integracoes where id = p_id;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'sistema_integracoes()',
    'sistema_salvar_integracao(text, text, text, text, uuid, boolean, text)',
    'sistema_apagar_integracao(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon;', f);
    execute format('grant execute on function public.%s to authenticated;', f);
  end loop;
end $$;
