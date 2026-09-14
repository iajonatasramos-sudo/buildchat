-- BuildChat — controle comercial (assinaturas e faturas)
--
-- Enquanto não há gateway de pagamento, o gestor registra as cobranças e as
-- baixas manualmente. A estrutura já prevê a automação: `referencia_externa`
-- guarda o id da cobrança no gateway e `forma` como foi pago.
--
-- Dinheiro em CENTAVOS (integer) — nada de float para valor.

-- ───────────────────── Dados comerciais da empresa ─────────────────────

alter table empresas add column if not exists valor_mensal_centavos integer not null default 0;
alter table empresas add column if not exists ciclo text not null default 'mensal';
alter table empresas add column if not exists proxima_cobranca date;
alter table empresas add column if not exists observacao text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'empresas_ciclo_valido') then
    alter table empresas add constraint empresas_ciclo_valido check (ciclo in ('mensal', 'anual'));
  end if;
end $$;

-- ──────────────────────────────── Faturas ──────────────────────────────

create table if not exists faturas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references empresas(id) on delete cascade,
  competencia        date not null,              -- mês de referência
  valor_centavos     integer not null check (valor_centavos >= 0),
  vencimento         date not null,
  pago_em            timestamptz,
  forma              text,                       -- pix | boleto | cartao | transferencia
  referencia_externa text,                       -- id da cobrança no gateway (futuro)
  observacao         text,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists idx_faturas_empresa on faturas (empresa_id, competencia desc);
create index if not exists idx_faturas_abertas on faturas (vencimento) where pago_em is null;

drop trigger if exists trg_faturas_atualizado on faturas;
create trigger trg_faturas_atualizado before update on faturas
for each row execute function public.tocar_atualizado_em();

alter table faturas enable row level security;

-- A clínica lê as próprias faturas (aparecem na tela de assinatura).
-- Escrita é exclusiva do gestor, pelas funções abaixo.
drop policy if exists faturas_empresa_ve on faturas;
create policy faturas_empresa_ve on faturas for select
  using (empresa_id = app.empresa_atual());

grant select on faturas to authenticated;

-- ─────────────────────── Leitura para o gestor ─────────────────────────

