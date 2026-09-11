// WebHooks de saída: quando uma mensagem chega, a extensão manda os dados
// escolhidos para o endereço que a clínica configurou.
//
// É o webhook "do balcão": simples, um endereço, e a pessoa marca o que quer
// enviar. (O de Automações é outro: ele nasce dentro de uma regra, com
// segredo e eventos próprios.)
//
// Regra de quem dispara: mensagem RECEBIDA, de contato — grupo fica de fora,
// como no motor das automações. O envio sai pelo service worker, porque a
// URL é de qualquer domínio.

import * as db from './db';
import { perfilAtual } from './store';
import { formatarTelefone } from './utils';

export type CampoWebhook = 'evento' | 'numero' | 'foto' | 'pastas' | 'contato' | 'usuario';

export const CAMPOS: { chave: CampoWebhook; rotulo: string; ajuda: string }[] = [
  { chave: 'evento', rotulo: 'Dados do evento', ajuda: 'texto, tipo, id e horário da mensagem' },
  { chave: 'numero', rotulo: 'Número', ajuda: 'telefone do contato, com DDI' },
  { chave: 'foto', rotulo: 'Foto', ajuda: 'endereço da foto de perfil no WhatsApp' },
  { chave: 'pastas', rotulo: 'Pastas do contato', ajuda: 'as etiquetas em que ele está' },
  { chave: 'contato', rotulo: 'Perfil do contato', ajuda: 'nome, interesses e último contato' },
  { chave: 'usuario', rotulo: 'Usuário logado', ajuda: 'quem está atendendo, e a clínica' },
];

export type ConfigWebhook = {
  url: string;
  ativo: boolean;
  campos: Record<CampoWebhook, boolean>;
};

export type EnvioWebhook = {
  em: string;
  ok: boolean;
  status?: number;
  erro?: string;
  /** Entregue às cegas: o destino não deixa a extensão ler a resposta. */
  semConfirmacao?: boolean;
  /** Resumo do que foi mandado, para conferir sem abrir o servidor. */
  resumo: string;
};

const K_CONFIG = 'bc2_webhook';
const K_LOG = 'bc2_webhook_log';
const MAX_LOG = 30;

export const CONFIG_PADRAO: ConfigWebhook = {
  url: '',
  ativo: false,
  campos: { evento: true, numero: true, foto: false, pastas: false, contato: false, usuario: false },
};

const ler = <T>(chave: string, padrao: T) =>
  new Promise<T>((r) => chrome.storage.local.get(chave, (res) => r(res[chave] ?? padrao)));
const gravar = (chave: string, valor: unknown) =>
  new Promise<void>((r) => chrome.storage.local.set({ [chave]: valor }, () => r()));

export async function obterConfig(): Promise<ConfigWebhook> {
  const salvo = await ler<Partial<ConfigWebhook>>(K_CONFIG, {});
  return { ...CONFIG_PADRAO, ...salvo, campos: { ...CONFIG_PADRAO.campos, ...(salvo.campos ?? {}) } };
}

export const salvarConfig = (c: ConfigWebhook) => gravar(K_CONFIG, c);

export const listarEnvios = () => ler<EnvioWebhook[]>(K_LOG, []);
export const limparEnvios = () => gravar(K_LOG, []);

async function registrarEnvio(e: EnvioWebhook) {
  const lista = await listarEnvios();
  await gravar(K_LOG, [e, ...lista].slice(0, MAX_LOG));
}

/** Telefone do contato: o da ficha vale; do jid só quando ele é `@c.us`. */
function telefoneDe(chatId: string, ficha: { telefone: string | null }): string | null {
  const digitos = ficha.telefone ?? (chatId.endsWith('@c.us') ? chatId.split('@')[0] : null);
  return digitos ? formatarTelefone(digitos) ?? `+${digitos}` : null;
}

export type MensagemRecebidaWebhook = {
  id: string | null;
  chatId: string | null;
  texto: string | null;
  tipo: string | null;
  autor: string | null;
  ts: number | null;
  deMim?: boolean;
};

