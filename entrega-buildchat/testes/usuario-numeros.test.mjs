// Números de WhatsApp por usuário: o painel do usuário comum filtra por eles.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, B, colega;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  B = await semearEmpresa(h, 'clinica-b');
  // Um segundo atendente na clínica A, para provar que um não vê o número do outro.
  colega = await criarAuthUser(h, 'colega@clinica-a.com');
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, 'Colega', 'colega@clinica-a.com', 'usuario')`,
    [colega, A.id]);
});

after(async () => h.fechar());

describe('registrar_numero', () => {
  test('a extensão registra o número conectado (limpando a formatação)', async () => {
    await h.como(A.usuario, `select registrar_numero('+55 (11) 96478-8124', 'Clínica A - Comercial')`);
    const { rows } = await h.como(A.usuario, `select wa_number, nome_whatsapp from meus_numeros()`);
    assert.deepEqual(rows, [{ wa_number: '5511964788124', nome_whatsapp: 'Clínica A - Comercial' }]);
  });

  test('registrar de novo só atualiza o último uso (não duplica)', async () => {
    await h.como(A.usuario, `select registrar_numero('5511964788124', null)`);
    const { rows } = await h.como(A.usuario, `select count(*)::int as n, max(nome_whatsapp) as nome from usuario_numeros`);
    assert.equal(rows[0].n, 1);
    assert.equal(rows[0].nome, 'Clínica A - Comercial', 'nome não é apagado por um registro sem nome');
  });

  test('recusa número inválido', async () => {
    await assert.rejects(h.como(A.usuario, `select registrar_numero('123', null)`), /inválido/i);
  });
});

describe('quem vê os números', () => {
  test('o colega da mesma clínica NÃO vê o número do outro atendente', async () => {
    const { rows } = await h.como(colega, `select count(*)::int as n from usuario_numeros`);
    assert.equal(rows[0].n, 0);
    const meus = await h.como(colega, `select * from meus_numeros()`);
    assert.equal(meus.rows.length, 0);
  });

  test('o admin da clínica vê os números de toda a equipe', async () => {
    const { rows } = await h.como(A.admin, `select usuario_id, wa_number from usuario_numeros`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].usuario_id, A.usuario);
  });

  test('outra clínica não vê nada', async () => {
    const { rows } = await h.como(B.admin, `select count(*)::int as n from usuario_numeros`);
    assert.equal(rows[0].n, 0);
  });

  test('ninguém escreve direto na tabela — só pela RPC, em nome próprio', async () => {
    await assert.rejects(
      h.como(A.admin,
        `insert into usuario_numeros (usuario_id, empresa_id, wa_number) values ($1, $2, '5511900000000')`,
        [A.usuario, A.id]),
      /permission denied/i,
    );
  });
});
