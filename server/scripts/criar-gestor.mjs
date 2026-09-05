#!/usr/bin/env node
// Cria (ou atualiza) a conta de um gestor do sistema e a registra como operador.
// A conta nasce sem clínica: o gestor administra assinaturas, não atende.
//
//   DATABASE_URL='...' node scripts/criar-gestor.mjs email@dominio 'senha' "Nome"

import pg from 'pg';

const [email, senha, nome = 'Gestor'] = process.argv.slice(2);
if (!email || !senha) throw new Error('uso: criar-gestor.mjs <email> <senha> [nome]');
if (senha.length < 8) throw new Error('use uma senha com pelo menos 8 caracteres');

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

let { rows: [u] } = await c.query(`select id from auth.users where lower(email) = lower($1)`, [email]);

if (u) {
  await c.query(
    `update auth.users
        set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf')),
            email_confirmed_at = coalesce(email_confirmed_at, now()),
            updated_at = now()
      where id = $1`, [u.id, senha]);
  console.log(`Conta já existia — senha atualizada: ${email}`);
} else {
  ({ rows: [u] } = await c.query(
    `insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                             email_confirmed_at, created_at, updated_at,
                             raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
             'authenticated', lower($1), extensions.crypt($2, extensions.gen_salt('bf')),
             now(), now(), now(),
             '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
     returning id`, [email, senha]));
  // O GoTrue lê estas colunas como texto: NULL quebra o login.
  await c.query(
    `update auth.users set confirmation_token='', recovery_token='', email_change='',
            email_change_token_new='', email_change_token_current='', phone_change='',
            phone_change_token='', reauthentication_token='' where id=$1`, [u.id]);
  await c.query(
    `insert into auth.identities (provider_id, user_id, identity_data, provider,
                                  last_sign_in_at, created_at, updated_at)
     values ($1::text, $2::uuid, jsonb_build_object('sub', $1::text, 'email', $3::text),
             'email', now(), now(), now())`, [u.id, u.id, email.toLowerCase()]);
  console.log(`Conta criada: ${email}`);
}

await c.query(
  `insert into sistema_operadores (usuario_auth_id, nome) values ($1, $2)
   on conflict (usuario_auth_id) do update set nome = excluded.nome`, [u.id, nome]);

const { rows } = await c.query(
  `select o.nome, u.email, u.email_confirmed_at is not null as confirmada
     from sistema_operadores o join auth.users u on u.id = o.usuario_auth_id`);
console.table(rows);
await c.end();
