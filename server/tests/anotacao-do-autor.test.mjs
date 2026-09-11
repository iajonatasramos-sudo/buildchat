// Anotação: só o autor e o admin editam ou apagam; o colega só lê.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';
import { mesmoDepartamento } from './harness.mjs';

let h, A, colega, notaId;
const WA = '5511964788124';
const JID = '5511999990000@c.us';

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  colega = await criarAuthUser(h, 'colega@clinica-a.com');
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, 'Colega', 'colega@clinica-a.com', 'usuario')`,
    [colega, A.id]);
  // Aqui o assunto é QUEM EDITA; para o colega poder ao menos ler, os dois
  // ficam no mesmo departamento (a leitura é departamental desde a 0031).
  await mesmoDepartamento(h, A.id, [A.usuario, colega]);
});

after(async () => h.fechar());

const texto = async (quem) =>
  (await h.como(quem, `select texto, deleted_at from anotacoes where id = $1`, [notaId])).rows[0];

test('o atendente cria assinando como autor', async () => {
  const { rows: [n] } = await h.como(A.usuario,
    `insert into anotacoes (empresa_id, wa_number, remote_jid, texto, autor_id) values ($1, $2, $3, 'Quer implante', $4) returning id`,
    [A.id, WA, JID, A.usuario]);
  notaId = n.id;
  await assert.rejects(
    h.como(A.usuario,
      `insert into anotacoes (empresa_id, wa_number, remote_jid, texto, autor_id) values ($1, $2, $3, 'em nome de outro', $4)`,
      [A.id, WA, JID, colega]),
    /row-level security/, 'não dá para assinar como outra pessoa');
});

test('o colega lê, mas não edita nem apaga', async () => {
  assert.equal((await texto(colega)).texto, 'Quer implante');
  await h.como(colega, `update anotacoes set texto = 'alterada pelo colega' where id = $1`, [notaId]);
  await h.como(colega, `update anotacoes set deleted_at = now() where id = $1`, [notaId]);
  const n = await texto(A.usuario);
  assert.equal(n.texto, 'Quer implante', 'o update do colega não pegou');
  assert.equal(n.deleted_at, null, 'o "apagar" do colega não pegou');
});

test('o autor edita a própria nota', async () => {
  await h.como(A.usuario, `update anotacoes set texto = 'Quer implante (2 dentes)' where id = $1`, [notaId]);
  assert.equal((await texto(A.usuario)).texto, 'Quer implante (2 dentes)');
});

test('o admin edita e apaga a nota de qualquer um — o autor continua sendo quem escreveu', async () => {
  await h.como(A.admin, `update anotacoes set texto = 'revisada pelo admin' where id = $1`, [notaId]);
  const { rows: [n] } = await h.servidor(`select texto, autor_id from anotacoes where id = $1`, [notaId]);
  assert.deepEqual(n, { texto: 'revisada pelo admin', autor_id: A.usuario });
  await h.como(A.admin, `update anotacoes set deleted_at = now() where id = $1`, [notaId]);
  assert.notEqual((await texto(A.admin)).deleted_at, null);
});
