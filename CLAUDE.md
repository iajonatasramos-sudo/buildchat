# BuildChat — guia do projeto

Extensão Chrome (Manifest V3) que adiciona mensagens rápidas, pastas/etiquetas, anotações e
CRM leve ao **WhatsApp Web**. Reescrita independente inspirada no Dental Chat (WaScript),
com a UI portada do **Saleschat/BuildClinic**. Hoje é 100% local; está evoluindo para um
**produto SaaS multiempresa** — ver [PLANEJAMENTO-SERVIDOR.md](PLANEJAMENTO-SERVIDOR.md).

## Comandos

```bash
npm run build     # gera dist/ (é a pasta que se carrega no Chrome)
npm run dev       # rebuild automático (recarregar a extensão e a aba após cada build)
npx tsc --noEmit  # checagem de tipos (rodar sempre antes de dar por pronto)
```

Instalar: `chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação** → `dist/`.
Depois de todo build: recarregar a extensão (↻) **e** a aba do WhatsApp Web.

## Arquitetura

```
public/
  manifest.json           MV3. Dois content scripts: o loader (ISOLATED) e
                          vendor/wppconnect-wa.js + assets/wa-bridge.js em world MAIN
  content-loader.js       importa o bundle ES (content scripts não aceitam módulo)
  vendor/wppconnect-wa.js WPP (wa-js) — copiado do node_modules pelo script `prebuild`
  seed/                   dados iniciais (respostas + mídias e vínculos do Dental Chat)
src/
  content/main.tsx        monta as raízes React em shadow DOM; injeta CSS no #app;
                          insere o ⚡ no compose e a barra no header; tema
  page/wa-bridge.ts       roda no contexto da PÁGINA: RPC por postMessage sobre window.WPP
  background/index.ts     service worker (webhook)
  lib/wa.ts               ponte + seletores de DOM do WhatsApp + envio (WPP e fallback)
  lib/db.ts               chrome.storage (fonte da verdade hoje)
  lib/store.ts            mini pub/sub compartilhado entre as raízes React
  lib/types.ts            tipos + variáveis das mensagens
  ui/                     TopBar, HeaderBar, HeaderMenus, MensagensRapidas, PastaPanel,
                          Anotacoes, QuickPicker, App, toast
  styles/tokens.css       tokens do BuildClinic + temas + zoom + classes .bc-cat-*
```

**Quatro raízes React**, cada uma em seu shadow root (CSS isolado do WhatsApp):
`#buildchat2-root` (overlay: gaveta, menus, modais, picker), `#buildchat2-topbar` (barra do
topo), `#buildchat2-headerbar` (barra no cabeçalho da conversa) e o ⚡ do compose, que é um
`<button>` puro no DOM do WhatsApp (não é React).

## Regras que não podem ser esquecidas

1. **ZOOM = 1.25.** A interface é ampliada por `zoom` no `.bc-root`. Toda coordenada lida do
   DOM do WhatsApp (`getBoundingClientRect`, `innerWidth`…) precisa passar por `emPx()` de
   `src/lib/utils.ts` antes de virar `left`/`top`, senão aparece deslocada 25%.
   O contrário também vale: medida interna comparada com px real precisa de `* ZOOM`.
2. **Envio**: sempre tentar WPP primeiro e cair no DOM. No fallback de texto, o editor do
   WhatsApp (Lexical) é assíncrono — limpar, **colar** (`ClipboardEvent`), esperar, e só
   então conferir; verificar o conteúdo logo depois duplica a mensagem.
3. **Mídia**: forçar o mime do data URL (`forcarMime`) — o Chrome serve `.ogg` da extensão
   como `video/ogg` e o WPP recusa. Áudio vai como PTT com waveform.
4. **Layout**: o `#app` do WhatsApp é `position:absolute` com altura em px via JS. O ajuste
   (topo pela barra e largura pela gaveta) é feito com `!important` no estilo injetado em
   `montarTopBar()`. `ALTURA_TOPBAR` é a altura **visual**; o conteúdo usa `emPx(...)`.
5. **Seletores do WhatsApp mudam.** Todos ficam centralizados em `DOM` (`src/lib/wa.ts`) e
   nos `garantir()` do `main.tsx`, sempre com fallback e MutationObserver — o WhatsApp
   remonta header e footer a cada troca de conversa.
6. **Temas**: `data-tema` no `.bc-root` (`light` implícito, `dim` = gray, `dark`). Cores só
   por token (`--surface`, `--text`…) e `color-mix` para tingir com a cor da pasta — nunca
   fixar cinza/branco literal, senão quebra em um dos três temas.
7. **Utilitários visuais** (em `tokens.css`): `.bc-seg` (controle segmentado das abas e
   filtros), `.bc-elev` / `.bc-elev-hover` (elevação e realce no hover) e `.bc-cat-*`
   (caixa translúcida da categoria). Use-os em vez de recriar sombras/pílulas na mão.
