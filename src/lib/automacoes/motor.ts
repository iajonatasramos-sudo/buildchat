// Automações — persistência e MOTOR, rodando no navegador.
//
// O BuildClinic executa isto no servidor (Evolution API). Aqui o WhatsApp é o
// da própria aba, então o motor mora no content script:
//   * gatilho "mensagem recebida" = evento `chat.new_message` do WPP (a ponte
//     já o emite como 'nova-msg');
//   * ações de envio = as mesmas funções que a extensão usa para enviar;
//   * esperas DURÁVEIS: cada disparo vira uma execução persistida em
//     chrome.storage com `proximoIndice` + `executarEm`; um laço processa as
//     vencidas enquanto a aba estiver aberta e o service worker cutuca por
//     chrome.alarms. Fechou o navegador? Ao abrir, o que venceu roda.
//
// Semântica das condições e das fases copiada de sales-automacoes.ts.

import * as db from '../db';
import { servidorConfigurado } from '@/lib/config';
import { perfilAtual } from '@/lib/store';
import { aplicarVariaveis } from '../types';
import { enviarMidia, enviarTexto, getContatoAtivo } from '../wa';
import { obterFicha } from '../db';
import { esperaEmMs, type Acao, type AlvoCampanha, type Automacao, type Campanha, type Condicao, type EventoNotif, type EventoWebhook, type Execucao, type NotificacaoConfig, type WebhookConfig, EVENTOS_NOTIF, LABEL_EVENTO_NOTIF } from './tipos';

const K = {
  automacoes: 'bc2_automacoes',
  execucoes: 'bc2_auto_execucoes',
  feitos: 'bc2_auto_feitos', // `${automacaoId}|${chatId}` — reexecução "uma vez"
  campanhas: 'bc2_campanhas',
  notificacoes: 'bc2_notificacoes',
  webhook: 'bc2_webhook',
} as const;

const ler = <T>(k: string, padrao: T) =>
  new Promise<T>((r) => chrome.storage.local.get(k, (res) => r((res[k] as T) ?? padrao)));
const gravar = (k: string, v: unknown) => new Promise<void>((r) => chrome.storage.local.set({ [k]: v }, () => r()));

// ───────────────────────────── Persistência ─────────────────────────────

export const listarAutomacoes = async () =>
  (await ler<Automacao[]>(K.automacoes, [])).sort((a, b) => a.ordem - b.ordem);

export async function salvarAutomacao(a: Automacao): Promise<void> {
  const lista = await ler<Automacao[]>(K.automacoes, []);
  const i = lista.findIndex((x) => x.id === a.id);
  const nova = { ...a, atualizadoEm: new Date().toISOString() };
  if (i >= 0) lista[i] = nova;
  else lista.push(nova);
  await gravar(K.automacoes, lista);
}

export async function removerAutomacao(id: string): Promise<void> {
  await gravar(K.automacoes, (await ler<Automacao[]>(K.automacoes, [])).filter((a) => a.id !== id));
  await gravar(K.execucoes, (await ler<Execucao[]>(K.execucoes, [])).filter(
    (e) => !(e.origem.tipo === 'bot' && e.origem.automacaoId === id && e.status === 'agendado'),
  ));
}

export async function reordenarAutomacoes(ids: string[]): Promise<void> {
  const lista = await ler<Automacao[]>(K.automacoes, []);
  await gravar(K.automacoes, lista.map((a) => ({ ...a, ordem: Math.max(0, ids.indexOf(a.id)) })));
}

export const listarExecucoes = () => ler<Execucao[]>(K.execucoes, []);
export const listarCampanhas = () => ler<Campanha[]>(K.campanhas, []);

export async function salvarCampanha(c: Campanha): Promise<void> {
  const lista = await ler<Campanha[]>(K.campanhas, []);
  const i = lista.findIndex((x) => x.id === c.id);
  const nova = { ...c, atualizadoEm: new Date().toISOString() };
  if (i >= 0) lista[i] = nova;
  else lista.push(nova);
  await gravar(K.campanhas, lista);
}

