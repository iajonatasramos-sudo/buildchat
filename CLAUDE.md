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
7. **`@property` não vale dentro do shadow DOM.** As utilities do Tailwind v4 leem
   variáveis internas (`.border` é `border-style: var(--tw-border-style)`), e o valor
   inicial delas vem de regras `@property` — que a spec manda **ignorar** dentro de uma
   shadow tree, justamente onde o nosso CSS é carregado. Sem registro o `var()` não
   resolve e a declaração cai: `border-style` volta a `none` (largura 1px, borda
   invisível) e `box-shadow` some. O plugin `valoresIniciaisDoTailwind()` em
   `vite.config.ts` lê os `@property` do CSS gerado e repete os valores iniciais em
   `.bc-root, .bc-root *`. **Isso vale para toda variável `--tw-*` nova** — o plugin já
   cobre sozinho, mas se aparecer utility sem efeito visual, suspeite disto primeiro.
8. **Utilitários visuais** (em `tokens.css`): `.bc-seg` (controle segmentado das abas e
   filtros), `.bc-elev` / `.bc-elev-hover` (elevação e realce no hover) e `.bc-cat-*`
   (caixa translúcida da categoria). Use-os em vez de recriar sombras/pílulas na mão.
9. **Nada do Dental Chat**: nenhum código, marca ou asset dele. O wa-js é open source; a UI
   vem do BuildClinic. Dados extraídos do storage local do usuário são **dele**.
10. **Idioma**: código, comentários e UI em português (nomes de variáveis inclusive).

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

## Gerar proposta (`src/lib/propostas.ts` + `src/ui/Proposta.tsx`)

Réplica da tela do BuildClinic. **O PDF não é montado aqui**: a extensão manda os dados
para `POST https://app.buildclinic.com.br/api/propostas/gerar?token=…` e recebe
`application/pdf`.

- **Endereço e token vêm da integração `propostas`**, cadastrada pelo gestor em
  `/sistema/api` (tabela `integracoes`) e trazida pelo sync (`minhas_integracoes()`).
  A configuração da empresa vence a global. **Não há token local na extensão.**
- **O botão só existe para quem tem a integração**: `db.integracaoDisponivel('propostas')`
  decide se a seção "Propostas" aparece na guia Contato. Clínica sem vínculo não vê o botão
  — nem desabilitado. Como `minhas_integracoes()` já filtra por empresa e por `ativo`,
  desligar ou remover a integração faz o botão sumir no sync seguinte.
- Trocar o endereço para outro domínio exige liberá-lo em `host_permissions`.
- Tipos: `EXEC_SP | INT_SP | EXEC_BR | INT_BR | VIGILANCIA`. Interiores troca metragem por
  nº/quais ambientes; Vigilância parcela 50/30/20 e tem os 3 checkboxes de formas a exibir.
- Cálculo a partir do valor total (à vista com desconto, cartão em N parcelas, entrada/saldo)
  só sobrescreve campo que o usuário **ainda não editou** (conjunto `tocados`).
- Depois do `await` o clique deixa de valer como gesto do usuário e o Chrome pode bloquear a
  aba do PDF — por isso o botão “Abrir para revisão” fica destacado quando isso acontece.
- Anexar na conversa usa `enviarArquivo()` (WPP, com o fluxo de anexo do WhatsApp como
  reserva) e registra o último contato no CRM.
- `host_permissions` precisa de `https://app.buildclinic.com.br/*`.
- **Toda proposta gerada fica no servidor** (`propostas`, `0015_propostas.sql`; PDF no bucket
  `midias` em `<empresa>/propostas/<id>.pdf`). Offline-first como o resto: `db.registrarProposta`
  guarda os metadados em `bc2_propostas` e o PDF em `media:proposta:<id>`, e enfileira
  `proposta.criar`; o sync sobe o arquivo, insere a linha e solta o PDF local
  (`concluirEnvioProposta`). Anexar na conversa enfileira `proposta.enviada`. O pull traz as
  propostas do número conectado e a guia Contato lista com **abrir** e **enviar na conversa**
  — é o "reenviar" do SalesBuild. A aba do PDF é aberta ANTES do `await` (gesto do usuário).

