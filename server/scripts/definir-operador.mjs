#!/usr/bin/env node
// Cadastra (ou remove) um gestor do sistema pelo e-mail da conta.
//
//   DATABASE_URL='...' node scripts/definir-operador.mjs email@dominio "Nome"
//   DATABASE_URL='...' node scripts/definir-operador.mjs --remover email@dominio

import pg from 'pg';

const remover = process.argv[2] === '--remover';
const email = (remover ? process.argv[3] : process.argv[2])?.toLowerCase();
const nome = process.argv[4] ?? 'Gestor';
if (!email) throw new Error('informe o e-mail da conta');

const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();

const { rows: [u] } = await c.query(`select id from auth.users where lower(email) = $1`, [email]);
if (!u) {
  console.error(`Nenhuma conta com o e-mail ${email}. Crie a conta primeiro (pelo painel ou pela extensão).`);
  process.exit(1);
}

if (remover) {
  await c.query(`delete from sistema_operadores where usuario_auth_id = $1`, [u.id]);
  console.log(`${email} não é mais gestor do sistema.`);
} else {
  await c.query(
    `insert into sistema_operadores (usuario_auth_id, nome) values ($1, $2)
     on conflict (usuario_auth_id) do update set nome = excluded.nome`, [u.id, nome]);
  console.log(`${email} agora é gestor do sistema.`);
}

const { rows } = await c.query(
  `select o.nome, u.email from sistema_operadores o join auth.users u on u.id = o.usuario_auth_id`);
console.table(rows);
await c.end();
