-- BuildChat — schema base (multiempresa)
-- Fase 0 do PLANEJAMENTO-SERVIDOR.md
--
-- Convenções:
--   * toda tabela de dado sincronizável tem: empresa_id, atualizado_em, deleted_at
--   * "escopo" define se o registro é da empresa (todos veem) ou pessoal (só o dono)
--   * exclusão é sempre lógica (deleted_at), para propagar entre dispositivos

-- ─────────────────────────────── Tenant e acesso ───────────────────────────────

create table if not exists empresas (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  plano         text not null default 'trial',
  status        text not null default 'trial'
                check (status in ('trial', 'ativa', 'inadimplente', 'cancelada')),
  trial_ate     timestamptz,
  assentos      integer not null default 3 check (assentos > 0),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- id = auth.users.id (o vínculo com o Supabase Auth é criado em 0003_supabase_auth.sql)
create table if not exists usuarios (
  id            uuid primary key,
  empresa_id    uuid not null references empresas(id) on delete cascade,
  nome          text not null,
  email         text not null unique,
  papel         text not null default 'usuario' check (papel in ('admin', 'usuario')),
  ativo         boolean not null default true,
  ultimo_acesso timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_usuarios_empresa on usuarios (empresa_id);

create table if not exists convites (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  email      text not null,
  papel      text not null default 'usuario' check (papel in ('admin', 'usuario')),
  token      text not null unique,
  expira_em  timestamptz not null,
  aceito_em  timestamptz,
  criado_em  timestamptz not null default now(),
  unique (empresa_id, email)
);

-- ──────────────────────────── Dados sincronizados ─────────────────────────────

-- Pastas = etiquetas. Uma única entidade (na extensão já são a mesma coisa).
create table if not exists pastas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  nome          text not null,
  cor           text not null default '#6366f1',
  ordem         integer not null default 0,
  escopo        text not null default 'empresa' check (escopo in ('empresa', 'pessoal')),
  owner_id      uuid references usuarios(id) on delete cascade,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at    timestamptz,
  -- pessoal exige dono; da empresa não tem dono
  constraint pastas_escopo_owner check ((escopo = 'pessoal') = (owner_id is not null))
);
create index if not exists idx_pastas_sync on pastas (empresa_id, atualizado_em);

-- Vínculo conversa ↔ pasta, chaveado pelo NÚMERO conectado (decisão §12.2):
-- compartilhado entre quem atende o mesmo WhatsApp, separado entre números diferentes.
create table if not exists pasta_conversas (
  empresa_id    uuid not null references empresas(id) on delete cascade,
  pasta_id      uuid not null references pastas(id) on delete cascade,
  wa_number     text not null,   -- número conectado, só dígitos (ex.: 5511964788124)
  remote_jid    text not null,   -- contato no WhatsApp (ex.: 5511999999999@c.us)
  criado_por    uuid references usuarios(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at    timestamptz,
  primary key (pasta_id, wa_number, remote_jid)
);
create index if not exists idx_pconv_conversa on pasta_conversas (empresa_id, wa_number, remote_jid);
create index if not exists idx_pconv_sync on pasta_conversas (empresa_id, atualizado_em);

create table if not exists categorias (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  nome          text not null,
  cor           text not null default '#22c55e',
  ordem         integer not null default 0,
  escopo        text not null default 'empresa' check (escopo in ('empresa', 'pessoal')),
  owner_id      uuid references usuarios(id) on delete cascade,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint categorias_escopo_owner check ((escopo = 'pessoal') = (owner_id is not null))
);
create index if not exists idx_categorias_sync on categorias (empresa_id, atualizado_em);

create table if not exists respostas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  categoria_id  uuid references categorias(id) on delete set null,
  titulo        text not null,
  atalho        text not null default '',
  pasta_id      uuid references pastas(id) on delete set null,  -- aplicada ao usar
  usos          integer not null default 0,
  ordem         integer not null default 0,
  escopo        text not null default 'empresa' check (escopo in ('empresa', 'pessoal')),
  owner_id      uuid references usuarios(id) on delete cascade,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint respostas_escopo_owner check ((escopo = 'pessoal') = (owner_id is not null))
);
create index if not exists idx_respostas_sync on respostas (empresa_id, atualizado_em);
create index if not exists idx_respostas_categoria on respostas (categoria_id);

-- Sequência de ações de uma resposta (texto → áudio → PDF, com intervalos).
-- Herda a permissão da resposta-mãe.
create table if not exists resposta_acoes (
  id             uuid primary key default gen_random_uuid(),
  resposta_id    uuid not null references respostas(id) on delete cascade,
  ordem          integer not null default 0,
  tipo           text not null default 'texto'
                 check (tipo in ('texto', 'imagem', 'audio', 'video', 'documento')),
  texto          text not null default '',
  midia_path     text,   -- caminho no Storage (mídia da resposta sincroniza)
  midia_mime     text,
  midia_nome     text,
  delay_segundos integer not null default 0 check (delay_segundos >= 0)
);
create index if not exists idx_acoes_resposta on resposta_acoes (resposta_id, ordem);

-- Anotações por conversa — compartilhadas por número, com autor registrado.
create table if not exists anotacoes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references empresas(id) on delete cascade,
  wa_number     text not null,
  remote_jid    text not null,
  texto         text not null,
  autor_id      uuid references usuarios(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at    timestamptz
);
create index if not exists idx_anotacoes_conversa on anotacoes (empresa_id, wa_number, remote_jid);
create index if not exists idx_anotacoes_sync on anotacoes (empresa_id, atualizado_em);

-- Preferências da extensão (por usuário).
create table if not exists config_usuario (
  usuario_id    uuid primary key references usuarios(id) on delete cascade,
  empresa_id    uuid not null references empresas(id) on delete cascade,
  tema          text not null default 'auto' check (tema in ('auto', 'claro', 'gray', 'escuro')),
  atalho        text not null default '/',
  webhook_url   text not null default '',
  atualizado_em timestamptz not null default now()
);

-- ──────────────────────── atualizado_em automático ────────────────────────────

create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'empresas','usuarios','pastas','pasta_conversas','categorias',
    'respostas','anotacoes','config_usuario'
  ] loop
    execute format(
      'drop trigger if exists trg_%1$s_atualizado on %1$I;
       create trigger trg_%1$s_atualizado before update on %1$I
       for each row execute function public.tocar_atualizado_em();', t);
  end loop;
end $$;