## Transcrever áudio (`src/lib/transcricao.ts` + `src/content/transcrever.ts`)

Botão **Transcrever** em cada mensagem de áudio. A transcrição é feita pela API
(`POST https://app.buildclinic.com.br/api/transcrever?token=…`, multipart com o campo
`file`, teto de 25 MB); a extensão só entrega o áudio e mostra o texto.

- **Token**: integração `transcricao`; sem ela, cai no token da `propostas` — é o mesmo da
  API, então quem já configurou a proposta ganha a transcrição sem mexer em nada. Sem
  nenhum dos dois, o botão não aparece (mesma regra da proposta).
- **Fica no DOM do WhatsApp**, não em shadow root: o bloco precisa nascer dentro da bolha,
  junto do player. Por isso o estilo vem de uma folha própria (prefixo `bc-tr-`), com as
  cores seguindo o `tema`.
- **Achar a bolha de áudio não pode depender do `<audio>`**: ele só existe depois que a
  pessoa toca o áudio (foi o primeiro erro — nenhum botão aparecia). Também não dá para
  confiar em classe ou `data-icon`, que mudam a cada versão. O que é estável é o `data-id`
  da linha: o comando `audiosDoChat` da ponte pergunta ao WPP quais mensagens são
  `ptt`/`audio` e cruzamos com esse atributo; `pareceAudio()` (ícone, `aria-label`,
  `data-testid`) fica de reforço para quando a ponte não responder.
- **Onde o botão entra**: `acharBolha()` procura o balão por **geometria** — o elemento mais
  externo dentro da linha que tem fundo próprio e é mais estreito que ela. Procurar por
  classe não vale (mudam a cada versão) e ancorar na linha jogava a pílula para a borda
  esquerda. O botão é uma pílula rosa centralizada no balão, logo abaixo do player.
- **O `data-id` do DOM e o id do WPP NÃO são a mesma string.** Desde a migração do
  WhatsApp para ids `@lid`, o mesmo áudio aparece como `false_123@lid_HASH` no DOM e
  `false_5511…@c.us_HASH` no WPP. O que coincide é o **hash** (terceiro segmento) — a ponte
  indexa os modelos por ele (`audiosConhecidos`), `audiosDoChat` devolve hashes e o content
  cruza com `hashDoId(data-id)`. Passar o id cru do DOM ao `downloadMedia` do wa-js estoura
  com `reading '_serialized'` (ele não acha a mensagem no store) — sem modelo, a ponte
  responde com mensagem legível em vez de tentar.
- Diagnóstico no console: `__bcTranscricao()` mostra se o recurso está liberado, quantos
  áudios o WPP reconheceu e quantos botões estão na tela.
- **Pegar o áudio** (`obterAudioDaMensagem` em `wa.ts`): o `<audio>` da bolha guarda um blob
  URL do próprio documento — basta buscá-lo. Em conversa antiga o WhatsApp já descartou
  esse blob; aí o comando `downloadMedia` da ponte manda o WPP baixar e descriptografar de
  novo (vai como data URL, porque a resposta atravessa o `postMessage`).
- **A lista é virtualizada**: a bolha some ao rolar e volta remontada. O observer reinsere o
  botão e um cache por id de mensagem devolve o texto já transcrito, sem repagar a API.

## Sincronização (`src/lib/sync.ts`) — Fase 2

Offline-first. Toda alteração é aplicada no `chrome.storage` na hora e enfileirada numa
**outbox**; o envio vem depois, com repetição. Leitura incremental por `atualizado_em`,
exclusão lógica por `deleted_at`, e vínculo pasta↔conversa por **número conectado**
(`wa_number`) — compartilhado entre quem atende o mesmo WhatsApp.

