-- BuildChat — as informações são DO CONTATO na empresa, não do número que atendeu
--
-- Cada WhatsApp da equipe que conversa com o mesmo contato tem a própria linha
-- em contatos / pasta_conversas (chave com wa_number — é a "origem"). Até aqui
-- cada extensão só baixava as linhas do PRÓPRIO número: a Patricia abria o
-- contato e não via as notas nem as etiquetas que o Jonatas registrou.
--
-- Agora a extensão baixa tudo da empresa (mescla por remote_jid) e o servidor
-- mantém as linhas irmãs coerentes: renomear, interesses, telefone, chaves de
-- compartilhamento e a remoção de etiqueta se propagam para as outras origens.
-- A "origem" continua registrada em cada linha.

-- Ficha: campos editáveis e chaves andam juntos entre as origens do mesmo contato.
create or replace function public.contato_propaga_para_irmaos() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  update contatos c
     set nome = new.nome,
         nome_whatsapp = coalesce(new.nome_whatsapp, c.nome_whatsapp),
         telefone = coalesce(new.telefone, c.telefone),
         interesses = new.interesses,
         ultimo_contato = greatest(c.ultimo_contato, new.ultimo_contato),
         compartilha_notas = new.compartilha_notas,
         compartilha_interesses = new.compartilha_interesses,
         compartilha_etiquetas = new.compartilha_etiquetas,
         compartilha_propostas = new.compartilha_propostas,
         atualizado_em = now()
   where c.empresa_id = new.empresa_id
     and c.remote_jid = new.remote_jid
     and c.id <> new.id
     and c.deleted_at is null
     and (c.nome is distinct from new.nome
          or c.interesses is distinct from new.interesses
          or (new.telefone is not null and c.telefone is distinct from new.telefone)
          or (new.nome_whatsapp is not null and c.nome_whatsapp is distinct from new.nome_whatsapp)
          or (new.ultimo_contato is not null and (c.ultimo_contato is null or c.ultimo_contato < new.ultimo_contato))
          or c.compartilha_notas <> new.compartilha_notas
          or c.compartilha_interesses <> new.compartilha_interesses
          or c.compartilha_etiquetas <> new.compartilha_etiquetas
          or c.compartilha_propostas <> new.compartilha_propostas);
  return new;
end $$;
drop trigger if exists trg_contato_irmaos on contatos;
create trigger trg_contato_irmaos
  after update of nome, nome_whatsapp, telefone, interesses, ultimo_contato,
                  compartilha_notas, compartilha_interesses, compartilha_etiquetas, compartilha_propostas
  on contatos
  for each row execute function public.contato_propaga_para_irmaos();

-- Etiqueta removida por um número some para os outros também (colocar não
-- precisa propagar: a extensão mescla "ativa em qualquer origem").
create or replace function public.pconv_propaga_remocao() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if pg_trigger_depth() > 1 or new.deleted_at is null then return new; end if;
  update pasta_conversas p
     set deleted_at = new.deleted_at, atualizado_em = now()
   where p.empresa_id = new.empresa_id
     and p.pasta_id = new.pasta_id
     and p.remote_jid = new.remote_jid
     and p.wa_number <> new.wa_number
     and p.deleted_at is null;
  return new;
end $$;
drop trigger if exists trg_pconv_remocao on pasta_conversas;
create trigger trg_pconv_remocao
  after update of deleted_at on pasta_conversas
  for each row execute function public.pconv_propaga_remocao();

-- A extensão passa a baixar as fichas da EMPRESA inteira (mescla por contato).
-- `wa_number` vem junto — é a origem — e `interesses` continua mascarado.
drop function if exists public.minhas_fichas(text, timestamptz);
create or replace function public.minhas_fichas(p_desde timestamptz default null)
returns table (
  wa_number text, remote_jid text, nome text, nome_whatsapp text, telefone text, interesses text,
  ultimo_contato timestamptz, deleted_at timestamptz, atualizado_em timestamptz
)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.wa_number, c.remote_jid, c.nome, c.nome_whatsapp, c.telefone,
         case when app.contato_libera(c.empresa_id, c.wa_number, c.remote_jid, 'interesses') then c.interesses else null end,
         c.ultimo_contato, c.deleted_at, c.atualizado_em
    from contatos c
   where c.empresa_id = app.empresa_atual()
     and (p_desde is null or c.atualizado_em > p_desde)
   order by c.atualizado_em
$$;
revoke execute on function public.minhas_fichas(timestamptz) from public, anon;
grant execute on function public.minhas_fichas(timestamptz) to authenticated;
