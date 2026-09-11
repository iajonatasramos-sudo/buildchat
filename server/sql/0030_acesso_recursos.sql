-- BuildChat / Anamni — quem enxerga cada função da extensão
--
-- A barra lateral (Contato, Mensagens rápidas, Automações, Agenda, WebHooks,
-- Conta do WhatsApp, Meus contatos) passa a ser configurável por pessoa ou por
-- equipe, com a MESMA gramática de pastas e mensagens: `visivel_todos` +
-- `visivel_equipes` / `visivel_usuarios`.
--
-- Sem linha para a função, ela vale para todo mundo — é o que já acontece
-- hoje, e clínica nenhuma precisa configurar nada para continuar como está.
-- A lista de chaves mora na extensão (é ela que sabe o que existe na tela);
-- aqui o texto é livre, para uma função nova não exigir migração.

create table if not exists recurso_acesso (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references empresas(id) on delete cascade,
  recurso         text not null,
  visivel_todos   boolean not null default true,
  visivel_equipes uuid[] not null default '{}',
  visivel_usuarios uuid[] not null default '{}',
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (empresa_id, recurso)
);
create index if not exists idx_recurso_sync on recurso_acesso (empresa_id, atualizado_em);

drop trigger if exists trg_recurso_acesso_atualizado on recurso_acesso;
create trigger trg_recurso_acesso_atualizado before update on recurso_acesso
  for each row execute function public.tocar_atualizado_em();

alter table recurso_acesso enable row level security;
grant select, insert, update, delete on recurso_acesso to authenticated;

-- Todo mundo LÊ a configuração (a extensão precisa dela para montar a tela);
-- não há segredo aqui, só quem vê o quê.
drop policy if exists recurso_ver on recurso_acesso;
create policy recurso_ver on recurso_acesso for select
  using (empresa_id = app.empresa_atual());

-- Escrever é do admin da clínica.
drop policy if exists recurso_admin on recurso_acesso;
create policy recurso_admin on recurso_acesso for all
  using (empresa_id = app.empresa_atual() and app.eh_admin())
  with check (empresa_id = app.empresa_atual() and app.eh_admin());
