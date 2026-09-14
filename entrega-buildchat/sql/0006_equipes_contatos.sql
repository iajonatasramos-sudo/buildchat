-- BuildChat — equipes, visibilidade das mensagens padrão e ficha do contato
--
-- Três mudanças:
--   1. equipes da empresa, com usuários associados;
--   2. mensagens/pastas da empresa podem ser restritas a equipes ou pessoas
--      (vazio = todo mundo da empresa vê);
--   3. ficha do contato (nome de tratamento e interesses), a base do CRM.

-- ─────────────────────────────── Equipes ───────────────────────────────

create table if not exists equipes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  nome          text not null,
  cor           text not null default '#6366f1',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_equipes_empresa on equipes (empresa_id, atualizado_em);

create table if not exists equipe_usuarios (
  equipe_id  uuid not null references equipes(id) on delete cascade,
  usuario_id uuid not null references usuarios(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  primary key (equipe_id, usuario_id)
);
create index if not exists idx_equipe_usuarios_usuario on equipe_usuarios (usuario_id);

-- ─────────────────────── Visibilidade das mensagens ────────────────────
-- Arrays vazios = visível para toda a empresa. Preenchidos, restringem.

alter table respostas  add column if not exists visivel_equipes  uuid[] not null default '{}';
alter table respostas  add column if not exists visivel_usuarios uuid[] not null default '{}';
alter table pastas     add column if not exists visivel_equipes  uuid[] not null default '{}';
alter table pastas     add column if not exists visivel_usuarios uuid[] not null default '{}';

-- ──────────────────────── Ficha do contato (CRM) ───────────────────────
-- Uma linha por conversa de um número conectado. `nome` é o tratamento usado
-- na variável {{nome}} das mensagens rápidas.

create table if not exists contatos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  wa_number      text not null,   -- número conectado (só dígitos)
  remote_jid     text not null,   -- contato no WhatsApp
  nome           text,            -- nome de tratamento (editável)
  nome_whatsapp  text,            -- como aparece no WhatsApp (referência)
  interesses     text,
  ultimo_contato timestamptz,     -- último envio feito pela extensão
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (empresa_id, wa_number, remote_jid)
);
create index if not exists idx_contatos_sync on contatos (empresa_id, atualizado_em);
create index if not exists idx_contatos_conversa on contatos (empresa_id, wa_number, remote_jid);

-- atualizado_em automático nas novas tabelas
do $$
declare t text;
begin
  foreach t in array array['equipes', 'contatos'] loop
    execute format(
      'drop trigger if exists trg_%1$s_atualizado on %1$I;
       create trigger trg_%1$s_atualizado before update on %1$I
       for each row execute function public.tocar_atualizado_em();', t);
  end loop;
end $$;

-- ────────────────────────────── Permissões ─────────────────────────────

alter table equipes         enable row level security;
alter table equipe_usuarios enable row level security;
alter table contatos        enable row level security;

-- Equipes do usuário autenticado (SECURITY DEFINER: a policy de
-- equipe_usuarios não pode consultar a própria tabela sem recursão).
create or replace function app.minhas_equipes() returns uuid[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(eu.equipe_id), '{}')
    from public.equipe_usuarios eu
    join public.equipes e on e.id = eu.equipe_id and e.deleted_at is null
   where eu.usuario_id = auth.uid()
$$;

-- Registro da empresa restrito a equipes/pessoas: vazio = todos veem.
create or replace function app.visivel_para_mim(p_equipes uuid[], p_usuarios uuid[])
returns boolean language sql stable as $$
  select (cardinality(p_equipes) = 0 and cardinality(p_usuarios) = 0)
      or auth.uid() = any(p_usuarios)
      or p_equipes && app.minhas_equipes()
$$;

drop policy if exists equipes_ver on equipes;
create policy equipes_ver on equipes for select
  using (empresa_id = app.empresa_atual());

drop policy if exists equipes_admin on equipes;
create policy equipes_admin on equipes for all
  using (empresa_id = app.empresa_atual() and app.eh_admin())
  with check (empresa_id = app.empresa_atual() and app.eh_admin());

drop policy if exists equipe_usuarios_ver on equipe_usuarios;
create policy equipe_usuarios_ver on equipe_usuarios for select
  using (exists (select 1 from equipes e
                  where e.id = equipe_id and e.empresa_id = app.empresa_atual()));

drop policy if exists equipe_usuarios_admin on equipe_usuarios;
create policy equipe_usuarios_admin on equipe_usuarios for all
  using (app.eh_admin() and exists (select 1 from equipes e
                                     where e.id = equipe_id and e.empresa_id = app.empresa_atual()))
  with check (app.eh_admin() and exists (select 1 from equipes e
                                          where e.id = equipe_id and e.empresa_id = app.empresa_atual()));

-- Ficha do contato: de toda a empresa (quem atende o número precisa dela).
drop policy if exists contatos_empresa on contatos;
create policy contatos_empresa on contatos for all
  using (empresa_id = app.empresa_atual())
  with check (empresa_id = app.empresa_atual());

-- Leitura de pastas e respostas passa a respeitar a visibilidade.
-- O admin continua vendo tudo (precisa administrar no painel); é a EXTENSÃO
-- que filtra o que aparece nas mensagens rápidas dele.
do $$
declare t text;
begin
  foreach t in array array['pastas', 'respostas'] loop
    execute format('drop policy if exists %1$s_ver on %1$I;', t);
    execute format(
      'create policy %1$s_ver on %1$I for select
         using (app.pode_ver(empresa_id, escopo, owner_id)
                and (escopo = ''pessoal''
                     or app.eh_admin()   -- o admin administra o acervo inteiro no painel
                     or app.visivel_para_mim(visivel_equipes, visivel_usuarios)));', t);
  end loop;
end $$;

grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;
grant select, insert, update, delete on equipes, equipe_usuarios, contatos to authenticated;
