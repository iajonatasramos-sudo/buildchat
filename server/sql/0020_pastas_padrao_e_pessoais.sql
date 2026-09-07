-- BuildChat — pastas padrão (do admin) e pastas pessoais (de cada usuário)
--
-- Mesma regra das mensagens rápidas, agora também nas pastas/etiquetas:
--   * PADRÃO (escopo 'empresa'): só o admin cria/edita/apaga, pelo painel, e
--     escolhe para quem aparece — todos, equipes ou pessoas. Nasce visível
--     para todos (é o que uma etiqueta da clínica costuma ser).
--   * PESSOAL (escopo 'pessoal'): qualquer usuário cria (extensão ou painel);
--     só ele vê e só ele apaga. Nem o admin apaga a pasta pessoal de alguém.
--
-- Isso revê a 0014, que tinha liberado qualquer usuário a escrever pasta da
-- empresa (era o remendo para a sincronização não morrer — agora a extensão
-- cria pastas pessoais, e o problema não existe mais).

alter table pastas add column if not exists visivel_todos boolean not null default true;

-- Leitura: pessoal é do dono; padrão depende da escolha do admin (que vê tudo).
drop policy if exists pastas_ver on pastas;
create policy pastas_ver on pastas for select
  using (app.pode_ver(empresa_id, escopo, owner_id)
         and (escopo = 'pessoal'
              or app.eh_admin()
              or visivel_todos
              or app.visivel_para_mim(visivel_equipes, visivel_usuarios)));

-- Escrita: padrão é do admin; pessoal é do dono. Nada de escrever no que é do outro.
drop policy if exists pastas_escreve on pastas;
create policy pastas_escreve on pastas for all
  using (
    empresa_id = app.empresa_atual()
    and ((escopo = 'pessoal' and owner_id = auth.uid()) or (escopo = 'empresa' and app.eh_admin()))
  )
  with check (
    empresa_id = app.empresa_atual()
    and ((escopo = 'pessoal' and owner_id = auth.uid()) or (escopo = 'empresa' and app.eh_admin()))
  );
