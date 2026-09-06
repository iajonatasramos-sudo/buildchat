// Lado do CONTENT SCRIPT: ponte RPC com o wa-bridge (contexto da página)
// + helpers de DOM com fallback (herdados do BuildChat v1).

import { aguardar, uid } from './utils';
import { aplicarVariaveis, type ContatoAtivo, type RespostaDC } from './types';
import {
  aplicarTagContato,
  obterFicha,
  registrarUltimoContato,
  obterMediaDataUrl,
  registrarMensagemCache,
  registrarRevogada,
  registrarUso,
} from './db';

type Pendente = { resolve: (v: any) => void; reject: (e: Error) => void; timer: number };
const pendentes = new Map<string, Pendente>();
let bridgePronta = false;
const listenersContato = new Set<(c: ContatoAtivo | null) => void>();

export function injetarBridge() {
  window.addEventListener('message', (ev: MessageEvent) => {
    const msg = ev.data;
    if (!msg || !msg.__bc) return;
    if (msg.__bc === 'res') {
      const p = pendentes.get(msg.id);
      if (!p) return;
      pendentes.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.data);
      else p.reject(new Error(msg.erro ?? 'Erro na ponte WPP'));
    } else if (msg.__bc === 'evt') {
      if (msg.evento === 'ready') {
        bridgePronta = true;
        console.info('[BuildChat] ponte WPP pronta.');
      }
      if (msg.evento === 'active-chat') listenersContato.forEach((fn) => fn(msg.data ?? null));
      if (msg.evento === 'nova-msg') registrarMensagemCache(msg.data).catch(() => {});
      if (msg.evento === 'msg-revoke') registrarRevogada(msg.data).catch(() => {});
    }
  });

  // O vendor do WPP e a ponte rodam como content scripts em world:MAIN
  // (declarados no manifest) — direto no contexto da página, imune a CSP.

  // O evento "ready" pode se perder (ex.: extensão recarregada) — um ping
  // periódico confirma a prontidão da ponte de qualquer forma.
  let tentativas = 0;
  const ping = window.setInterval(async () => {
    if (bridgePronta) {
      window.clearInterval(ping);
      return;
    }
    tentativas++;
    try {
      const r = await chamar<{ pronto: boolean }>('ping', undefined, 1500);
      if (r?.pronto) {
        bridgePronta = true;
        console.info('[BuildChat] ponte WPP pronta (via ping).');
        window.clearInterval(ping);
      } else if (tentativas % 5 === 0) {
        console.info('[BuildChat] aguardando WPP… status:', r);
      }
    } catch {
      if (tentativas % 5 === 0) console.info('[BuildChat] ponte não responde ao ping (script MAIN não carregou?).');
    }
  }, 2000);
}

export function bridgeDisponivel() {
  return bridgePronta;
}

function chamar<T = any>(cmd: string, payload?: any, timeoutMs = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = uid('req');
    const timer = window.setTimeout(() => {
      pendentes.delete(id);
      reject(new Error('Tempo esgotado na ponte WPP.'));
    }, timeoutMs);
    pendentes.set(id, { resolve, reject, timer });
    window.postMessage({ __bc: 'req', id, cmd, payload }, '*');
  });
}

// ───────────────────────── DOM (fallback e utilidades) ─────────────────────────