export async function removerCampanha(id: string): Promise<void> {
  await gravar(K.campanhas, (await ler<Campanha[]>(K.campanhas, [])).filter((c) => c.id !== id));
}

export async function listarNotificacoes(): Promise<NotificacaoConfig[]> {
  const salvas = await ler<NotificacaoConfig[]>(K.notificacoes, []);
  // Uma linha por evento, sempre — a tela mostra todos, ligados ou não.
  return EVENTOS_NOTIF.map(
    (evento) =>
      salvas.find((n) => n.evento === evento) ?? {
        evento,
        ativo: false,
        destinatarios: [],
        campos: ['contato', 'telefone', 'detalhe', 'quando'],
        textoExtra: '',
      },
  );
}
export const salvarNotificacoes = (lista: NotificacaoConfig[]) => gravar(K.notificacoes, lista);

export const obterWebhook = () =>
  ler<WebhookConfig>(K.webhook, { url: '', ativo: false, eventos: [], segredo: '' });
export const salvarWebhook = (w: WebhookConfig) => gravar(K.webhook, w);

// ───────────────────────────── Condições ─────────────────────────────
// Exatamente como no BuildClinic: tudo case-insensitive onde indicado.

type Alvos = { texto: string; telefone: string; ddd: string };

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function testarCondicao(c: Condicao, a: Alvos): boolean {
  const alvo = c.campo === 'mensagem' ? a.texto : c.campo === 'ddd' ? a.ddd : a.telefone;
  const val = (c.valor ?? '').trim();
  const alvoL = (alvo ?? '').toLowerCase();
  const valL = val.toLowerCase();
  switch (c.operador) {
    case 'exato':
      return alvoL === valL;
    case 'contem':
      return valL !== '' && alvoL.includes(valL);
    case 'palavra':
      try {
        return new RegExp(`\\b${escaparRegex(val)}\\b`, 'i').test(alvo);
      } catch {
        return false;
      }
    case 'regex':
      try {
        return new RegExp(val, 'i').test(alvo);
      } catch {
        return false;
      }
    case 'igual':
      return alvo.trim() === val;
    case 'em':
      return val
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .some((v) => alvo.trim() === v || alvoL === v.toLowerCase());
    case 'comeca_com':
      return alvoL.startsWith(valL);
    default:
      return false;
  }
}

export function avaliarCondicoes(a: Alvos, condicoes: Condicao[], combinacao: 'E' | 'OU'): boolean {
  if (condicoes.length === 0) return true; // "qualquer mensagem"
  return combinacao === 'OU' ? condicoes.some((c) => testarCondicao(c, a)) : condicoes.every((c) => testarCondicao(c, a));
}

/** Telefone e DDD a partir do jid (`5511999998888@c.us` → 5511…, 11). */
function telefoneDoJid(chatId: string): { telefone: string; ddd: string } {
  const raw = chatId.split('@')[0]?.replace(/\D/g, '') ?? '';
  let n = raw;
  if (n.startsWith('55') && n.length >= 12) n = n.slice(2);
  return { telefone: raw, ddd: n.slice(0, 2) };
}

const esperaDaAcao = (a: Acao) => esperaEmMs(a.esperaValor ?? 0, a.esperaUnidade ?? 'seg');

// ───────────────────────────── Gatilho: mensagem ─────────────────────────────

export type MensagemRecebida = {
  chatId: string | null;
  deMim: boolean;
  texto: string | null;
  tipo: string | null;
};

/** Sem conta, o motor fica parado — nada da extensão funciona deslogado. */
function logado(): boolean {
  return !servidorConfigurado() || !!perfilAtual.get();
}

