-- BuildChat / Anamni — agenda da clínica
--
-- Compromisso ligado (ou não) a um contato: "retornar para a Dra. Ana na
-- quinta", "o paciente ficou de responder dia 12". Nasce na extensão, durante
-- a conversa, e aparece no calendário do painel — e vice-versa.
--
-- Visibilidade: a agenda é DA CLÍNICA (todo mundo vê o que a equipe marcou —
-- é para isso que serve uma agenda). Mexer, só quem criou, quem é o
-- responsável ou o admin — mesma regra das anotações (0025).

create table if not exists agendamentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references empresas(id) on delete cascade,
  -- Contato do compromisso. Opcional: dá para marcar algo solto na agenda.
  wa_number      text,
  remote_jid     text,
  contato_nome   text,
  titulo         text not null,
  descricao      text,
  inicio         timestamptz not null,
  fim            timestamptz,
  dia_inteiro    boolean not null default false,
  status         text not null default 'pendente'
                 check (status in ('pendente', 'concluido', 'cancelado')),
  criado_por     uuid references usuarios(id) on delete set null,
  responsavel_id uuid references usuarios(id) on delete set null,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  deleted_at     timestamptz
);

create index if not exists idx_agenda_periodo on agendamentos (empresa_id, inicio);
create index if not exists idx_agenda_sync on agendamentos (empresa_id, atualizado_em);
create index if not exists idx_agenda_contato on agendamentos (empresa_id, remote_jid);

alter table agendamentos enable row level security;
grant select, insert, update, delete on agendamentos to authenticated;

-- Sem responsável informado, quem marcou responde por ele.
create or replace function public.agenda_responsavel_padrao() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.responsavel_id is null then new.responsavel_id := new.criado_por; end if;
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists trg_agenda_responsavel on agendamentos;
create trigger trg_agenda_responsavel before insert or update on agendamentos
  for each row execute function public.agenda_responsavel_padrao();

-- A clínica inteira LÊ a agenda.
drop policy if exists agenda_ver on agendamentos;
create policy agenda_ver on agendamentos for select
  using (empresa_id = app.empresa_atual());

-- Quem marca assina o compromisso.
drop policy if exists agenda_criar on agendamentos;
create policy agenda_criar on agendamentos for insert
  with check (empresa_id = app.empresa_atual() and criado_por = auth.uid());

-- Mexer: autor, responsável ou admin.
drop policy if exists agenda_editar on agendamentos;
create policy agenda_editar on agendamentos for update
  using (empresa_id = app.empresa_atual()
         and (criado_por = auth.uid() or responsavel_id = auth.uid() or app.eh_admin()))
  with check (empresa_id = app.empresa_atual());

drop policy if exists agenda_apagar on agendamentos;
create policy agenda_apagar on agendamentos for delete
  using (empresa_id = app.empresa_atual()
         and (criado_por = auth.uid() or responsavel_id = auth.uid() or app.eh_admin()));