export const DOM = {
  getComposeBox(): HTMLElement | null {
    return (
      document.querySelector<HTMLElement>('footer div[contenteditable="true"][data-tab]') ||
      document.querySelector<HTMLElement>('div[contenteditable="true"][role="textbox"]') ||
      document.querySelector<HTMLElement>('footer [contenteditable="true"]')
    );
  },

  getActiveChatTitle(): string | null {
    const el =
      document.querySelector('#main header span[title]') ||
      document.querySelector("#main header span[dir='auto']");
    // `data-bc-original`: nomes.ts reescreve o texto do cabeçalho com o nome de
    // tratamento e guarda ali o original — é o original que identifica a conversa.
    return el
      ? (el.getAttribute('title') || (el as HTMLElement).dataset.bcOriginal || el.textContent || '').trim() || null
      : null;
  },

  /** Simula "colar" — funciona também no editor novo (Lexical) do WhatsApp. */
  colarTexto(box: HTMLElement, text: string): void {
    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    box.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  },

  /**
   * Substitui o conteúdo do compose por `text`. O editor do WhatsApp (Lexical)
   * renderiza de forma ASSÍNCRONA — checar o conteúdo logo após inserir lê o
   * campo "vazio" e causava texto duplicado. Estratégia: limpa, cola (sempre
   * funciona no Lexical), espera renderizar e só então usa insertText como
   * último recurso se nada apareceu.
   */
  async setComposeText(text: string): Promise<boolean> {
    const box = this.getComposeBox();
    if (!box) return false;
    box.focus();
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
    await aguardar(60);
    this.colarTexto(box, text);
    await aguardar(150);
    if (!(box.textContent ?? '').trim()) {
      document.execCommand('insertText', false, text);
      await aguardar(80);
    }
    return true;
  },

  limparCompose(): void {
    const box = this.getComposeBox();
    if (!box) return;
    box.focus();
    document.execCommand('selectAll', false);
    document.execCommand('delete', false);
  },

  clickSend(): boolean {
    const btn =
      document.querySelector<HTMLElement>('button[aria-label="Enviar"]') ||
      document.querySelector<HTMLElement>('button[aria-label="Send"]') ||
      document.querySelector<HTMLElement>('[data-testid="send"]') ||
      document.querySelector<HTMLElement>('span[data-icon="send"]')?.closest('button') ||
      document.querySelector<HTMLElement>('span[data-icon="wds-ic-send-filled"]')?.closest('button') ||
      null;
    if (btn) {
      btn.click();
      return true;
    }
    // Último recurso: Enter na caixa de mensagem (o WhatsApp envia com Enter).
    const box = this.getComposeBox();
    if (!box) return false;
    box.focus();
    box.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }),
    );
    return true;
  },
};

// ───────────────────────── Conversa ativa ─────────────────────────

export async function getContatoAtivo(): Promise<ContatoAtivo | null> {
  if (bridgePronta) {
    try {
      const c = await chamar<ContatoAtivo | null>('activeChat', undefined, 4000);
      if (c) return c;
    } catch {
      /* cai para o DOM */
    }
  }
  const titulo = DOM.getActiveChatTitle();
  return titulo ? { chatId: `wa:${titulo}`, nome: titulo, telefone: null, ehGrupo: false } : null;
}

/** Observa troca de conversa (evento WPP + fallback por MutationObserver no DOM). */
export function observarConversa(cb: (c: ContatoAtivo | null) => void): () => void {
  listenersContato.add(cb);
  let ultimoTitulo: string | null = DOM.getActiveChatTitle();
  const obs = new MutationObserver(() => {
    const t = DOM.getActiveChatTitle();
    if (t !== ultimoTitulo) {
      ultimoTitulo = t;
      getContatoAtivo().then(cb);
    }
  });
  const raiz = document.querySelector('#app') ?? document.body;
  obs.observe(raiz, { childList: true, subtree: true });
  return () => {
    listenersContato.delete(cb);
    obs.disconnect();
  };
}

export type ChatResumo = ContatoAtivo & { naoLidas: number; ultimaTs: number | null };

/** Fotos de perfil dos contatos informados (id → url ou null). */
export async function fotosDosContatos(ids: string[]): Promise<Record<string, string | null>> {
  if (!bridgePronta || ids.length === 0) return {};
  try {
    return await chamar<Record<string, string | null>>('fotos', { ids }, 15000);
  } catch {
    return {};
  }
}

/** Lista todas as conversas via WPP (vazio se a ponte não estiver pronta). */
export async function listarChats(): Promise<ChatResumo[]> {
  if (!bridgePronta) return [];
  try {
    return await chamar<ChatResumo[]>('listChats', undefined, 10000);
  } catch {
    return [];
  }
}

import { migrarChavesWa } from './db';

let reconciliou = false;
/**
 * Uma vez por sessão, com o WPP pronto: converte as chaves antigas de
 * etiquetas ("wa:<nome>"/"wa:<telefone>", herdadas do seed) para os ids reais
 * das conversas — sem isso o filtro de pastas não encontra as conversas.
 * Retorna null enquanto não conseguiu rodar (sem ponte/sem conversas).
 */