/** Chamado pela ponte a cada mensagem nova. Só o que vem DE FORA, de contato (não grupo). */
export async function aoReceberMensagem(m: MensagemRecebida): Promise<void> {
  if (!logado()) return;
  if (!m.chatId || m.deMim || m.chatId.endsWith('@g.us')) return;
  const regras = (await listarAutomacoes()).filter((r) => r.ativo && r.gatilho === 'mensagem');
  if (regras.length === 0) {
    await emitirWebhook('mensagem_recebida', { chatId: m.chatId, texto: m.texto, tipo: m.tipo });
    return;
  }

  const { telefone, ddd } = telefoneDoJid(m.chatId);
  const alvos: Alvos = { texto: m.texto ?? '', telefone, ddd };
  const feitos = new Set(await ler<string[]>(K.feitos, []));
  const ficha = await obterFicha(m.chatId);
  const nome = ficha.nome?.trim() || ficha.nomeWhatsapp?.trim() || '';
  let disparou = false;

  for (const r of regras) {
    const chave = `${r.id}|${m.chatId}`;
    if (r.reexecucao === 'uma_vez' && feitos.has(chave)) continue;
    const fase1 = r.condicoes.filter((c) => (c.fase ?? 1) === 1);
    if (!avaliarCondicoes(alvos, fase1, r.condicaoCombinacao)) continue;

    feitos.add(chave);
    disparou = true;
    await agendarExecucao({
      origem: { tipo: 'bot', automacaoId: r.id },
      chatId: m.chatId,
      contexto: { ...alvos, nome },
      acoes: r.acoes,
      condicoes: r.condicoes,
      condicaoCombinacao: r.condicaoCombinacao,
    });
    await salvarAutomacao({ ...r, execucoes: (r.execucoes ?? 0) + 1 });
    await emitirWebhook('bot_disparado', { automacao: r.nome, chatId: m.chatId, texto: m.texto });
    if (r.pararNoMatch) break;
  }
  await gravar(K.feitos, [...feitos].slice(-5000));
  await emitirWebhook('mensagem_recebida', { chatId: m.chatId, texto: m.texto, tipo: m.tipo, disparouBot: disparou });
  if (disparou) processarFila().catch(() => {});
}

// ───────────────────────────── Fila durável ─────────────────────────────

async function agendarExecucao(
  base: Pick<Execucao, 'origem' | 'chatId' | 'contexto' | 'acoes' | 'condicoes' | 'condicaoCombinacao'> & { executarEm?: number },
): Promise<void> {
  const fila = await ler<Execucao[]>(K.execucoes, []);
  const primeira = base.acoes[0];
  fila.push({
    ...base,
    id: crypto.randomUUID(),
    proximoIndice: 0,
    executarEm: base.executarEm ?? Date.now() + (primeira ? esperaDaAcao(primeira) : 0),
    status: 'agendado',
    criadoEm: new Date().toISOString(),
    atualizadoEm: new Date().toISOString(),
  });
  // Histórico curto: concluídas antigas saem para o storage não crescer sem fim.
  const enxuta = fila.filter((e) => e.status === 'agendado').concat(
    fila.filter((e) => e.status !== 'agendado').slice(-200),
  );
  await gravar(K.execucoes, enxuta);
}

let processando = false;

/**
 * Roda tudo que venceu. Idempotente e reentrante-seguro: uma execução por vez
 * por chamada; o laço periódico chama de novo em seguida.
 */
export async function processarFila(): Promise<void> {
  if (processando || !logado()) return;
  processando = true;
  try {
    const fila = await ler<Execucao[]>(K.execucoes, []);
    const agora = Date.now();
    const vencidas = fila.filter((e) => e.status === 'agendado' && e.executarEm <= agora);
    for (const exec of vencidas) {
      await avancarExecucao(exec.id);
    }
    await avancarCampanhas();
  } finally {
    processando = false;
  }
}

