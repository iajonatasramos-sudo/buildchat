#!/usr/bin/env node
// Teste de ponta a ponta contra um projeto Supabase REAL: cadastro, criação da
// empresa, leitura do perfil e isolamento entre duas empresas distintas.
//
//   SUPABASE_URL=... SUPABASE_KEY=... node scripts/teste-e2e.mjs
//
// Cria contas com e-mail prefixado por "e2e-"; use scripts/limpar-e2e.mjs depois.

import pg from 'pg';

const URL_BASE = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL_BASE || !KEY) throw new Error('defina SUPABASE_URL e SUPABASE_KEY');

const marca = Date.now().toString(36);
const DOMINIO = process.env.DOMINIO_TESTE ?? 'gmail.com';
let falhas = 0;

const ok = (cond, msg, extra = '') => {
  console.log(`${cond ? '  ✔' : '  ✖'} ${msg}${extra ? ` — ${extra}` : ''}`);
  if (!cond) falhas++;
};

async function api(caminho, { token, metodo = 'GET', corpo } = {}) {
  const r = await fetch(`${URL_BASE}${caminho}`, {
    method: metodo,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token ?? KEY}`,
      'Content-Type': 'application/json',
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  return { status: r.status, dados: texto ? JSON.parse(texto) : null };
}

const SENHA = 'SenhaTeste123!';

/**
 * Cria o usuário de teste DIRETO no banco (auth.users + auth.identities) e faz
 * login pela API. Evita o limite de envio de e-mails do Supabase
 * (over_email_send_rate_limit), que bloqueia signups repetidos em testes.
 */
async function criarUsuarioTeste(email) {
  if (!process.env.DATABASE_URL) throw new Error('defina DATABASE_URL para o teste e2e');
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const { rows: [u] } = await c.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at,
                               raw_app_meta_data, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
               'authenticated', $1, extensions.crypt($2, extensions.gen_salt('bf')),
               now(), now(), now(),
               '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
       returning id`, [email, SENHA]);
    // O GoTrue lê estas colunas como string: NULL quebra o login com
    // "Database error querying schema".
    await c.query(
      `update auth.users
          set confirmation_token = '', recovery_token = '', email_change = '',
              email_change_token_new = '', email_change_token_current = '',
              phone_change = '', phone_change_token = '', reauthentication_token = ''
        where id = $1`, [u.id]);
    await c.query(
      `insert into auth.identities (provider_id, user_id, identity_data, provider,
                                    last_sign_in_at, created_at, updated_at)
       values ($1::text, $2::uuid, jsonb_build_object('sub', $1::text, 'email', $3::text),
               'email', now(), now(), now())`, [u.id, u.id, email]);
  } finally {
    await c.end();
  }
  const login = await api('/auth/v1/token?grant_type=password', {
    metodo: 'POST', corpo: { email, password: SENHA },
  });
  if (!login.dados?.access_token) {
    throw new Error(`login falhou: ${JSON.stringify(login.dados).slice(0, 200)}`);
  }
  return login.dados.access_token;
}

console.log('\n1. Cadastro cria empresa em teste grátis');
const tokenA = await criarUsuarioTeste(`e2e-${marca}-a@${DOMINIO}`);
const rpcA = await api('/rest/v1/rpc/criar_empresa_e_admin', {
  token: tokenA, metodo: 'POST', corpo: { p_empresa: 'Clínica E2E A', p_nome: 'Admin A' },
});
ok(rpcA.status === 200, 'RPC criar_empresa_e_admin respondeu', `status ${rpcA.status}`);

const perfilA = await api(
  '/rest/v1/usuarios?select=nome,papel,empresa:empresas(nome,status,trial_ate,assentos)',
  { token: tokenA },
);
const uA = perfilA.dados?.[0];
ok(uA?.papel === 'admin', 'quem cadastrou virou admin');
ok(uA?.empresa?.status === 'trial', 'empresa começa em teste grátis');
const dias = uA?.empresa?.trial_ate
  ? Math.ceil((new Date(uA.empresa.trial_ate) - Date.now()) / 86400000) : null;
ok(dias >= 13 && dias <= 14, 'trial de 14 dias', `${dias} dia(s)`);

console.log('\n2. Acervo da empresa A');
const pasta = await api('/rest/v1/pastas', {
  token: tokenA, metodo: 'POST',
  corpo: { empresa_id: uA.empresa_id ?? undefined, nome: 'LEAD FACETA', cor: '#ec4899' },
});
// empresa_id vem do perfil; refaz buscando o id
const { dados: [meu] } = await api('/rest/v1/usuarios?select=empresa_id', { token: tokenA });
if (pasta.status >= 400) {
  const p2 = await api('/rest/v1/pastas', {
    token: tokenA, metodo: 'POST', corpo: { empresa_id: meu.empresa_id, nome: 'LEAD FACETA', cor: '#ec4899' },
  });
  ok(p2.status < 300, 'admin cria pasta da empresa', `status ${p2.status}`);
} else {
  ok(true, 'admin cria pasta da empresa');
}
const pastasA = await api('/rest/v1/pastas?select=nome', { token: tokenA });
ok(pastasA.dados?.length === 1, 'empresa A enxerga a própria pasta', `${pastasA.dados?.length} registro(s)`);

console.log('\n3. Isolamento em produção');
const tokenB = await criarUsuarioTeste(`e2e-${marca}-b@${DOMINIO}`);
await api('/rest/v1/rpc/criar_empresa_e_admin', {
  token: tokenB, metodo: 'POST', corpo: { p_empresa: 'Clínica E2E B', p_nome: 'Admin B' },
});
const pastasB = await api('/rest/v1/pastas?select=nome', { token: tokenB });
ok(pastasB.dados?.length === 0, 'empresa B NÃO vê a pasta da empresa A', `${pastasB.dados?.length} registro(s)`);

const invasao = await api('/rest/v1/pastas', {
  token: tokenB, metodo: 'POST', corpo: { empresa_id: meu.empresa_id, nome: 'invasora' },
});
ok(invasao.status >= 400, 'empresa B não grava dado da empresa A', `status ${invasao.status}`);

console.log('\n4. Sem login');
const anon = await api('/rest/v1/pastas?select=nome');
ok(anon.status >= 400 || anon.dados?.length === 0, 'anônimo não lê nada', `status ${anon.status}`);
const rpcAnon = await api('/rest/v1/rpc/criar_empresa_e_admin', {
  metodo: 'POST', corpo: { p_empresa: 'x', p_nome: 'y' },
});
ok(rpcAnon.status >= 400, 'anônimo não executa a RPC de cadastro', `status ${rpcAnon.status}`);

console.log(falhas === 0 ? '\n✅ tudo certo\n' : `\n❌ ${falhas} verificação(ões) falharam\n`);
process.exitCode = falhas ? 1 : 0;