8. **Nada do Dental Chat**: nenhum código, marca ou asset dele. O wa-js é open source; a UI
   vem do BuildClinic. Dados extraídos do storage local do usuário são **dele**.
9. **Idioma**: código, comentários e UI em português (nomes de variáveis inclusive).

## Chaves do chrome.storage

| Chave | Conteúdo |
|---|---|
| `bc2_categorias`, `bc2_respostas` | mensagens rápidas (categoria + resposta com ações) |
| `bc2_tags` | pastas/etiquetas (nome, cor) |
| `bc2_contact_tags` | vínculo conversa → pastas (`Record<chatId, tagId[]>`) |
| `bc2_notes` | anotações por conversa |
| `bc2_settings` | webhook, caractere de atalho, tema |
| `bc2_msg_cache`, `bc2_apagadas` | anti-revoke (mensagens capturadas e apagadas) |
| `media:<id>` | mídia enviada pelo usuário (dataURL) |
| `bc2_seeded`, `bc2_seeded_vinculos` | controle das importações iniciais |

## Estado atual (funciona hoje)

Mensagens rápidas com sequência de ações (texto/imagem/áudio/vídeo/documento, delay e
variáveis), picker `/` no compose, pastas com filtro de conversas, barra de funções no
cabeçalho (pastas com badge, filtro, anotações com badge, apagadas, fixar), anotações com
copiar/editar/deletar, três temas, webhook e importação dos dados do Dental Chat
(23 pastas, 188 vínculos, respostas com mídia).

## Conta e servidor (Fase 1 — em andamento)

`src/lib/config.ts` guarda `SUPABASE_URL` e `SUPABASE_ANON_KEY`. **Enquanto tiverem os
valores de exemplo, a extensão roda 100% local** e o botão "Entrar" nem aparece —
`servidorConfigurado()` é o interruptor.

- `src/lib/auth.ts` — cliente Supabase com a sessão em `chrome.storage` (nunca
  `localStorage`: o da página é do WhatsApp), login, cadastro (RPC
  `criar_empresa_e_admin`), convite, perfil e `avaliarLicenca()`.
- `src/ui/Conta.tsx` — botão de conta na barra do topo + modal entrar/criar conta.
- Licença tem **tolerância offline de 7 dias** (perfil em cache): sem rede o atendente
  não pode ficar travado.

## Sincronização (`src/lib/sync.ts`) — Fase 2

Offline-first. Toda alteração é aplicada no `chrome.storage` na hora e enfileirada numa
**outbox**; o envio vem depois, com repetição. Leitura incremental por `atualizado_em`,
exclusão lógica por `deleted_at`, e vínculo pasta↔conversa por **número conectado**
(`wa_number`) — compartilhado entre quem atende o mesmo WhatsApp.

- Mutações que enfileiram: `criarTag`, `alternarTagContato`, `aplicarTagContato` (em `db.ts`).
- **Adoção**: na primeira sincronização o acervo local é assumido pela conta — pastas casam
  por nome, as que faltam são criadas e os ids locais viram os uuid do servidor
  (`remapearTagIds`). Por isso `criarTag` já nasce com `crypto.randomUUID()`.
- Estado na barra do topo: nuvem verde (ok), girando (sincronizando), riscada (sem rede),
  escudo (assinatura pendente). Sem conta, o ícone não aparece.
- Sincroniza: pastas, vínculos, categorias, respostas (com a sequência de ações),
  **mídia das respostas** (bucket `midias`, caminho `<empresa_id>/<arquivo>`, cache local
  por `midia_cache:<path>`), anotações e preferências.
- Registros nascem no escopo da empresa quando o autor é **admin**; senão, pessoais.
- Contrato validado por `server/scripts/teste-sync.mjs` e `teste-mensagens.mjs`.
- **PostgREST**: em inserção em lote, todos os objetos precisam ter exatamente as mesmas
  chaves — por isso o envio das ações sempre manda todos os campos, mesmo nulos.

## Equipes, visibilidade e ficha do contato

- **Equipes** (`equipes` + `equipe_usuarios`): agrupam usuários. Só admin cria e move gente.
- **Visibilidade** (só de `respostas`): `visivel_todos` (booleano) + `visivel_equipes` /
  `visivel_usuarios`. **Mensagem nova nasce visível para NINGUÉM** — é escolha explícita do
  admin. Pastas **não** têm restrição: o vínculo conversa↔pasta é compartilhado, esconder a
  pasta deixaria a conversa etiquetada num lugar invisível para o colega. O admin **enxerga tudo** na RLS (precisa administrar no painel) —
  quem filtra o que aparece nas mensagens rápidas dele é a **extensão**
  (`MensagensRapidas.carregar`, usando `minhasEquipes()` do sync).
