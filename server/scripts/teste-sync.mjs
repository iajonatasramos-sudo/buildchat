#!/usr/bin/env node
// Valida o contrato de sincronização (Fase 2) contra o projeto real:
// upsert por chave composta, união entre colegas, exclusão lógica e
// leitura incremental por atualizado_em.

import { api, criarUsuarioTeste, verificador } from './_comum.mjs';

const v = verificador();
const marca = Date.now().toString(36);
const WA = '5511964788124';       // número conectado (a "instância")
const JID = '5511999990000@c.us'; // conversa

console.log('\n1. Empresa com dois atendentes no mesmo número');
const tokenA = await criarUsuarioTeste(`e2e-${marca}-adm@gmail.com`);
const { dados: empresaId } = await api('/rest/v1/rpc/criar_empresa_e_admin', {
  token: tokenA, metodo: 'POST', corpo: { p_empresa: 'Clínica E2E Sync', p_nome: 'Admin' },
});
await api('/rest/v1/convites', {
  token: tokenA, metodo: 'POST',
  corpo: { empresa_id: empresaId, email: `e2e-${marca}-rec@gmail.com`, papel: 'usuario',
           token: `tok-${marca}`, expira_em: new Date(Date.now() + 6e8).toISOString() },
});
const tokenB = await criarUsuarioTeste(`e2e-${marca}-rec@gmail.com`);
const aceite = await api('/rest/v1/rpc/aceitar_convite', {
  token: tokenB, metodo: 'POST', corpo: { p_token: `tok-${marca}`, p_nome: 'Recepção' },
});
v.ok(aceite.status === 200, 'recepcionista entrou na empresa pelo convite', `status ${aceite.status}`);

console.log('\n2. Pasta e vínculo');
const pasta = await api('/rest/v1/pastas', {
  token: tokenA, metodo: 'POST', prefer: 'return=representation',
  corpo: { empresa_id: empresaId, nome: 'LEAD FACETA', cor: '#ec4899' },
});
const pastaId = pasta.dados?.[0]?.id;
v.ok(!!pastaId, 'admin criou a pasta');

const marcar = (token, ativo = true) =>
  api('/rest/v1/pasta_conversas?on_conflict=pasta_id,wa_number,remote_jid', {
    token, metodo: 'POST', prefer: 'resolution=merge-duplicates',
    corpo: { empresa_id: empresaId, pasta_id: pastaId, wa_number: WA, remote_jid: JID,
             deleted_at: ativo ? null : new Date().toISOString() },
  });

const m1 = await marcar(tokenA);
v.ok(m1.status < 300, 'admin marcou a conversa na pasta', `status ${m1.status}`);

const visaoB = await api(`/rest/v1/pasta_conversas?select=remote_jid&wa_number=eq.${WA}`, { token: tokenB });
v.ok(visaoB.dados?.length === 1, 'a colega vê o vínculo (mesmo número = acervo comum)');

console.log('\n3. Repetição e exclusão');
const m2 = await marcar(tokenB);
v.ok(m2.status < 300, 'marcar de novo não dá erro (upsert idempotente)', `status ${m2.status}`);
const total = await api(`/rest/v1/pasta_conversas?select=remote_jid&wa_number=eq.${WA}`, { token: tokenA });
v.ok(total.dados?.length === 1, 'continua sendo um único vínculo', `${total.dados?.length} linha(s)`);

const t0 = new Date().toISOString();
await new Promise((r) => setTimeout(r, 1200));
const rem = await marcar(tokenA, false);
v.ok(rem.status < 300, 'desmarcar grava exclusão lógica', `status ${rem.status}`);

console.log('\n4. Leitura incremental');
const inc = await api(
  `/rest/v1/pasta_conversas?select=remote_jid,deleted_at&wa_number=eq.${WA}&atualizado_em=gt.${t0}`,
  { token: tokenB });
v.ok(inc.dados?.length === 1, 'a colega recebe só o que mudou desde o último sync');
v.ok(!!inc.dados?.[0]?.deleted_at, 'e a mudança carrega o deleted_at (propaga a remoção)');

const nada = await api(
  `/rest/v1/pasta_conversas?select=remote_jid&atualizado_em=gt.${new Date().toISOString()}`,
  { token: tokenB });
v.ok(nada.dados?.length === 0, 'sem alterações novas, o pull volta vazio');

v.fim();
