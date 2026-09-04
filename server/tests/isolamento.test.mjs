// Prova o critério de pronto da Fase 0:
// "Empresa A não enxerga 1 byte da B" — e o escopo pessoal × empresa.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, semearEmpresa } from './harness.mjs';

let h, A, B;

before(async () => {
  h = await criarBanco();
  A = await semearEmpresa(h, 'clinica-a');
  B = await semearEmpresa(h, 'clinica-b');

  // Acervo da empresa A (criado pelo admin dela)
  await h.como(A.admin,
    `insert into pastas (empresa_id, nome, cor) values ($1, 'LEAD FACETA', '#ec4899')`, [A.id]);
  await h.como(A.admin,
    `insert into categorias (empresa_id, nome) values ($1, 'SAUDAÇÃO')`, [A.id]);
  await h.como(A.admin,
    `insert into respostas (empresa_id, titulo, atalho) values ($1, 'Saudação MCA', 'saudacao')`, [A.id]);
  await h.como(A.admin,
    `insert into anotacoes (empresa_id, wa_number, remote_jid, texto, autor_id)
     values ($1, '5511964788124', '5511999999999@c.us', 'Paciente pediu retorno', $2)`, [A.id, A.admin]);
  const { rows: [pastaA] } = await h.como(A.admin, `select id from pastas limit 1`);
  await h.como(A.admin,
    `insert into pasta_conversas (empresa_id, pasta_id, wa_number, remote_jid, criado_por)
     values ($1, $2, '5511964788124', '5511999999999@c.us', $3)`, [A.id, pastaA.id, A.admin]);
});

after(async () => h.fechar());

describe('isolamento entre empresas', () => {
  const tabelas = ['pastas', 'categorias', 'respostas', 'anotacoes', 'pasta_conversas'];

  test('empresa B não lê nenhum dado da empresa A', async () => {
    for (const t of tabelas) {
      const r = await h.como(B.admin, `select count(*)::int as n from ${t}`);
      assert.equal(r.rows[0].n, 0, `vazou ${t} para outra empresa`);
    }
  });

  test('empresa B não consegue gravar dado marcado como da empresa A', async () => {
    await assert.rejects(
      h.como(B.admin, `insert into pastas (empresa_id, nome) values ($1, 'invasora')`, [A.id]),
      /row-level security/i,
    );
  });

  test('empresa B não altera nem apaga registro da empresa A', async () => {
    const upd = await h.como(B.admin, `update pastas set nome = 'hackeada' returning id`);
    assert.equal(upd.rows.length, 0);
    const del = await h.como(B.admin, `delete from pastas returning id`);
    assert.equal(del.rows.length, 0);
  });

  test('B não lê as ações (mídia) das respostas de A', async () => {
    const { rows: [resp] } = await h.como(A.admin, `select id from respostas limit 1`);
    await h.como(A.admin,
      `insert into resposta_acoes (resposta_id, tipo, texto, midia_path)
       values ($1, 'audio', '', 'empresa-a/audio.ogg')`, [resp.id]);
    const r = await h.como(B.admin, `select count(*)::int as n from resposta_acoes`);
    assert.equal(r.rows[0].n, 0);
  });

  test('usuário da empresa A enxerga o acervo dela', async () => {
    const r = await h.como(A.usuario, `select count(*)::int as n from pastas`);
    assert.equal(r.rows[0].n, 1);
  });
});

describe('escopo pessoal × empresa', () => {
  test('mensagem pessoal de um usuário não aparece para o colega', async () => {
    await h.como(A.usuario,
      `insert into respostas (empresa_id, titulo, escopo, owner_id)
       values ($1, 'Minha pessoal', 'pessoal', $2)`, [A.id, A.usuario]);

    const doColega = await h.como(A.admin,
      `select count(*)::int as n from respostas where titulo = 'Minha pessoal'`);
    assert.equal(doColega.rows[0].n, 0, 'mensagem pessoal vazou para o colega');

    const doDono = await h.como(A.usuario,
      `select count(*)::int as n from respostas where titulo = 'Minha pessoal'`);
    assert.equal(doDono.rows[0].n, 1);
  });

  test('usuário comum não publica mensagem padrão da empresa', async () => {
    await assert.rejects(
      h.como(A.usuario,
        `insert into respostas (empresa_id, titulo) values ($1, 'Padrão indevida')`, [A.id]),
      /row-level security/i,
    );
  });

  test('usuário comum não altera a mensagem padrão publicada pelo admin', async () => {
    const upd = await h.como(A.usuario,
      `update respostas set titulo = 'alterada' where escopo = 'empresa' returning id`);
    assert.equal(upd.rows.length, 0);
  });
});

describe('dados operacionais são compartilhados na empresa', () => {
  test('colega vê o vínculo de pasta e a anotação feitos por outro', async () => {
    const p = await h.como(A.usuario, `select count(*)::int as n from pasta_conversas`);
    const a = await h.como(A.usuario, `select count(*)::int as n from anotacoes`);
    assert.equal(p.rows[0].n, 1);
    assert.equal(a.rows[0].n, 1);
  });

  test('usuário comum pode marcar pasta e anotar (não precisa ser admin)', async () => {
    const { rows: [pasta] } = await h.como(A.usuario, `select id from pastas limit 1`);
    await h.como(A.usuario,
      `insert into pasta_conversas (empresa_id, pasta_id, wa_number, remote_jid, criado_por)
       values ($1, $2, '5511964788124', '5511988887777@c.us', $3)`, [A.id, pasta.id, A.usuario]);
    const r = await h.como(A.admin, `select count(*)::int as n from pasta_conversas`);
    assert.equal(r.rows[0].n, 2);
  });
});

describe('preferências são privadas do usuário', () => {
  test('config de um usuário não é lida por outro da mesma empresa', async () => {
    await h.como(A.usuario,
      `insert into config_usuario (usuario_id, empresa_id, tema) values ($1, $2, 'gray')`,
      [A.usuario, A.id]);
    const outro = await h.como(A.admin, `select count(*)::int as n from config_usuario`);
    assert.equal(outro.rows[0].n, 0);
    const dono = await h.como(A.usuario, `select tema from config_usuario`);
    assert.equal(dono.rows[0].tema, 'gray');
  });
});

describe('sessão sem usuário', () => {
  test('token de usuário inexistente não lê nada', async () => {
    const r = await h.como('00000000-0000-0000-0000-000000000000',
      `select count(*)::int as n from pastas`);
    assert.equal(r.rows[0].n, 0);
  });

  test('usuário inativo perde o acesso', async () => {
    await h.servidor(`update usuarios set ativo = false where id = $1`, [B.usuario]);
    const r = await h.como(B.usuario, `select count(*)::int as n from pastas`);
    assert.equal(r.rows[0].n, 0);
  });
});
