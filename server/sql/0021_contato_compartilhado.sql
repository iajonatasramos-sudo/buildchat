-- BuildChat — compartilhamento por contato
--
-- Ficha, anotações e propostas de um contato nascem PRIVADAS de quem as fez;
-- o admin da clínica liga o compartilhamento por contato, e aí toda a equipe
-- (de qualquer número) passa a ver. Etiquetas (pasta_conversas) continuam
-- da empresa — organizar a conversa é sempre compartilhado.
--
-- O que já existia fica compartilhado (ninguém perde acesso ao que via).
-- O admin vê tudo, sempre — é ele quem administra e decide.

alter table contatos add column if not exists compartilhado boolean not null default false;
alter table contatos add column if not exists criado_por uuid references usuarios(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_class where relname = 'contatos_compartilhado_migrado') then
    update contatos set compartilhado = true;
    create table contatos_compartilhado_migrado (em timestamptz not null default now());
  end if;
end $$;

-- Quem cria a ficha vira o dono (a extensão não precisa mandar a coluna).
create or replace function public.contato_dono() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.criado_por is null then new.criado_por := auth.uid(); end if;
  return new;
end $$;
drop trigger if exists trg_contato_dono on contatos;
create trigger trg_contato_dono before insert on contatos
for each row execute function public.contato_dono();

-- Ligar/desligar o compartilhamento "toca" as anotações e propostas do contato:
-- a extensão sincroniza por atualizado_em, e sem isso o colega não receberia o
-- que já existia (nem a remoção, ao desligar).
create or replace function public.contato_compartilhado_mudou() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.compartilhado is distinct from old.compartilhado then
    update anotacoes set atualizado_em = now()
     where empresa_id = new.empresa_id and wa_number = new.wa_number and remote_jid = new.remote_jid;
    update propostas set atualizado_em = now()
     where empresa_id = new.empresa_id and wa_number = new.wa_number and remote_jid = new.remote_jid;
  end if;
  return new;
end $$;
drop trigger if exists trg_contato_compartilhado on contatos;
create trigger trg_contato_compartilhado after update of compartilhado on contatos
for each row execute function public.contato_compartilhado_mudou();

/** O contato está compartilhado com a equipe? Sem ficha, vale como compartilhado. */
create or replace function app.contato_liberado(p_empresa uuid, p_wa text, p_jid text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select c.compartilhado from contatos c
      where c.empresa_id = p_empresa and c.wa_number = p_wa and c.remote_jid = p_jid and c.deleted_at is null
      limit 1),
    true)
$$;
grant execute on function app.contato_liberado(uuid, text, text) to authenticated;

-- Ficha: o dono, quem o admin liberou, e o admin. (Sem dono = legado: todos.)
drop policy if exists contatos_empresa on contatos;
create policy contatos_empresa on contatos for all
  using (empresa_id = app.empresa_atual()
         and (app.eh_admin() or compartilhado or criado_por is null or criado_por = auth.uid()))
  with check (empresa_id = app.empresa_atual());

-- Anotações: as minhas, as de contato compartilhado, e o admin vê tudo.
drop policy if exists anotacoes_empresa on anotacoes;
create policy anotacoes_empresa on anotacoes for all
  using (empresa_id = app.empresa_atual()
         and (app.eh_admin() or autor_id is null or autor_id = auth.uid()
              or app.contato_liberado(empresa_id, wa_number, remote_jid)))
  with check (empresa_id = app.empresa_atual());

-- Propostas: mesma regra.
drop policy if exists propostas_empresa on propostas;
create policy propostas_empresa on propostas for all
  using (empresa_id = app.empresa_atual()
         and (app.eh_admin() or criado_por is null or criado_por = auth.uid()
              or app.contato_liberado(empresa_id, wa_number, remote_jid)))
  with check (
    empresa_id = app.empresa_atual()
    and arquivo_path like app.empresa_atual()::text || '/%'
  );
