// Equipes, visibilidade das mensagens padrão e ficha do contato.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, B, equipeVendas, foraDaEquipe;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  B = await semearEmpresa(h, 'clinica-b');

  // Uma equipe com o usuário comum de A dentro
  const { rows: [eq] } = await h.como(A.admin,
    `insert into equipes (empresa_id, nome) values ($1, 'Vendas') returning id`, [A.id]);
  equipeVendas = eq.id;
  await h.como(A.admin,
    `insert into equipe_usuarios (equipe_id, usuario_id) values ($1, $2)`, [equipeVendas, A.usuario]);

  // Terceira pessoa: da empresa, sem ser admin nem da equipe Vendas.
  foraDaEquipe = await criarAuthUser(h, 'recepcao@clinica-a.com');
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel)
     values ($1, $2, 'Recepção', 'recepcao@clinica-a.com', 'usuario')`, [foraDaEquipe, A.id]);
});

after(async () => h.fechar());

describe('equipes', () => {
  test('usuário comum não cria nem apaga equipe', async () => {
    await assert.rejects(
      h.como(A.usuario, `insert into equipes (empresa_id, nome) values ($1, 'Pirata')`, [A.id]),
      /row-level security/i,
    );
    const del = await h.como(A.usuario, `delete from equipes returning id`);
    assert.equal(del.rows.length, 0);
  });

  test('empresa B não enxerga as equipes de A', async () => {
    const r = await h.como(B.admin, `select count(*)::int as n from equipes`);
    assert.equal(r.rows[0].n, 0);
    const m = await h.como(B.admin, `select count(*)::int as n from equipe_usuarios`);
    assert.equal(m.rows[0].n, 0);
  });

  test('a equipe aparece para quem é da empresa', async () => {
    const r = await h.como(A.usuario, `select nome from equipes`);
    assert.equal(r.rows[0]?.nome, 'Vendas');
  });
});

describe('visibilidade das mensagens padrão', () => {
  test('sem restrição, todos da empresa veem', async () => {
    await h.como(A.admin,
      `insert into respostas (empresa_id, titulo) values ($1, 'Para todos')`, [A.id]);
    const r = await h.como(A.usuario, `select count(*)::int as n from respostas where titulo = 'Para todos'`);
    assert.equal(r.rows[0].n, 1);
  });

  test('restrita a uma equipe: só quem está nela vê', async () => {
    await h.como(A.admin,
      `insert into respostas (empresa_id, titulo, visivel_equipes)
       values ($1, 'Só Vendas', array[$2::uuid])`, [A.id, equipeVendas]);

    const naEquipe = await h.como(A.usuario,
      `select count(*)::int as n from respostas where titulo = 'Só Vendas'`);
    assert.equal(naEquipe.rows[0].n, 1, 'quem está na equipe deve ver');

    const outraPessoa = await h.como(foraDaEquipe,
      `select count(*)::int as n from respostas where titulo = 'Só Vendas'`);
    assert.equal(outraPessoa.rows[0].n, 0, 'quem não está na equipe não deve ver');

    // O admin enxerga para poder administrar no painel (a extensão é que filtra).
    const admin = await h.como(A.admin,
      `select count(*)::int as n from respostas where titulo = 'Só Vendas'`);
    assert.equal(admin.rows[0].n, 1, 'o admin administra o acervo inteiro');
  });

  test('restrita a uma pessoa: só ela vê', async () => {
    await h.como(A.admin,
      `insert into respostas (empresa_id, titulo, visivel_usuarios)
       values ($1, 'Só para o admin', array[$2::uuid])`, [A.id, A.admin]);

    const dono = await h.como(A.admin,
      `select count(*)::int as n from respostas where titulo = 'Só para o admin'`);
    assert.equal(dono.rows[0].n, 1);

    const outro = await h.como(foraDaEquipe,
      `select count(*)::int as n from respostas where titulo = 'Só para o admin'`);
    assert.equal(outro.rows[0].n, 0);
  });

  test('sair da equipe tira o acesso', async () => {
    await h.como(A.admin,
      `delete from equipe_usuarios where equipe_id = $1 and usuario_id = $2`, [equipeVendas, A.usuario]);
    const r = await h.como(A.usuario,
      `select count(*)::int as n from respostas where titulo = 'Só Vendas'`);
    assert.equal(r.rows[0].n, 0);
  });

  test('mensagem pessoal ignora visibilidade e continua privada', async () => {
    await h.como(A.usuario,
      `insert into respostas (empresa_id, titulo, escopo, owner_id)
       values ($1, 'Minha particular', 'pessoal', $2)`, [A.id, A.usuario]);

    const dono = await h.como(A.usuario,
      `select count(*)::int as n from respostas where titulo = 'Minha particular'`);
    assert.equal(dono.rows[0].n, 1);

    const admin = await h.como(A.admin,
      `select count(*)::int as n from respostas where titulo = 'Minha particular'`);
    assert.equal(admin.rows[0].n, 0, 'nem o admin vê a mensagem pessoal de um usuário');
  });
});

describe('ficha do contato', () => {
  test('é compartilhada por quem atende o mesmo número', async () => {
    await h.como(A.usuario,
      `insert into contatos (empresa_id, wa_number, remote_jid, nome, interesses)
       values ($1, '5511964788124', '5511999990000@c.us', 'Dra. Kelly', 'Lentes de contato')`, [A.id]);

    const colega = await h.como(A.admin,
      `select nome, interesses from contatos where remote_jid = '5511999990000@c.us'`);
    assert.equal(colega.rows[0]?.nome, 'Dra. Kelly');
    assert.equal(colega.rows[0]?.interesses, 'Lentes de contato');
  });

  test('empresa B não vê contatos de A', async () => {
    const r = await h.como(B.admin, `select count(*)::int as n from contatos`);
    assert.equal(r.rows[0].n, 0);
  });

  test('a mesma conversa não duplica (chave por empresa, número e contato)', async () => {
    await assert.rejects(
      h.como(A.admin,
        `insert into contatos (empresa_id, wa_number, remote_jid, nome)
         values ($1, '5511964788124', '5511999990000@c.us', 'Duplicada')`, [A.id]),
      /duplicate key|unique/i,
    );
  });

  test('qualquer atendente da empresa pode atualizar a ficha', async () => {
    const upd = await h.como(A.admin,
      `update contatos set interesses = 'Lentes + clareamento'
        where remote_jid = '5511999990000@c.us' returning id`);
    assert.equal(upd.rows.length, 1);
  });
});
