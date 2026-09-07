// Categoria pessoal usada por mensagem da empresa vira categoria da empresa —
// senão a equipe recebe a mensagem sem a categoria e ela some da lista.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, semearEmpresa } from './harness.mjs';

let h, A, categoria;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  await h.servidor(`update empresas set status = 'ativa', plano_slug = 'pro' where id = $1`, [A.id]);
});

after(async () => h.fechar());

test('o admin cria uma categoria pessoal (como a extensão faz)', async () => {
  const { rows: [c] } = await h.como(A.admin,
    `insert into categorias (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'pessoal', $2, 'Links', '#08f', 0) returning id`,
    [A.id, A.admin]);
  categoria = c.id;
  const { rows } = await h.como(A.usuario, `select count(*)::int as n from categorias where id = $1`, [categoria]);
  assert.equal(rows[0].n, 0, 'o atendente não vê a categoria pessoal do admin');
});

test('publicar uma mensagem da empresa nessa categoria a promove para a empresa', async () => {
  await h.como(A.admin,
    `insert into respostas (empresa_id, escopo, owner_id, categoria_id, titulo, visivel_todos)
     values ($1, 'empresa', null, $2, 'Link do formulário', true)`, [A.id, categoria]);
  const { rows: [c] } = await h.servidor(`select escopo, owner_id from categorias where id = $1`, [categoria]);
  assert.equal(c.escopo, 'empresa');
  assert.equal(c.owner_id, null);
  const vista = await h.como(A.usuario, `select nome from categorias where id = $1`, [categoria]);
  assert.equal(vista.rows[0]?.nome, 'Links', 'agora o atendente vê a categoria junto com a mensagem');
});

test('mensagem pessoal não mexe na categoria de ninguém', async () => {
  const { rows: [c] } = await h.como(A.usuario,
    `insert into categorias (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'pessoal', $2, 'Minhas', '#0f8', 0) returning id`,
    [A.id, A.usuario]);
  await h.como(A.usuario,
    `insert into respostas (empresa_id, escopo, owner_id, categoria_id, titulo) values ($1, 'pessoal', $2, $3, 'Só minha')`,
    [A.id, A.usuario, c.id]);
  const { rows: [depois] } = await h.servidor(`select escopo from categorias where id = $1`, [c.id]);
  assert.equal(depois.escopo, 'pessoal');
});
