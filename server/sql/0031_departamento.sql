-- BuildChat / Anamni — anotações e etiquetas ficam no departamento
--
-- Até aqui a anotação e a etiqueta eram da EMPRESA inteira (respeitando as
-- chaves de compartilhamento do contato). Agora valem dentro do
-- DEPARTAMENTO: vejo o que eu mesmo registrei, o que veio de alguém do meu
-- departamento, e o admin vê tudo. (Departamento é a tabela `equipes` — o
-- nome mudou só na tela; renomear a tabela custaria caro e não mudaria nada
-- de comportamento.)
--
-- Cuidado com o legado: linha sem autor (`autor_id`/`criado_por` nulos) é de
-- antes dessa história e continua valendo para a empresa — senão o acervo
-- antigo sumiria da tela de todo mundo.
--
-- Quem não está em NENHUM departamento passa a ver só o que é dele. É o
-- esperado da regra; por isso a tela de Departamentos existe.

-- ── Anotações ───────────────────────────────────────────────────────────────
drop policy if exists anotacoes_ver on anotacoes;
create policy anotacoes_ver on anotacoes for select
  using (
    empresa_id = app.empresa_atual()
    -- alcance: minha, do meu departamento, legado sem autor, ou sou admin
    and (autor_id = auth.uid()
         or autor_id is null
         or app.eh_admin()
         or app.mesma_equipe(autor_id))
    -- e a chave do contato continua mandando
    and (autor_id = auth.uid() or app.contato_libera(empresa_id, wa_number, remote_jid, 'notas'))
  );

-- ── Etiquetas do contato (vínculo pasta ↔ conversa) ─────────────────────────
-- A policy antiga era `for all`; separamos leitura de escrita para a leitura
-- poder ser mais estreita sem travar quem etiqueta.
drop policy if exists pconv_empresa on pasta_conversas;

create policy pconv_ver on pasta_conversas for select
  using (
    empresa_id = app.empresa_atual()
    and (criado_por = auth.uid()
         or criado_por is null
         or app.eh_admin()
         or app.mesma_equipe(criado_por))
    and (criado_por = auth.uid() or app.contato_libera(empresa_id, wa_number, remote_jid, 'etiquetas'))
  );

create policy pconv_criar on pasta_conversas for insert
  with check (empresa_id = app.empresa_atual());

create policy pconv_editar on pasta_conversas for update
  using (empresa_id = app.empresa_atual())
  with check (empresa_id = app.empresa_atual());

create policy pconv_apagar on pasta_conversas for delete
  using (empresa_id = app.empresa_atual());
