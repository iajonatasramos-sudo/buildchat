// Níveis Start → Pro → Master: o que cada um libera, fiscalizado no banco.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, S, P, operador;

/** Coloca a empresa num plano, já como assinatura ativa. */
async function definirPlano(empresaId, slug) {
  await h.como(operador, `select sistema_definir_plano($1, $2, true)`, [empresaId, slug]);
  await h.servidor(`update empresas set status = 'ativa' where id = $1`, [empresaId]);
}

before(async () => {
  h = await criarBanco();
  S = await semearEmpresa(h, 'clinica-start');
  P = await semearEmpresa(h, 'clinica-pro');
  operador = await criarAuthUser(h, 'dono@buildchat.com.br');
  await h.servidor(`insert into sistema_operadores (usuario_auth_id, nome) values ($1, 'Dono')`, [operador]);

  await definirPlano(S.id, 'start');
  await definirPlano(P.id, 'pro');
});

after(async () => h.fechar());

describe('catálogo', () => {
  test('os três níveis existem, em ordem e com preço', async () => {
    const r = await h.como(S.admin, `select slug, nome, assentos_inclusos from planos order by ordem`);
    assert.deepEqual(r.rows.map((p) => p.slug), ['start', 'pro', 'master']);
    assert.deepEqual(r.rows.map((p) => p.nome), ['Start', 'Pro', 'Master']);
    assert.ok(r.rows[0].assentos_inclusos < r.rows[2].assentos_inclusos);
  });

  test('mudar de plano ajusta os assentos', async () => {
    await h.como(operador, `select sistema_definir_plano($1, 'master', true)`, [P.id]);
    const { rows: [e] } = await h.servidor(`select plano_slug, assentos from empresas where id = $1`, [P.id]);
    assert.equal(e.plano_slug, 'master');
    assert.equal(e.assentos, 15);
    await definirPlano(P.id, 'pro'); // volta para os testes seguintes
  });

  test('plano inexistente é recusado, e a clínica não muda o próprio', async () => {
    await assert.rejects(
      h.como(operador, `select sistema_definir_plano($1, 'premium', true)`, [S.id]),
      /plano inexistente/i,
    );
    await assert.rejects(
      h.como(P.admin, `select sistema_definir_plano($1, 'master', true)`, [P.id]),
      /acesso restrito/i,
    );
  });
});

describe('Start: o essencial', () => {
  test('não cria equipes', async () => {
    await assert.rejects(
      h.como(S.admin, `insert into equipes (empresa_id, nome) values ($1, 'Vendas')`, [S.id]),
      /row-level security/i,
    );
  });

  test('não publica mensagem para a empresa', async () => {
    await assert.rejects(
      h.como(S.admin, `insert into respostas (empresa_id, titulo) values ($1, 'Padrão')`, [S.id]),
      /row-level security/i,
    );
  });

  test('mas cria as mensagens pessoais normalmente', async () => {
    await h.como(S.usuario,
      `insert into respostas (empresa_id, titulo, escopo, owner_id)
       values ($1, 'Minha', 'pessoal', $2)`, [S.id, S.usuario]);
    const r = await h.como(S.usuario, `select count(*)::int as n from respostas`);
    assert.equal(r.rows[0].n, 1);
  });

  test('respeita o teto de mensagens do plano', async () => {
    const { rows: [pl] } = await h.servidor(`select max_mensagens from planos where slug = 'start'`);
    // completa até o teto
    for (let i = 1; i < pl.max_mensagens; i++) {
      await h.como(S.usuario,
        `insert into respostas (empresa_id, titulo, escopo, owner_id)
         values ($1, $2, 'pessoal', $3)`, [S.id, `Msg ${i}`, S.usuario]);
    }
    await assert.rejects(
      h.como(S.usuario,
        `insert into respostas (empresa_id, titulo, escopo, owner_id)
         values ($1, 'Passou do teto', 'pessoal', $2)`, [S.id, S.usuario]),
      /permite \d+ mensagens/i,
    );
  });

  test('meu_plano informa o consumo para a interface', async () => {
    const { rows: [r] } = await h.como(S.admin, `select meu_plano() as j`);
    assert.equal(r.j.slug, 'start');
    assert.equal(r.j.permite_equipes, false);
    assert.equal(r.j.mensagens_usadas, r.j.max_mensagens);
  });
});

describe('Pro: equipe e acervo da empresa', () => {
  test('cria equipes e publica mensagens da empresa', async () => {
    await h.como(P.admin, `insert into equipes (empresa_id, nome) values ($1, 'Recepção')`, [P.id]);
    await h.como(P.admin,
      `insert into respostas (empresa_id, titulo, visivel_todos) values ($1, 'Padrão da casa', true)`, [P.id]);
    const eq = await h.como(P.admin, `select count(*)::int as n from equipes`);
    const ms = await h.como(P.admin, `select count(*)::int as n from respostas`);
    assert.equal(eq.rows[0].n, 1);
    assert.equal(ms.rows[0].n, 1);
  });

  test('teto maior que o do Start', async () => {
    const { rows: [r] } = await h.como(P.admin, `select meu_plano() as j`);
    assert.equal(r.j.slug, 'pro');
    assert.ok(r.j.max_mensagens > 30);
    assert.equal(r.j.permite_exportar, true);
  });
});

describe('teste grátis e inadimplência', () => {
  test('em teste grátis a clínica experimenta o Pro', async () => {
    const T = await semearEmpresa(h, 'clinica-trial');
    await h.servidor(
      `update empresas set status = 'trial', trial_ate = now() + interval '10 days' where id = $1`, [T.id]);
    const { rows: [r] } = await h.como(T.admin, `select meu_plano() as j`);
    assert.equal(r.j.slug, 'pro', 'o trial mostra o produto completo');
    await h.como(T.admin, `insert into equipes (empresa_id, nome) values ($1, 'Time')`, [T.id]);
  });

  test('assinatura vencida cai para o Start', async () => {
    await h.servidor(`update empresas set status = 'inadimplente' where id = $1`, [P.id]);
    const { rows: [r] } = await h.como(P.admin, `select meu_plano() as j`);
    assert.equal(r.j.slug, 'start');
    await assert.rejects(
      h.como(P.admin, `insert into equipes (empresa_id, nome) values ($1, 'Nova')`, [P.id]),
      /row-level security/i,
    );
    // o que já existe continua lá — não se apaga dado de cliente
    const eq = await h.como(P.admin, `select count(*)::int as n from equipes`);
    assert.equal(eq.rows[0].n, 1);
  });
});
