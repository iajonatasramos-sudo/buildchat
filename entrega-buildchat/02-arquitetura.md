# 2. Arquitetura

## O desenho em uma frase

A extensão injeta uma interface React dentro do WhatsApp Web, conversa com o WhatsApp por uma
ponte que roda no contexto da página, guarda tudo primeiro no navegador e sincroniza com o
servidor depois.

```
  ┌─────────────────────── aba do web.whatsapp.com ───────────────────────┐
  │                                                                       │
  │  contexto da PÁGINA            │  contexto da EXTENSÃO (isolado)       │
  │  ──────────────────            │  ─────────────────────────────        │
  │  window.WPP (wa-js)            │  React em shadow DOM (4 raízes)       │
  │  src/page/wa-bridge.ts  ◄──────┼──►  src/lib/wa.ts                     │
  │      (postMessage)             │       ▼                               │
  │                                │     src/lib/db.ts  (chrome.storage)   │
  │                                │       ▼                               │
  │                                │     src/lib/sync.ts ──► Supabase      │
  └───────────────────────────────────────────────────────────────────────┘
                                          │
                       service worker (src/background/index.ts)
                       webhooks, alarmes, permissões de domínio
```

## As quatro partes

**1. Content script (mundo isolado).** Monta a interface. Quatro raízes React, cada uma em seu
próprio shadow DOM, para o CSS do WhatsApp não vazar para dentro nem o nosso para fora:

| Raiz | O que é |
|---|---|
| `#buildchat2-topbar` | a barra do topo (marca, pastas, agenda, conta, engrenagem) |
| `#buildchat2-root` | tudo que flutua: gaveta, barra lateral, modais, menus, picker |
| `#buildchat2-headerbar` | os ícones dentro do cabeçalho da conversa |
| o ⚡ da caixa de mensagem | botão puro no DOM do WhatsApp, não é React |

Fora das raízes, três módulos escrevem **direto no DOM do WhatsApp**, porque precisam nascer
dentro da bolha da mensagem: `transcrever.ts`, `apagadas.ts` e `nomes.ts`.

**2. A ponte (mundo da página).** `src/page/wa-bridge.ts` roda no mesmo contexto do site e é o
único lugar que enxerga `window.WPP`. A comunicação é por `postMessage`, com um pedido e uma
resposta por id. Quem chama do lado da extensão é `src/lib/wa.ts`.

A biblioteca usada é a [`@wppconnect/wa-js`](https://github.com/wppconnect-team/wa-js), aberta,
copiada para `public/vendor/` na compilação. Ela dá acesso ao que o WhatsApp Web já faz por
dentro: enviar, listar conversas, baixar mídia, saber quem apagou o quê.

**Se a ponte não estiver pronta, nada quebra**: o envio de texto cai num caminho alternativo
que digita na caixa de mensagem. A barra mostra "compat." em vez de "WPP".

**3. Armazenamento local.** `src/lib/db.ts` é a fonte da verdade imediata, sobre
`chrome.storage.local`. Toda ação da pessoa é gravada ali na hora e enfileirada para subir
depois. É o que faz a extensão funcionar sem internet.

**4. Sincronização.** `src/lib/sync.ts` é uma fila de saída com repetição, mais uma leitura
incremental por data de atualização. Roda a cada cinco minutos, ao focar a aba e ao abrir a
gaveta. Detalhes em [03-contrato-do-servidor.md](03-contrato-do-servidor.md).

## Mapa dos arquivos

### Extensão

| Arquivo | Responsabilidade |
|---|---|
| `src/content/main.tsx` | monta as raízes, injeta o CSS, insere o ⚡ e a barra do cabeçalho, tema |
| `src/page/wa-bridge.ts` | a ponte com o `WPP` (roda no contexto da página) |
| `src/lib/wa.ts` | chama a ponte, guarda os seletores do WhatsApp, envia mensagem e arquivo |
| `src/lib/db.ts` | tudo que é gravado no navegador |
| `src/lib/sync.ts` | fila de saída, leitura incremental, adoção do acervo |
| `src/lib/auth.ts` | login, perfil, licença, sessão em `chrome.storage` |
| `src/lib/store.ts` | mini pub/sub entre as raízes React |
| `src/lib/types.ts` | tipos e variáveis das mensagens |
| `src/lib/marca.ts` | qual produto é este pacote, e quais recursos ele tem |
| `src/lib/acessos.ts` | quais funções a pessoa enxerga (configurado no painel) |
| `src/lib/agenda.ts` | contas de calendário |
| `src/lib/propostas.ts`, `src/lib/transcricao.ts` | chamadas à API da BuildClinic |
| `src/lib/webhook.ts` | webhook de saída, disparado a cada mensagem recebida |
| `src/lib/automacoes/` | motor das automações (fila durável) e tipos |
| `src/content/transcrever.ts` | botão de transcrever dentro da bolha de áudio |
| `src/content/apagadas.ts` | "Ver mensagem apagada" dentro da bolha |
| `src/content/nomes.ts` | reescreve o nome do contato na lista e no cabeçalho |
| `src/content/menus.ts` | reposiciona o menu do WhatsApp para a nossa barra não cortá-lo |
| `src/content/dom-bolha.ts` | acha a bolha da mensagem por geometria (usado pelos dois de cima) |
| `src/ui/*.tsx` | as telas |
| `src/background/index.ts` | service worker: webhooks, alarmes, permissão de domínio |

### Painel web (`painel/`)

Next.js 15 com Tailwind, cliente do mesmo Supabase. Não existe chave de servidor ali: a
segurança é a mesma regra de linha que vale para a extensão.

| Rota | Para quem |
|---|---|
| `/entrar`, `/acesso` | login; `/acesso` recebe a sessão vinda da extensão |
| `/painel` | visão geral (diferente para administrador e atendente) |
| `/painel/contatos` e `/painel/contatos/[id]` | o CRM: planilha e ficha do lead |
| `/painel/agenda` | o mesmo calendário da extensão |
| `/painel/mensagens` e `/painel/mensagens/[id]` | acervo de mensagens rápidas e o editor |
| `/painel/pastas`, `/painel/departamentos`, `/painel/usuarios` | cadastro e visibilidade |
| `/painel/acessos` | quais funções da extensão cada pessoa enxerga |
| `/painel/assinatura` | plano e assentos |
| `/sistema/*` | área do dono do produto: clínicas, vendas, faturas, integrações |
| `/instalar`, `/privacidade` | páginas públicas |

## Compilação

```bash
npm run build          # gera dist/ (é a pasta que se carrega no Chrome)
npm run pacote         # o mesmo, e empacota o .zip
npx tsc --noEmit       # checagem de tipos
cd painel && npm run dev   # painel em desenvolvimento (porta 3100)
cd server && npm test      # a suíte contra Postgres real
```

Depois de cada compilação: recarregar a extensão no `chrome://extensions` **e** a aba do
WhatsApp. Só recarregar a extensão deixa a aba com o código antigo, e é daí que vem o "compat."
laranja na barra.
