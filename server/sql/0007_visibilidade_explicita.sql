-- BuildChat — visibilidade explícita das mensagens/pastas da empresa
--
-- Antes: arrays vazios significavam "todos veem". Isso fazia toda mensagem
-- nova nascer liberada para a clínica inteira, sem ninguém decidir.
-- Agora: `visivel_todos` é uma escolha explícita e nasce FALSE — a mensagem só
-- aparece para quem o admin marcar (equipe, pessoa ou "todos").

-- Só as MENSAGENS têm visibilidade restrita. Pastas (etiquetas) continuam de
-- toda a empresa: o vínculo conversa↔pasta é compartilhado, então esconder a
-- pasta de um colega deixaria a conversa etiquetada numa pasta invisível.
alter table respostas add column if not exists visivel_todos boolean not null default false;

-- Preserva o comportamento do que já existe: o que estava visível continua.
do $$
begin
  if not exists (select 1 from pg_class where relname = 'respostas_visivel_todos_migrado') then
    update respostas
       set visivel_todos = true
     where cardinality(visivel_equipes) = 0
       and cardinality(visivel_usuarios) = 0;
    -- marcador para não reabrir registros restritos numa reaplicação
    create table respostas_visivel_todos_migrado (em timestamptz not null default now());
  end if;
end $$;

-- Regra de leitura: pessoal é do dono; da empresa depende da escolha.
create or replace function app.visivel_para_mim(p_equipes uuid[], p_usuarios uuid[])
returns boolean language sql stable as $$
  select auth.uid() = any(p_usuarios)
      or p_equipes && app.minhas_equipes()
$$;

-- Pastas: de volta à regra simples (empresa vê tudo; pessoal é do dono).
drop policy if exists pastas_ver on pastas;
create policy pastas_ver on pastas for select
  using (app.pode_ver(empresa_id, escopo, owner_id));

-- Mensagens: só quem foi escolhido (ou o admin, que administra o acervo).
drop policy if exists respostas_ver on respostas;
create policy respostas_ver on respostas for select
  using (app.pode_ver(empresa_id, escopo, owner_id)
         and (escopo = 'pessoal'
              or app.eh_admin()
              or visivel_todos
              or app.visivel_para_mim(visivel_equipes, visivel_usuarios)));
