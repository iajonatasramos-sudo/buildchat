-- BuildChat — mudar o escopo de uma integração já cadastrada
--
-- Antes o upsert era por (chave, empresa): trocar a empresa criava OUTRA linha
-- em vez de mover a existente. Com `p_id` o gestor edita a linha e pode passar
-- a integração de global para uma clínica (e vice-versa) sem perder o token.

create or replace function public.sistema_salvar_integracao(
  p_chave      text,
  p_nome       text,
  p_url        text default null,
  p_token      text default null,
  p_empresa    uuid default null,
  p_ativo      boolean default true,
  p_observacao text default null,
  p_id         uuid default null
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not app.eh_operador() then
    raise exception 'acesso restrito ao gestor do sistema';
  end if;
  if coalesce(trim(p_chave), '') = '' then
    raise exception 'informe a chave da integração';
  end if;
  if p_empresa is not null and not exists (select 1 from empresas where id = p_empresa) then
    raise exception 'clínica inexistente';
  end if;

  -- Edição por id (permite trocar o escopo); senão, upsert por chave + escopo.
  if p_id is not null then
    v_id := p_id;
    if not exists (select 1 from integracoes where id = v_id) then
      raise exception 'integração não encontrada';
    end if;
  else
    select id into v_id from integracoes
     where chave = trim(p_chave) and empresa_id is not distinct from p_empresa;
  end if;

  -- Uma configuração por chave em cada escopo — avisa antes do índice estourar.
  if exists (
    select 1 from integracoes
     where chave = trim(p_chave)
       and empresa_id is not distinct from p_empresa
       and id is distinct from v_id
  ) then
    raise exception '% já tem uma integração "%" cadastrada.',
      coalesce((select nome from empresas where id = p_empresa), 'O padrão do sistema'),
      trim(p_chave);
  end if;

  if v_id is null then
    insert into integracoes (empresa_id, chave, nome, url, token, ativo, observacao)
         values (p_empresa, trim(p_chave), p_nome, p_url, p_token, p_ativo, p_observacao)
      returning id into v_id;
  else
    update integracoes
       set empresa_id = p_empresa,
           chave      = trim(p_chave),
           nome       = p_nome,
           url        = p_url,
           -- Token vazio não apaga o que já existe (o painel mostra mascarado).
           token      = coalesce(nullif(p_token, ''), token),
           ativo      = p_ativo,
           observacao = p_observacao
     where id = v_id;
  end if;
  return v_id;
end $$;

-- A versão antiga (sem p_id) sai de cena para não haver duas assinaturas — o
-- PostgREST escolheria pelo conjunto de argumentos e confundiria o painel.
drop function if exists public.sistema_salvar_integracao(text, text, text, text, uuid, boolean, text);

revoke execute on function
  public.sistema_salvar_integracao(text, text, text, text, uuid, boolean, text, uuid)
  from public, anon;
grant execute on function
  public.sistema_salvar_integracao(text, text, text, text, uuid, boolean, text, uuid)
  to authenticated;
