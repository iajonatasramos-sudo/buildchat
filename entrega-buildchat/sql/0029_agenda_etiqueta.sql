-- BuildChat / Anamni — etiqueta na atividade da agenda
--
-- Cada produto tem a sua lista (BuildChat: Follow-up, Reunião, Cobrar,
-- Urgente; Anamni: Follow-up, Consulta, Retorno, Urgente) e a lista mora na
-- extensão/painel, não aqui: o banco guarda o texto. Assim dá para mudar,
-- acrescentar ou traduzir uma etiqueta sem migração — e um compromisso antigo
-- nunca fica órfão de uma opção que saiu da lista.

alter table agendamentos add column if not exists etiqueta text;
create index if not exists idx_agenda_etiqueta on agendamentos (empresa_id, etiqueta);
