// Cadastro de clínica pelo gestor: teste grátis, plano e tipo de assinatura.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, operador, alheia;

before(async () => {
  h = await criarBanco();
  operador = await criarAuthUser(h, 'dono@buildchat.com.br');
  await h.servidor(`insert into sistema_operadores (usuario_auth_id, nome) values ($1, 'Dono')`, [operador]);
  alheia = await semearEmpresa(h, 'clinica-existente');
});

after(async () => h.fechar());

/** Cria a conta no "Auth" e pede a empresa ao gestor. */
async function criar(nome, email, opcoes = {}) {
  const conta = await criarAuthUser(h, email);
  const { rows: [r] } = await h.como(operador,
    `select sistema_criar_empresa($1, $2, $3, $4, $5, $6, $7, $8, $9) as id`,
    [nome, conta, `Admin ${nome}`, email,
     opcoes.plano ?? 'start', opcoes.status ?? 'trial', opcoes.trialDias ?? 14,
     opcoes.ciclo ?? 'mensal', opcoes.valor ?? null]);
  return { empresa: r.id, conta };
}

describe('criar clínica', () => {
  test('em teste grátis, com prazo e plano do trial', async () => {
    const { empresa, conta } = await criar('Sorriso', 'admin@sorriso.com', { trialDias: 21 });

    const { rows: [e] } = await h.como(operador,
      `select nome, status, plano, assentos, admin_email, trial_ate, proxima_cobranca
         from sistema_empresas() where id = $1`, [empresa]);
    assert.equal(e.nome, 'Sorriso');
    assert.equal(e.status, 'trial');
    assert.equal(e.plano, 'Start');
    assert.equal(e.assentos, 2);                  // assentos inclusos do Start
    assert.equal(e.admin_email, 'admin@sorriso.com');
    assert.equal(e.proxima_cobranca, null);       // trial não cobra
    const dias = (new Date(e.trial_ate) - Date.now()) / 86400000;
    assert.ok(dias > 20 && dias < 22, `trial de ${dias} dias`);

    // O admin já entra na clínica, com preferências criadas.
    const { rows: [u] } = await h.servidor(
      `select papel, empresa_id from usuarios where id = $1`, [conta]);
    assert.equal(u.papel, 'admin');
    assert.equal(u.empresa_id, empresa);
    const { rows: cfg } = await h.servidor(
      `select 1 from config_usuario where usuario_id = $1`, [conta]);
    assert.equal(cfg.length, 1);
  });

  test('já ativa, no plano Master trimestral, agenda a próxima cobrança', async () => {
    const { empresa } = await criar('Ápice', 'admin@apice.com',
      { plano: 'master', status: 'ativa', ciclo: 'trimestral' });

    const { rows: [e] } = await h.como(operador,
      `select plano, assentos, ciclo, valor_mensal_centavos, trial_ate,
              (proxima_cobranca - current_date) as dias
         from sistema_empresas() where id = $1`, [empresa]);
    assert.equal(e.plano, 'Master');
    assert.equal(e.assentos, 15);
    assert.equal(e.ciclo, 'trimestral');
    assert.equal(e.valor_mensal_centavos, 39700);  // preço de tabela do Master
    assert.equal(e.trial_ate, null);
    assert.ok(e.dias >= 89 && e.dias <= 92, `próxima cobrança em ${e.dias} dias`);
  });

  test('vitalício não agenda cobrança e aceita valor negociado', async () => {
    const { empresa } = await criar('Vita', 'admin@vita.com',
      { plano: 'pro', status: 'ativa', ciclo: 'vitalicio', valor: 499000 });

    const { rows: [e] } = await h.como(operador,
      `select ciclo, valor_mensal_centavos, proxima_cobranca
         from sistema_empresas() where id = $1`, [empresa]);
    assert.equal(e.ciclo, 'vitalicio');
    assert.equal(e.valor_mensal_centavos, 499000);
    assert.equal(e.proxima_cobranca, null);
  });

  test('recusa nome vazio, plano, situação e ciclo inválidos', async () => {
    const conta = await criarAuthUser(h, 'sobra@teste.com');
    const chamar = (args) => h.como(operador,
      `select sistema_criar_empresa($1, $2, 'Admin', 'sobra@teste.com', $3, $4, 14, $5, null)`, args);

    await assert.rejects(chamar(['  ', conta, 'start', 'trial', 'mensal']), /nome/i);
    await assert.rejects(chamar(['X', conta, 'ouro', 'trial', 'mensal']), /plano inexistente/i);
    await assert.rejects(chamar(['X', conta, 'start', 'suspensa', 'mensal']), /situação inválida/i);
    await assert.rejects(chamar(['X', conta, 'start', 'trial', 'semanal']), /ciclo inválido/i);
  });

  test('não rouba uma conta que já tem clínica', async () => {
    await assert.rejects(
      h.como(operador,
        `select sistema_criar_empresa('Outra', $1, 'A', 'a@a.com', 'start', 'trial', 14, 'mensal', null)`,
        [alheia.admin]),
      /já pertence/i,
    );
  });

  test('admin de clínica não cria empresa', async () => {
    const conta = await criarAuthUser(h, 'tentativa@teste.com');
    await assert.rejects(
      h.como(alheia.admin,
        `select sistema_criar_empresa('Pirata', $1, 'A', 'p@p.com', 'start', 'trial', 14, 'mensal', null)`,
        [conta]),
      /acesso restrito/i,
    );
  });
});

