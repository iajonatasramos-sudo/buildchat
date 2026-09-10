// Agenda da clínica: todo mundo vê o que a equipe marcou; mexer é de quem
// criou, de quem responde pelo compromisso ou do admin.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser, semearEmpresa } from './harness.mjs';

let h, A, colega, B, compromisso;
const JID = '5511999990000@c.us';
const WA = '5511964788124';

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  B = await semearEmpresa(h, 'clinica-b');
  colega = await criarAuthUser(h, 'colega@clinica-a.com');
  await h.servidor(
    `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, 'Colega', 'colega@clinica-a.com', 'usuario')`,
    [colega, A.id]);
});

after(async () => h.fechar());

const marcar = (quem, titulo, extra = '') =>
  h.como(quem,
    `insert into agendamentos (empresa_id, wa_number, remote_jid, contato_nome, titulo, inicio, criado_por${extra ? ', responsavel_id' : ''})
     values ($1, $2, $3, 'Dra. Ana', $4, now() + interval '2 days', $5${extra ? ', $6' : ''}) returning id`,
    extra ? [A.id, WA, JID, titulo, quem, extra] : [A.id, WA, JID, titulo, quem]);

describe('marcar um retorno durante a conversa', () => {
  test('o atendente marca e vira responsável por padrão', async () => {
    const { rows: [r] } = await marcar(A.usuario, 'Retornar para a Dra. Ana');
    compromisso = r.id;
    const { rows: [a] } = await h.servidor(
      `select criado_por, responsavel_id, status, dia_inteiro from agendamentos where id = $1`, [compromisso]);
    assert.equal(a.criado_por, A.usuario);
    assert.equal(a.responsavel_id, A.usuario, 'sem responsável informado, responde quem marcou');
    assert.equal(a.status, 'pendente');
    assert.equal(a.dia_inteiro, false);
  });

  test('não dá para marcar em nome de outra pessoa', async () => {
    await assert.rejects(
      h.como(A.usuario,
        `insert into agendamentos (empresa_id, titulo, inicio, criado_por) values ($1, 'em nome de outro', now(), $2)`,
        [A.id, colega]),
      /row-level security/);
  });

  test('dá para marcar algo solto, sem contato', async () => {
    const { rows } = await h.como(A.usuario,
      `insert into agendamentos (empresa_id, titulo, inicio, criado_por) values ($1, 'Reunião da equipe', now(), $2) returning id`,
      [A.id, A.usuario]);
    assert.ok(rows[0].id);
  });
});

describe('a agenda é da clínica, até onde vai a equipe', () => {
  // Quem divide equipe enxerga (ver agenda-equipe.test.mjs). Aqui o colega
  // está solto, sem equipe: só o autor, o responsável e o admin veem.
  test('colega sem equipe em comum NÃO vê o compromisso alheio', async () => {
    const { rows } = await h.como(colega, `select titulo from agendamentos where id = $1`, [compromisso]);
    assert.equal(rows.length, 0);
  });

  test('o admin vê', async () => {
    const { rows } = await h.como(A.admin, `select titulo from agendamentos where id = $1`, [compromisso]);
    assert.equal(rows[0]?.titulo, 'Retornar para a Dra. Ana');
  });

  test('outra clínica não vê nada', async () => {
    const { rows } = await h.como(B.admin, `select count(*)::int as n from agendamentos`);
    assert.equal(rows[0].n, 0);
  });
});

describe('quem pode mexer', () => {
  test('o colega não edita nem apaga o compromisso de outro', async () => {
    await h.como(colega, `update agendamentos set titulo = 'mudei' where id = $1`, [compromisso]);
    await h.como(colega, `delete from agendamentos where id = $1`, [compromisso]);
    const { rows } = await h.servidor(`select titulo from agendamentos where id = $1`, [compromisso]);
    assert.equal(rows[0]?.titulo, 'Retornar para a Dra. Ana', 'nada mudou');
  });

  test('o responsável marca como concluído, mesmo sem ter criado', async () => {
    const { rows: [r] } = await marcar(A.usuario, 'Ligar para o paciente', colega);
    await h.como(colega, `update agendamentos set status = 'concluido' where id = $1`, [r.id]);
    const { rows } = await h.servidor(`select status from agendamentos where id = $1`, [r.id]);
    assert.equal(rows[0].status, 'concluido');
  });

  test('o autor edita o próprio', async () => {
    await h.como(A.usuario, `update agendamentos set titulo = 'Retornar (remarcado)' where id = $1`, [compromisso]);
    const { rows } = await h.servidor(`select titulo from agendamentos where id = $1`, [compromisso]);
    assert.equal(rows[0].titulo, 'Retornar (remarcado)');
  });

  test('o admin mexe em qualquer um', async () => {
    await h.como(A.admin, `update agendamentos set status = 'cancelado' where id = $1`, [compromisso]);
    const { rows } = await h.servidor(`select status from agendamentos where id = $1`, [compromisso]);
    assert.equal(rows[0].status, 'cancelado');
  });

  test('situação inventada é recusada', async () => {
    await assert.rejects(
      h.como(A.admin, `update agendamentos set status = 'talvez' where id = $1`, [compromisso]),
      /agendamentos_status_check|check constraint/);
  });
});

describe('sincronização', () => {
  test('editar "toca" atualizado_em, para o colega baixar a mudança', async () => {
    const { rows: [antes] } = await h.servidor(`select atualizado_em from agendamentos where id = $1`, [compromisso]);
    await new Promise((r) => setTimeout(r, 20));
    await h.como(A.admin, `update agendamentos set titulo = 'Retornar (2)' where id = $1`, [compromisso]);
    const { rows: [depois] } = await h.servidor(`select atualizado_em from agendamentos where id = $1`, [compromisso]);
    assert.ok(new Date(depois.atualizado_em) > new Date(antes.atualizado_em));
  });
});

describe('etiqueta da atividade', () => {
  test('guarda a etiqueta escolhida e deixa ficar sem nenhuma', async () => {
    const { rows: [com] } = await h.como(A.usuario,
      `insert into agendamentos (empresa_id, titulo, inicio, criado_por, etiqueta)
       values ($1, 'Cobrar a proposta', now(), $2, 'Cobrar') returning id, etiqueta`, [A.id, A.usuario]);
    assert.equal(com.etiqueta, 'Cobrar');
    const { rows: [sem] } = await h.como(A.usuario,
      `insert into agendamentos (empresa_id, titulo, inicio, criado_por) values ($1, 'Sem etiqueta', now(), $2) returning etiqueta`,
      [A.id, A.usuario]);
    assert.equal(sem.etiqueta, null);
  });

  test('a lista de etiquetas é da extensão: o banco aceita qualquer texto', async () => {
    // Cada marca tem a sua; trocar a lista não pode exigir migração nem
    // deixar compromisso antigo inválido.
    const { rows } = await h.como(A.usuario,
      `insert into agendamentos (empresa_id, titulo, inicio, criado_por, etiqueta)
       values ($1, 'Consulta da Anamni', now(), $2, 'Consulta') returning etiqueta`, [A.id, A.usuario]);
    assert.equal(rows[0].etiqueta, 'Consulta');
  });
});
