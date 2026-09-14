// O compromisso é de quem marcou (0032): vejo o que marquei e o que está sob
// minha responsabilidade; o admin vê a clínica inteira. Dividir departamento
// NÃO dá acesso — o retorno combinado com um cliente é assunto de quem atendeu.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, daEquipe, deFora, equipe;

const criarUsuario = async (email, nome) => {
  const id = await criarAuthUser(h, email);
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, $3, $4, 'usuario')`,
    [id, A.id, nome, email]);
  return id;
};

const marcar = async (quem, titulo, responsavel = null) =>
  (await h.como(quem,
    `insert into agendamentos (empresa_id, titulo, inicio, criado_por, responsavel_id)
     values ($1, $2, now() + interval '1 day', $3, $4) returning id`,
    [A.id, titulo, quem, responsavel ?? quem])).rows[0].id;

const vistos = async (quem) =>
  (await h.como(quem, `select titulo from agendamentos order by titulo`)).rows.map((r) => r.titulo);

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  // A clínica de teste nasce com poucos assentos; aqui precisamos de quatro pessoas.
  await h.servidor(`update empresas set assentos = 10 where id = $1`, [A.id]);
  daEquipe = await criarUsuario('vendas1@clinica-a.com', 'Colega da equipe');
  deFora = await criarUsuario('recepcao@clinica-a.com', 'Gente de outra equipe');
  const { rows: [e] } = await h.servidor(
    `insert into equipes (empresa_id, nome) values ($1, 'Vendas') returning id`, [A.id]);
  equipe = e.id;
  for (const u of [A.usuario, daEquipe]) {
    await h.servidor(`insert into equipe_usuarios (equipe_id, usuario_id) values ($1, $2)`, [equipe, u]);
  }
});

after(async () => h.fechar());

describe('quem enxerga o quê', () => {
  before(async () => {
    await marcar(A.usuario, 'Retorno do atendente');
    await marcar(deFora, 'Compromisso da recepção');
  });

  test('vejo o meu', async () => {
    assert.ok((await vistos(A.usuario)).includes('Retorno do atendente'));
  });

  test('NÃO vejo o de quem divide departamento comigo', async () => {
    assert.deepEqual(await vistos(daEquipe), [], 'mesmo departamento não abre a agenda do colega');
  });

  test('NÃO vejo o de quem está em outro departamento', async () => {
    assert.ok(!(await vistos(A.usuario)).includes('Compromisso da recepção'));
    assert.deepEqual(await vistos(deFora), ['Compromisso da recepção'], 'ela vê só o dela');
  });

  test('o admin vê a clínica inteira', async () => {
    assert.deepEqual(await vistos(A.admin), ['Compromisso da recepção', 'Retorno do atendente']);
  });
});

describe('responsável enxerga — é para isso que o campo existe', () => {
  test('marcado por outro, mas sob minha responsabilidade', async () => {
    await marcar(A.admin, 'Ligar para o paciente novo', deFora);
    assert.ok((await vistos(deFora)).includes('Ligar para o paciente novo'));
    assert.ok(!(await vistos(daEquipe)).includes('Ligar para o paciente novo'),
      'quem não marcou nem é responsável continua de fora');
  });
});

describe('o compromisso de um contato não vaza para o colega', () => {
  test('marquei o retorno da Dra. Ana: só eu e o admin vemos', async () => {
    await h.como(A.usuario,
      `insert into agendamentos (empresa_id, titulo, inicio, criado_por, responsavel_id, remote_jid, contato_nome)
       values ($1, 'Perguntar do lavabo', now() + interval '2 days', $2, $2, '5511964788124@c.us', 'Dra. Ana')`,
      [A.id, A.usuario]);
    const doContato = async (quem) =>
      (await h.como(quem, `select titulo from agendamentos where remote_jid = '5511964788124@c.us'`)).rows.map((r) => r.titulo);
    assert.deepEqual(await doContato(A.usuario), ['Perguntar do lavabo']);
    assert.deepEqual(await doContato(daEquipe), [], 'o colega abre o mesmo contato e não vê');
    assert.deepEqual(await doContato(deFora), []);
    assert.deepEqual(await doContato(A.admin), ['Perguntar do lavabo']);
  });
});
