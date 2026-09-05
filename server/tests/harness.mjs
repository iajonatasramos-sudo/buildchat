// Sobe um Postgres real (PGlite/WASM) com o schema + RLS aplicados e um
// substituto local de `auth.uid()` — no Supabase essa função já existe, então
// o shim abaixo NÃO faz parte das migrações.

import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

const SHIM = `
  create schema if not exists auth;
  -- Equivalente mínimo de auth.users (no Supabase, é o Auth quem mantém).
  create table if not exists auth.users (
    id    uuid primary key default gen_random_uuid(),
    email text unique
  );
  -- Igual ao Supabase: lê o "sub" do JWT da sessão.
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  -- Papéis que o Supabase cria por padrão.
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin;   -- existe no Supabase; usado nos revokes
    end if;
  end $$;
  -- No Supabase estes grants já existem por padrão.
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
`;

export async function criarBanco() {
  const db = new PGlite();
  await db.exec(SHIM);
  // Aplica TODAS as migrações em ordem — assim um arquivo novo entra nos
  // testes sem ninguém precisar lembrar de registrá-lo aqui.
  // (0004 é do Storage: depende de tabelas que só existem no Supabase.)
  const arquivos = (await readdir(join(raiz, 'sql')))
    .filter((f) => f.endsWith('.sql') && !f.startsWith('0004'))
    .sort();
  for (const f of arquivos) {
    await db.exec(await readFile(join(raiz, 'sql', f), 'utf8'));
  }

  return {
    db,
    /** Executa como o usuário autenticado informado (RLS ativa). */
    async como(usuarioId, sql, params) {
      await db.exec(`set role authenticated;`);
      await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuarioId]);
      try {
        return await db.query(sql, params);
      } finally {
        await db.exec('reset role;');
      }
    },
    /** Executa como o servidor (superusuário — ignora RLS). Só para semear dados. */
    servidor(sql, params) {
      return db.query(sql, params);
    },
    fechar: () => db.close(),
  };
}

/** Cria uma empresa com um admin e um usuário comum. */
export async function semearEmpresa(h, nome) {
  const { rows: [empresa] } = await h.servidor(
    `insert into empresas (nome) values ($1) returning id`, [nome]);
  const criar = async (papel, email) => {
    const id = await criarAuthUser(h, email);
    await h.servidor(
      `insert into usuarios (id, empresa_id, nome, email, papel) values ($1, $2, $3, $4, $5)`,
      [id, empresa.id, `${papel} ${nome}`, email, papel]);
    return id;
  };
  return {
    id: empresa.id,
    admin: await criar('admin', `admin@${nome}.com`),
    usuario: await criar('usuario', `user@${nome}.com`),
  };
}

/** Simula um cadastro no Supabase Auth (ainda sem empresa). */
export async function criarAuthUser(h, email) {
  const { rows: [u] } = await h.servidor(
    `insert into auth.users (email) values ($1) returning id`, [email]);
  return u.id;
}
