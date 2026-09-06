// Roda no CONTEXTO DA PÁGINA (web.whatsapp.com), injetado pelo content script.
// Usa o WPP (@wppconnect/wa-js) — a mesma técnica da extensão de referência —
// para enviar mensagens/mídia e ler a conversa ativa de forma confiável.
// O vendor/wppconnect-wa.js (UMD) é injetado ANTES deste script e define
// window.WPP. Comunicação com o content script via window.postMessage.

type Req = { __bc: 'req'; id: string; cmd: string; payload?: any };

let pronto = false;
let WPP: any;

function emitir(evento: string, data?: any) {
  window.postMessage({ __bc: 'evt', evento, data }, '*');
}

function responder(id: string, ok: boolean, data?: any, erro?: string) {
  window.postMessage({ __bc: 'res', id, ok, data, erro }, '*');
}

function contatoDoChat(chat: any) {
  if (!chat) return null;
  const id = chat.id?._serialized ?? String(chat.id ?? '');
  const ehGrupo = !!chat.isGroup || id.endsWith('@g.us');
  const nome =
    chat.formattedTitle || chat.name || chat.contact?.formattedName || chat.contact?.pushname || id;
  const telefone = !ehGrupo && chat.id?.user ? `+${chat.id.user}` : null;
  return { chatId: id, nome, telefone, ehGrupo, fixada: !!chat.pin };
}

async function chatAtivoId(): Promise<string | null> {
  const chat = WPP.chat.getActiveChat();
  return chat?.id?._serialized ?? null;
}

const comandos: Record<string, (payload: any) => Promise<any>> = {
  async ping() {
    let mainReady = false;
    let injetado = false;
    try {
      injetado = !!WPP?.webpack?.isInjected;
      mainReady = !!WPP?.conn?.isMainReady?.();
    } catch {
      /* diagnóstico apenas */
    }
    return { pronto, temWPP: !!WPP, injetado, mainReady };
  },

  async activeChat() {
    return contatoDoChat(WPP.chat.getActiveChat());
  },

  async listChats() {
    const chats = await WPP.chat.list();
    return (chats ?? [])
      .map((c: any) => {
        const base = contatoDoChat(c);
        if (!base) return null;
        return {
          ...base,
          naoLidas: c.unreadCount ?? 0,
          ultimaTs: typeof c.t === 'number' ? c.t : null, // epoch em segundos
        };
      })
      .filter(Boolean);
  },

  async openChat({ chatId }: { chatId: string }) {
    await WPP.chat.openChatBottom(chatId);
    return true;
  },

  async pinChat({ chatId, pin }: { chatId: string; pin: boolean }) {
    await WPP.chat.pin(chatId, pin);
    return { fixada: pin };
  },

  async selfInfo() {
    try {
      const meu = WPP.conn?.getMyUserId?.();
      const id = meu?._serialized ?? null;
      const numero = meu?.user ? `+${meu.user}` : null;
      let nome: string | null = null;
      try {
        nome = WPP.profile?.getMyProfileName?.() ?? null;
      } catch {
        nome = null;
      }
      return { id, numero, nome, conectado: !!(WPP.conn?.isMainReady?.() ?? pronto) };
    } catch {
      return { id: null, numero: null, nome: null, conectado: false };
    }
  },

  /**
   * Baixa a mídia de uma mensagem e devolve como data URL.
   *
   * Plano B da transcrição: normalmente o áudio já está no <audio> da bolha
   * como blob URL, mas o WhatsApp descarta o blob de conversas antigas. Aqui o
   * WPP busca de novo e descriptografa. Vai como string porque a resposta
   * atravessa o postMessage entre o mundo da página e o da extensão.
   */
  async downloadMedia({ msgId }: { msgId: string }) {
    const blob: Blob = await WPP.chat.downloadMedia(msgId);
    if (!blob) throw new Error('Mídia indisponível.');
    const dataUrl: string = await new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = () => reject(new Error('Falha ao ler a mídia.'));
      leitor.readAsDataURL(blob);
    });
    return { dataUrl, mime: blob.type || null, tamanho: blob.size };
  },

  async sendText({ chatId, texto }: { chatId?: string; texto: string }) {
    const alvo = chatId || (await chatAtivoId());
    if (!alvo) throw new Error('Nenhuma conversa aberta.');
    const r = await WPP.chat.sendTextMessage(alvo, texto, { createChat: true });
    return { id: (r as any)?.id ?? null };
  },

  async sendFile({
    chatId,
    dataUrl,
    tipo,
    mime,
    nome,
    legenda,
  }: {
    chatId?: string;
    dataUrl: string;
    tipo: 'imagem' | 'audio' | 'video' | 'documento';
    mime?: string | null;
    nome?: string | null;
    legenda?: string | null;
  }) {
    const alvo = chatId || (await chatAtivoId());
    if (!alvo) throw new Error('Nenhuma conversa aberta.');
    const mapa: Record<string, string> = {
      imagem: 'image',
      audio: 'audio',
      video: 'video',
      documento: 'document',
    };
    const opts: any = {
      type: mapa[tipo] ?? 'auto-detect',
      filename: nome ?? undefined,
      mimetype: mime ?? undefined,
      caption: legenda || undefined,
      createChat: true,
    };
    if (tipo === 'audio') {
      opts.isPtt = true; // áudio como mensagem de voz, igual à referência
      opts.waveform = true;
    }
    try {
      const r = await WPP.chat.sendFileMessage(alvo, dataUrl, opts);
      return { id: (r as any)?.id ?? null };
    } catch (e: any) {
      console.error('[BuildChat] sendFileMessage falhou:', e);
      if (opts.type !== 'document') {
        // Rede de segurança: entrega como documento (arquivo) em vez de falhar.
        console.warn('[BuildChat] reenviando como documento…');
        const r2 = await WPP.chat.sendFileMessage(alvo, dataUrl, {
          type: 'document',
          filename: nome ?? 'arquivo',
          mimetype: mime ?? undefined,
          caption: legenda || undefined,
          createChat: true,
        });
        return { id: (r2 as any)?.id ?? null, comoDocumento: true };
      }
      throw e;
    }
  },
};