// Fases ("Então"): ao entrar numa fase >= 2 as condições dela são avaliadas com
// os alvos do gatilho; reprovou, a fase inteira é pulada (sem contar a espera).
async function avancarExecucao(execId: string): Promise<void> {
  const fila = await ler<Execucao[]>(K.execucoes, []);
  const exec = fila.find((e) => e.id === execId);
  if (!exec || exec.status !== 'agendado') return;

  const alvos: Alvos = exec.contexto;
  const condPorFase = new Map<number, Condicao[]>();
  for (const c of exec.condicoes) {
    const f = c.fase ?? 1;
    condPorFase.set(f, [...(condPorFase.get(f) ?? []), c]);
  }
  const cacheFase = new Map<number, boolean>();
  const faseAprovada = (f: number) => {
    if (f <= 1) return true;
    if (!cacheFase.has(f)) cacheFase.set(f, avaliarCondicoes(alvos, condPorFase.get(f) ?? [], exec.condicaoCombinacao));
    return cacheFase.get(f)!;
  };

  const salvar = async (patch: Partial<Execucao>) => {
    const atual = await ler<Execucao[]>(K.execucoes, []);
    const i = atual.findIndex((e) => e.id === execId);
    if (i >= 0) atual[i] = { ...atual[i], ...patch, atualizadoEm: new Date().toISOString() };
    await gravar(K.execucoes, atual);
  };

  let idx = exec.proximoIndice;
  let executarEm = exec.executarEm;
  const acoes = exec.acoes;

  while (idx < acoes.length) {
    if (!faseAprovada(acoes[idx].fase ?? 1)) {
      idx += 1;
      continue;
    }
    if (executarEm > Date.now()) {
      await salvar({ proximoIndice: idx, executarEm });
      return;
    }
    try {
      await executarAcao(acoes[idx], exec);
    } catch (e) {
      await salvar({ status: 'erro', proximoIndice: idx, erro: e instanceof Error ? e.message.slice(0, 300) : 'erro' });
      return;
    }
    idx += 1;
    while (idx < acoes.length && !faseAprovada(acoes[idx].fase ?? 1)) idx += 1;
    if (idx < acoes.length) executarEm = Date.now() + esperaDaAcao(acoes[idx]);
  }
  await salvar({ status: 'concluido', proximoIndice: idx });
}

// ───────────────────────────── Ações ─────────────────────────────

async function executarAcao(a: Acao, exec: Execucao): Promise<void> {
  const ctx = { nome: exec.contexto.nome, telefone: exec.contexto.telefone };
  switch (a.tipo) {
    case 'enviar_mensagem': {
      const texto = aplicarVariaveis(a.texto ?? '', ctx).trim();
      if (!texto) return;
      await enviarTexto(texto, exec.chatId);
      await db.registrarUltimoContato(exec.chatId);
      return;
    }
    case 'enviar_resposta_rapida': {
      const resposta = (await db.listarRespostas()).find((r) => r.id === a.respostaId);
      if (!resposta) throw new Error('Mensagem rápida não encontrada (foi apagada?).');
      for (const sub of resposta.acoes) {
        if (sub.tipo === 'texto') {
          const texto = aplicarVariaveis(sub.texto ?? '', ctx).trim();
          if (texto) await enviarTexto(texto, exec.chatId);
        } else if (sub.midiaPath) {
          await enviarMidia(
            { midiaPath: sub.midiaPath, midiaMime: sub.midiaMime ?? null, midiaNome: sub.midiaNome ?? null, tipo: sub.tipo, texto: aplicarVariaveis(sub.texto ?? '', ctx) },
            exec.chatId,
          );
        }
        // Intervalo da própria sequência (limitado: espera longa é o "esperar antes" da regra).
        if (sub.delaySegundos > 0) await new Promise((r) => setTimeout(r, Math.min(sub.delaySegundos * 1000, 30_000)));
      }
      await db.registrarUso(resposta.id).catch(() => {});
      await db.registrarUltimoContato(exec.chatId);
      return;
    }
    case 'mover_pasta':
      if (a.pastaId) {
        await db.aplicarTagContato(exec.chatId, a.pastaId);
        await notificar('contato_em_pasta', { chatId: exec.chatId, detalhe: await nomeDaPasta(a.pastaId) });
      }
      return;
    case 'remover_pasta':
      if (a.pastaId) await db.removerTagContato(exec.chatId, a.pastaId);
      return;
    case 'espera':
      return; // a espera é o "esperar antes" da próxima ação
  }
}

