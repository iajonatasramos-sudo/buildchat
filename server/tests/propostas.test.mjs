// Propostas geradas: ficam para a equipe, isoladas por empresa, e o arquivo
// só pode apontar para a pasta da própria empresa no Storage.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, semearEmpresa } from './harness.mjs';

let h, A, B;
const WA = '5511964788124';
const JID = '5511999990000@c.us';

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  B = await semearEmpresa(h, 'clinica-b');
});

after(async () => h.fechar());

const inserir = (quem, empresa, path, extra = {}) =>
  h.como(quem,
    `insert into propostas (id, empresa_id, wa_number, remote_jid, contato_nome, tipo, valor_centavos, arquivo_path, criado_por)
     values ($1, $2, $3, $4, 'Dra. Kelly', 'EXEC_SP', 1200000, $5, $6) returning id`,
    [extra.id ?? crypto.randomUUID(), empresa, WA, JID, path, quem]);

describe('propostas do contato', () => {
  let id;

  test('o atendente registra a proposta gerada', async () => {
    const { rows: [r] } = await inserir(A.usuario, A.id, `${A.id}/propostas/p1.pdf`);
    id = r.id;
    assert.ok(id);
  });

  test('o colega que atende o mesmo número vê e reenvia', async () => {
    const { rows } = await h.como(A.admin,
      `select tipo, valor_centavos, arquivo_path, enviada_em from propostas where remote_jid = $1`, [JID]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].valor_centavos, 1200000);
    assert.equal(rows[0].enviada_em, null);

    const upd = await h.como(A.admin,
      `update propostas set enviada_em = now() where id = $1 returning enviada_em`, [id]);
    assert.ok(upd.rows[0].enviada_em, 'marcou como enviada');
  });

  test('empresa B não vê nem altera as propostas de A', async () => {
    const r = await h.como(B.admin, `select count(*)::int as n from propostas`);
    assert.equal(r.rows[0].n, 0);
    const upd = await h.como(B.admin, `update propostas set valor_centavos = 1 where id = $1`, [id]);
    assert.equal(upd.rowCount ?? 0, 0, 'a RLS esconde a linha');
  });

  test('B não registra proposta em nome de A', async () => {
    await assert.rejects(
      inserir(B.admin, A.id, `${A.id}/propostas/pirata.pdf`),
      /row-level security/i,
    );
  });

  test('o arquivo tem de estar na pasta da própria empresa', async () => {
    await assert.rejects(
      inserir(A.admin, A.id, `${B.id}/propostas/alheia.pdf`),
      /row-level security/i,
    );
    await assert.rejects(
      inserir(A.admin, A.id, `propostas/sem-pasta.pdf`),
      /row-level security/i,
    );
  });

  test('a extensão manda o próprio id (offline-first) e ele é respeitado', async () => {
    const meu = crypto.randomUUID();
    const { rows: [r] } = await inserir(A.usuario, A.id, `${A.id}/propostas/${meu}.pdf`, { id: meu });
    assert.equal(r.id, meu);
  });

  test('exclusão é lógica e continua visível para a sincronização', async () => {
    await h.como(A.usuario, `update propostas set deleted_at = now() where id = $1`, [id]);
    const { rows } = await h.como(A.admin,
      `select deleted_at from propostas where id = $1`, [id]);
    assert.ok(rows[0].deleted_at);
  });
});
