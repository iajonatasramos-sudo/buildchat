// Etiquetas são da equipe: qualquer usuário ativo cria e edita, em qualquer plano.
// (Regressão do bug que derrubava a sincronização inteira do atendente comum.)

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, semearEmpresa } from './harness.mjs';

let h, A, B;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');   // fica no Start (padrão)
  B = await semearEmpresa(h, 'clinica-b');
  await h.servidor(`update empresas set status = 'ativa', plano_slug = 'start' where id = $1`, [A.id]);
});

after(async () => h.fechar());

const criarPasta = (quem, empresa, nome) =>
  h.como(quem,
    `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem)
     values ($1, 'empresa', null, $2, '#888', 0) returning id`, [empresa, nome]);

describe('quem pode manter as etiquetas', () => {
  test('o atendente comum cria etiqueta da empresa', async () => {
    const { rows: [p] } = await criarPasta(A.usuario, A.id, 'Lead frio');
    assert.ok(p.id);
  });

  test('o Start não trava etiqueta — o limite é de mensagens, não de pastas', async () => {
    const { rows: [p] } = await criarPasta(A.admin, A.id, 'Orçamento enviado');
    assert.ok(p.id);
    // A mesma clínica continua sem publicar mensagem da empresa (isso é do plano).
    await assert.rejects(
      h.como(A.admin,
        `insert into respostas (empresa_id, escopo, owner_id, titulo)
         values ($1, 'empresa', null, 'Da empresa')`, [A.id]),
      /row-level security/i,
    );
  });

  test('o atendente renomeia e arquiva a etiqueta da equipe', async () => {
    const { rows: [p] } = await criarPasta(A.admin, A.id, 'Para renomear');
    await h.como(A.usuario, `update pastas set nome = 'Renomeada' where id = $1`, [p.id]);
    await h.como(A.usuario, `update pastas set deleted_at = now() where id = $1`, [p.id]);
    const { rows: [depois] } = await h.servidor(
      `select nome, deleted_at from pastas where id = $1`, [p.id]);
    assert.equal(depois.nome, 'Renomeada');
    assert.ok(depois.deleted_at);
  });

  test('não alcança a etiqueta de outra clínica', async () => {
    const { rows: [p] } = await criarPasta(B.admin, B.id, 'Da clínica B');
    const r = await h.como(A.usuario, `update pastas set nome = 'invadida' where id = $1`, [p.id]);
    assert.equal(r.rowCount ?? r.affectedRows ?? 0, 0, 'a RLS esconde a linha');
    await assert.rejects(criarPasta(A.usuario, B.id, 'Intrusa'), /row-level security/i);
  });

  test('usuário desativado não mexe em nada', async () => {
    await h.servidor(`update usuarios set ativo = false where id = $1`, [A.usuario]);
    await assert.rejects(criarPasta(A.usuario, A.id, 'Fantasma'), /row-level security/i);
    await h.servidor(`update usuarios set ativo = true where id = $1`, [A.usuario]);
  });
});