async function nomeDaPasta(id: string): Promise<string> {
  return (await db.listarTags()).find((t) => t.id === id)?.nome ?? 'pasta';
}

// ───────────────────────────── Campanhas ─────────────────────────────

/** Contatos que casam o segmento (a partir das fichas e vínculos locais). */
export async function alvosDoSegmento(segmento: Campanha['segmento']): Promise<{ chatId: string; nome: string }[]> {
  const [fichas, vinculos] = await Promise.all([db.mapaFichas(), db.mapaTagsContatos()]);
  const candidatos = new Set<string>([...Object.keys(fichas), ...Object.keys(vinculos)]);
  const saida: { chatId: string; nome: string }[] = [];
  for (const chatId of candidatos) {
    if (!chatId.includes('@') || chatId.endsWith('@g.us')) continue;
    const f = fichas[chatId];
    const { ddd } = telefoneDoJid(chatId);
    const ok = segmento.every((regra) => {
      if (regra.campo === 'pasta') return regra.valores.length === 0 || (vinculos[chatId] ?? []).some((p) => regra.valores.includes(p));
      if (regra.campo === 'ddd') return regra.valores.length === 0 || regra.valores.map((v) => v.trim()).includes(ddd);
      if (regra.campo === 'dias_sem_contato') {
        const dias = Number(regra.valores[0] ?? 0);
        if (!dias) return true;
        const ultimo = f?.ultimoContato ? new Date(f.ultimoContato).getTime() : 0;
        return Date.now() - ultimo >= dias * 86_400_000;
      }
      return true;
    });
    if (ok) saida.push({ chatId, nome: f?.nome?.trim() || f?.nomeWhatsapp?.trim() || chatId.split('@')[0] });
  }
  return saida;
}

/** Monta a fila de alvos com intervalos aleatórios e coloca a campanha para rodar. */
export async function iniciarCampanha(c: Campanha): Promise<Campanha> {
  const alvos = await alvosDoSegmento(c.segmento);
  let t = Date.now();
  const fila: AlvoCampanha[] = alvos.map((a, i) => {
    if (i > 0) {
      const min = Math.max(1, c.intervaloMinSeg);
      const max = Math.max(min, c.intervaloMaxSeg);
      t += (min + Math.random() * (max - min)) * 1000;
    }
    return { chatId: a.chatId, nome: a.nome, status: 'pendente', enviarEm: t };
  });
  const rodando: Campanha = { ...c, status: fila.length ? 'rodando' : 'concluida', alvos: fila, totalAlvos: fila.length, totalEnviados: 0, totalErros: 0 };
  await salvarCampanha(rodando);
  processarFila().catch(() => {});
  return rodando;
}

export async function cancelarCampanha(id: string): Promise<void> {
  const c = (await listarCampanhas()).find((x) => x.id === id);
  if (!c) return;
  await salvarCampanha({ ...c, status: 'cancelada', alvos: c.alvos.map((a) => (a.status === 'pendente' ? { ...a, status: 'pulado' } : a)) });
}

async function avancarCampanhas(): Promise<void> {
  const campanhas = await listarCampanhas();
  const agora = Date.now();
  for (const c of campanhas) {
    if (c.status !== 'rodando') continue;
    let mudou = false;
    for (const alvo of c.alvos) {
      if (alvo.status !== 'pendente' || alvo.enviarEm > agora) continue;
      const exec: Execucao = {
        id: crypto.randomUUID(),
        origem: { tipo: 'campanha', campanhaId: c.id },
        chatId: alvo.chatId,
        contexto: { texto: '', nome: alvo.nome, ...telefoneDoJid(alvo.chatId) },
        acoes: c.acoes,
        condicoes: [],
        condicaoCombinacao: 'E',
        proximoIndice: 0,
        executarEm: agora,
        status: 'agendado',
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
      };
      try {
        for (const a of c.acoes) await executarAcao(a, exec);
        alvo.status = 'enviado';
        c.totalEnviados += 1;
      } catch (e) {
        alvo.status = 'erro';
        alvo.erro = e instanceof Error ? e.message.slice(0, 200) : 'erro';
        c.totalErros += 1;
      }
      mudou = true;
      break; // um envio por passada — respeita o intervalo e não trava a aba
    }
    if (!c.alvos.some((a) => a.status === 'pendente')) {
      c.status = 'concluida';
      mudou = true;
    }
    if (mudou) await salvarCampanha(c);
  }
}

