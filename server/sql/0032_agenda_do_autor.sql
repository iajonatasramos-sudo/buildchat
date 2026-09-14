-- BuildChat / Anamni — o compromisso é de quem marcou
--
-- A 0028 deixava o departamento inteiro enxergar a agenda. Na prática o
-- retorno combinado com um cliente é assunto de quem atendeu: agora só
-- **quem marcou**, **quem é responsável** e o **admin** veem.
--
-- O responsável continua na regra porque é para isso que o campo existe:
-- marcar algo para outra pessoa da equipe (e ele nasce igual ao autor).

drop policy if exists agenda_ver on agendamentos;
create policy agenda_ver on agendamentos for select
  using (
    empresa_id = app.empresa_atual()
    and (
      criado_por = auth.uid()
      or responsavel_id = auth.uid()
      or app.eh_admin()
    )
  );
