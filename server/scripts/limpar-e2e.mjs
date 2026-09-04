#!/usr/bin/env node
// Remove tudo que o teste de ponta a ponta criou (contas e2e-* e as empresas
// "Clínica E2E"). Não toca em dados reais.
//
//   DATABASE_URL='postgresql://...' node scripts/limpar-e2e.mjs

import pg from 'pg';

const c = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

const empresas = await c.query(`delete from public.empresas where nome like 'Clínica E2E%' returning nome`);
const usuarios = await c.query(`delete from auth.users where email like 'e2e-%' returning email`);

console.log(`empresas removidas: ${empresas.rowCount}`);
console.log(`contas de teste removidas: ${usuarios.rowCount}`);

const { rows: [resta] } = await c.query(`
  select (select count(*) from public.empresas)::int empresas,
         (select count(*) from auth.users)::int contas`);
console.log(`sobraram: ${resta.empresas} empresa(s), ${resta.contas} conta(s)`);
await c.end();
