#!/usr/bin/env node
// Gera os segredos de um stack Supabase auto-hospedado novo (JWT_SECRET,
// ANON_KEY, SERVICE_ROLE_KEY e senhas). Sem dependências.
//
//   node scripts/gerar-chaves.mjs            # 10 anos de validade
//   node scripts/gerar-chaves.mjs --anos 5

import { createHmac, randomBytes } from 'node:crypto';

const anos = Number(process.argv[process.argv.indexOf('--anos') + 1]) || 10;

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function jwt(payload, segredo) {
  const cabecalho = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const corpo = b64url(JSON.stringify(payload));
  const assinatura = b64url(createHmac('sha256', segredo).update(`${cabecalho}.${corpo}`).digest());
  return `${cabecalho}.${corpo}.${assinatura}`;
}

// Segredos alfanuméricos (sem símbolos, para não quebrar o .env do compose)
const senha = (n) => randomBytes(n * 2).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, n);

const JWT_SECRET = senha(48); // o self-host exige >= 32
const iat = Math.floor(Date.now() / 1000);
const exp = iat + anos * 365 * 24 * 3600;

const chaves = {
  POSTGRES_PASSWORD: senha(32),
  JWT_SECRET,
  ANON_KEY: jwt({ role: 'anon', iss: 'supabase', iat, exp }, JWT_SECRET),
  SERVICE_ROLE_KEY: jwt({ role: 'service_role', iss: 'supabase', iat, exp }, JWT_SECRET),
  SECRET_KEY_BASE: senha(64),
  VAULT_ENC_KEY: senha(32),
  DASHBOARD_USERNAME: 'buildchat',
  DASHBOARD_PASSWORD: senha(24),
  LOGFLARE_API_KEY: senha(32),
  POOLER_TENANT_ID: 'buildchat',
};

console.log(`# Segredos do stack BuildChat — ${new Date().toISOString().slice(0, 10)}`);
console.log(`# Chaves válidas até ${new Date(exp * 1000).toISOString().slice(0, 10)}. GUARDE EM LOCAL SEGURO.\n`);
for (const [k, v] of Object.entries(chaves)) console.log(`${k}=${v}`);
console.log(`
# Confira: as chaves abaixo devem bater com o JWT_SECRET acima.
# node -e "console.log(JSON.parse(Buffer.from(process.argv[1].split('.')[1],'base64url')))" <ANON_KEY>`);
