-- BuildChat — anotação: quem escreveu (ou o admin) é quem edita e apaga
--
-- A leitura continua a mesma (empresa + chave de compartilhamento do admin).
-- Inserir exige assinar como autor; alterar e apagar (deleted_at) só o próprio
-- autor ou o admin da clínica. Antes, qualquer colega que enxergasse a nota
-- podia reescrevê-la ou apagá-la.

drop policy if exists anotacoes_empresa on anotacoes;

drop policy if exists anotacoes_ver on anotacoes;
create policy anotacoes_ver on anotacoes for select
  using (empresa_id = app.empresa_atual()
         and (autor_id = auth.uid() or app.contato_libera(empresa_id, wa_number, remote_jid, 'notas')));

drop policy if exists anotacoes_criar on anotacoes;
create policy anotacoes_criar on anotacoes for insert
  with check (empresa_id = app.empresa_atual() and autor_id = auth.uid());

drop policy if exists anotacoes_editar on anotacoes;
create policy anotacoes_editar on anotacoes for update
  using (empresa_id = app.empresa_atual() and (autor_id = auth.uid() or app.eh_admin()))
  with check (empresa_id = app.empresa_atual() and (autor_id = auth.uid() or app.eh_admin()));

drop policy if exists anotacoes_apagar on anotacoes;
create policy anotacoes_apagar on anotacoes for delete
  using (empresa_id = app.empresa_atual() and (autor_id = auth.uid() or app.eh_admin()));