- **Escopo na extensão**: tudo que a pessoa cria ali nasce **pessoal**, mesmo sendo admin
  (`escopoDe` em `sync.ts`). Mensagem da empresa só nasce no painel.
- **Ficha do contato** (`contatos`, chave `empresa+wa_number+remote_jid`): nome de
  tratamento, interesses e `ultimo_contato`. O nome da ficha tem prioridade sobre o do
  WhatsApp em `{{nome}}` (`executarResposta` e `inserirTextoNoCompose`).
- `ultimo_contato` é gravado a cada envio pela extensão — é o que alimenta o CRM.

## Painel web (`painel/`) — Fase 5

Next.js 15 + Tailwind v4, cliente do mesmo Supabase (RLS faz a segurança; nada de
service_role aqui). Tokens visuais vêm do protótipo do Claude Design
(`extens-o-web-naveg-vel-prototipada/`): marca `#4F46E5`, fundo `#F6F7FB`, cartões com
raio 14px, Plus Jakarta Sans + DM Mono.

```
painel/app/entrar            login e criação da clínica (RPC criar_empresa_e_admin)
painel/app/painel/           casca com barra lateral + faixa de assinatura vencida
  page.tsx                   visão geral (assinatura, assentos, pastas, uso)
  usuarios/                  tabela + criação de usuário (e-mail e senha definidos pelo
                             admin; o signUp troca a sessão, então ela é restaurada logo
                             em seguida com setSession) e ativar/desativar
  mensagens/                 acervo agrupado por categoria
  mensagens/[id]/            editor da sequência de ações (upload vai para o Storage)
  equipes/                   equipes e seus membros
  pastas/                    lista com ordem, cor e contagem de conversas
  contatos/                  CRM: planilha de contatos, pastas, interesses e último
                             contato, com busca, filtro por pasta e export CSV
  assinatura/                plano, assentos e situação
```

`cd painel && npm run dev` (porta 3100). Credenciais em `painel/.env.local`.

### Acesso da equipe

Não há convite por e-mail: **o admin cria o usuário com e-mail e senha** e entrega as
credenciais. Ordem obrigatória — `auth.users` primeiro (o `usuarios.id` tem FK para ele),
depois a linha em `usuarios`. O **limite de assentos é garantido por trigger no banco**
(`0005_assentos.sql`), valendo para criação e para reativação; a interface só antecipa o aviso.

## Servidor (`server/`) — Fase 0 concluída

```
server/sql/0001_schema.sql        tabelas multiempresa (escopo empresa × pessoal)
server/sql/0002_rls.sql           RLS + funções app.* + grants para `authenticated`
server/sql/0003_supabase_auth.sql FK com auth.users + criar_empresa_e_admin + aceitar_convite
server/tests/                     19 testes rodando em Postgres real (PGlite/WASM)
```

`cd server && npm test` — sobe um Postgres 16 em WASM, aplica as migrações e executa como
o papel `authenticated` com o `sub` do JWT na sessão, igual ao Supabase. **Toda mudança de
policy ou de tabela tem que passar aí antes de subir.** O shim de `auth.uid()` vive só em
`tests/harness.mjs`; nunca nas migrações.

Projeto **BuildChat** no Supabase Cloud já provisionado, migrações aplicadas e teste de
ponta a ponta passando contra ele (`scripts/teste-e2e.mjs`). Credenciais públicas em
`src/lib/config.ts`; senha do banco e chaves privadas **nunca** entram no repositório.

## Direção do produto (decidido)

- Empresa (assinante) → usuários criados pelo admin. **Cobrança por assento.**
- Sincronizam: mensagens rápidas (padrão da empresa + pessoais), pastas, vínculos,
  anotações e configurações do usuário.
- **Nunca sobem**: conversas, mídia recebida e cache de apagadas.
- Vínculos e anotações são da empresa, **chaveados pelo número conectado** (`wa_number`).
- Servidor próprio (Supabase novo), independente do BuildClinic.

Detalhes, fases e pendências: [PLANEJAMENTO-SERVIDOR.md](PLANEJAMENTO-SERVIDOR.md).

## Como testar de verdade

O WhatsApp Web só pode ser validado com navegador real. Receita usada até aqui
(no diretório de scratchpad da sessão, nunca no projeto):

```bash
npm i puppeteer-core && npx @puppeteer/browsers install chrome@stable
# subir com --disable-extensions-except=<dist> --load-extension=<dist>, headless:false
```

O Chrome do usuário **não** carrega a extensão por linha de comando; usar o
**Chrome for Testing**. Para envio real é preciso escanear o QR. Sem login, ainda dá para
medir layout, tema, presença das raízes e o estado do WPP (`window.WPP`).
