# ⚡ BuildChat 2

Extensão Chrome (Manifest V3) que adiciona superpoderes ao **WhatsApp Web**, com a **UI portada do Saleschat/BuildClinic** (`src/app/(app)/dental-chat/` do BuildClinic) — visual idêntico ao sistema, dados 100% locais e integração com o seu sistema via webhook.

Reescrita independente da extensão de referência (Dental Chat/WaScript): **não contém código, marca nem backend dela**. O envio programático usa o [@wppconnect/wa-js](https://github.com/wppconnect-team/wa-js) (open source), a mesma técnica de injeção no WhatsApp Web.

## Como instalar

```bash
npm install
npm run build        # gera a pasta dist/
```

1. Abra `chrome://extensions`
2. Ative **Modo do desenvolvedor**
3. **Carregar sem compactação** → selecione a pasta **`dist/`**
4. Abra/recarregue <https://web.whatsapp.com>

Durante o desenvolvimento: `npm run dev` (rebuild automático; recarregue a extensão e a aba).

## Funcionalidades (v1)

- **Painel Mensagens Rápidas** (botão ⚡ flutuante) — porte fiel do painel do Saleschat:
  categorias coloridas com drag-and-drop, filtros (Tudo / Por Tipo / Sem Categoria / Mais Usadas),
  busca, criação/edição de respostas com **sequência de ações** (texto, imagem, áudio, vídeo,
  documento, com delay entre ações), variáveis `{{nome}}`, `{{primeiro_nome}}`, `{{saudacao}}`, `{{data}}`.
- **Envio real** pela ponte WPP: texto e mídia direto na conversa ativa (áudio sai como mensagem de voz).
- **Picker "/"** no campo de mensagem: filtre pelo atalho/título, `↑↓` navega, **Enter envia a sequência**, **Tab só insere o texto**.
- **Guia Contato**: dados da conversa aberta, etiquetas (aplicadas também automaticamente ao usar uma resposta com etiqueta) e notas locais.
- **Seed automático**: na primeira execução importa suas respostas/etiquetas do BuildChat v1 (`seed/dentalchat.json`, com as mídias).
- **Webhook**: configure a URL em ⚙ Configurações; cada envio dispara `POST { source: "buildchat", event: "quick_reply_sent", payload: {...} }`.

## Arquitetura

```
public/
  manifest.json            # MV3
  content-loader.js        # carrega o bundle ES no content script
  vendor/wppconnect-wa.js  # WPP (UMD) injetado no contexto da página
  seed/                    # dados iniciais (BuildChat v1)
src/
  content/main.tsx         # monta o app React em shadow DOM (CSS isolado do WhatsApp)
  page/wa-bridge.ts        # roda NA PÁGINA: RPC via postMessage sobre window.WPP
  background/index.ts      # service worker: webhook
  ui/                      # App (FAB/gaveta), painel portado, picker "/", toasts
  lib/                     # tipos, storage (chrome.storage), ponte WA, utils
  styles/tokens.css        # tokens visuais do BuildClinic (Tailwind v4, :host)
```

## Roadmap

- [ ] Etiquetas visíveis no cabeçalho da conversa (chips)
- [ ] CRM/Funil (kanban de leads) — portar `sales/funil-panel.tsx` do BuildClinic
- [ ] Agendamento de mensagens (alarms)
- [ ] Sincronização bidirecional com o BuildClinic (além do webhook)

## Avisos

- O WhatsApp Web muda com frequência; os seletores de DOM têm fallback em `src/lib/wa.ts` e o WPP é atualizado via `npm update @wppconnect/wa-js` (o `prebuild` copia o vendor novo).
- Uso de automação no WhatsApp é por sua conta e risco (termos do WhatsApp).
