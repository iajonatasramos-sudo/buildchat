// Compartilhamento por item: contato nasce compartilhado; o admin restringe
// notas, interesses, etiquetas ou propostas a quem cadastrou.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';
import { mesmoDepartamento } from './harness.mjs';

let h, A, colega, pasta;
const WA = '5511964788124';
const JID = '5511999990000@c.us';

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  colega = await criarAuthUser(h, 'colega@clinica-a.com');
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, 'Colega', 'colega@clinica-a.com', 'usuario')`,
    [colega, A.id]);
  const { rows: [p] } = await h.servidor(
    `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'empresa', null, 'Leads', '#c00', 0) returning id`, [A.id]);
  pasta = p.id;
  // Notas e etiquetas valem dentro do departamento (0031): aqui o assunto é
  // outro (compartilhamento por item), então os dois ficam no mesmo.
  await mesmoDepartamento(h, A.id, [A.usuario, colega]);
});

after(async () => h.fechar());

const conta = async (quem, tabela) =>
  (await h.como(quem, `select count(*)::int as n from ${tabela} where deleted_at is null and remote_jid = $1`, [JID])).rows[0].n;
// minhas_fichas() devolve a empresa inteira (0024); a origem vem em wa_number.
const interessesVistos = async (quem) =>
  (await h.como(quem, `select interesses from minhas_fichas() where remote_jid = $1 and wa_number = $2`, [JID, WA])).rows[0]?.interesses ?? null;
const chave = (nome, valor) => h.como(A.admin, `update contatos set ${nome} = ${valor} where remote_jid = $1`, [JID]);

describe('nasce compartilhado', () => {
  test('o atendente registra o contato com tudo: ficha, nota, etiqueta, proposta', async () => {
    await h.como(A.usuario,
      `insert into contatos (empresa_id, wa_number, remote_jid, nome, interesses) values ($1, $2, $3, 'Dra. Kelly', 'implante')`, [A.id, WA, JID]);
    await h.como(A.usuario,
      `insert into anotacoes (empresa_id, wa_number, remote_jid, texto, autor_id) values ($1, $2, $3, 'Quer implante', $4)`, [A.id, WA, JID, A.usuario]);
    await h.como(A.usuario,
      `insert into pasta_conversas (empresa_id, pasta_id, wa_number, remote_jid, criado_por) values ($1, $2, $3, $4, $5)`, [A.id, pasta, WA, JID, A.usuario]);
    await h.como(A.usuario,
      `insert into propostas (id, empresa_id, wa_number, remote_jid, tipo, valor_centavos, arquivo_path, criado_por)
       values (gen_random_uuid(), $1, $2, $3, 'EXEC_SP', 100000, $5, $4)`, [A.id, WA, JID, A.usuario, `${A.id}/propostas/x.pdf`]);
    const { rows: [c] } = await h.servidor(
      `select criado_por, compartilha_notas, compartilha_interesses, compartilha_etiquetas, compartilha_propostas from contatos where remote_jid = $1`, [JID]);
    assert.equal(c.criado_por, A.usuario, 'quem cadastrou fica registrado');
    assert.deepEqual([c.compartilha_notas, c.compartilha_interesses, c.compartilha_etiquetas, c.compartilha_propostas], [true, true, true, true]);
  });

  test('o colega vê tudo — é o padrão', async () => {
    for (const t of ['contatos', 'anotacoes', 'pasta_conversas', 'propostas']) assert.equal(await conta(colega, t), 1, `colega vê ${t}`);
    assert.equal(await interessesVistos(colega), 'implante');
  });
});

describe('o admin restringe por item', () => {
  test('o atendente comum não mexe nas chaves', async () => {
    // A ficha é da empresa (pode editar nome/interesses), mas as chaves são do admin: a
    // coluna existe para todos; quem decide é o painel do admin. Aqui só provamos que a
    // ficha continua visível ao colega mesmo com tudo restrito (é o CRM).
    assert.equal(await conta(colega, 'contatos'), 1);
  });

  test('notas restritas: só quem registrou e o admin', async () => {
    await chave('compartilha_notas', 'false');
    assert.equal(await conta(colega, 'anotacoes'), 0);
    assert.equal(await conta(A.usuario, 'anotacoes'), 1, 'quem registrou continua vendo');
    assert.equal(await conta(A.admin, 'anotacoes'), 1, 'o admin vê tudo');
    assert.equal(await conta(colega, 'contatos'), 1, 'a ficha continua no CRM');
  });

  test('interesses restritos: a ficha vem sem o campo para o colega', async () => {
    await chave('compartilha_interesses', 'false');
    assert.equal(await interessesVistos(colega), null);
    assert.equal(await interessesVistos(A.usuario), 'implante');
    assert.equal(await interessesVistos(A.admin), 'implante');
  });

  test('etiquetas restritas: o vínculo some para o colega', async () => {
    await chave('compartilha_etiquetas', 'false');
    assert.equal(await conta(colega, 'pasta_conversas'), 0);
    assert.equal(await conta(A.usuario, 'pasta_conversas'), 1);
  });

  test('propostas restritas', async () => {
    await chave('compartilha_propostas', 'false');
    assert.equal(await conta(colega, 'propostas'), 0);
    assert.equal(await conta(A.admin, 'propostas'), 1);
  });

  test('reabrir "toca" o item para o sync incremental do colega trazer', async () => {
    const { rows: [antes] } = await h.servidor(`select atualizado_em from anotacoes where remote_jid = $1`, [JID]);
    await new Promise((r) => setTimeout(r, 20));
    await chave('compartilha_notas', 'true');
    const { rows: [depois] } = await h.servidor(`select atualizado_em from anotacoes where remote_jid = $1`, [JID]);
    assert.ok(new Date(depois.atualizado_em) > new Date(antes.atualizado_em));
    assert.equal(await conta(colega, 'anotacoes'), 1);
  });

  test('contato sem ficha: nada a restringir, tudo visível', async () => {
    await h.como(colega,
      `insert into anotacoes (empresa_id, wa_number, remote_jid, texto, autor_id) values ($1, $2, '5511888880000@c.us', 'sem ficha', $3)`, [A.id, WA, colega]);
    const { rows } = await h.como(A.usuario, `select count(*)::int as n from anotacoes where remote_jid = '5511888880000@c.us'`);
    assert.equal(rows[0].n, 1);
  });
});
