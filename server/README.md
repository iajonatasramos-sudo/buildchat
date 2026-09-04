# BuildChat — servidor (Fase 0)

Schema multiempresa, políticas de RLS e a suíte que prova o isolamento entre empresas.
Não há aplicação aqui ainda: esta fase entrega **o banco e a garantia de que ele isola**.

## Rodar os testes

```bash
npm install
npm test
```

Os testes sobem um **Postgres 16 real via WASM** (PGlite) — sem Docker, sem servidor.
Cada teste executa como o papel `authenticated`, com o `sub` do JWT na sessão, exatamente
como o Supabase faz. Ou seja: as políticas são exercitadas de verdade, não simuladas.

## Aplicar num projeto Supabase

**Auto-hospedado na sua VPS?** Siga o [DEPLOY-VPS.md](DEPLOY-VPS.md) — lá está o passo a
passo para subir um stack isolado (o self-host não tem "projetos").

Na nuvem da Supabase:

1. Crie o projeto em <https://supabase.com> (região São Paulo).
2. No **SQL Editor**, rode os arquivos **na ordem**:
   - `sql/0001_schema.sql` — tabelas, índices e `atualizado_em` automático
   - `sql/0002_rls.sql` — RLS, políticas e privilégios
   - `sql/0003_supabase_auth.sql` — vínculo com `auth.users` + onboarding
3. Em **Authentication → Providers**, deixe apenas e-mail/senha; desligue signups
   anônimos.
4. Guarde `SUPABASE_URL` e `SUPABASE_ANON_KEY` (ver `.env.example`). A extensão usa só
   a anon key — a `service_role` **nunca** sai do servidor.

> O `auth.uid()` usado nas políticas já existe no Supabase. O harness de teste cria um
> equivalente local (`tests/harness.mjs`); ele **não** faz parte das migrações.

## O que as políticas garantem

| Regra | Onde é testada |
|---|---|
| Empresa A não lê, altera nem apaga nada da empresa B | `tests/isolamento.test.mjs` |
| Registro `pessoal` só aparece para o dono | idem |
| Só admin publica mensagem/pasta da empresa | idem |
| Vínculo de pasta e anotação são de toda a empresa (por número) | idem |
| Preferências são privadas de cada usuário | idem |
| Usuário inativo ou sem empresa não lê nada | idem |
| Cadastro cria empresa em teste grátis e admin | `tests/onboarding.test.mjs` |
| Convite respeita papel, validade e limite de assentos | idem |

## Scripts

| Comando | Para quê |
|---|---|
| `npm test` | 19 testes de RLS em Postgres real (PGlite) — **rode antes de qualquer deploy** |
| `DATABASE_URL=… node scripts/aplicar-migracoes.mjs` | aplica os SQLs na ordem e lista o estado da RLS |
| `SUPABASE_URL=… SUPABASE_KEY=… DATABASE_URL=… node scripts/teste-e2e.mjs` | cadastro, empresa, acervo e isolamento **contra o projeto real** |
| `DATABASE_URL=… node scripts/limpar-e2e.mjs` | apaga o que o teste e2e criou |
| `node scripts/gerar-chaves.mjs` | segredos para um stack auto-hospedado |

Nenhum script grava credencial em arquivo — tudo por variável de ambiente.

## Estrutura

```
sql/0001_schema.sql          tabelas do produto
sql/0002_rls.sql             RLS + funções app.* + grants
sql/0003_supabase_auth.sql   FK com auth.users + criar_empresa_e_admin + aceitar_convite
tests/harness.mjs            PGlite + shim de auth + helpers (como/servidor)
tests/isolamento.test.mjs    isolamento entre empresas e escopos
tests/onboarding.test.mjs    cadastro, convite e assentos
```

## Estado atual

Projeto **BuildChat** no Supabase Cloud com as três migrações aplicadas, RLS ativa nas 10
tabelas e o teste de ponta a ponta passando (cadastro → empresa em trial → acervo →
isolamento entre empresas → bloqueio do anônimo).

**Pendente de configuração no painel do Supabase:** SMTP próprio. O SMTP embutido limita
os cadastros a poucos por hora (`over_email_send_rate_limit`) e não serve para produção.

## Próximo passo (Fase 1)

Login na extensão: `supabase-js` no bundle, sessão em `chrome.storage`, `key` fixa no
manifest e leitura do status da assinatura. Ver `../PLANEJAMENTO-SERVIDOR.md`.
