// O mesmo contato atendido por dois WhatsApps da equipe: as informações são
// do contato na empresa — renomear, interesses, chaves e remoção de etiqueta
// se propagam entre as linhas "irmãs"; a extensão baixa a empresa inteira.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';
import { mesmoDepartamento } from './harness.mjs';

let h, A, colega, pasta;
const JID = '214220167757933@lid';
const WA_JONATAS = '5511964788124';
const WA_PATRICIA = '5511949346997';

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  colega = await criarAuthUser(h, 'colega@clinica-a.com');
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, 'Colega', 'colega@clinica-a.com', 'usuario')`,
    [colega, A.id]);
  const { rows: [p] } = await h.servidor(
    `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'empresa', null, 'Analise de Ponto', '#639', 0) returning id`, [A.id]);
  pasta = p.id;
  // O assunto aqui é o mesmo contato em DOIS números; o departamento é outra
  // dimensão (0031), então os dois atendentes ficam juntos.
  await mesmoDepartamento(h, A.id, [A.usuario, colega]);
});

after(async () => h.fechar());

describe('duas origens, um contato', () => {
  test('cada número registra a própria linha do contato', async () => {
    await h.como(A.usuario, `insert into contatos (empresa_id, wa_number, remote_jid, nome_whatsapp) values ($1, $2, $3, '+55 21 97181-8993')`, [A.id, WA_JONATAS, JID]);
    await h.como(colega, `insert into contatos (empresa_id, wa_number, remote_jid, nome_whatsapp) values ($1, $2, $3, '+55 21 97181-8993')`, [A.id, WA_PATRICIA, JID]);
    const { rows } = await h.servidor(`select count(*)::int as n from contatos where remote_jid = $1`, [JID]);
    assert.equal(rows[0].n, 2);
  });

  test('a nota de um número aparece para o outro (a extensão baixa a empresa inteira)', async () => {
    await h.como(A.usuario,
      `insert into anotacoes (empresa_id, wa_number, remote_jid, texto, autor_id) values ($1, $2, $3, 'Doutora busca outra sala', $4)`, [A.id, WA_JONATAS, JID, A.usuario]);
    const { rows } = await h.como(colega, `select texto from anotacoes where remote_jid = $1`, [JID]);
    assert.deepEqual(rows.map((r) => r.texto), ['Doutora busca outra sala']);
  });

  test('renomear e anotar interesses num número chega ao outro', async () => {
    await h.como(A.usuario, `update contatos set nome = 'Dra. Giovana', interesses = 'sala 43m²' where wa_number = $1 and remote_jid = $2`, [WA_JONATAS, JID]);
    const { rows } = await h.como(colega, `select nome, interesses from minhas_fichas() where remote_jid = $1 and wa_number = $2`, [JID, WA_PATRICIA]);
    assert.deepEqual(rows[0], { nome: 'Dra. Giovana', interesses: 'sala 43m²' });
  });

  test('a etiqueta colocada por um número vale para o outro; removida, some dos dois', async () => {
    await h.como(A.usuario,
      `insert into pasta_conversas (empresa_id, pasta_id, wa_number, remote_jid, criado_por) values ($1, $2, $3, $4, $5)`, [A.id, pasta, WA_JONATAS, JID, A.usuario]);
    let { rows } = await h.como(colega, `select wa_number from pasta_conversas where remote_jid = $1 and deleted_at is null`, [JID]);
    assert.equal(rows.length, 1, 'o colega recebe o vínculo da outra origem');

    // O colega também etiqueta pelo número dele; depois o Jonatas remove pelo dele.
    await h.como(colega,
      `insert into pasta_conversas (empresa_id, pasta_id, wa_number, remote_jid, criado_por) values ($1, $2, $3, $4, $5)`, [A.id, pasta, WA_PATRICIA, JID, colega]);
    await h.como(A.usuario, `update pasta_conversas set deleted_at = now() where wa_number = $1 and remote_jid = $2`, [WA_JONATAS, JID]);
    ({ rows } = await h.servidor(`select wa_number, deleted_at is not null as removida from pasta_conversas where remote_jid = $1 order by wa_number`, [JID]));
    assert.deepEqual(rows.map((r) => r.removida), [true, true], 'a remoção se propaga para a linha irmã');
  });

  test('chave de compartilhamento desligada pelo admin vale para todas as origens', async () => {
    await h.como(A.admin, `update contatos set compartilha_notas = false where wa_number = $1 and remote_jid = $2`, [WA_JONATAS, JID]);
    const { rows } = await h.servidor(`select compartilha_notas from contatos where remote_jid = $1`, [JID]);
    assert.deepEqual(rows.map((r) => r.compartilha_notas), [false, false]);
    const vistas = await h.como(colega, `select count(*)::int as n from anotacoes where remote_jid = $1`, [JID]);
    assert.equal(vistas.rows[0].n, 0, 'o colega deixou de ver a nota, venha ela de que número vier');
  });
});
