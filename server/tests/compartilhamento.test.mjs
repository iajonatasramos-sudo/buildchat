// Compartilhamento por contato: ficha, anotações e propostas nascem do autor;
// o admin libera para a equipe; etiquetas são sempre da empresa.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, colega;
const WA = '5511964788124';
const JID = '5511999990000@c.us';

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  colega = await criarAuthUser(h, 'colega@clinica-a.com');
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, 'Colega', 'colega@clinica-a.com', 'usuario')`,
    [colega, A.id]);
});

after(async () => h.fechar());

const conta = async (quem, tabela) =>
  (await h.como(quem, `select count(*)::int as n from ${tabela} where deleted_at is null and remote_jid = $1`, [JID])).rows[0].n;

describe('privado por padrão', () => {
  test('o atendente registra ficha, anotação e proposta do contato', async () => {
    await h.como(A.usuario,
      `insert into contatos (empresa_id, wa_number, remote_jid, nome, interesses) values ($1, $2, $3, 'Dra. Kelly', 'implante')`, [A.id, WA, JID]);
    await h.como(A.usuario,
      `insert into anotacoes (empresa_id, wa_number, remote_jid, texto, autor_id) values ($1, $2, $3, 'Quer implante', $4)`, [A.id, WA, JID, A.usuario]);
    await h.como(A.usuario,
      `insert into propostas (id, empresa_id, wa_number, remote_jid, tipo, valor_centavos, arquivo_path, criado_por)
       values (gen_random_uuid(), $1, $2, $3, 'EXEC_SP', 100000, $5, $4)`, [A.id, WA, JID, A.usuario, `${A.id}/propostas/x.pdf`]);
    const { rows: [c] } = await h.servidor(`select criado_por, compartilhado from contatos where remote_jid = $1`, [JID]);
    assert.equal(c.criado_por, A.usuario, 'o trigger marca o dono');
    assert.equal(c.compartilhado, false);
  });

  test('o dono vê tudo; o colega não vê nada; o admin vê tudo', async () => {
    for (const t of ['contatos', 'anotacoes', 'propostas']) {
      assert.equal(await conta(A.usuario, t), 1, `dono vê ${t}`);
      assert.equal(await conta(colega, t), 0, `colega não vê ${t}`);
      assert.equal(await conta(A.admin, t), 1, `admin vê ${t}`);
    }
  });

  test('a etiqueta continua compartilhada com todos', async () => {
    const { rows: [p] } = await h.servidor(
      `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'empresa', null, 'Leads', '#c00', 0) returning id`, [A.id]);
    await h.como(A.usuario,
      `insert into pasta_conversas (empresa_id, pasta_id, wa_number, remote_jid, criado_por) values ($1, $2, $3, $4, $5)`, [A.id, p.id, WA, JID, A.usuario]);
    const { rows } = await h.como(colega, `select count(*)::int as n from pasta_conversas where remote_jid = $1`, [JID]);
    assert.equal(rows[0].n, 1);
  });
});

describe('o admin liga o compartilhamento', () => {
  test('o atendente comum não consegue ligar sozinho', async () => {
    const r = await h.como(colega, `update contatos set compartilhado = true where remote_jid = $1`, [JID]);
    assert.equal(r.rowCount ?? 0, 0, 'a RLS nem devolve a linha ao colega');
  });

  test('ligado pelo admin: a equipe passa a ver ficha, anotações e propostas', async () => {
    const { rows: [antes] } = await h.servidor(`select atualizado_em from anotacoes where remote_jid = $1`, [JID]);
    await new Promise((r) => setTimeout(r, 20));
    const upd = await h.como(A.admin, `update contatos set compartilhado = true where remote_jid = $1 returning id`, [JID]);
    assert.equal(upd.rows.length, 1);
    for (const t of ['contatos', 'anotacoes', 'propostas']) assert.equal(await conta(colega, t), 1, `colega vê ${t}`);
    const { rows: [depois] } = await h.servidor(`select atualizado_em from anotacoes where remote_jid = $1`, [JID]);
    assert.ok(new Date(depois.atualizado_em) > new Date(antes.atualizado_em), 'a anotação foi "tocada" para o sync incremental do colega trazer');
  });

  test('desligado: some de novo para o colega', async () => {
    await h.como(A.admin, `update contatos set compartilhado = false where remote_jid = $1`, [JID]);
    for (const t of ['contatos', 'anotacoes', 'propostas']) assert.equal(await conta(colega, t), 0);
  });

  test('anotação de contato SEM ficha continua visível (não há o que bloquear)', async () => {
    await h.como(colega,
      `insert into anotacoes (empresa_id, wa_number, remote_jid, texto, autor_id) values ($1, $2, '5511888880000@c.us', 'sem ficha', $3)`, [A.id, WA, colega]);
    const { rows } = await h.como(A.usuario, `select count(*)::int as n from anotacoes where remote_jid = '5511888880000@c.us'`);
    assert.equal(rows[0].n, 1);
  });
});