- Mutações que enfileiram: `criarTag`, `alternarTagContato`, `aplicarTagContato` (em `db.ts`).
- **Adoção**: na primeira sincronização o acervo local é assumido pela conta — pastas casam
  por nome, as que faltam são criadas e os ids locais viram os uuid do servidor
  (`remapearTagIds`). Por isso `criarTag` já nasce com `crypto.randomUUID()`.
  **A adoção falhar não derruba o ciclo**: fica para a próxima e o pull continua — senão
  uma recusa ali (permissão, limite do plano) deixaria a pessoa sem licença, sem acervo e
  sem as integrações, com a nuvem riscada. Foi exatamente esse o sintoma do furo das pastas.
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
  pasta deixaria a conversa etiquetada num lugar invisível para o colega. Desde
  `0014_pastas_da_equipe.sql` a **escrita** em `pastas` também é livre: qualquer usuário
  ativo cria/edita etiqueta, em qualquer plano (antes seguia `app.pode_escrever`, que exige
  admin + recurso do plano — travava o atendente e, no Start, até o admin). O admin **enxerga tudo** na RLS (precisa administrar no painel) —
  quem filtra o que aparece nas mensagens rápidas dele é a **extensão**
  (`MensagensRapidas.carregar`, usando `minhasEquipes()` do sync).
- **Escopo na extensão**: tudo que a pessoa cria ali nasce **pessoal**, mesmo sendo admin
  (`escopoDe` em `sync.ts`). Mensagem da empresa só nasce no painel.
- **Ficha do contato** (`contatos`, chave `empresa+wa_number+remote_jid`): nome de
  tratamento, interesses e `ultimo_contato`. **O nome da ficha vale em toda tela nossa**:
  `{{nome}}`, proposta, guia Contato, lista da pasta, cabeçalho das anotações e autor das
  apagadas — via `db.nomesDasFichas()`/`obterFicha()`, com o nome do WhatsApp só de reserva.
  Casar vínculo com conversa continua pelo nome do WhatsApp (é o que o WPP devolve). A
  lista e o cabeçalho do próprio WhatsApp são dele: não dá para renomear por ali.
- `ultimo_contato` é gravado a cada envio pela extensão — é o que alimenta o CRM.
- **`@lid` não é telefone.** O WhatsApp identifica algumas conversas por LID (id interno de
  15 dígitos, `…@lid`); derivar o número do `remote_jid` mostrava esse id como celular. A
  ponte resolve o número real com `WPP.contact.getPnLidEntry` (`contatoCompleto`, com cache),
  a ficha guarda em `telefone` (`0016`) e o painel usa `telefoneDoContato()` — do jid só
  quando ele é `@c.us`; sem número conhecido mostra "—", nunca o LID.
- **A ficha nasce na primeira interação**, não só no envio: `db.registrarContato(chatId,
  nomeWhatsapp)` é chamado ao etiquetar, anotar e gerar proposta (só enfileira se a ficha
  ainda não tem o nome do WhatsApp). O painel completa o resto: ao abrir `/painel/contatos`
  ele materializa a ficha de toda conversa que já tem pasta, proposta ou anotação sem ficha —
  foi assim que os 208 vínculos antigos da MCA viraram contatos.

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
  contatos/                  CRM: planilha de contatos, pastas, propostas, interesses e
                             último contato, com busca, filtro por pasta e export CSV
  contatos/[id]/             ficha do lead: nome/interesses editáveis, entrar/sair de
                             pasta, propostas com "Abrir PDF" (URL assinada do Storage) e
                             anotações — tudo chega à extensão no sync seguinte
  assinatura/                plano, assentos e situação
