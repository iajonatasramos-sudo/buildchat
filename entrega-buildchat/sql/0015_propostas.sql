-- BuildChat — propostas geradas pela extensão
--
-- Cada PDF gerado fica guardado para a equipe: quem atende o número vê as
-- propostas do contato na guia Contato e pode reenviar direto na conversa,
-- como no SalesBuild. É ficha da empresa, chaveada pelo número conectado
-- (wa_number) + contato (remote_jid), igual a `contatos`.
--
-- O arquivo mora no bucket `midias`, em <empresa_id>/propostas/<id>.pdf — a
-- política do bucket já isola pela primeira pasta do caminho, então nada de
-- novo no Storage. O `with check` abaixo garante que a linha só aponte para a
-- pasta da própria empresa.

create table if not exists propostas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  wa_number      text not null,          -- número conectado (só dígitos)
  remote_jid     text not null,          -- contato no WhatsApp
  contato_nome   text,                   -- nome como saiu na proposta
  tipo           text not null,          -- EXEC_SP | INT_SP | EXEC_BR | INT_BR | VIGILANCIA
  valor_centavos integer not null default 0 check (valor_centavos >= 0),
  arquivo_path   text not null,          -- caminho no bucket midias
  criado_por     uuid references usuarios(id) on delete set null,
  enviada_em     timestamptz,            -- última vez que foi anexada na conversa
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists idx_propostas_sync on propostas (empresa_id, atualizado_em);
create index if not exists idx_propostas_conversa on propostas (empresa_id, wa_number, remote_jid);

drop trigger if exists trg_propostas_atualizado on propostas;
create trigger trg_propostas_atualizado before update on propostas
for each row execute function public.tocar_atualizado_em();

alter table propostas enable row level security;

drop policy if exists propostas_empresa on propostas;
create policy propostas_empresa on propostas for all
  using (empresa_id = app.empresa_atual())
  with check (
    empresa_id = app.empresa_atual()
    and arquivo_path like app.empresa_atual()::text || '/%'
  );

grant select, insert, update, delete on propostas to authenticated;