// ───────────────────────────── Notificações e webhook ─────────────────────────────

/** Avisa os destinatários no WhatsApp quando um evento acontece. */
export async function notificar(
  evento: EventoNotif,
  dados: { chatId: string; detalhe?: string | null },
): Promise<void> {
  const cfg = (await listarNotificacoes()).find((n) => n.evento === evento);
  if (!cfg?.ativo || cfg.destinatarios.length === 0) return;
  const ficha = await obterFicha(dados.chatId);
  const nome = ficha.nome?.trim() || ficha.nomeWhatsapp?.trim() || dados.chatId.split('@')[0];
  const telefone = ficha.telefone || telefoneDoJid(dados.chatId).telefone;
  const eu = await getContatoAtivo().catch(() => null);
  const linhas = [`🔔 ${LABEL_EVENTO_NOTIF[evento]}`];
  if (cfg.campos.includes('contato')) linhas.push(`Contato: ${nome}`);
  if (cfg.campos.includes('telefone') && telefone) linhas.push(`Telefone: +${telefone}`);
  if (cfg.campos.includes('detalhe') && dados.detalhe) linhas.push(`Detalhe: ${dados.detalhe}`);
  if (cfg.campos.includes('quem')) linhas.push(`Por: ${eu?.nome ?? 'a extensão'}`);
  if (cfg.campos.includes('quando')) linhas.push(`Quando: ${new Date().toLocaleString('pt-BR')}`);
  if (cfg.textoExtra.trim()) linhas.push('', cfg.textoExtra.trim());
  const texto = linhas.join('\n');
  for (const d of cfg.destinatarios) {
    const jid = d.includes('@') ? d : `${d.replace(/\D/g, '')}@c.us`;
    await enviarTexto(texto, jid).catch((e) => console.warn('[BuildChat] notificação:', e));
  }
  await emitirWebhook(evento, { chatId: dados.chatId, contato: nome, telefone, detalhe: dados.detalhe ?? null });
}

/** POST JSON para a URL configurada, se o evento estiver marcado. Nunca derruba quem chamou. */
export async function emitirWebhook(evento: EventoWebhook, payload: Record<string, unknown>): Promise<void> {
  try {
    const w = await obterWebhook();
    if (!w.ativo || !w.url || !w.eventos.includes(evento)) return;
    chrome.runtime.sendMessage({
      type: 'bc:webhook:auto',
      url: w.url,
      segredo: w.segredo,
      event: evento,
      payload: { ...payload, em: new Date().toISOString() },
    });
  } catch {
    /* sem service worker no momento — o evento é perdido, não a extensão */
  }
}

/** Dispara o POST de teste e devolve o resultado para a tela. */
export function testarWebhook(w: WebhookConfig): Promise<{ ok: boolean; status?: number; erro?: string }> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(
        { type: 'bc:webhook:auto', url: w.url, segredo: w.segredo, event: 'teste', payload: { em: new Date().toISOString() } },
        (res) => resolve(res ?? { ok: false, erro: 'Sem resposta do service worker.' }),
      );
    } catch (e) {
      resolve({ ok: false, erro: e instanceof Error ? e.message : String(e) });
    }
  });
}

// ───────────────────────────── Laço ─────────────────────────────

let laco: number | null = null;

/** Liga o processamento periódico (aba do WhatsApp aberta) e ouve o cutucão do service worker. */
export function iniciarMotor(): void {
  if (laco) return;
  processarFila().catch(() => {});
  laco = window.setInterval(() => processarFila().catch(() => {}), 10_000);
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === 'bc:fila') processarFila().catch(() => {});
    });
  } catch {
    /* fora da extensão (testes) */
  }
}