```

`cd painel && npm run dev` (porta 3100). Credenciais em `painel/.env.local`.

### Acesso da equipe

Não há convite por e-mail: **o admin cria o usuário com e-mail e senha** e entrega as
credenciais. Ordem obrigatória — `auth.users` primeiro (o `usuarios.id` tem FK para ele),
depois a linha em `usuarios`. O **limite de assentos é garantido por trigger no banco**
(`0005_assentos.sql`), valendo para criação e para reativação; a interface só antecipa o aviso.

## Níveis de cliente: Start → Pro → Master

Catálogo em `planos` (`0010_planos.sql`). Os limites são **fiscalizados no banco**, não só
escondidos na interface — esconder botão não impede chamada direta à API.

| | Start | Pro | Master |
|---|---|---|---|
| Assentos | 2 | 5 | 15 |
| Mensagens rápidas | 30 | 200 | ilimitado |
| Equipes e mensagens da empresa | — | ✓ | ✓ |
| Exportar CRM | — | ✓ | ✓ |

- `app.plano_vigente(empresa)`: em **trial** a clínica usa o **Pro** (o teste mostra o
  produto completo); **inadimplente/cancelada** cai para o **Start** — sem apagar nada.
- Fiscalização: policy de `equipes`, `app.pode_escrever` (mensagem da empresa) e o trigger
  `checar_limite_mensagens` (teto por plano).
- `meu_plano()` devolve recursos e consumo para a interface; `sistema_definir_plano()` é do
  gestor e ajusta assentos/preço ao trocar de nível (preserva preço negociado).
- Preços iniciais (97/197/397) são **sugestão** — mude em `planos`.

## Painel do gestor do sistema (`/sistema`)

Área do **dono do produto**, separada do painel das clínicas.

- Quem é gestor: tabela `sistema_operadores` (por `auth.users.id`). Cadastrar/remover:
  `DATABASE_URL=… node server/scripts/definir-operador.mjs email@dominio "Nome"`.
- **Não abre a RLS dos inquilinos.** O acesso passa por funções SECURITY DEFINER que só
  devolvem dados administrativos: `sistema_empresas()`, `sistema_resumo()`,
  `sistema_atualizar_empresa(...)` e `sou_operador()`. Mensagens, contatos, anotações e
  conversas das clínicas continuam fechados até para o gestor — e há teste provando isso.
- **Cobrança é do gestor**: `revoke update on empresas` + `grant update (nome)` para
  `authenticated`. Sem isso o admin da clínica se daria assentos sem pagar (foi um furo
  real, pego por teste).
- **Comercial** (`0009_vendas.sql`): `empresas.valor_mensal_centavos`, `ciclo`,
  `proxima_cobranca`, `observacao` + tabela `faturas`. Dinheiro é **integer em centavos**.
  A clínica **lê** as próprias faturas (RLS), mas só o gestor cria e dá baixa
  (`sistema_lancar_fatura`, `sistema_baixar_fatura`, `sistema_definir_comercial`).
  Dar baixa reativa a assinatura e adia a próxima cobrança um ciclo.
  `sistema_vendas()` calcula MRR, recebido no mês, em aberto e vencidas.
- **Tipos de assinatura** (`0012_cadastro_empresa.sql`): `mensal`, `trimestral`, `anual` e
  `vitalicio`. O valor guardado é o do ciclo inteiro; o MRR divide por 3 (trimestral) ou 12
  (anual). **Vitalício é pagamento único**: fica fora do MRR e do ticket médio, e nunca tem
  `proxima_cobranca` — nem ao criar, nem ao dar baixa, nem ao trocar o ciclo.
- **Cadastrar clínica** (`sistema_criar_empresa`): o painel cria a conta no Auth (`signUp`,
  restaurando a sessão do gestor logo depois — o mesmo truque de `/painel/usuarios`) e passa
  o `id` para a RPC, que abre a empresa, o admin dela e o `config_usuario` numa transação só.
  Dá para nascer em teste grátis (com o prazo em dias) ou já ativa, no plano e no ciclo
  escolhidos, com valor de tabela ou negociado.
- Páginas: `/sistema` (métricas), `/sistema/vendas` (receita e faturas), `/sistema/api`
  (integrações: chave, endereço, token com botão de revelar/copiar, escopo global ou por
  clínica — **editável**: `sistema_salvar_integracao(..., p_id)` move a linha de escopo
  preservando o token, em vez de criar outra) e `/sistema/empresas` (cadastro de clínica, situação, assentos, uso e as ações
  comerciais). O atalho na barra lateral só aparece para operadores.

## Servidor (`server/`) — Fase 0 concluída

```
server/sql/0001_schema.sql        tabelas multiempresa (escopo empresa × pessoal)
server/sql/0002_rls.sql           RLS + funções app.* + grants para `authenticated`
server/sql/0003_supabase_auth.sql FK com auth.users + criar_empresa_e_admin + aceitar_convite
server/tests/                     95 testes rodando em Postgres real (PGlite/WASM)
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
