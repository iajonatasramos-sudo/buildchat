-- BuildChat — níveis de cliente: Start → Pro → Master
--
-- Os limites são fiscalizados NO BANCO (policy e trigger), não só escondidos na
-- interface: esconder botão não impede uma chamada direta à API.
--
-- Durante o teste grátis a clínica experimenta o Pro — é o que faz o trial
-- vender o plano do meio.

create table if not exists planos (
  slug                      text primary key,   -- start | pro | master
  nome                      text not null,
  ordem                     integer not null,
  preco_mensal_centavos     integer not null default 0,
  assentos_inclusos         integer not null,
  max_mensagens             integer,            -- null = sem limite
  permite_equipes           boolean not null default false,
  permite_mensagens_empresa boolean not null default false,
  permite_exportar          boolean not null default false,
  ativo                     boolean not null default true
);

insert into planos (slug, nome, ordem, preco_mensal_centavos, assentos_inclusos,
                    max_mensagens, permite_equipes, permite_mensagens_empresa, permite_exportar)
values
  ('start',  'Start',  1,  9700, 2,   30, false, false, false),
  ('pro',    'Pro',    2, 19700, 5,  200, true,  true,  true),
  ('master', 'Master', 3, 39700, 15, null, true,  true,  true)
on conflict (slug) do nothing;

alter table empresas add column if not exists plano_slug text references planos(slug);

-- Migra o campo de texto livre que existia antes.
update empresas
   set plano_slug = case
         when lower(coalesce(plano, '')) in ('start', 'pro', 'master') then lower(plano)
         else 'start'
       end
 where plano_slug is null;

alter table empresas alter column plano_slug set default 'start';
alter table empresas alter column plano_slug set not null;

-- Todo mundo lê o catálogo (a tela de assinatura mostra os planos).
alter table planos enable row level security;
drop policy if exists planos_ver on planos;
create policy planos_ver on planos for select using (true);
grant select on planos to authenticated, anon;

-- ─────────────────────── Recursos do plano vigente ─────────────────────

/**
 * Plano que vale AGORA para a empresa. Em teste grátis (dentro do prazo) a
 * clínica usa o Pro; assinatura vencida cai para o Start.
 */
create or replace function app.plano_vigente(p_empresa uuid) returns planos
language sql stable security definer set search_path = public, pg_temp as $$
  select p.*
    from empresas e
    join planos p on p.slug = case
           when e.status = 'trial' and (e.trial_ate is null or e.trial_ate > now()) then 'pro'
           when e.status in ('ativa') then e.plano_slug
           else 'start'
         end
   where e.id = p_empresa
$$;

create or replace function app.plano_permite(p_recurso text) returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pl planos;
begin
  select * into pl from app.plano_vigente(app.empresa_atual());
  if pl is null then return false; end if;
  return case p_recurso
    when 'equipes'           then pl.permite_equipes
    when 'mensagens_empresa' then pl.permite_mensagens_empresa
    when 'exportar'          then pl.permite_exportar
    else false
  end;
end $$;

grant execute on function app.plano_vigente(uuid), app.plano_permite(text) to authenticated;

/** Recursos do plano vigente — a interface usa para orientar o usuário. */
create or replace function public.meu_plano() returns json
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare pl planos; emp uuid; usados integer;
begin
  emp := app.empresa_atual();
  if emp is null then return null; end if;
  select * into pl from app.plano_vigente(emp);
  select count(*) into usados from respostas
   where empresa_id = emp and deleted_at is null;

  return json_build_object(
    'slug', pl.slug, 'nome', pl.nome,
    'assentos_inclusos', pl.assentos_inclusos,
    'max_mensagens', pl.max_mensagens,
    'mensagens_usadas', usados,
    'permite_equipes', pl.permite_equipes,
    'permite_mensagens_empresa', pl.permite_mensagens_empresa,
    'permite_exportar', pl.permite_exportar
  );
end $$;
revoke execute on function public.meu_plano() from public, anon;
grant execute on function public.meu_plano() to authenticated;

-- ──────────────────────────── Fiscalização ─────────────────────────────

-- Equipes: recurso do Pro em diante.
drop policy if exists equipes_admin on equipes;
create policy equipes_admin on equipes for all
  using (empresa_id = app.empresa_atual() and app.eh_admin())
  with check (empresa_id = app.empresa_atual() and app.eh_admin() and app.plano_permite('equipes'));

-- Mensagem publicada para a empresa: recurso do Pro em diante.
-- (A pessoal continua liberada em qualquer plano.)
create or replace function app.pode_escrever(p_empresa uuid, p_escopo text, p_owner uuid)
returns boolean language sql stable as $$
  select p_empresa = app.empresa_atual()
     and case
           when p_escopo = 'pessoal' then p_owner = auth.uid()
           else app.eh_admin() and app.plano_permite('mensagens_empresa')
         end
$$;

-- Teto de mensagens do plano.
create or replace function public.checar_limite_mensagens() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare teto integer; usados integer; nome text;
begin
  select max_mensagens, planos.nome into teto, nome from app.plano_vigente(new.empresa_id) as planos;
  if teto is null then return new; end if;

  select count(*) into usados from respostas
   where empresa_id = new.empresa_id and deleted_at is null;

  if usados >= teto then
    raise exception 'O plano % permite % mensagens rápidas. Apague alguma ou mude de plano.', nome, teto
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists trg_limite_mensagens on respostas;
create trigger trg_limite_mensagens before insert on respostas
for each row execute function public.checar_limite_mensagens();

-- ───────────────────── O gestor troca o plano da clínica ───────────────

create or replace function public.sistema_definir_plano(
  p_empresa uuid,
  p_plano   text,
  p_ajustar_assentos boolean default true
) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare pl planos;
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  select * into pl from planos where slug = p_plano and ativo;
  if pl is null then
    raise exception 'plano inexistente';
  end if;

  update empresas
     set plano_slug = pl.slug,
         plano      = pl.nome,
         assentos   = case when p_ajustar_assentos then pl.assentos_inclusos else assentos end,
         valor_mensal_centavos = case
           when valor_mensal_centavos = 0 then pl.preco_mensal_centavos
           else valor_mensal_centavos   -- preserva preço negociado
         end
   where id = p_empresa;
end $$;
revoke execute on function public.sistema_definir_plano(uuid, text, boolean) from public, anon;
grant execute on function public.sistema_definir_plano(uuid, text, boolean) to authenticated;