create or replace function public.sistema_faturas(p_empresa uuid default null)
returns table (
  id uuid, empresa_id uuid, empresa text, competencia date, valor_centavos integer,
  vencimento date, pago_em timestamptz, forma text, observacao text
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  return query
    select f.id, f.empresa_id, e.nome, f.competencia, f.valor_centavos,
           f.vencimento, f.pago_em, f.forma, f.observacao
      from faturas f join empresas e on e.id = f.empresa_id
     where p_empresa is null or f.empresa_id = p_empresa
     order by f.vencimento desc, e.nome;
end $$;

/** Números de venda: receita recorrente, o que entrou e o que está em aberto. */
create or replace function public.sistema_vendas()
returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare r json;
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;

  select json_build_object(
    -- MRR: assinaturas ativas, com o anual diluído em 12 meses
    'mrr_centavos', (
      select coalesce(sum(case when ciclo = 'anual' then valor_mensal_centavos / 12
                               else valor_mensal_centavos end), 0)
        from empresas where status = 'ativa'),
    'clientes_pagantes', (select count(*) from empresas where status = 'ativa'),
    'ticket_medio_centavos', (
      select coalesce(avg(valor_mensal_centavos), 0)::int
        from empresas where status = 'ativa' and valor_mensal_centavos > 0),
    'recebido_mes_centavos', (
      select coalesce(sum(valor_centavos), 0) from faturas
       where pago_em >= date_trunc('month', now())),
    'aberto_centavos', (
      select coalesce(sum(valor_centavos), 0) from faturas where pago_em is null),
    'vencidas', (
      select count(*) from faturas where pago_em is null and vencimento < current_date),
    'vencidas_centavos', (
      select coalesce(sum(valor_centavos), 0) from faturas
       where pago_em is null and vencimento < current_date),
    'novas_no_mes', (
      select count(*) from empresas where criado_em >= date_trunc('month', now())),
    'trials_vencendo', (
      select count(*) from empresas
       where status = 'trial' and trial_ate between now() and now() + interval '7 days')
  ) into r;
  return r;
end $$;

-- ─────────────────────── Ações comerciais do gestor ────────────────────

create or replace function public.sistema_definir_comercial(
  p_empresa         uuid,
  p_valor_centavos  integer default null,
  p_ciclo           text default null,
  p_proxima         date default null,
  p_observacao      text default null
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  if p_ciclo is not null and p_ciclo not in ('mensal', 'anual') then
    raise exception 'ciclo inválido';
  end if;
  if p_valor_centavos is not null and p_valor_centavos < 0 then
    raise exception 'valor não pode ser negativo';
  end if;

  update empresas
     set valor_mensal_centavos = coalesce(p_valor_centavos, valor_mensal_centavos),
         ciclo                 = coalesce(p_ciclo, ciclo),
         proxima_cobranca      = coalesce(p_proxima, proxima_cobranca),
         observacao            = coalesce(p_observacao, observacao)
   where id = p_empresa;
end $$;

create or replace function public.sistema_lancar_fatura(
  p_empresa     uuid,
  p_competencia date,
  p_valor_centavos integer,
  p_vencimento  date,
  p_observacao  text default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  if p_valor_centavos is null or p_valor_centavos <= 0 then
    raise exception 'informe o valor da fatura';
  end if;

  insert into faturas (empresa_id, competencia, valor_centavos, vencimento, observacao)
       values (p_empresa, p_competencia, p_valor_centavos, p_vencimento, p_observacao)
    returning id into v_id;
  return v_id;
end $$;

create or replace function public.sistema_baixar_fatura(
  p_fatura uuid,
  p_forma  text default 'pix',
  p_pago_em timestamptz default now()
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_empresa uuid;
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;

  update faturas set pago_em = p_pago_em, forma = p_forma
   where id = p_fatura returning empresa_id into v_empresa;
  if v_empresa is null then
    raise exception 'fatura não encontrada';
  end if;

  -- Pagou: a assinatura volta a valer e a próxima cobrança anda um ciclo.
  update empresas e
     set status = case when e.status in ('inadimplente', 'trial') then 'ativa' else e.status end,
         proxima_cobranca = case
           when e.ciclo = 'anual' then coalesce(e.proxima_cobranca, current_date) + interval '1 year'
           else coalesce(e.proxima_cobranca, current_date) + interval '1 month'
         end
   where e.id = v_empresa;
end $$;

create or replace function public.sistema_apagar_fatura(p_fatura uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  delete from faturas where id = p_fatura;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'sistema_faturas(uuid)',
    'sistema_vendas()',
    'sistema_definir_comercial(uuid, integer, text, date, text)',
    'sistema_lancar_fatura(uuid, date, integer, date, text)',
    'sistema_baixar_fatura(uuid, text, timestamptz)',
    'sistema_apagar_fatura(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon;', f);
    execute format('grant execute on function public.%s to authenticated;', f);
  end loop;
end $$;

-- A listagem de empresas passa a trazer o comercial junto.
drop function if exists public.sistema_empresas();
create or replace function public.sistema_empresas()
returns table (
  id uuid, nome text, plano text, status text, trial_ate timestamptz, assentos integer,
  usuarios_ativos bigint, admin_email text, mensagens bigint, pastas bigint, contatos bigint,
  ultimo_acesso timestamptz, criado_em timestamptz,
  valor_mensal_centavos integer, ciclo text, proxima_cobranca date, observacao text,
  faturas_abertas bigint, aberto_centavos bigint
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
             where u.empresa_id = e.id and u.papel = 'admin' order by u.criado_em limit 1),
           (select count(*) from respostas r where r.empresa_id = e.id and r.deleted_at is null),
           (select count(*) from pastas p where p.empresa_id = e.id and p.deleted_at is null),
           (select count(*) from contatos c where c.empresa_id = e.id and c.deleted_at is null),
           (select max(u.ultimo_acesso) from usuarios u where u.empresa_id = e.id),
           e.criado_em,
           e.valor_mensal_centavos, e.ciclo, e.proxima_cobranca, e.observacao,
           (select count(*) from faturas f where f.empresa_id = e.id and f.pago_em is null),
           (select coalesce(sum(f.valor_centavos), 0) from faturas f
             where f.empresa_id = e.id and f.pago_em is null)
      from empresas e
     order by e.criado_em desc;
end $$;
revoke execute on function public.sistema_empresas() from public, anon;
grant execute on function public.sistema_empresas() to authenticated;