describe('ciclos novos no comercial', () => {
  test('vitalício fica fora do MRR e do ticket médio', async () => {
    const { rows: [antes] } = await h.como(operador, `select sistema_vendas() as v`);
    const { empresa } = await criar('Perpétua', 'admin@perpetua.com',
      { plano: 'master', status: 'ativa', ciclo: 'vitalicio', valor: 900000 });
    const { rows: [depois] } = await h.como(operador, `select sistema_vendas() as v`);

    assert.equal(depois.v.mrr_centavos, antes.v.mrr_centavos);
    assert.equal(depois.v.ticket_medio_centavos, antes.v.ticket_medio_centavos);
    assert.equal(depois.v.clientes_pagantes, antes.v.clientes_pagantes + 1);
    assert.ok(depois.v.vitalicios >= 1);

    // Pagou: continua sem próxima cobrança.
    const { rows: [f] } = await h.como(operador,
      `select sistema_lancar_fatura($1, current_date, 900000, current_date, 'Licença vitalícia') as id`,
      [empresa]);
    await h.como(operador, `select sistema_baixar_fatura($1, 'pix', now())`, [f.id]);
    const { rows: [e] } = await h.como(operador,
      `select proxima_cobranca from sistema_empresas() where id = $1`, [empresa]);
    assert.equal(e.proxima_cobranca, null);
  });

  test('o trimestral anda três meses na baixa da fatura', async () => {
    const { empresa } = await criar('Trimestre', 'admin@trimestre.com',
      { plano: 'pro', status: 'ativa', ciclo: 'trimestral' });
    await h.como(operador,
      `select sistema_definir_comercial($1, null, null, current_date::date, null)`, [empresa]);

    const { rows: [f] } = await h.como(operador,
      `select sistema_lancar_fatura($1, current_date, 19700, current_date, null) as id`, [empresa]);
    await h.como(operador, `select sistema_baixar_fatura($1, 'pix', now())`, [f.id]);

    const { rows: [e] } = await h.como(operador,
      `select (proxima_cobranca - current_date) as dias from sistema_empresas() where id = $1`, [empresa]);
    assert.ok(e.dias >= 89 && e.dias <= 92, `avançou ${e.dias} dias`);
  });

  test('mudar para vitalício limpa a próxima cobrança', async () => {
    await h.como(operador,
      `select sistema_definir_comercial($1, 350000, 'vitalicio', null, null)`, [alheia.id]);
    const { rows: [e] } = await h.como(operador,
      `select ciclo, proxima_cobranca from sistema_empresas() where id = $1`, [alheia.id]);
    assert.equal(e.ciclo, 'vitalicio');
    assert.equal(e.proxima_cobranca, null);
  });
});

test('a listagem informa o nível do cliente', async () => {
  const { rows } = await h.como(operador, `select plano_slug from sistema_empresas()`);
  assert.ok(rows.length > 0);
  assert.ok(rows.every((r) => ['start', 'pro', 'master'].includes(r.plano_slug)));
});