window.addEventListener('message', (ev: MessageEvent) => {
  const msg = ev.data as Req;
  if (!msg || msg.__bc !== 'req') return;
  const fn = comandos[msg.cmd];
  if (!fn) {
    responder(msg.id, false, undefined, `Comando desconhecido: ${msg.cmd}`);
    return;
  }
  fn(msg.payload)
    .then((data) => responder(msg.id, true, data))
    .catch((e) => responder(msg.id, false, undefined, e?.message ?? String(e)));
});

// Aguarda o vendor UMD definir window.WPP e então inicializa.
function marcarPronto() {
  if (pronto) return;
  pronto = true;
  emitir('ready');
  console.info('[BuildChat] WPP pronto.');
  try {
    WPP.on('chat.active_chat', (chat: any) => emitir('active-chat', contatoDoChat(chat)));
  } catch {
    /* evento indisponível nesta versão — o content script tem fallback por DOM */
  }
  // Captura de mensagens (para o recurso "mensagens apagadas") + revogações.
  try {
    WPP.on('chat.new_message', (msg: any) => {
      try {
        emitir('nova-msg', {
          id: msg?.id?._serialized ?? null,
          chatId: msg?.id?.remote?._serialized ?? msg?.from?._serialized ?? null,
          deMim: !!(msg?.id?.fromMe ?? msg?.fromMe),
          texto: typeof msg?.body === 'string' ? msg.body.slice(0, 2000) : null,
          tipo: msg?.type ?? null,
          autor: msg?.author?._serialized ?? msg?.from?._serialized ?? null,
          ts: typeof msg?.t === 'number' ? msg.t : null,
        });
      } catch {
        /* mensagem em formato inesperado — ignora */
      }
    });
    WPP.on('chat.msg_revoke', (dados: any) => {
      try {
        emitir('msg-revoke', {
          id: dados?.id?._serialized ?? (typeof dados?.id === 'string' ? dados.id : null),
          refId: dados?.refId?._serialized ?? (typeof dados?.refId === 'string' ? dados.refId : null),
          chatId:
            dados?.chat?.id?._serialized ??
            dados?.chat?._serialized ??
            dados?.id?.remote?._serialized ??
            dados?.from?._serialized ??
            null,
          autor: dados?.author?._serialized ?? null,
        });
      } catch {
        /* ignora */
      }
    });
  } catch (e) {
    console.warn('[BuildChat] eventos de mensagem indisponíveis:', e);
  }
}

function iniciar() {
  WPP = (window as any).WPP;
  if (!WPP) {
    setTimeout(iniciar, 100);
    return;
  }
  console.info('[BuildChat] ponte ativa; WPP capturado. Versão:', WPP.version ?? '?');

  // Cada etapa é independente: no wa-js 4.x o módulo `webpack` não existe mais
  // (a injeção é automática) — nada aqui pode derrubar o resto da inicialização.
  const wp = WPP.webpack;
  try {
    if (wp?.injectLoader && !wp.isInjected) wp.injectLoader();
  } catch (e) {
    console.warn('[BuildChat] injectLoader:', e);
  }
  try {
    wp?.onReady?.(() => console.info('[BuildChat] WPP: onReady.'));
    wp?.onFullReady?.(marcarPronto);
  } catch {
    /* API antiga indisponível */
  }
  try {
    WPP.on?.('conn.main_ready', marcarPronto);
  } catch {
    /* evento indisponível */
  }
  // Vigia o estado real da conexão — cobre qualquer versão.
  const vigia = setInterval(() => {
    try {
      if (WPP.conn?.isMainReady?.()) {
        clearInterval(vigia);
        marcarPronto();
      }
    } catch {
      /* ainda carregando */
    }
  }, 1000);
}
iniciar();
