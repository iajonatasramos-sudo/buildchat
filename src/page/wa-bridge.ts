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

/**
 * Modelos das mensagens de áudio já vistas, indexados pelo HASH da mensagem.
 *
 * O `data-id` do DOM e o `id._serialized` do WPP nem sempre são a mesma
 * string: desde a migração do WhatsApp para ids `@lid`, o mesmo áudio pode
 * aparecer como `false_123@lid_HASH` num lado e `false_5511…@c.us_HASH` no
 * outro. O que coincide é o hash (terceiro segmento) — é por ele que casamos.
 * Foi essa diferença que fazia o download estourar com "reading '_serialized'":
 * o wa-js não achava a mensagem pelo id cru do DOM.
 */
const audiosConhecidos = new Map<string, any>();

/** `false_5511@c.us_3EB0ABC[_participante]` → `3EB0ABC`. */
function hashDoId(id: string): string {
  const partes = id.split('_');
  return partes.length >= 3 ? partes[2] : id;
}

function hashDoModelo(m: any): string | null {
  const curto = m?.id?.id;
  if (typeof curto === 'string' && curto) return curto;
  const serial = m?.id?._serialized ?? (typeof m?.id === 'string' ? m.id : null);
  return serial ? hashDoId(serial) : null;
}

/**
 * Acha o modelo de uma mensagem a partir do id do DOM: cache por hash, depois
 * a API do WPP com o id cru e, por fim, varredura das mensagens carregadas da
 * conversa casando pelo hash.
 */
async function buscarMensagem(msgId: string): Promise<any | null> {
  const hash = hashDoId(msgId);
  const emCache = audiosConhecidos.get(hash);
  if (emCache) return emCache;

  try {
    const m = await WPP.chat.getMessageById(msgId);
    if (m?.id) {
      audiosConhecidos.set(hash, m);
      return m;
    }
  } catch {
    /* id em formato que o WPP não converte — segue para a varredura */
  }
  try {
    const chat = await chatAtivoId();
    if (!chat) return null;
    const msgs: any[] = (await WPP.chat.getMessages(chat, { count: 500 })) ?? [];
    const m = msgs.find((x) => hashDoModelo(x) === hash);
    if (m) audiosConhecidos.set(hash, m);
    return m ?? null;
  } catch {
    return null;
  }
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
   * Ids das mensagens de voz/áudio já carregadas na conversa.
   *
   * É assim que sabemos onde pôr o botão "Transcrever": o WhatsApp só cria o
   * <audio> quando a pessoa toca o áudio, e as classes da bolha mudam a cada
   * versão. Perguntar ao WPP é estável — e o id casa com o `data-id` que a
   * linha da mensagem carrega no DOM.
   */
  async audiosDoChat({ chatId, quantidade = 200 }: { chatId?: string; quantidade?: number }) {
    const alvo = chatId || (await chatAtivoId());
    if (!alvo) return { ids: [] as string[] };
    const msgs: any[] = (await WPP.chat.getMessages(alvo, { count: quantidade })) ?? [];
    const ids: string[] = []; // hashes — ver `audiosConhecidos`
    for (const m of msgs) {
      if (m?.type !== 'ptt' && m?.type !== 'audio') continue;
      const hash = hashDoModelo(m);
      if (!hash) continue;
      ids.push(hash);
      audiosConhecidos.set(hash, m); // guarda o MODELO — ver downloadMedia
    }
    return { ids };
  },

  /**
   * Baixa a mídia de uma mensagem e devolve como data URL.
   *
   * Plano B da transcrição: normalmente o áudio já está no <audio> da bolha
   * como blob URL, mas o WhatsApp descarta o blob de conversas antigas.
   *
   * Por que uma cascata: o `downloadMedia` do wa-js resolve a mensagem no store
   * antes de baixar, e quando não a encontra estoura lá dentro com
   * "reading '_serialized'" — o id do DOM sozinho não basta. Tentamos, em
   * ordem, o modelo que já temos em mãos, o próprio método do modelo, a busca
   * pelo id e, por fim, a mensagem recarregada do chat. O erro que sobe carrega
   * o motivo original, senão não há como diagnosticar de fora.
   */
  async downloadMedia({ msgId }: { msgId: string }) {
    const modelo = await buscarMensagem(msgId);
    if (!modelo) {
      throw new Error('Não achei esta mensagem na conversa aberta. Role até ela e tente de novo.');
    }

    // O wa-js aceita o modelo ou o id serializado DELE (não o do DOM).
    const idDoWpp: string = modelo?.id?._serialized ?? msgId;
    const tentativas: { nome: string; executar: () => Promise<Blob> }[] = [
      { nome: 'modelo', executar: () => WPP.chat.downloadMedia(modelo) },
      { nome: 'id do WPP', executar: () => WPP.chat.downloadMedia(idDoWpp) },
    ];
    if (typeof modelo.downloadMedia === 'function') {
      tentativas.push({ nome: 'modelo.downloadMedia', executar: () => modelo.downloadMedia() });
    }

    let blob: Blob | null = null;
    const falhas: string[] = [];
    for (const tentativa of tentativas) {
      try {
        blob = await tentativa.executar();
        if (blob) break;
        falhas.push(`${tentativa.nome}: vazio`);
      } catch (e: any) {
        falhas.push(`${tentativa.nome}: ${e?.message ?? e}`);
      }
    }

    if (!blob) {
      console.warn('[BuildChat] downloadMedia falhou —', falhas.join(' | '));
      throw new Error(`Não consegui baixar este áudio (${falhas[0] ?? 'motivo desconhecido'}).`);
    }

    const dataUrl: string = await new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result));
      leitor.onerror = () => reject(new Error('Falha ao ler a mídia.'));
      leitor.readAsDataURL(blob!);
    });
    return { dataUrl, mime: blob.type || null, tamanho: blob.size };
  },

  /** Relatório de diagnóstico da transcrição — ver `__bcTranscricao()`. */
  async diagAudio({ msgId }: { msgId: string }) {
    const modelo = await buscarMensagem(msgId);
    return {
      wppPronto: !!(WPP?.conn?.isMainReady?.() ?? pronto),
      temDownloadMedia: typeof WPP?.chat?.downloadMedia,
      temGetMessageById: typeof WPP?.chat?.getMessageById,
      modeloEncontrado: !!modelo,
      tipoDaMensagem: modelo?.type ?? null,
      idDoModelo: modelo?.id?._serialized ?? null,
      idPedido: msgId,
      hashPedido: hashDoId(msgId),
      audiosEmCache: audiosConhecidos.size,
    };
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
