// Ações de pasta na sequência: entrar numa pasta, sair de uma, ou sair de todas.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, semearEmpresa } from './harness.mjs';

let h, A, resposta, pasta;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  const { rows: [p] } = await h.servidor(
    `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'empresa', null, 'Clientes', '#0a0', 0) returning id`, [A.id]);
  pasta = p.id;
  const { rows: [r] } = await h.como(A.usuario,
    `insert into respostas (empresa_id, escopo, owner_id, titulo) values ($1, 'pessoal', $2, 'Fechou negócio') returning id`,
    [A.id, A.usuario]);
  resposta = r.id;
});

after(async () => h.fechar());

const acao = (tipo, texto) =>
  h.como(A.usuario,
    `insert into resposta_acoes (resposta_id, ordem, tipo, texto) values ($1, 0, $2, $3) returning tipo, texto`,
    [resposta, tipo, texto]);

describe('tipos novos', () => {
  test('entrar numa pasta guarda o id dela', async () => {
    const { rows: [a] } = await acao('pasta_add', pasta);
    assert.deepEqual([a.tipo, a.texto], ['pasta_add', pasta]);
  });

  test('sair de uma pasta', async () => {
    const { rows: [a] } = await acao('pasta_del', pasta);
    assert.equal(a.tipo, 'pasta_del');
  });

  test('sair de TODAS as pastas', async () => {
    const { rows: [a] } = await acao('pasta_del', 'todas');
    assert.deepEqual([a.tipo, a.texto], ['pasta_del', 'todas']);
  });

  test('tipo inventado continua recusado', async () => {
    await assert.rejects(acao('teleporte', ''), /resposta_acoes_tipo_check/);
  });
});
