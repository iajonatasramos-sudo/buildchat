-- BuildChat — compartilhamento por item, tudo compartilhado por padrão
--
-- Corrige o modelo da 0021 (que nascia privado): agora TODO contato conversado
-- sobe para o servidor e nasce compartilhado. O admin escolhe, por contato,
-- O QUE fica restrito a quem registrou: notas, interesses, etiquetas ou
-- propostas. A ficha em si (nome, telefone, origem, quem cadastrou, quando)
-- é sempre da empresa — é o CRM.

alter table contatos add column if not exists compartilha_notas      boolean not null default true;
alter table contatos add column if not exists compartilha_interesses boolean not null default true;
alter table contatos add column if not exists compartilha_etiquetas  boolean not null default true;
alter table contatos add column if not exists compartilha_propostas  boolean not null default true;
-- O que dependia da coluna antiga sai antes dela (trigger, policies, função).
drop trigger if exists trg_contato_compartilhado on contatos;
drop policy if exists contatos_empresa on contatos;
drop policy if exists anotacoes_empresa on anotacoes;
drop policy if exists propostas_empresa on propostas;
drop policy if exists pconv_empresa on pasta_conversas;
drop function if exists app.contato_liberado(uuid, text, text);
alter table contatos drop column if exists compartilhado;
drop table if exists contatos_compartilhado_migrado;

-- Mudou alguma chave? "Toca" o que depende dela, para o sync incremental
-- dos colegas trazer (ou tirar) o que passou a valer.
create or replace function public.contato_compartilhamento_mudou() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.compartilha_notas is distinct from old.compartilha_notas then
    update anotacoes set atualizado_em = now()
     where empresa_id = new.empresa_id and wa_number = new.wa_number and remote_jid = new.remote_jid;
  end if;
  if new.compartilha_propostas is distinct from old.compartilha_propostas then
    update propostas set atualizado_em = now()
     where empresa_id = new.empresa_id and wa_number = new.wa_number and remote_jid = new.remote_jid;
  end if;
  if new.compartilha_etiquetas is distinct from old.compartilha_etiquetas then
    update pasta_conversas set atualizado_em = now()
     where empresa_id = new.empresa_id and wa_number = new.wa_number and remote_jid = new.remote_jid;
  end if;
  return new;
end $$;
drop trigger if exists trg_contato_compartilhado on contatos;
drop trigger if exists trg_contato_compartilhamento on contatos;
create trigger trg_contato_compartilhamento
  after update of compartilha_notas, compartilha_interesses, compartilha_etiquetas, compartilha_propostas on contatos
  for each row execute function public.contato_compartilhamento_mudou();

-- Quem pode ver um item restrito: o admin, quem cadastrou o contato ou, se a
-- chave estiver aberta, todo mundo. Sem ficha, vale como aberto.
create or replace function app.contato_libera(p_empresa uuid, p_wa text, p_jid text, p_item text)
returns boolean language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c contatos%rowtype;
begin
  if app.eh_admin() then return true; end if;
  select * into c from contatos
   where empresa_id = p_empresa and wa_number = p_wa and remote_jid = p_jid and deleted_at is null
   limit 1;
  if c.id is null then return true; end if;
  if c.criado_por = auth.uid() then return true; end if;
  return case p_item
    when 'notas'      then c.compartilha_notas
    when 'interesses' then c.compartilha_interesses
    when 'etiquetas'  then c.compartilha_etiquetas
    when 'propostas'  then c.compartilha_propostas
    else true end;
end $$;
grant execute on function app.contato_libera(uuid, text, text, text) to authenticated;

-- Ficha: da empresa inteira (o CRM). Escrita idem.
drop policy if exists contatos_empresa on contatos;
create policy contatos_empresa on contatos for all
  using (empresa_id = app.empresa_atual())
  with check (empresa_id = app.empresa_atual());

drop policy if exists anotacoes_empresa on anotacoes;
create policy anotacoes_empresa on anotacoes for all
  using (empresa_id = app.empresa_atual()
         and (autor_id = auth.uid() or app.contato_libera(empresa_id, wa_number, remote_jid, 'notas')))
  with check (empresa_id = app.empresa_atual());

drop policy if exists propostas_empresa on propostas;
create policy propostas_empresa on propostas for all
  using (empresa_id = app.empresa_atual()
         and (criado_por = auth.uid() or app.contato_libera(empresa_id, wa_number, remote_jid, 'propostas')))
  with check (
    empresa_id = app.empresa_atual()
    and arquivo_path like app.empresa_atual()::text || '/%'
  );

drop policy if exists pconv_empresa on pasta_conversas;
create policy pconv_empresa on pasta_conversas for all
  using (empresa_id = app.empresa_atual()
         and (criado_por = auth.uid() or app.contato_libera(empresa_id, wa_number, remote_jid, 'etiquetas')))
  with check (empresa_id = app.empresa_atual());

-- A extensão lê as fichas por aqui: `interesses` vem mascarado quando restrito.
-- (RLS não filtra coluna; a função filtra.)
create or replace function public.minhas_fichas(p_wa text, p_desde timestamptz default null)
returns table (
  remote_jid text, nome text, nome_whatsapp text, telefone text, interesses text,
  ultimo_contato timestamptz, deleted_at timestamptz, atualizado_em timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.remote_jid, c.nome, c.nome_whatsapp, c.telefone,
         case when app.contato_libera(c.empresa_id, c.wa_number, c.remote_jid, 'interesses') then c.interesses else null end,
         c.ultimo_contato, c.deleted_at, c.atualizado_em
    from contatos c
   where c.empresa_id = app.empresa_atual()
     and c.wa_number = p_wa
     and (p_desde is null or c.atualizado_em > p_desde)
$$;
revoke execute on function public.minhas_fichas(text, timestamptz) from public, anon;
grant execute on function public.minhas_fichas(text, timestamptz) to authenticated;
