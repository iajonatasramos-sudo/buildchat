// Perfil do gestor do sistema: lê e renomeia só a própria conta.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, operador, outro;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  operador = await criarAuthUser(h, 'dono@buildchat.com.br');
  outro = await criarAuthUser(h, 'socio@buildchat.com.br');
  await h.servidor(`insert into sistema_operadores (usuario_auth_id, nome) values ($1, 'Dono'), ($2, 'Sócio')`, [operador, outro]);
});

after(async () => h.fechar());

test('o gestor vê o próprio nome e e-mail', async () => {
  const { rows } = await h.como(operador, `select nome, email from sistema_meu_perfil()`);
  assert.deepEqual(rows, [{ nome: 'Dono', email: 'dono@buildchat.com.br' }]);
});

test('renomear muda só a própria conta', async () => {
  await h.como(operador, `select sistema_renomear_me('  Jonatas Ramos ')`);
  const { rows } = await h.servidor(`select usuario_auth_id, nome from sistema_operadores order by nome`);
  assert.deepEqual(rows.map((r) => r.nome), ['Jonatas Ramos', 'Sócio']);
  await assert.rejects(h.como(operador, `select sistema_renomear_me('   ')`), /informe o nome/i);
});

test('admin de clínica não é gestor: nada a ver, nada a renomear', async () => {
  const { rows } = await h.como(A.admin, `select * from sistema_meu_perfil()`);
  assert.equal(rows.length, 0);
  await assert.rejects(h.como(A.admin, `select sistema_renomear_me('Pirata')`), /acesso restrito/i);
});
