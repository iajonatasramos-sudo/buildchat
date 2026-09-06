-- BuildChat — pasta/etiqueta é da equipe inteira, em qualquer plano
--
-- Furo real: `pastas` seguia a mesma policy de `respostas` (`app.pode_escrever`),
-- que exige admin E o recurso "mensagens da empresa" do plano. Duas consequências
-- em produção:
--
--   1. atendente comum não conseguia criar etiqueta — e como a extensão sobe o
--      acervo local na primeira sincronização, o sync inteiro morria no catch:
--      a nuvem ficava riscada e as integrações (o botão "Gerar proposta") nunca
--      chegavam ao aparelho dele;
--   2. no plano Start nem o admin criava etiqueta, porque o limite de MENSAGENS
--      da empresa estava sendo aplicado a ETIQUETAS.
--
-- Etiqueta é organização compartilhada — o vínculo conversa↔pasta já é da
-- empresa e visível para todos (ver CLAUDE.md). Quem pode etiquetar conversa
-- pode manter as etiquetas. Mensagens (`respostas`, `categorias`) não mudam:
-- publicar para a empresa continua sendo do admin, com o plano fiscalizado.

drop policy if exists pastas_escreve on pastas;
create policy pastas_escreve on pastas for all
  using (
    empresa_id = app.empresa_atual()
    and (escopo = 'empresa' or owner_id = auth.uid())
  )
  with check (
    empresa_id = app.empresa_atual()
    and (escopo = 'empresa' or owner_id = auth.uid())
  );
