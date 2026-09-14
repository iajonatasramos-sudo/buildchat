// Anotações e etiquetas valem dentro do departamento: vejo a minha, a de quem
// divide departamento comigo, e o admin vê tudo. Linha antiga (sem autor)
// continua valendo para a empresa.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, doDep, deOutroDep, pasta, dep;
const WA = '5511964788124';
const JID = '5511999990000@c.us';

const criarUsuario = async (email, nome) => {
  const id = await criarAuthUser(h, email);
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, $3, $4, 'usuario')`,
    [id, A.id, nome, email]);
  return id;
};

const anotar = (quem, texto) =>
  h.como(quem,
    `insert into anotacoes (empresa_id, wa_number, remote_jid, texto, autor_id) values ($1, $2, $3, $4, $5)`,
    [A.id, WA, JID, texto, quem]);

const notasDe = async (quem) =>
  (await h.como(quem, `select texto from anotacoes where remote_jid = $1 order by texto`, [JID])).rows.map((r) => r.texto);

const etiquetasDe = async (quem) =>
  (await h.como(quem, `select count(*)::int as n from pasta_conversas where remote_jid = $1 and deleted_at is null`, [JID])).rows[0].n;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  await h.servidor(`update empresas set assentos = 10 where id = $1`, [A.id]);
  doDep = await criarUsuario('colega@clinica-a.com', 'Colega do departamento');
  deOutroDep = await criarUsuario('recepcao@clinica-a.com', 'Recepção');
  const { rows: [d] } = await h.servidor(`insert into equipes (empresa_id, nome) values ($1, 'Projetos') returning id`, [A.id]);
  dep = d.id;
  for (const u of [A.usuario, doDep]) {
    await h.servidor(`insert into equipe_usuarios (equipe_id, usuario_id) values ($1, $2)`, [dep, u]);
  }
  const { rows: [p] } = await h.servidor(
    `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'empresa', null, 'Leads', '#c00', 0) returning id`, [A.id]);
  pasta = p.id;
  await h.como(A.usuario, `insert into contatos (empresa_id, wa_number, remote_jid, nome) values ($1, $2, $3, 'Dra. Ana')`, [A.id, WA, JID]);
});

after(async () => h.fechar());

describe('anotações', () => {
  before(async () => {
    await anotar(A.usuario, 'A - do atendente');
    await anotar(deOutroDep, 'B - da recepção');
    // Linha antiga, de antes do autor existir.
    await h.servidor(
      `insert into anotacoes (empresa_id, wa_number, remote_jid, texto) values ($1, $2, $3, 'C - legado sem autor')`,
      [A.id, WA, JID]);
  });

  test('vejo a minha e a do meu departamento', async () => {
    assert.deepEqual(await notasDe(doDep), ['A - do atendente', 'C - legado sem autor']);
  });

  test('NÃO vejo a de outro departamento', async () => {
    assert.ok(!(await notasDe(A.usuario)).includes('B - da recepção'));
  });

  test('quem escreveu sempre vê a própria', async () => {
    assert.ok((await notasDe(deOutroDep)).includes('B - da recepção'));
  });

  test('o admin vê todas', async () => {
    assert.equal((await notasDe(A.admin)).length, 3);
  });

  test('a nota antiga, sem autor, continua valendo para a empresa', async () => {
    for (const quem of [A.usuario, doDep, deOutroDep]) {
      assert.ok((await notasDe(quem)).includes('C - legado sem autor'), 'todos veem o legado');
    }
  });
});

describe('etiquetas do contato', () => {
  before(async () => {
    await h.como(A.usuario,
      `insert into pasta_conversas (empresa_id, pasta_id, wa_number, remote_jid, criado_por) values ($1, $2, $3, $4, $5)`,
      [A.id, pasta, WA, JID, A.usuario]);
  });

  test('o colega do departamento enxerga a etiqueta', async () => {
    assert.equal(await etiquetasDe(doDep), 1);
  });

  test('quem é de outro departamento não enxerga', async () => {
    assert.equal(await etiquetasDe(deOutroDep), 0);
  });

  test('mas continua podendo etiquetar por conta própria', async () => {
    await h.como(deOutroDep,
      `insert into pasta_conversas (empresa_id, pasta_id, wa_number, remote_jid, criado_por) values ($1, $2, $3, $4, $5)`,
      [A.id, pasta, '5511949346997', JID, deOutroDep]);
    assert.equal(await etiquetasDe(deOutroDep), 1, 'vê a própria');
    assert.equal(await etiquetasDe(A.admin), 2, 'o admin vê as duas');
  });
});
