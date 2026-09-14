-- BuildChat — Storage das mídias das respostas rápidas
--
-- Só a mídia DAS RESPOSTAS sobe (áudios de saudação, PDFs de proposta...).
-- A mídia das CONVERSAS nunca sai do computador do usuário.
--
-- Caminho do arquivo: <empresa_id>/<nome-do-arquivo>
-- A primeira pasta do caminho é o isolamento: a política compara com a empresa
-- do usuário autenticado.

insert into storage.buckets (id, name, public, file_size_limit)
values ('midias', 'midias', false, 52428800)   -- 50 MB por arquivo
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

drop policy if exists midias_ver on storage.objects;
create policy midias_ver on storage.objects for select to authenticated
  using (bucket_id = 'midias' and (storage.foldername(name))[1] = app.empresa_atual()::text);

drop policy if exists midias_inserir on storage.objects;
create policy midias_inserir on storage.objects for insert to authenticated
  with check (bucket_id = 'midias' and (storage.foldername(name))[1] = app.empresa_atual()::text);

drop policy if exists midias_atualizar on storage.objects;
create policy midias_atualizar on storage.objects for update to authenticated
  using (bucket_id = 'midias' and (storage.foldername(name))[1] = app.empresa_atual()::text)
  with check (bucket_id = 'midias' and (storage.foldername(name))[1] = app.empresa_atual()::text);

drop policy if exists midias_apagar on storage.objects;
create policy midias_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'midias' and (storage.foldername(name))[1] = app.empresa_atual()::text);
