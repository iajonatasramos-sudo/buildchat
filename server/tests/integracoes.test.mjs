// Integrações (APIs) administradas pelo gestor e lidas pela extensão.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, B, operador;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  B = await semearEmpresa(h, 'clinica-b');
  operador = await criarAuthUser(h, 'dono@buildchat.com.br');
  await h.servidor(`insert into sistema_operadores (usuario_auth_id, nome) values ($1, 'Dono')`, [operador]);
});

after(async () => h.fechar());

describe('administração', () => {
  test('o gestor cria a integração global', async () => {
    await h.como(operador,
      `select sistema_salvar_integracao('propostas', 'Propostas BuildClinic',
              'https://app.buildclinic.com.br/api/propostas/gerar', 'token-global', null, true, 'padrão')`);
    const r = await h.como(operador, `select chave, token, empresa from sistema_integracoes()`);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].token, 'token-global');
    assert.equal(r.rows[0].empresa, null, 'global não tem empresa');
  });

  test('salvar sem token não apaga o token existente', async () => {
    await h.como(operador,
      `select sistema_salvar_integracao('propostas', 'Propostas BuildClinic',
              'https://app.buildclinic.com.br/api/propostas/gerar', '', null, true, 'sem mexer no token')`);
    const { rows: [r] } = await h.como(operador, `select token, observacao from sistema_integracoes()`);
    assert.equal(r.token, 'token-global');
    assert.match(r.observacao, /sem mexer/);
  });

  test('a clínica não administra integrações', async () => {
    await assert.rejects(
      h.como(A.admin, `select sistema_integracoes()`), /acesso restrito/i);
    await assert.rejects(
      h.como(A.admin, `select sistema_salvar_integracao('x', 'X', null, 'tok', null, true, null)`),
      /acesso restrito/i);
    // Nem chega à RLS: a clínica não tem privilégio de escrita na tabela.
    await assert.rejects(
      h.como(A.admin, `insert into integracoes (chave, nome, token) values ('pirata', 'P', 't')`),
      /permission denied/i);
    await assert.rejects(
      h.como(A.admin, `update integracoes set token = 'roubado'`),
      /permission denied/i);
  });
});

describe('o que cada clínica enxerga', () => {
  test('sem configuração específica, vale a global', async () => {
    const r = await h.como(A.usuario, `select chave, token from minhas_integracoes()`);
    assert.equal(r.rows[0]?.token, 'token-global');
  });

  test('a configuração da empresa tem prioridade sobre a global', async () => {
    await h.como(operador,
      `select sistema_salvar_integracao('propostas', 'Propostas da Clínica A',
              'https://api.clinica-a.com', 'token-da-a', $1, true, null)`, [A.id]);

    const daA = await h.como(A.admin, `select token, url from minhas_integracoes()`);
    assert.equal(daA.rows[0].token, 'token-da-a', 'A usa o próprio token');
    assert.equal(daA.rows.length, 1, 'não duplica a chave');

    const daB = await h.como(B.admin, `select token from minhas_integracoes()`);
    assert.equal(daB.rows[0].token, 'token-global', 'B continua no padrão');
  });

  test('uma clínica não lê a integração da outra', async () => {
    const r = await h.como(B.admin, `select count(*)::int as n from integracoes where empresa_id is not null`);
    assert.equal(r.rows[0].n, 0);
  });

  test('integração desativada não chega à extensão', async () => {
    await h.como(operador,
      `select sistema_salvar_integracao('propostas', 'Propostas da Clínica A',
              'https://api.clinica-a.com', '', $1, false, null)`, [A.id]);
    const r = await h.como(A.admin, `select token from minhas_integracoes()`);
    assert.equal(r.rows[0].token, 'token-global', 'volta para a global quando a específica é desligada');
  });
});
