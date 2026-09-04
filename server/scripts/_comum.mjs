// Utilidades compartilhadas pelos testes contra o projeto real.
import pg from 'pg';

export const URL_BASE = process.env.SUPABASE_URL;
export const KEY = process.env.SUPABASE_KEY;
export const SENHA = 'SenhaTeste123!';

export async function api(caminho, { token, metodo = 'GET', corpo, prefer } = {}) {
  const r = await fetch(`${URL_BASE}${caminho}`, {
    method: metodo,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token ?? KEY}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await r.text();
  return { status: r.status, dados: texto ? JSON.parse(texto) : null };
}

async function comBanco(fn) {
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

/** Cria só o acesso (auth.users + identity), sem vincular a nenhuma empresa. */
export async function criarAcesso(email) {
  return comBanco(async (c) => {
    const { rows: [u] } = await c.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at,
                               raw_app_meta_data, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
               'authenticated', $1, extensions.crypt($2, extensions.gen_salt('bf')),
               now(), now(), now(),
               '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
       returning id`, [email, SENHA]);
    await c.query(
      `update auth.users set confirmation_token='', recovery_token='', email_change='',
              email_change_token_new='', email_change_token_current='', phone_change='',
              phone_change_token='', reauthentication_token='' where id=$1`, [u.id]);
    await c.query(
      `insert into auth.identities (provider_id, user_id, identity_data, provider,
                                    last_sign_in_at, created_at, updated_at)
       values ($1::text, $2::uuid, jsonb_build_object('sub', $1::text, 'email', $3::text),
               'email', now(), now(), now())`, [u.id, u.id, email]);
    return u.id;
  });
}

/** Cria a conta direto no banco (evita o limite de e-mails) e faz login real. */
export async function criarUsuarioTeste(email) {
  await comBanco(async (c) => {
    const { rows: [u] } = await c.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at,
                               raw_app_meta_data, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
               'authenticated', $1, extensions.crypt($2, extensions.gen_salt('bf')),
               now(), now(), now(),
               '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
       returning id`, [email, SENHA]);
    // O GoTrue lê estas colunas como string: NULL quebra o login.
    await c.query(
      `update auth.users set confirmation_token='', recovery_token='', email_change='',
              email_change_token_new='', email_change_token_current='', phone_change='',
              phone_change_token='', reauthentication_token='' where id=$1`, [u.id]);
    await c.query(
      `insert into auth.identities (provider_id, user_id, identity_data, provider,
                                    last_sign_in_at, created_at, updated_at)
       values ($1::text, $2::uuid, jsonb_build_object('sub', $1::text, 'email', $3::text),
               'email', now(), now(), now())`, [u.id, u.id, email]);
  });
  const login = await api('/auth/v1/token?grant_type=password', {
    metodo: 'POST', corpo: { email, password: SENHA },
  });
  if (!login.dados?.access_token) throw new Error(`login falhou: ${JSON.stringify(login.dados).slice(0, 160)}`);
  return login.dados.access_token;
}

export function verificador() {
  let falhas = 0;
  return {
    ok(cond, msg, extra = '') {
      console.log(`${cond ? '  ✔' : '  ✖'} ${msg}${extra ? ` — ${extra}` : ''}`);
      if (!cond) falhas++;
    },
    fim() {
      console.log(falhas === 0 ? '\n✅ tudo certo\n' : `\n❌ ${falhas} falha(s)\n`);
      process.exitCode = falhas ? 1 : 0;
    },
  };
}
