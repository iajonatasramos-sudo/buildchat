// Pastas: padrão (do admin, com visibilidade) e pessoais (só de quem criou).
// Mesma regra das mensagens rápidas.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, B, colega, equipe;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  B = await semearEmpresa(h, 'clinica-b');
  await h.servidor(`update empresas set status = 'ativa', plano_slug = 'start' where id = $1`, [A.id]);
  colega = await criarAuthUser(h, 'colega@clinica-a.com');
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, 'Colega', 'colega@clinica-a.com', 'usuario')`,
    [colega, A.id]);
  // Uma equipe só com o colega, para testar visibilidade por equipe.
  await h.servidor(`update empresas set plano_slug = 'pro' where id = $1`, [A.id]);
  const { rows: [e] } = await h.servidor(
    `insert into equipes (empresa_id, nome) values ($1, 'Recepção') returning id`, [A.id]);
  equipe = e.id;
  await h.servidor(`insert into equipe_usuarios (equipe_id, usuario_id) values ($1, $2)`, [equipe, colega]);
  await h.servidor(`update empresas set plano_slug = 'start' where id = $1`, [A.id]);
});

after(async () => h.fechar());

const pessoal = (quem, empresa, nome) =>
  h.como(quem,
    `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem)
     values ($1, 'pessoal', $2, $3, '#888', 0) returning id`, [empresa, quem, nome]);
const padrao = (quem, empresa, nome, extra = '') =>
  h.como(quem,
    `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem ${extra ? ', ' + extra.split('=')[0] : ''})
     values ($1, 'empresa', null, $2, '#888', 0 ${extra ? ', ' + extra.split('=')[1] : ''}) returning id`,
    [empresa, nome]);
const nomesVistos = async (quem) =>
  (await h.como(quem, `select nome from pastas where deleted_at is null order by nome`)).rows.map((r) => r.nome);

describe('pasta pessoal', () => {
  let minha;

  test('o atendente cria a sua, em qualquer plano', async () => {
    const { rows: [p] } = await pessoal(A.usuario, A.id, 'Meus leads');
    minha = p.id;
    assert.ok(minha);
  });

  test('só ele vê — nem o colega, nem o admin', async () => {
    assert.deepEqual(await nomesVistos(A.usuario), ['Meus leads']);
    assert.deepEqual(await nomesVistos(colega), []);
    assert.deepEqual(await nomesVistos(A.admin), []);
  });

  test('o admin não apaga a pasta pessoal de ninguém', async () => {
    const r = await h.como(A.admin, `update pastas set deleted_at = now() where id = $1`, [minha]);
    assert.equal(r.rowCount ?? 0, 0, 'a RLS esconde a linha do admin');
  });

  test('ninguém cria pasta pessoal em nome de outro', async () => {
    await assert.rejects(
      h.como(A.admin,
        `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'pessoal', $2, 'Forjada', '#888', 0)`,
        [A.id, A.usuario]),
      /row-level security/i,
    );
  });

  test('o dono renomeia e apaga a sua', async () => {
    await h.como(A.usuario, `update pastas set nome = 'Leads quentes' where id = $1`, [minha]);
    await h.como(A.usuario, `update pastas set deleted_at = now() where id = $1`, [minha]);
    assert.deepEqual(await nomesVistos(A.usuario), []);
  });
});

describe('pasta padrão (do admin)', () => {
  test('o atendente não cria pasta padrão', async () => {
    await assert.rejects(padrao(A.usuario, A.id, 'Pirata'), /row-level security/i);
  });

  test('o admin cria; por padrão todos veem', async () => {
    await padrao(A.admin, A.id, 'Orçamento enviado');
    assert.deepEqual(await nomesVistos(A.usuario), ['Orçamento enviado']);
    assert.deepEqual(await nomesVistos(colega), ['Orçamento enviado']);
  });

  test('restrita a uma equipe: só quem está nela vê (o admin vê tudo)', async () => {
    await h.como(A.admin,
      `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem, visivel_todos, visivel_equipes)
       values ($1, 'empresa', null, 'Recepção', '#888', 0, false, array[$2]::uuid[])`, [A.id, equipe]);
    assert.ok((await nomesVistos(colega)).includes('Recepção'), 'colega está na equipe');
    assert.ok(!(await nomesVistos(A.usuario)).includes('Recepção'), 'usuário não está');
    assert.ok((await nomesVistos(A.admin)).includes('Recepção'));
  });

  test('restrita a uma pessoa', async () => {
    await h.como(A.admin,
      `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem, visivel_todos, visivel_usuarios)
       values ($1, 'empresa', null, 'Só pro Fulano', '#888', 0, false, array[$2]::uuid[])`, [A.id, A.usuario]);
    assert.ok((await nomesVistos(A.usuario)).includes('Só pro Fulano'));
    assert.ok(!(await nomesVistos(colega)).includes('Só pro Fulano'));
  });

  test('o atendente não edita nem apaga a pasta padrão', async () => {
    const { rows: [p] } = await h.como(A.admin, `select id from pastas where nome = 'Orçamento enviado'`);
    const r = await h.como(A.usuario, `update pastas set nome = 'x' where id = $1`, [p.id]);
    assert.equal(r.rowCount ?? 0, 0);
  });

  test('o admin apaga a padrão', async () => {
    const { rows: [p] } = await h.como(A.admin, `select id from pastas where nome = 'Orçamento enviado'`);
    await h.como(A.admin, `update pastas set deleted_at = now() where id = $1`, [p.id]);
    assert.ok(!(await nomesVistos(A.usuario)).includes('Orçamento enviado'));
  });

  test('qualquer atendente etiqueta conversa numa pasta que vê', async () => {
    const { rows: [p] } = await h.como(A.admin, `select id from pastas where nome = 'Só pro Fulano'`);
    await h.como(A.usuario,
      `insert into pasta_conversas (empresa_id, pasta_id, wa_number, remote_jid, criado_por)
       values ($1, $2, '5511900000000', '5511911111111@c.us', $3)`, [A.id, p.id, A.usuario]);
  });

  test('outra clínica não vê nada disso', async () => {
    assert.deepEqual(await nomesVistos(B.admin), []);
  });
});
