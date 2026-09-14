-- BuildChat — conta de teste por 7 dias
--
-- Quem cria a própria conta (extensão ou /entrar) ganha 7 dias de teste; o
-- gestor, ao cadastrar uma clínica, também parte de 7 (pode mudar na tela).
-- Virar assinante é só mudar `status` na MESMA empresa: nada do que foi
-- criado no teste é apagado (há teste provando).

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
       values (p_empresa, 'trial', now() + interval '7 days')
    returning id into v_empresa;

  insert into usuarios (id, empresa_id, nome, email, papel)
       values (auth.uid(), v_empresa, p_nome, v_email, 'admin');

  insert into config_usuario (usuario_id, empresa_id)
       values (auth.uid(), v_empresa);

  return v_empresa;
end $$;

-- Mesmo corpo da 0012; só o padrão do teste cai de 14 para 7 dias.
create or replace function public.sistema_criar_empresa(
  p_nome        text,
  p_admin_id    uuid,
  p_admin_nome  text,
  p_admin_email text,
  p_plano       text default 'start',
  p_status      text default 'trial',
  p_trial_dias  integer default 7,
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
