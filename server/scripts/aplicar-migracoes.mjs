#!/usr/bin/env node
// Aplica os SQLs de sql/ na ordem, contra o banco apontado por DATABASE_URL
// (ou pelas variáveis padrão PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT).
//
//   DATABASE_URL='postgresql://...' node scripts/aplicar-migracoes.mjs
//
// Nenhuma credencial é gravada em arquivo.

import pg from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dirSql = join(dirname(fileURLToPath(import.meta.url)), '..', 'sql');

const cliente = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // certificado gerenciado pelo Supabase
});

await cliente.connect();
const { rows: [info] } = await cliente.query('select current_database() db, version()');
console.log(`conectado em ${info.db} — ${info.version.split(',')[0]}`);

for (const arquivo of (await readdir(dirSql)).filter((f) => f.endsWith('.sql')).sort()) {
  process.stdout.write(`aplicando ${arquivo} … `);
  try {
    await cliente.query(await readFile(join(dirSql, arquivo), 'utf8'));
    console.log('ok');
  } catch (e) {
    console.log('FALHOU');
    console.error(`  ${e.message}`);
    process.exitCode = 1;
    break;
  }
}

const { rows: tabelas } = await cliente.query(`
  select tablename, rowsecurity from pg_tables
   where schemaname = 'public' order by tablename`);
console.log('\ntabela'.padEnd(20), 'RLS');
for (const t of tabelas) console.log(t.tablename.padEnd(20), t.rowsecurity ? 'ativa' : '*** DESLIGADA ***');

await cliente.end();
