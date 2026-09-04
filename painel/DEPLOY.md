# Publicar o painel

O único componente que precisa de hospedagem é este painel. O Supabase já está na
nuvem e a extensão roda no navegador de cada usuário.

Escolha **um** dos caminhos.

---

## Caminho A — Vercel (recomendado para começar)

Grátis, HTTPS automático, sobe em minutos e não exige manutenção.

```bash
cd painel
npx vercel@latest login
npx vercel@latest        # primeira vez: cria o projeto (Framework: Next.js)
npx vercel@latest --prod # publica em produção
```

Na primeira publicação a Vercel pergunta as variáveis de ambiente — informe:

| Variável | Valor |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jlzgnshwzlpnaaksozur.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | a chave `sb_publishable_…` |

> As duas são públicas por natureza (vão no bundle). A `service_role` **nunca** entra aqui.

Depois, em **Settings → Domains**, aponte seu domínio (ex.: `painel.seudominio.com.br`).

---

## Caminho B — Sua VPS com Dokploy (o seu caso)

No Dokploy, dentro do projeto **BuildChat / production**:

1. **Create Service → Application** (não use *Compose*: é para pilhas com vários
   contêineres, e as labels de Traefik do nosso `docker-compose.yml` conflitariam com as
   que o próprio Dokploy gerencia).
2. **Source**: escolha **GitHub** (recomendado — cada `git push` republica) ou **Drop**,
   enviando um zip da pasta `painel/` para subir sem repositório.
3. **Build Type**: **Dockerfile**, caminho `./Dockerfile`.
   O Dockerfile já traz as chaves públicas como valores padrão, então o build funciona sem
   configurar variáveis. Para outro ambiente, sobrescreva em *Build Args*.
4. **Domains**: adicione `painel.seudominio.com.br`, **Container Port `3100`**, HTTPS com
   Let's Encrypt.
5. **Deploy**. Acompanhe em *Logs*; a primeira imagem leva ~2 minutos.

> Se optar por *Drop*, envie apenas a pasta `painel/` (o `.dockerignore` já exclui
> `node_modules` e `.next`).

## Caminho C — Docker Compose manual (sem Dokploy)

Use se preferir manter tudo na sua infraestrutura. Consome ~150 MB de RAM.

```bash
# na VPS, dentro da pasta do projeto
cat > .env <<'EOF'
NEXT_PUBLIC_SUPABASE_URL=https://jlzgnshwzlpnaaksozur.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
EOF

docker compose up -d --build
docker compose logs -f painel
```

O `docker-compose.yml` já traz as labels do **Traefik**. Se você usa Nginx, remova as
labels e publique a porta (`ports: ["3100:3100"]`), apontando o `proxy_pass` para ela.

O `Dockerfile` usa o modo *standalone* do Next: a imagem final fica pequena e roda como
usuário sem privilégios.

---

## Depois de publicar (vale para os dois caminhos)

1. **Supabase → Authentication → URL Configuration**
   - *Site URL*: a URL do painel (ex.: `https://painel.seudominio.com.br`)
   - *Redirect URLs*: a mesma URL — necessária para o link de **recuperação de senha**
     funcionar. Sem isso, "esqueci minha senha" leva para o lugar errado.
2. **SMTP próprio** (Resend/SendGrid) em *Authentication → Emails* — o servidor de e-mail
   embutido do Supabase limita a poucos envios por hora e não serve para produção.
3. Teste o fluxo real: entrar, criar um usuário, sair, entrar com o usuário criado.

## O que ainda não é publicado

- **A extensão** continua instalada "sem compactação" em cada máquina. Publicar na Chrome
  Web Store é a Fase 7 e depende do nome/marca definitivos.
- **Cobrança** (Fase 6) precisa da escolha do gateway; enquanto isso a tela de assinatura
  mostra a situação real da conta mas não cobra.
