-- BuildChat / Anamni — a agenda enxerga até onde vai a equipe
--
-- Antes, a clínica inteira via todos os compromissos. Agora cada pessoa vê:
--   • o que ela marcou ou o que está sob a responsabilidade dela;
--   • o de quem divide EQUIPE com ela (mesma empresa, por definição);
--   • o admin continua vendo tudo, porque administra a clínica.
--
-- É regra de banco, não de tela: esconder na interface não impede a chamada
-- direta à API.

create or replace function app.mesma_equipe(p_usuario uuid)
returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p_usuario is not null and exists (
    select 1
      from equipe_usuarios minha
      join equipe_usuarios dele on dele.equipe_id = minha.equipe_id
     where minha.usuario_id = auth.uid()
       and dele.usuario_id = p_usuario
  )
$$;
grant execute on function app.mesma_equipe(uuid) to authenticated;

drop policy if exists agenda_ver on agendamentos;
create policy agenda_ver on agendamentos for select
  using (
    empresa_id = app.empresa_atual()
    and (
      criado_por = auth.uid()
      or responsavel_id = auth.uid()
      or app.eh_admin()
      or app.mesma_equipe(criado_por)
      or app.mesma_equipe(responsavel_id)
    )
  );
