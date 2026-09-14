-- BuildChat — cadastro de empresa pelo gestor e novos ciclos de assinatura
--
-- Ciclos: mensal, trimestral, anual e vitalício. O vitalício é pagamento único:
-- não entra no MRR (não é receita recorrente) e não gera próxima cobrança.

alter table empresas drop constraint if exists empresas_ciclo_valido;
alter table empresas add constraint empresas_ciclo_valido
  check (ciclo in ('mensal', 'trimestral', 'anual', 'vitalicio'));

-- ───────────────── Criar a empresa e o administrador dela ──────────────
-- O usuário do Auth precisa existir antes (o painel faz o signUp e passa o id).

create or replace function public.sistema_criar_empresa(
  p_nome        text,
  p_admin_id    uuid,
  p_admin_nome  text,
  p_admin_email text,
  p_plano       text default 'start',
  p_status      text default 'trial',
  p_trial_dias  integer default 14,
  p_ciclo       text default 'mensal',
  p_valor_centavos integer default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_empresa uuid; pl planos;
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'informe o nome da clínica';
  end if;
  if p_status not in ('trial', 'ativa', 'inadimplente', 'cancelada') then
    raise exception 'situação inválida';
  end if;
  if p_ciclo not in ('mensal', 'trimestral', 'anual', 'vitalicio') then
    raise exception 'ciclo inválido';
  end if;
  if exists (select 1 from usuarios where id = p_admin_id) then
    raise exception 'esta conta já pertence a uma clínica';
  end if;

  select * into pl from planos where slug = p_plano and ativo;
  if pl is null then
    raise exception 'plano inexistente';
  end if;

  insert into empresas (nome, plano_slug, plano, status, assentos, ciclo,
                        valor_mensal_centavos, trial_ate, proxima_cobranca)
       values (trim(p_nome), pl.slug, pl.nome, p_status, pl.assentos_inclusos, p_ciclo,
               coalesce(p_valor_centavos, pl.preco_mensal_centavos),
               case when p_status = 'trial' then now() + make_interval(days => greatest(p_trial_dias, 1)) end,
               case
                 when p_status <> 'ativa' or p_ciclo = 'vitalicio' then null
                 else current_date + case p_ciclo
                        when 'trimestral' then interval '3 months'
                        when 'anual' then interval '1 year'
                        else interval '1 month' end
               end)
    returning id into v_empresa;

  insert into usuarios (id, empresa_id, nome, email, papel)
       values (p_admin_id, v_empresa, trim(p_admin_nome), lower(trim(p_admin_email)), 'admin');
  insert into config_usuario (usuario_id, empresa_id) values (p_admin_id, v_empresa);

  return v_empresa;
end $$;
revoke execute on function public.sistema_criar_empresa(text, uuid, text, text, text, text, integer, text, integer)
  from public, anon;
grant execute on function public.sistema_criar_empresa(text, uuid, text, text, text, text, integer, text, integer)
  to authenticated;

-- ──────────── Ciclos novos no cálculo de receita e na baixa ────────────

create or replace function public.sistema_vendas()
returns json
language plpgsql security definer set search_path = public, pg_temp as $$
declare r json;
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;

  select json_build_object(
    -- MRR: tudo trazido para o mês. Vitalício é pagamento único, fica de fora.
    'mrr_centavos', (
      select coalesce(sum(case ciclo
               when 'anual' then valor_mensal_centavos / 12
               when 'trimestral' then valor_mensal_centavos / 3
               when 'vitalicio' then 0
               else valor_mensal_centavos end), 0)
        from empresas where status = 'ativa'),
    'clientes_pagantes', (select count(*) from empresas where status = 'ativa'),
    'vitalicios', (select count(*) from empresas where status = 'ativa' and ciclo = 'vitalicio'),
    -- Ticket médio da recorrência; o vitalício não tem mensalidade.
    'ticket_medio_centavos', (
      select coalesce(avg(valor_mensal_centavos), 0)::int
        from empresas
       where status = 'ativa' and valor_mensal_centavos > 0 and ciclo <> 'vitalicio'),
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

  update empresas e
     set status = case when e.status in ('inadimplente', 'trial') then 'ativa' else e.status end,
         -- Vitalício não tem próxima cobrança.
         proxima_cobranca = case e.ciclo
           when 'vitalicio' then null
           when 'anual' then coalesce(e.proxima_cobranca, current_date) + interval '1 year'
           when 'trimestral' then coalesce(e.proxima_cobranca, current_date) + interval '3 months'
           else coalesce(e.proxima_cobranca, current_date) + interval '1 month'
         end
   where e.id = v_empresa;
end $$;

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
  if p_ciclo is not null and p_ciclo not in ('mensal', 'trimestral', 'anual', 'vitalicio') then
    raise exception 'ciclo inválido';
  end if;
  if p_valor_centavos is not null and p_valor_centavos < 0 then
    raise exception 'valor não pode ser negativo';
  end if;

  update empresas
     set valor_mensal_centavos = coalesce(p_valor_centavos, valor_mensal_centavos),
         ciclo                 = coalesce(p_ciclo, ciclo),
         proxima_cobranca      = case
           when coalesce(p_ciclo, ciclo) = 'vitalicio' then null
           else coalesce(p_proxima, proxima_cobranca)
         end,
         observacao            = coalesce(p_observacao, observacao)
   where id = p_empresa;
end $$;

-- ─────────── A listagem devolve o nível do cliente (plano_slug) ─────────
-- Sem isso o painel não sabe qual plano marcar no seletor.

drop function if exists public.sistema_empresas();
create function public.sistema_empresas()
returns table (
  id uuid, nome text, plano text, plano_slug text, status text, trial_ate timestamptz,
  assentos integer, usuarios_ativos bigint, admin_email text, mensagens bigint,
  pastas bigint, contatos bigint, ultimo_acesso timestamptz, criado_em timestamptz,
  valor_mensal_centavos integer, ciclo text, proxima_cobranca date, observacao text,
  faturas_abertas bigint, aberto_centavos bigint
)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;

  return query
    select e.id, e.nome, e.plano, e.plano_slug, e.status, e.trial_ate, e.assentos,
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
