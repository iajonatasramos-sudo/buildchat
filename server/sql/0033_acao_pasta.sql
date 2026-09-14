-- BuildChat / Anamni — ações de pasta na sequência da mensagem rápida
--
-- Além de enviar texto e mídia, uma ação pode **colocar o contato numa pasta**
-- ou **tirar dela**. O id da pasta vai na coluna `texto` (que já existe e está
-- vazia nesses tipos); em `pasta_del`, o valor especial `todas` limpa todas as
-- pastas do contato de uma vez.
--
-- Continua existindo o campo "Etiqueta (ao usar)" da mensagem, que é um atalho
-- para o caso simples; a ação serve para montar sequências ("tira de Lead,
-- põe em Cliente").

alter table resposta_acoes drop constraint if exists resposta_acoes_tipo_check;
alter table resposta_acoes add constraint resposta_acoes_tipo_check
  check (tipo in ('texto', 'imagem', 'audio', 'video', 'documento', 'pasta_add', 'pasta_del'));
