-- BuildChat — com quais números de WhatsApp cada usuário conectou
--
-- O painel do usuário comum mostra só os contatos dos números que ELE usou
-- na extensão. Até aqui o servidor não sabia essa relação: a extensão só
-- carimbava `usuarios.ultimo_acesso`. Agora, a cada sincronização, ela
-- registra o número conectado (RPC abaixo, no máximo uma vez por hora).
--
-- Leitura: o usuário vê os próprios números; o admin vê os de toda a empresa
-- (é ele quem administra quem atende o quê). Escrita só pela RPC.

create table if not exists usuario_numeros (
  usuario_id    uuid not null references usuarios(id) on delete cascade,
  empresa_id    uuid not null references empresas(id) on delete cascade,
  wa_number     text not null,            -- só dígitos, com DDI
  nome_whatsapp text,                     -- nome do perfil do WhatsApp conectado
  primeiro_uso  timestamptz not null default now(),
  ultimo_uso    timestamptz not null default now(),
  primary key (usuario_id, wa_number)
);
create index if not exists idx_usuario_numeros_empresa on usuario_numeros (empresa_id, wa_number);

alter table usuario_numeros enable row level security;

drop policy if exists usuario_numeros_ver on usuario_numeros;
create policy usuario_numeros_ver on usuario_numeros for select
  using (usuario_id = auth.uid() or (empresa_id = app.empresa_atual() and app.eh_admin()));

grant select on usuario_numeros to authenticated;

/** A extensão chama ao sincronizar: "este usuário está atendendo por este número". */
create or replace function public.registrar_numero(p_wa_number text, p_nome text default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_empresa uuid; v_digitos text;
begin
  v_empresa := app.empresa_atual();
  if v_empresa is null then
    raise exception 'usuário sem empresa';
  end if;
  v_digitos := regexp_replace(coalesce(p_wa_number, ''), '\D', '', 'g');
  if length(v_digitos) < 8 then
    raise exception 'número inválido';
  end if;

  insert into usuario_numeros (usuario_id, empresa_id, wa_number, nome_whatsapp)
       values (auth.uid(), v_empresa, v_digitos, nullif(trim(p_nome), ''))
  on conflict (usuario_id, wa_number) do update
     set ultimo_uso    = now(),
         nome_whatsapp = coalesce(excluded.nome_whatsapp, usuario_numeros.nome_whatsapp);
end $$;
revoke execute on function public.registrar_numero(text, text) from public, anon;
grant execute on function public.registrar_numero(text, text) to authenticated;

/** Números do usuário autenticado (a extensão e o painel usam para filtrar). */
create or replace function public.meus_numeros()
returns table (wa_number text, nome_whatsapp text, ultimo_uso timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select n.wa_number, n.nome_whatsapp, n.ultimo_uso
    from usuario_numeros n
   where n.usuario_id = auth.uid()
   order by n.ultimo_uso desc
$$;
revoke execute on function public.meus_numeros() from public, anon;
grant execute on function public.meus_numeros() to authenticated;
