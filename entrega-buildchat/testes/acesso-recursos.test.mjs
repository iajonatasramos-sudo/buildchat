// Quem enxerga cada função da extensão: sem linha, todo mundo vê; com linha,
// vale `visivel_todos` / equipes / pessoas. Só o admin configura.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, colega, equipe;

const definir = (recurso, campos) =>
  h.como(A.admin,
    `insert into recurso_acesso (empresa_id, recurso, visivel_todos, visivel_equipes, visivel_usuarios)
     values ($1, $2, $3, $4, $5)
     on conflict (empresa_id, recurso) do update
       set visivel_todos = excluded.visivel_todos,
           visivel_equipes = excluded.visivel_equipes,
           visivel_usuarios = excluded.visivel_usuarios`,
    [A.id, recurso, campos.todos ?? false, campos.equipes ?? [], campos.usuarios ?? []]);

const config = async (quem) =>
  Object.fromEntries(
    (await h.como(quem, `select recurso, visivel_todos, visivel_equipes, visivel_usuarios from recurso_acesso where deleted_at is null`))
      .rows.map((r) => [r.recurso, r]));

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  await h.servidor(`update empresas set assentos = 10 where id = $1`, [A.id]);
  colega = await criarAuthUser(h, 'recepcao@clinica-a.com');
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, 'Recepção', 'recepcao@clinica-a.com', 'usuario')`,
    [colega, A.id]);
  const { rows: [e] } = await h.servidor(`insert into equipes (empresa_id, nome) values ($1, 'Vendas') returning id`, [A.id]);
  equipe = e.id;
  await h.servidor(`insert into equipe_usuarios (equipe_id, usuario_id) values ($1, $2)`, [equipe, A.usuario]);
});

after(async () => h.fechar());

describe('sem configuração, tudo liberado', () => {
  test('a tabela começa vazia — a extensão mostra tudo', async () => {
    assert.deepEqual(await config(A.usuario), {});
  });
});

describe('o admin restringe', () => {
  test('função só para uma equipe', async () => {
    await definir('automacoes', { equipes: [equipe] });
    const c = await config(A.usuario);
    assert.equal(c.automacoes.visivel_todos, false);
    assert.deepEqual(c.automacoes.visivel_equipes, [equipe]);
  });

  test('função só para uma pessoa', async () => {
    await definir('webhooks', { usuarios: [A.usuario] });
    const c = await config(colega);
    assert.deepEqual(c.webhooks.visivel_usuarios, [A.usuario]);
  });

  test('a configuração é lida por todos — é a extensão que monta a tela', async () => {
    const c = await config(colega);
    assert.ok(c.automacoes && c.webhooks, 'o colega lê a configuração para saber o que mostrar');
  });

  test('voltar a liberar para todos', async () => {
    await definir('automacoes', { todos: true });
    assert.equal((await config(colega)).automacoes.visivel_todos, true);
  });
});

describe('só o admin configura', () => {
  test('o atendente não cria nem altera', async () => {
    await assert.rejects(
      h.como(A.usuario,
        `insert into recurso_acesso (empresa_id, recurso, visivel_todos) values ($1, 'agenda', false)`, [A.id]),
      /row-level security/);
    await h.como(A.usuario, `update recurso_acesso set visivel_todos = false where recurso = 'automacoes'`);
    assert.equal((await config(A.usuario)).automacoes.visivel_todos, true, 'nada mudou');
  });

  test('outra clínica não enxerga nem configura a minha', async () => {
    const B = await semearEmpresa(h, 'clinica-b');
    assert.deepEqual(await config(B.admin), {});
  });
});
