// Duas marcas (BuildChat e Anamni) no mesmo banco: a empresa registra de qual
// produto veio; painel e RLS continuam os mesmos.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, operador;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  operador = await criarAuthUser(h, 'gestor@buildchat.com.br');
  await h.servidor(`insert into sistema_operadores (usuario_auth_id, nome) values ($1, 'Gestor')`, [operador]);
});

after(async () => h.fechar());

const marcaDe = async (empresa) =>
  (await h.servidor(`select marca from empresas where id = $1`, [empresa])).rows[0].marca;

describe('quem já existe é BuildChat', () => {
  test('empresa antiga fica com a marca padrão', async () => {
    assert.equal(await marcaDe(A.id), 'buildchat');
  });
});

describe('autoatendimento: a marca vem do painel usado', () => {
  test('o doutor que entra pelo Anamni abre a clínica dele como Anamni', async () => {
    const doutor = await criarAuthUser(h, 'doutor@consultorio.com.br');
    const { rows: [r] } = await h.como(doutor, `select criar_empresa_e_admin($1, $2, $3) as id`,
      ['Consultório Dr. Silva', 'Dr. Silva', 'anamni']);
    assert.equal(await marcaDe(r.id), 'anamni');
    const { rows: [u] } = await h.servidor(`select papel from usuarios where id = $1`, [doutor]);
    assert.equal(u.papel, 'admin', 'ele é o admin da própria clínica');
  });

  test('sem informar a marca, é BuildChat (o cliente antigo continua funcionando)', async () => {
    const outro = await criarAuthUser(h, 'equipe@buildclinic.com.br');
    const { rows: [r] } = await h.como(outro, `select criar_empresa_e_admin($1, $2) as id`, ['Nova Unidade', 'Fulano']);
    assert.equal(await marcaDe(r.id), 'buildchat');
  });

  test('marca inventada é recusada', async () => {
    const x = await criarAuthUser(h, 'x@x.com');
    await assert.rejects(
      h.como(x, `select criar_empresa_e_admin($1, $2, $3)`, ['X', 'X', 'concorrente']),
      /marca inválida/);
  });
});

describe('cadastro pelo gestor', () => {
  test('o gestor escolhe a marca ao cadastrar', async () => {
    const admin = await criarAuthUser(h, 'dra@anamni-cliente.com.br');
    const { rows: [r] } = await h.como(operador,
      `select sistema_criar_empresa($1, $2, $3, $4, 'pro', 'ativa', 7, 'mensal', null, $5) as id`,
      ['Clínica Dra. Ana', admin, 'Dra. Ana', 'dra@anamni-cliente.com.br', 'anamni']);
    assert.equal(await marcaDe(r.id), 'anamni');
  });

  test('a lista do gestor traz a marca de cada clínica', async () => {
    const { rows } = await h.como(operador, `select nome, marca from sistema_empresas() order by nome`);
    const porNome = Object.fromEntries(rows.map((r) => [r.nome, r.marca]));
    assert.equal(porNome['Clínica Dra. Ana'], 'anamni');
    assert.equal(porNome['Consultório Dr. Silva'], 'anamni');
    assert.equal(porNome['Nova Unidade'], 'buildchat');
  });

  test('o gestor corrige a marca de uma clínica já cadastrada', async () => {
    await h.como(operador, `select sistema_definir_marca($1, 'anamni')`, [A.id]);
    assert.equal(await marcaDe(A.id), 'anamni');
    await h.como(operador, `select sistema_definir_marca($1, 'buildchat')`, [A.id]);
    assert.equal(await marcaDe(A.id), 'buildchat');
  });

  test('o admin da clínica NÃO troca a própria marca', async () => {
    await assert.rejects(
      h.como(A.admin, `select sistema_definir_marca($1, 'anamni')`, [A.id]),
      /acesso restrito/);
    // Nem por update direto: a RLS só libera a coluna `nome`.
    await h.como(A.admin, `update empresas set marca = 'anamni' where id = $1`, [A.id]).catch(() => {});
    assert.equal(await marcaDe(A.id), 'buildchat');
  });
});

describe('as duas marcas convivem sem se enxergar', () => {
  test('a clínica Anamni não vê os dados da clínica BuildChat', async () => {
    const { rows: [dono] } = await h.servidor(
      `select id from usuarios where email = 'doutor@consultorio.com.br'`);
    await h.como(A.admin,
      `insert into pastas (empresa_id, escopo, owner_id, nome, cor, ordem) values ($1, 'empresa', null, 'Leads BuildClinic', '#c00', 0)`,
      [A.id]);
    const { rows } = await h.como(dono.id, `select count(*)::int as n from pastas`);
    assert.equal(rows[0].n, 0, 'a RLS por empresa continua valendo entre marcas');
  });
});
