// Painel do gestor do sistema: quem pode ver, o que vê e o que pode mudar.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, B, operador;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  B = await semearEmpresa(h, 'clinica-b');

  // O gestor do sistema não pertence a nenhuma empresa.
  operador = await criarAuthUser(h, 'dono@buildchat.com.br');
  await h.servidor(
    `insert into sistema_operadores (usuario_auth_id, nome) values ($1, 'Dono')`, [operador]);

  await h.como(A.admin, `insert into respostas (empresa_id, titulo) values ($1, 'Msg A')`, [A.id]);
  await h.como(A.admin,
    `insert into contatos (empresa_id, wa_number, remote_jid, nome)
     values ($1, '5511900000000', '5511911111111@c.us', 'Paciente A')`, [A.id]);
});

after(async () => h.fechar());

describe('acesso ao painel do sistema', () => {
  test('o gestor enxerga todas as empresas', async () => {
    const r = await h.como(operador, `select nome, assentos, mensagens, contatos from sistema_empresas()`);
    const nomes = r.rows.map((x) => x.nome).sort();
    assert.deepEqual(nomes, ['clinica-a', 'clinica-b']);
    const a = r.rows.find((x) => x.nome === 'clinica-a');
    assert.equal(Number(a.mensagens), 1, 'conta as mensagens da empresa');
    assert.equal(Number(a.contatos), 1, 'conta os contatos da empresa');
  });

  test('o resumo traz os números do negócio', async () => {
    const { rows: [r] } = await h.como(operador, `select sistema_resumo() as j`);
    assert.equal(r.j.empresas, 2);
    assert.equal(r.j.trial, 2);
    assert.equal(typeof r.j.usuarios_ativos, 'number');
  });

  test('admin de clínica NÃO acessa o painel do sistema', async () => {
    await assert.rejects(
      h.como(A.admin, `select * from sistema_empresas()`),
      /acesso restrito/i,
    );
    await assert.rejects(h.como(A.admin, `select sistema_resumo()`), /acesso restrito/i);
    const { rows: [r] } = await h.como(A.admin, `select sou_operador() as v`);
    assert.equal(r.v, false);
  });

  test('a tabela de operadores não é legível pela API', async () => {
    await assert.rejects(
      h.como(A.admin, `select * from sistema_operadores`),
      /permission denied/i,
    );
  });
});

describe('ações do gestor', () => {
  test('ativa a assinatura e ajusta os assentos', async () => {
    await h.como(operador,
      `select sistema_atualizar_empresa($1, 'ativa', 'profissional', 10, null)`, [A.id]);
    const r = await h.como(operador, `select status, plano, assentos from sistema_empresas() where id = $1`, [A.id]);
    assert.equal(r.rows[0].status, 'ativa');
    assert.equal(r.rows[0].plano, 'profissional');
    assert.equal(r.rows[0].assentos, 10);
  });

  test('recusa status inválido e assento zero', async () => {
    await assert.rejects(
      h.como(operador, `select sistema_atualizar_empresa($1, 'grátis', null, null, null)`, [A.id]),
      /status inválido/i,
    );
    await assert.rejects(
      h.como(operador, `select sistema_atualizar_empresa($1, null, null, 0, null)`, [A.id]),
      /pelo menos um assento/i,
    );
  });

  test('admin de clínica não muda plano nem assentos', async () => {
    await assert.rejects(
      h.como(A.admin, `select sistema_atualizar_empresa($1, 'ativa', null, 99, null)`, [A.id]),
      /acesso restrito/i,
    );
    // Nem por escrita direta: dar assentos a si mesmo seria burlar a cobrança.
    await assert.rejects(
      h.como(A.admin, `update empresas set assentos = 99`),
      /permission denied/i,
    );
    await assert.rejects(
      h.como(A.admin, `update empresas set status = 'ativa'`),
      /permission denied/i,
    );
    // Mas segue podendo corrigir o nome da própria clínica.
    const nome = await h.como(A.admin, `update empresas set nome = 'Clínica A' returning id`);
    assert.equal(nome.rows.length, 1);
  });

  test('o gestor não lê o conteúdo das clínicas', async () => {
    const msgs = await h.como(operador, `select count(*)::int as n from respostas`);
    const cts = await h.como(operador, `select count(*)::int as n from contatos`);
    assert.equal(msgs.rows[0].n, 0, 'mensagens das clínicas permanecem fechadas');
    assert.equal(cts.rows[0].n, 0, 'contatos das clínicas permanecem fechados');
  });
});
