// Cadastro da empresa, convite de equipe e limite de assentos.

import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { criarBanco, criarAuthUser } from './harness.mjs';

let h;
before(async () => { h = await criarBanco(); });
after(async () => h.fechar());

describe('cadastro da empresa', () => {
  test('quem se cadastra vira admin da própria empresa, em teste grátis', async () => {
    const dono = await criarAuthUser(h, 'kelly@clinicacarvalho.com.br');
    await h.como(dono, `select public.criar_empresa_e_admin('Clínica Carvalho', 'Dra. Kelly')`);

    const { rows: [u] } = await h.como(dono, `select papel, email, empresa_id from usuarios where id = $1`, [dono]);
    assert.equal(u.papel, 'admin');
    assert.equal(u.email, 'kelly@clinicacarvalho.com.br');

    const { rows: [e] } = await h.como(dono, `select status, trial_ate from empresas`);
    assert.equal(e.status, 'trial');
    assert.ok(e.trial_ate > new Date(), 'trial deve ter data futura');

    const { rows: [c] } = await h.como(dono, `select tema from config_usuario`);
    assert.equal(c.tema, 'auto');
  });

  test('não dá para cadastrar duas empresas com o mesmo usuário', async () => {
    const dono = await criarAuthUser(h, 'duplicado@teste.com');
    await h.como(dono, `select public.criar_empresa_e_admin('Primeira', 'Fulano')`);
    await assert.rejects(
      h.como(dono, `select public.criar_empresa_e_admin('Segunda', 'Fulano')`),
      /já pertence a uma empresa/,
    );
  });
});

describe('convite de equipe', () => {
  test('convidado entra na empresa com o papel do convite', async () => {
    const dono = await criarAuthUser(h, 'dono@clinica-x.com');
    const empresaId = (await h.como(dono, `select public.criar_empresa_e_admin('Clínica X', 'Dono') as id`)).rows[0].id;
    await h.como(dono,
      `insert into convites (empresa_id, email, papel, token, expira_em)
       values ($1, 'recep@clinica-x.com', 'usuario', 'tok-123', now() + interval '7 days')`,
      [empresaId]);

    const convidado = await criarAuthUser(h, 'recep@clinica-x.com');
    await h.como(convidado, `select public.aceitar_convite('tok-123', 'Recepção')`);

    const { rows: [u] } = await h.como(convidado, `select papel, empresa_id from usuarios where id = $1`, [convidado]);
    assert.equal(u.papel, 'usuario');
    assert.equal(u.empresa_id, empresaId);

    // e já enxerga o acervo da empresa
    const { rows: [conv] } = await h.como(dono, `select aceito_em from convites where token = 'tok-123'`);
    assert.ok(conv.aceito_em, 'convite deve ficar marcado como aceito');
  });

  test('convite expirado é recusado', async () => {
    const dono = await criarAuthUser(h, 'dono@expira.com');
    const empresaId = (await h.como(dono, `select public.criar_empresa_e_admin('Expira', 'Dono') as id`)).rows[0].id;
    await h.servidor(
      `insert into convites (empresa_id, email, papel, token, expira_em)
       values ($1, 'tarde@expira.com', 'usuario', 'tok-velho', now() - interval '1 day')`, [empresaId]);

    const convidado = await criarAuthUser(h, 'tarde@expira.com');
    await assert.rejects(
      h.como(convidado, `select public.aceitar_convite('tok-velho', 'Atrasado')`),
      /inválido ou expirado/,
    );
  });

  test('usuário comum não consegue convidar (só admin)', async () => {
    const dono = await criarAuthUser(h, 'dono@convite.com');
    const empresaId = (await h.como(dono, `select public.criar_empresa_e_admin('Convite', 'Dono') as id`)).rows[0].id;
    await h.como(dono,
      `insert into convites (empresa_id, email, papel, token, expira_em)
       values ($1, 'comum@convite.com', 'usuario', 'tok-c1', now() + interval '7 days')`, [empresaId]);
    const comum = await criarAuthUser(h, 'comum@convite.com');
    await h.como(comum, `select public.aceitar_convite('tok-c1', 'Comum')`);

    await assert.rejects(
      h.como(comum,
        `insert into convites (empresa_id, email, papel, token, expira_em)
         values ($1, 'outro@convite.com', 'usuario', 'tok-c2', now() + interval '7 days')`, [empresaId]),
      /row-level security/i,
    );
  });

  test('assentos esgotados bloqueiam a entrada', async () => {
    const dono = await criarAuthUser(h, 'dono@lotada.com');
    const empresaId = (await h.como(dono, `select public.criar_empresa_e_admin('Lotada', 'Dono') as id`)).rows[0].id;
    await h.servidor(`update empresas set assentos = 1 where id = $1`, [empresaId]);
    await h.servidor(
      `insert into convites (empresa_id, email, papel, token, expira_em)
       values ($1, 'sobrando@lotada.com', 'usuario', 'tok-lotada', now() + interval '7 days')`, [empresaId]);

    const convidado = await criarAuthUser(h, 'sobrando@lotada.com');
    await assert.rejects(
      h.como(convidado, `select public.aceitar_convite('tok-lotada', 'Sobrando')`),
      /assentos/,
    );
  });
});
