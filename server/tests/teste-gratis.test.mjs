// Conta de teste: 7 dias, com os recursos do Pro; virar assinante não apaga nada.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser } from './harness.mjs';

let h, dono, empresa, operador;

before(async () => {
  h = await criarBanco();
  dono = await criarAuthUser(h, 'dra.kelly@sorriso.com');
  operador = await criarAuthUser(h, 'dono@buildchat.com.br');
  await h.servidor(`insert into sistema_operadores (usuario_auth_id, nome) values ($1, 'Dono')`, [operador]);
});

after(async () => h.fechar());

describe('criar a própria conta', () => {
  test('nasce em teste grátis de 7 dias, como admin da clínica', async () => {
    const { rows: [r] } = await h.como(dono, `select criar_empresa_e_admin('Sorriso', 'Dra. Kelly') as id`);
    empresa = r.id;
    const { rows: [e] } = await h.servidor(
      `select status, extract(epoch from (trial_ate - now())) / 86400 as dias from empresas where id = $1`, [empresa]);
    assert.equal(e.status, 'trial');
    assert.ok(e.dias > 6.9 && e.dias <= 7, `trial de ${e.dias} dias`);
    const { rows: [u] } = await h.servidor(`select papel from usuarios where id = $1`, [dono]);
    assert.equal(u.papel, 'admin');
  });

  test('no teste a clínica usa os recursos do Pro', async () => {
    const { rows: [p] } = await h.como(dono, `select meu_plano() as p`);
    assert.equal(p.p.slug, 'pro');
  });

  test('o gestor também parte de 7 dias ao cadastrar uma clínica', async () => {
    const conta = await criarAuthUser(h, 'admin@outra.com');
    const { rows: [r] } = await h.como(operador,
      `select sistema_criar_empresa('Outra', $1, 'Admin', 'admin@outra.com') as id`, [conta]);
    const { rows: [e] } = await h.servidor(
      `select extract(epoch from (trial_ate - now())) / 86400 as dias from empresas where id = $1`, [r.id]);
    assert.ok(e.dias > 6.9 && e.dias <= 7, `trial de ${e.dias} dias`);
  });
});

describe('virar assinante preserva o que foi feito no teste', () => {
  let contagem;

  test('a clínica cria acervo durante o teste', async () => {
    await h.como(dono, `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'empresa', null, 'Leads', '#c00', 0)`, [empresa]);
    await h.como(dono, `insert into categorias (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'empresa', null, 'Saudações', '#0c0', 0)`, [empresa]);
    await h.como(dono, `insert into respostas (empresa_id, escopo, owner_id, titulo) values ($1, 'empresa', null, 'Bom dia')`, [empresa]);
    await h.como(dono, `insert into contatos (empresa_id, wa_number, remote_jid, nome) values ($1, '5511900000000', '5511911111111@c.us', 'Paciente')`, [empresa]);
    await h.como(dono, `insert into anotacoes (empresa_id, wa_number, remote_jid, texto) values ($1, '5511900000000', '5511911111111@c.us', 'Quer implante')`, [empresa]);
    contagem = await contar();
    assert.deepEqual(contagem, { pastas: 1, categorias: 1, respostas: 1, contatos: 1, anotacoes: 1 });
  });

  test('o gestor ativa a assinatura (Start) e nada some', async () => {
    await h.como(operador, `select sistema_definir_plano($1, 'start', true)`, [empresa]);
    await h.como(operador, `select sistema_atualizar_empresa($1, 'ativa', null, null, null)`, [empresa]);
    const { rows: [e] } = await h.servidor(`select status, plano_slug from empresas where id = $1`, [empresa]);
    assert.equal(e.status, 'ativa');
    assert.equal(e.plano_slug, 'start');
    assert.deepEqual(await contar(), contagem, 'o acervo do teste continua inteiro e visível');
  });

  test('mesmo com o teste vencido antes de pagar, nada é apagado', async () => {
    await h.servidor(`update empresas set status = 'trial', trial_ate = now() - interval '1 day' where id = $1`, [empresa]);
    assert.deepEqual(await contar(), contagem);
    await h.como(operador, `select sistema_atualizar_empresa($1, 'ativa', null, null, null)`, [empresa]);
    assert.deepEqual(await contar(), contagem);
  });

  async function contar() {
    const q = async (t) => (await h.como(dono, `select count(*)::int as n from ${t} where deleted_at is null`)).rows[0].n;
    return { pastas: await q('pastas'), categorias: await q('categorias'), respostas: await q('respostas'),
             contatos: await q('contatos'), anotacoes: await q('anotacoes') };
  }
});