/** Monta o corpo do POST com o que estiver marcado. */
export async function montarCorpo(m: MensagemRecebidaWebhook, cfg: ConfigWebhook) {
  const chatId = m.chatId ?? '';
  const corpo: Record<string, unknown> = {
    evento: 'mensagem_recebida',
    em: new Date().toISOString(),
    chat_id: chatId,
  };

  if (cfg.campos.evento) {
    corpo.mensagem = {
      id: m.id,
      texto: m.texto,
      tipo: m.tipo,
      de_mim: !!m.deMim,
      recebida_em: m.ts ? new Date(m.ts * 1000).toISOString() : null,
    };
  }

  const precisaFicha = cfg.campos.numero || cfg.campos.contato;
  const ficha = precisaFicha ? await db.obterFicha(chatId) : null;

  if (cfg.campos.numero) corpo.numero = telefoneDe(chatId, ficha!);

  if (cfg.campos.contato && ficha) {
    corpo.contato = {
      nome: ficha.nome,
      nome_whatsapp: ficha.nomeWhatsapp,
      telefone: ficha.telefone,
      interesses: ficha.interesses,
      ultimo_contato: ficha.ultimoContato,
    };
  }

  if (cfg.campos.pastas) {
    const [ids, tags] = await Promise.all([db.tagsDoContato(chatId), db.listarTags()]);
    corpo.pastas = tags.filter((t) => ids.includes(t.id)).map((t) => ({ id: t.id, nome: t.nome, cor: t.cor }));
  }

  if (cfg.campos.foto) {
    // A foto vem do WPP; import tardio para não criar ciclo com wa.ts.
    const { fotosDosContatos } = await import('./wa');
    corpo.foto = (await fotosDosContatos([chatId]))[chatId] ?? null;
  }

  if (cfg.campos.usuario) {
    const p = perfilAtual.get();
    corpo.usuario = p
      ? { id: p.id, nome: p.nome, email: p.email, papel: p.papel, empresa: { id: p.empresa.id, nome: p.empresa.nome } }
      : null;
  }

  return corpo;
}

/** Manda o POST pelo service worker e guarda o resultado no histórico. */
export async function dispararWebhook(m: MensagemRecebidaWebhook, cfgForcada?: ConfigWebhook): Promise<EnvioWebhook> {
  const cfg = cfgForcada ?? (await obterConfig());
  const corpo = await montarCorpo(m, cfg);
  const resumo = `${m.chatId?.split('@')[0] ?? 'contato'} · ${(m.texto ?? '(sem texto)').slice(0, 40)}`;

  const resposta = await new Promise<{ ok: boolean; status?: number; erro?: string }>((r) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'bc:webhook:saida', url: cfg.url, event: 'mensagem_recebida', payload: corpo },
        (res) => r(res ?? { ok: false, erro: chrome.runtime.lastError?.message ?? 'sem resposta' }),
      );
    } catch (e: any) {
      r({ ok: false, erro: e?.message ?? 'falha ao enviar' });
    }
  });

  const envio: EnvioWebhook = { em: new Date().toISOString(), resumo, ...resposta };
  await registrarEnvio(envio);
  return envio;
}

/** Chamado a cada mensagem nova que a ponte entrega. */
export async function aoReceberMensagem(m: MensagemRecebidaWebhook): Promise<void> {
  if (!m.chatId || m.deMim || m.chatId.endsWith('@g.us')) return;
  const cfg = await obterConfig();
  if (!cfg.ativo || !cfg.url.trim()) return;
  await dispararWebhook(m, cfg).catch(() => {});
}

/**
 * Permissão para falar com o domínio do webhook.
 *
 * O `manifest` só libera o WhatsApp e as nossas APIs; para qualquer outro
 * endereço o Chrome exige permissão — e ela tem de ser pedida DENTRO de um
 * clique da pessoa. Sem isso, o navegador barra a resposta e o envio vira
 * "às cegas" (o corpo chega, mas não sabemos o que o destino respondeu).
 */
export function origemDaUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    return /^https?:$/.test(u.protocol) ? `${u.protocol}//${u.host}/*` : null;
  } catch {
    return null;
  }
}

export function temPermissao(url: string): Promise<boolean> {
  const origem = origemDaUrl(url);
  if (!origem) return Promise.resolve(false);
  return new Promise((r) => {
    try {
      chrome.permissions.contains({ origins: [origem] }, (tem) => r(!!tem && !chrome.runtime.lastError));
    } catch {
      r(false);
    }
  });
}

/** Pede a permissão — precisa ser chamado a partir de um clique. */
export function pedirPermissao(url: string): Promise<boolean> {
  const origem = origemDaUrl(url);
  if (!origem) return Promise.resolve(false);
  return new Promise((r) => {
    try {
      chrome.permissions.request({ origins: [origem] }, (ok) => r(!!ok && !chrome.runtime.lastError));
    } catch {
      r(false);
    }
  });
}
