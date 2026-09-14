// Controle comercial: valor da assinatura, faturas, baixa e métricas de venda.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, B, operador;
const hoje = new Date().toISOString().slice(0, 10);

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  B = await semearEmpresa(h, 'clinica-b');
  operador = await criarAuthUser(h, 'dono@buildchat.com.br');
  await h.servidor(`insert into sistema_operadores (usuario_auth_id, nome) values ($1, 'Dono')`, [operador]);
});

after(async () => h.fechar());

describe('assinatura da clínica', () => {
  test('o gestor define valor, ciclo e próxima cobrança', async () => {
    await h.como(operador,
      `select sistema_definir_comercial($1, 29700, 'mensal', $2::date, 'Fechado com 10% de desconto')`,
      [A.id, hoje]);
    const { rows: [e] } = await h.como(operador,
      `select valor_mensal_centavos, ciclo, observacao from sistema_empresas() where id = $1`, [A.id]);
    assert.equal(e.valor_mensal_centavos, 29700);
    assert.equal(e.ciclo, 'mensal');
    assert.match(e.observacao, /desconto/);
  });

  test('recusa ciclo inválido e valor negativo', async () => {
    await assert.rejects(
      h.como(operador, `select sistema_definir_comercial($1, null, 'semanal', null, null)`, [A.id]),
      /ciclo inválido/i,
    );
    await assert.rejects(
      h.como(operador, `select sistema_definir_comercial($1, -100, null, null, null)`, [A.id]),
      /negativo/i,
    );
  });

  test('admin de clínica não mexe no comercial', async () => {
    await assert.rejects(
      h.como(A.admin, `select sistema_definir_comercial($1, 100, null, null, null)`, [A.id]),
      /acesso restrito/i,
    );
    await assert.rejects(
      h.como(A.admin, `update empresas set valor_mensal_centavos = 1`),
      /permission denied/i,
    );
  });
});

describe('faturas', () => {
  let fatura;

  test('o gestor lança a cobrança do mês', async () => {
    const { rows: [r] } = await h.como(operador,
      `select sistema_lancar_fatura($1, date_trunc('month', now())::date, 29700,
              (current_date + 5), 'Mensalidade') as id`, [A.id]);
    fatura = r.id;
    assert.ok(fatura);

    const lista = await h.como(operador, `select empresa, valor_centavos, pago_em from sistema_faturas($1)`, [A.id]);
    assert.equal(lista.rows.length, 1);
    assert.equal(lista.rows[0].empresa, 'clinica-a');
    assert.equal(lista.rows[0].pago_em, null);
  });

  test('valor zerado é recusado', async () => {
    await assert.rejects(
      h.como(operador, `select sistema_lancar_fatura($1, current_date, 0, current_date, null)`, [A.id]),
      /informe o valor/i,
    );
  });

  test('a clínica vê as próprias faturas, e só as dela', async () => {
    const minhas = await h.como(A.admin, `select count(*)::int as n from faturas`);
    assert.equal(minhas.rows[0].n, 1);
    const outra = await h.como(B.admin, `select count(*)::int as n from faturas`);
    assert.equal(outra.rows[0].n, 0);
  });

  test('a clínica não cria nem quita a própria fatura', async () => {
    await assert.rejects(
      h.como(A.admin,
        `insert into faturas (empresa_id, competencia, valor_centavos, vencimento)
         values ($1, current_date, 100, current_date)`, [A.id]),
      /permission denied|row-level security/i,
    );
    await assert.rejects(
      h.como(A.admin, `update faturas set pago_em = now()`),
      /permission denied|row-level security/i,
    );
  });

  test('dar baixa ativa a assinatura e adia a próxima cobrança', async () => {
    await h.servidor(`update empresas set status = 'inadimplente' where id = $1`, [A.id]);
    await h.como(operador, `select sistema_baixar_fatura($1, 'pix', now())`, [fatura]);

    const { rows: [e] } = await h.como(operador,
      `select status, proxima_cobranca from sistema_empresas() where id = $1`, [A.id]);
    assert.equal(e.status, 'ativa', 'pagamento reativa a assinatura');
    assert.ok(new Date(e.proxima_cobranca) > new Date(), 'a próxima cobrança foi adiada');
  });
});

describe('números de venda', () => {
  test('MRR, recebido e em aberto', async () => {
    // uma segunda cliente, anual, para conferir a diluição no MRR
    await h.como(operador, `select sistema_definir_comercial($1, 24000, 'anual', null, null)`, [B.id]);
    await h.servidor(`update empresas set status = 'ativa' where id = $1`, [B.id]);
    // e uma fatura em aberto, já vencida
    await h.como(operador,
      `select sistema_lancar_fatura($1, current_date, 10000, current_date - 3, 'Atrasada')`, [B.id]);

    const { rows: [r] } = await h.como(operador, `select sistema_vendas() as j`);
    // A: 297,00 mensais + B: 240,00/12 = 20,00
    assert.equal(r.j.mrr_centavos, 29700 + 2000);
    assert.equal(r.j.clientes_pagantes, 2);
    assert.equal(r.j.recebido_mes_centavos, 29700, 'conta o que foi pago no mês');
    assert.equal(r.j.aberto_centavos, 10000);
    assert.equal(r.j.vencidas, 1);
  });

  test('a clínica não acessa os números de venda', async () => {
    await assert.rejects(h.como(A.admin, `select sistema_vendas()`), /acesso restrito/i);
    await assert.rejects(h.como(A.admin, `select * from sistema_faturas(null)`), /acesso restrito/i);
  });
});
