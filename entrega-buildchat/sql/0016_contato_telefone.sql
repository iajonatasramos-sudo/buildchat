-- BuildChat — telefone real do contato
--
-- O WhatsApp passou a identificar conversas por LID (`198285872635944@lid`),
-- um id interno que não é telefone. Derivar o número do `remote_jid` — o que a
-- ficha e o painel faziam — mostrava esse id como se fosse um celular.
-- A extensão resolve o número real pelo WPP (`getPnLidEntry`) e grava aqui;
-- sem ele, o painel mostra "—" em vez de inventar um número.

alter table contatos add column if not exists telefone text;  -- só dígitos, com DDI
