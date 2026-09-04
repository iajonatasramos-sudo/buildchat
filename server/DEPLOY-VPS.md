# Subir o Supabase do BuildChat na sua VPS

O Supabase auto-hospedado **não tem "projetos"**: cada stack é um projeto só. Para o
BuildChat (produto vendido a terceiros), sobe-se um **segundo stack isolado** — banco,
auth, storage e segredos próprios.

> **Por que não reaproveitar o stack atual:** os usuários das clínicas ficariam na mesma
> tabela `auth.users` dos seus outros sistemas e, com o mesmo `JWT_SECRET`, um token
> emitido para outro sistema seria aceito aqui. Isolamento é requisito, não capricho.

Custo: ~1,5–2 GB de RAM a mais. Confira com `free -h` antes de começar.

---

## 1. Clonar o stack

```bash
# na VPS — ajuste o caminho de origem para onde está o seu stack atual
cp -r /opt/supabase /opt/supabase-buildchat
cd /opt/supabase-buildchat

# CRÍTICO: zerar os dados clonados, senão o BuildChat nasce com o banco do outro sistema
rm -rf files/volumes/db/data/*
rm -rf files/volumes/storage/*
```

## 2. Separar o stack do outro

No `docker/docker-compose.yml` do clone:

```yaml
name: supabase-buildchat        # era "supabase" — sem isso o Compose mistura os dois
```

E no serviço `supavisor`, mude **apenas as portas do host** (o lado interno continua 5432/6543):

```yaml
    ports:
      - 5433:5432
      - 6544:6543
```

## 3. Gerar segredos novos

No seu Mac, dentro de `server/`:

```bash
node scripts/gerar-chaves.mjs
```

Copie a saída para o `.env` do clone, substituindo os valores existentes:
`POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`, `SECRET_KEY_BASE`,
`VAULT_ENC_KEY`, `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD`, `LOGFLARE_API_KEY`,
`POOLER_TENANT_ID`.

> `ANON_KEY` e `SERVICE_ROLE_KEY` são JWTs assinados com o `JWT_SECRET` gerado junto —
> os três andam sempre em conjunto. Reaproveitar chave antiga com segredo novo quebra tudo.

## 4. Ajustar o resto do `.env`

```ini
CONTAINER_PREFIX=supabase-buildchat
STUDIO_DEFAULT_ORGANIZATION=BuildChat
STUDIO_DEFAULT_PROJECT=BuildChat

SUPABASE_PUBLIC_URL=https://api.seudominio.com.br
API_EXTERNAL_URL=https://api.seudominio.com.br
SITE_URL=https://app.seudominio.com.br
SUPABASE_HOST=api.seudominio.com.br

# a extensão precisa estar na allow list de redirect
ADDITIONAL_REDIRECT_URLS=chrome-extension://<ID_DA_EXTENSAO>/*

# cadastro por e-mail/senha, sem anônimo
DISABLE_SIGNUP=false
ENABLE_EMAIL_SIGNUP=true
ENABLE_ANONYMOUS_USERS=false
ENABLE_PHONE_SIGNUP=false
ENABLE_EMAIL_AUTOCONFIRM=true   # troque para false quando o SMTP estiver configurado
```

Configure também `SMTP_*` — sem isso não há recuperação de senha nem confirmação de e-mail.

## 5. Publicar o subdomínio

O `kong` não expõe portas (só `expose`), então quem publica é o seu proxy reverso.
Aponte `api.seudominio.com.br` para o container **kong do novo stack**, porta 8000.

- **Traefik**: adicione as labels de router/service no serviço `kong` do clone, com um
  `Host()` diferente do stack atual.
- **Nginx**: `proxy_pass http://supabase-buildchat-kong:8000;` — o Nginx precisa estar na
  mesma rede Docker do novo stack (`docker network connect`).

## 6. Subir

```bash
cd /opt/supabase-buildchat/docker
docker compose up -d
docker compose ps        # todos healthy?
```

## 7. Aplicar as migrações

Pelo Studio novo (SQL Editor), na ordem, ou direto no container:

```bash
cd /caminho/do/BuildChat2/server
for f in sql/0001_schema.sql sql/0002_rls.sql sql/0003_supabase_auth.sql; do
  docker exec -i supabase-buildchat-db psql -U postgres -d postgres < "$f"
done
```

Verifique que a RLS está ativa:

```sql
select tablename, rowsecurity from pg_tables
 where schemaname = 'public' order by tablename;
-- rowsecurity deve ser true em TODAS
```

## 8. Anotar as credenciais da extensão

```ini
SUPABASE_URL=https://api.seudominio.com.br
SUPABASE_ANON_KEY=<ANON_KEY gerado no passo 3>
```

Só esses dois vão para o bundle da extensão. **A `SERVICE_ROLE_KEY` nunca sai do servidor** —
ela ignora toda a RLS.

---

## Checklist antes de considerar pronto

- [ ] `docker compose ps` sem nenhum container reiniciando
- [ ] Studio novo abre no subdomínio e pede a senha do `DASHBOARD_*`
- [ ] `rowsecurity = true` em todas as tabelas de `public`
- [ ] Cadastro de teste cria empresa (`select app.criar_empresa_e_admin('Teste','Eu')`)
- [ ] Backup automático do volume `files/volumes/db/data` configurado
- [ ] Segredos guardados fora da VPS (gerenciador de senhas)

## Se a RAM apertar

O stack completo inclui `analytics` (Logflare) e `vector`, que só servem para os logs do
Studio e consomem bastante. Dá para removê-los, mas **vários serviços declaram
`depends_on: analytics (service_healthy)`** — é preciso remover essas dependências junto,
senão nada sobe. Faça isso só se precisar; comece com o stack inteiro.