export async function reconciliarTagsContatos(): Promise<number | null> {
  if (reconciliou) return 0;
  if (!bridgePronta) return null;
  const chats = await listarChats();
  if (!chats.length) return null;
  reconciliou = true;
  const n = await migrarChavesWa(chats);
  if (n > 0) console.info(`[BuildChat] ${n} vínculo(s) de pasta migrados para ids reais do WhatsApp.`);
  return n;
}

/** Alterna o "fixar" da conversa ativa. Retorna o novo estado, ou null se indisponível. */
export async function alternarFixado(): Promise<boolean | null> {
  if (!bridgePronta) return null;
  try {
    const c = await chamar<(ContatoAtivo & { fixada?: boolean }) | null>('activeChat', undefined, 4000);
    if (!c) return null;
    const novo = !c.fixada;
    await chamar('pinChat', { chatId: c.chatId, pin: novo }, 8000);
    return novo;
  } catch (e) {
    console.warn('[BuildChat] fixar conversa falhou:', e);
    return null;
  }
}

/** Abre uma conversa pelo id (WPP). */
export async function abrirChat(chatId: string): Promise<boolean> {
  if (!bridgePronta) return false;
  try {
    await chamar('openChat', { chatId }, 8000);
    return true;
  } catch {
    return false;
  }
}

export async function getInfoConta(): Promise<{
  id: string | null;
  numero: string | null;
  nome: string | null;
  conectado: boolean;
}> {
  if (!bridgePronta) return { id: null, numero: null, nome: null, conectado: false };
  try {
    return await chamar('selfInfo', undefined, 4000);
  } catch {
    return { id: null, numero: null, nome: null, conectado: false };
  }
}

// ───────────────────────── Envio ─────────────────────────

export async function enviarTexto(texto: string, chatId?: string): Promise<void> {
  if (bridgePronta) {
    try {
      await chamar('sendText', { chatId, texto });
      return;
    } catch (e) {
      console.warn('[BuildChat] envio via WPP falhou, tentando pela caixa de mensagem:', e);
    }
  }
  // Fallback DOM: insere e envia (botão ou Enter)
  if (!(await DOM.setComposeText(texto))) throw new Error('Caixa de mensagem não encontrada — abra uma conversa.');
  await aguardar(150);
  if (!DOM.clickSend()) throw new Error('Não consegui acionar o envio no WhatsApp.');
  await aguardar(150);
}

function dataUrlParaFile(dataUrl: string, mime: string | null, nome: string | null): File {
  const [cabecalho, b64] = dataUrl.split(',');
  const tipo = mime ?? cabecalho.match(/^data:([^;]*)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const ext = tipo.split('/')[1]?.split('+')[0] ?? 'bin';
  return new File([arr], nome || `arquivo.${ext}`, { type: tipo });
}

async function esperarElemento<T>(fn: () => T | null | undefined, tentativas: number, intervaloMs: number): Promise<T | null> {
  for (let i = 0; i < tentativas; i++) {
    const v = fn();
    if (v) return v;
    await aguardar(intervaloMs);
  }
  return null;
}

/**
 * Fallback sem WPP: anexa o arquivo pelo próprio fluxo do WhatsApp
 * (botão + → input de arquivo → enviar na pré-visualização).
 */
async function enviarMidiaPorDom(dataUrl: string, mime: string | null, nome: string | null): Promise<void> {
  const file = dataUrlParaFile(dataUrl, mime, nome);

  const btnAnexo =
    document.querySelector<HTMLElement>('#main span[data-icon="plus"]')?.closest('button') ||
    document.querySelector<HTMLElement>('#main span[data-icon="plus-rounded"]')?.closest('button') ||
    document.querySelector<HTMLElement>('#main span[data-icon="attach-menu-plus"]')?.closest('button') ||
    document.querySelector<HTMLElement>('#main span[data-icon="clip"]')?.closest('button') ||
    document.querySelector<HTMLElement>('#main button[aria-label="Attach"]') ||
    document.querySelector<HTMLElement>('#main button[aria-label="Anexar"]');
  if (!btnAnexo) throw new Error('Botão de anexar do WhatsApp não encontrado.');
  btnAnexo.click();

  // O menu cria vários inputs; o de documento aceita qualquer tipo ("*").
  const input = await esperarElemento(() => {
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')];
    return (
      inputs.find((i) => (i.accept || '').includes('*')) ||
      inputs.find((i) => !!mime && i.accept.includes(mime.split('/')[0]!)) ||
      inputs[0] ||
      null
    );
  }, 20, 150);
  if (!input) throw new Error('Campo de arquivo do WhatsApp não encontrado.');

  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));

  const btnEnviar = await esperarElemento(
    () =>
      document.querySelector<HTMLElement>('div[role="dialog"] span[data-icon="send"]')?.closest('button') ||
      document.querySelector<HTMLElement>('div[role="dialog"] span[data-icon="wds-ic-send-filled"]')?.closest('button') ||
      document.querySelector<HTMLElement>('span[data-icon="wds-ic-send-filled"]')?.closest('button') ||
      document.querySelector<HTMLElement>('span[data-icon="send"]')?.closest('button'),
    40,
    250,
  );
  if (!btnEnviar) throw new Error('Botão de enviar da pré-visualização não encontrado.');
  btnEnviar.click();
  await aguardar(600);
}

