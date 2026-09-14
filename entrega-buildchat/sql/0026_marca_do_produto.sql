-- BuildChat / Anamni — duas marcas, o mesmo sistema
--
-- A extensão é distribuída em duas versões: BuildChat (uso do grupo
-- BuildClinic) e Anamni (produto comercial, painel.anamni.com.br). Painel e
-- banco continuam ÚNICOS: cada empresa já é isolada pela RLS. O que muda é a
-- casca — e a marca precisa ficar registrada na empresa para o painel do
-- gestor separar os dois produtos e para o atendimento saber com quem fala.
--
-- Quem cria a própria conta manda a marca do painel em que está (o domínio
-- decide); o gestor escolhe ao cadastrar. Sem informar, vale 'buildchat' —
-- é o que toda empresa que já existe é.

alter table empresas add column if not exists marca text not null default 'buildchat';
do $$ begin
  alter table empresas add constraint empresas_marca_valida check (marca in ('buildchat', 'anamni'));
exception when duplicate_object then null; end $$;

-- ─────────────── Autoatendimento: a marca vem do painel usado ───────────────
-- A versão de 2 argumentos sai de cena: com o parâmetro novo tendo padrão,
-- manter as duas deixaria a chamada de 2 argumentos ambígua.
drop function if exists public.criar_empresa_e_admin(text, text);
create or replace function public.criar_empresa_e_admin(p_empresa text, p_nome text, p_marca text default 'buildchat')
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
  if p_marca not in ('buildchat', 'anamni') then
    raise exception 'marca inválida';
  end if;

  select email into v_email from auth.users where id = auth.uid();

  insert into empresas (nome, status, trial_ate, marca)
       values (p_empresa, 'trial', now() + interval '7 days', p_marca)
    returning id into v_empresa;

  insert into usuarios (id, empresa_id, nome, email, papel)
       values (auth.uid(), v_empresa, p_nome, v_email, 'admin');

  insert into config_usuario (usuario_id, empresa_id)
       values (auth.uid(), v_empresa);

  return v_empresa;
end $$;
revoke execute on function public.criar_empresa_e_admin(text, text, text) from public, anon;
grant execute on function public.criar_empresa_e_admin(text, text, text) to authenticated;

-- ─────────────── Cadastro pelo gestor: escolhe a marca na tela ───────────────
drop function if exists public.sistema_criar_empresa(text, uuid, text, text, text, text, integer, text, integer);
create or replace function public.sistema_criar_empresa(
  p_nome        text,
  p_admin_id    uuid,
  p_admin_nome  text,
  p_admin_email text,
  p_plano       text default 'start',
  p_status      text default 'trial',
  p_trial_dias  integer default 7,
  p_ciclo       text default 'mensal',
  p_valor_centavos integer default null,
  p_marca       text default 'buildchat'
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
  if p_marca not in ('buildchat', 'anamni') then
    raise exception 'marca inválida';
  end if;
  if exists (select 1 from usuarios where id = p_admin_id) then
    raise exception 'esta conta já pertence a uma clínica';
  end if;

  select * into pl from planos where slug = p_plano and ativo;
  if pl is null then
    raise exception 'plano inexistente';
  end if;

  insert into empresas (nome, plano_slug, plano, status, assentos, ciclo,
                        valor_mensal_centavos, trial_ate, proxima_cobranca, marca)
       values (trim(p_nome), pl.slug, pl.nome, p_status, pl.assentos_inclusos, p_ciclo,
               coalesce(p_valor_centavos, pl.preco_mensal_centavos),
               case when p_status = 'trial' then now() + make_interval(days => greatest(p_trial_dias, 1)) end,
               case
                 when p_status <> 'ativa' or p_ciclo = 'vitalicio' then null
                 else current_date + case p_ciclo
                        when 'trimestral' then interval '3 months'
                        when 'anual' then interval '1 year'
                        else interval '1 month' end
               end,
               p_marca)
    returning id into v_empresa;

  insert into usuarios (id, empresa_id, nome, email, papel)
       values (p_admin_id, v_empresa, trim(p_admin_nome), lower(trim(p_admin_email)), 'admin');
  insert into config_usuario (usuario_id, empresa_id) values (p_admin_id, v_empresa);

  return v_empresa;
end $$;
revoke execute on function public.sistema_criar_empresa(text, uuid, text, text, text, text, integer, text, integer, text)
  from public, anon;
grant execute on function public.sistema_criar_empresa(text, uuid, text, text, text, text, integer, text, integer, text)
  to authenticated;

-- Corrigir a marca de uma empresa já cadastrada (só o gestor; a RLS de
-- `empresas` só libera a coluna `nome` para o admin da clínica).
create or replace function public.sistema_definir_marca(p_empresa uuid, p_marca text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  if p_marca not in ('buildchat', 'anamni') then
    raise exception 'marca inválida';
  end if;
  update empresas set marca = p_marca, atualizado_em = now() where id = p_empresa;
end $$;
revoke execute on function public.sistema_definir_marca(uuid, text) from public, anon;
grant execute on function public.sistema_definir_marca(uuid, text) to authenticated;

-- ─────────────── A lista do gestor mostra de que produto é cada uma ───────────────
drop function if exists public.sistema_empresas();
create function public.sistema_empresas()
returns table (
  id uuid, nome text, plano text, plano_slug text, status text, trial_ate timestamptz,
  assentos integer, usuarios_ativos bigint, admin_email text, mensagens bigint,
  pastas bigint, contatos bigint, ultimo_acesso timestamptz, criado_em timestamptz,
  valor_mensal_centavos integer, ciclo text, proxima_cobranca date, observacao text,
  faturas_abertas bigint, aberto_centavos bigint, marca text
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
             where f.empresa_id = e.id and f.pago_em is null),
           e.marca
      from empresas e
     order by e.criado_em desc;
end $$;
revoke execute on function public.sistema_empresas() from public, anon;
grant execute on function public.sistema_empresas() to authenticated;
