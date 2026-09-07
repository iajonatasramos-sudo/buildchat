-- BuildChat — categoria acompanha a mensagem publicada
--
-- Furo real: o admin cria a categoria "Links" na extensão (nasce PESSOAL dele)
-- e depois publica para a equipe uma mensagem nessa categoria. A equipe recebe
-- a mensagem, mas não a categoria (é pessoal de outro) — e a extensão, sem a
-- categoria, deixava a mensagem sem grupo e ela sumia da lista.
--
-- Regra: uma categoria usada por mensagem da EMPRESA é da empresa. O trigger
-- promove a categoria pessoal no momento em que a mensagem é publicada, seja
-- pelo painel ou pela extensão.

create or replace function public.promover_categoria_da_mensagem() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.escopo = 'empresa' and new.categoria_id is not null then
    update categorias
       set escopo = 'empresa', owner_id = null, atualizado_em = now()
     where id = new.categoria_id and escopo = 'pessoal';
  end if;
  return new;
end $$;

drop trigger if exists trg_categoria_acompanha_mensagem on respostas;
create trigger trg_categoria_acompanha_mensagem
  after insert or update of escopo, categoria_id on respostas
  for each row execute function public.promover_categoria_da_mensagem();

-- O que já está publicado com categoria pessoal também é corrigido agora.
update categorias c
   set escopo = 'empresa', owner_id = null, atualizado_em = now()
 where c.escopo = 'pessoal'
   and exists (select 1 from respostas r
                where r.categoria_id = c.id and r.escopo = 'empresa' and r.deleted_at is null);