/** Ids das mensagens de áudio da conversa aberta (vazio se a ponte não responder). */
export async function idsDeAudioDoChat(): Promise<string[]> {
  try {
    const r = await chamar<{ ids: string[] }>('audiosDoChat', {}, 8000);
    return r?.ids ?? [];
  } catch {
    return [];
  }
}

/** Relatório da ponte sobre um áudio — usado pelo diagnóstico do console. */
export async function diagnosticarAudio(msgId: string): Promise<unknown> {
  try {
    return await chamar('diagAudio', { msgId }, 8000);
  } catch (e) {
    return { erroNaPonte: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Áudio de uma mensagem, como Blob.
 *
 * Primeiro o caminho barato: o <audio> da bolha guarda um blob URL do próprio
 * documento, então basta buscá-lo. Se o WhatsApp já descartou esse blob (é o
 * que acontece em conversa antiga), o WPP baixa e descriptografa de novo.
 */
export async function obterAudioDaMensagem(audioEl: HTMLAudioElement | null, msgId: string | null): Promise<Blob> {
  const src = audioEl?.getAttribute('src') || audioEl?.src || '';
  if (src && !src.startsWith('data:')) {
    try {
      const blob = await (await fetch(src)).blob();
      if (blob.size > 0) return blob;
    } catch {
      /* blob revogado — segue para o WPP */
    }
  }

  if (!msgId) throw new Error('Não consegui identificar este áudio. Toque nele uma vez e tente de novo.');
  const r = await chamar<{ dataUrl: string }>('downloadMedia', { msgId }, 60000);
  return await (await fetch(r.dataUrl)).blob();
}

/**
 * Envia um arquivo pronto (ex.: o PDF da proposta) na conversa aberta.
 * Tenta o WPP e cai no fluxo de anexo do próprio WhatsApp se ele não estiver
 * disponível — mesma estratégia das mídias das mensagens rápidas.
 */
export async function enviarArquivo(
  blob: Blob,
  nome: string,
  legenda?: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const contato = await getContatoAtivo();
  if (!contato) return { ok: false, erro: 'Abra a conversa antes de anexar.' };

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });

  try {
    if (bridgePronta) {
      await chamar(
        'sendFile',
        {
          chatId: contato.chatId.startsWith('wa:') ? undefined : contato.chatId,
          dataUrl,
          tipo: 'documento',
          mime: blob.type || 'application/pdf',
          nome,
          legenda: legenda || null,
        },
        90000,
      );
    } else {
      await enviarMidiaPorDom(dataUrl, blob.type || 'application/pdf', nome);
      if (legenda?.trim()) await enviarTexto(legenda);
    }
    registrarUltimoContato(contato.chatId, contato.nome).catch(() => {});
    return { ok: true };
  } catch (e: any) {
    console.warn('[BuildChat] anexar arquivo falhou:', e);
    return { ok: false, erro: e?.message ?? 'Não consegui anexar o arquivo.' };
  }
}

export async function enviarMidia(
  acao: { midiaPath: string; midiaMime: string | null; midiaNome: string | null; tipo: string; texto: string },
  chatId?: string,
): Promise<void> {
  const dataUrl = await obterMediaDataUrl(acao.midiaPath, acao.midiaMime);
  if (!dataUrl) throw new Error(`Arquivo de mídia não encontrado (${acao.midiaPath}).`);
  console.info('[BuildChat] enviando mídia:', {
    tipo: acao.tipo,
    mime: acao.midiaMime,
    nome: acao.midiaNome,
    tamanho: dataUrl.length,
    viaWpp: bridgePronta,
  });

  if (bridgePronta) {
    try {
      await chamar('sendFile', {
        chatId,
        dataUrl,
        tipo: acao.tipo,
        mime: acao.midiaMime,
        nome: acao.midiaNome,
        legenda: acao.texto || null,
      }, 90000);
      return;
    } catch (e) {
      console.warn('[BuildChat] envio via WPP falhou; tentando pelo anexo do WhatsApp:', e);
    }
  }

  // Sem WPP (ou WPP falhou): usa o fluxo de anexo nativo do WhatsApp.
  await enviarMidiaPorDom(dataUrl, acao.midiaMime, acao.midiaNome);
  // A legenda não entra no fluxo de anexo — vai como mensagem em seguida.
  if (acao.texto.trim()) await enviarTexto(acao.texto);
}

export type ResultadoExecucao = { ok: true } | { ok: false; erro: string };

/**
 * Executa a sequência de ações de uma resposta rápida na conversa ativa:
 * espera o delay de cada ação, substitui variáveis, envia texto/mídia,
 * aplica a etiqueta configurada e dispara o webhook.
 */
export async function executarResposta(resposta: RespostaDC): Promise<ResultadoExecucao> {
  const contatoWa = await getContatoAtivo();
  if (!contatoWa) return { ok: false, erro: 'Abra uma conversa antes de enviar.' };

  // O nome cadastrado na ficha manda em {{nome}}; sem ele, vale o do WhatsApp.
  const ficha = await obterFicha(contatoWa.chatId);
  const contato = { ...contatoWa, nome: ficha.nome?.trim() || contatoWa.nome };

  try {
    for (const acao of resposta.acoes) {
      if (acao.delaySegundos > 0) await aguardar(acao.delaySegundos * 1000);
      if (acao.midiaPath) {
        await enviarMidia(
          { midiaPath: acao.midiaPath, midiaMime: acao.midiaMime, midiaNome: acao.midiaNome, tipo: acao.tipo, texto: aplicarVariaveis(acao.texto, contato) },
          contato.chatId.startsWith('wa:') ? undefined : contato.chatId,
        );
      } else if (acao.texto.trim()) {
        await enviarTexto(
          aplicarVariaveis(acao.texto, contato),
          contato.chatId.startsWith('wa:') ? undefined : contato.chatId,
        );
      }
    }
  } catch (e: any) {
    console.warn('[BuildChat] executarResposta falhou:', e);
    return { ok: false, erro: e?.message ?? 'Falha ao enviar.' };
  }

  registrarUso(resposta.id).catch(() => {});
  // Alimenta o CRM do painel: data do último envio para esta conversa.
  registrarUltimoContato(contatoWa.chatId, contatoWa.nome).catch(() => {});
  if (resposta.tagId) aplicarTagContato(contato.chatId, resposta.tagId).catch(() => {});
  try {
    chrome.runtime.sendMessage({
      type: 'bc:webhook',
      event: 'quick_reply_sent',
      payload: {
        chatId: contato.chatId,
        contact: contato.nome,
        phone: contato.telefone,
        reply: { id: resposta.id, titulo: resposta.titulo, atalho: resposta.atalho },
        tag: resposta.tagId ? { id: resposta.tagId, nome: resposta.tagNome } : null,
        at: new Date().toISOString(),
      },
    });
  } catch {
    /* service worker pode estar dormindo; o webhook é melhor-esforço */
  }
  return { ok: true };
}

/** Só insere o texto no compose (sem enviar) — usado no picker "/" com Tab. */
export async function inserirTextoNoCompose(resposta: RespostaDC, contato: ContatoAtivo | null) {
  const primeira = resposta.acoes.find((a) => a.texto.trim());
  if (!primeira) return;
  const ficha = contato ? await obterFicha(contato.chatId) : null;
  const ctx = contato ? { ...contato, nome: ficha?.nome?.trim() || contato.nome } : {};
  await DOM.setComposeText(aplicarVariaveis(primeira.texto, ctx));
}
