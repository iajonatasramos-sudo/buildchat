// Camada de dados — tudo local em chrome.storage.local (como a extensão de referência).
// Chaves:
//   bc2_categorias    -> CategoriaDC[]
//   bc2_respostas     -> RespostaDC[]
//   bc2_tags          -> TagOpt[]                       (etiquetas)
//   bc2_contact_tags  -> Record<chatId, string[]>       (etiquetas por contato)
//   bc2_notes         -> Record<chatId, NotaContato[]>
//   bc2_settings      -> Settings
//   media:<id>        -> { dataUrl, mime, nome }        (mídia enviada pelo usuário)

import { uid } from './utils';
import type {
  CategoriaDC,
  FichaContato,
  CorCategoria,
  MensagensRapidasData,
  NotaContato,
  RespostaDC,
  Settings,
  TagOpt,
  TipoResposta,
} from './types';
import { CORES_CATEGORIA } from './types';
import type { PropostaSalva } from './types';
import { propostasMudaram } from './store';

const K = {
  categorias: 'bc2_categorias',
  respostas: 'bc2_respostas',
  tags: 'bc2_tags',
  contactTags: 'bc2_contact_tags',
  notes: 'bc2_notes',
  settings: 'bc2_settings',
  seeded: 'bc2_seeded',
  msgCache: 'bc2_msg_cache',
  apagadas: 'bc2_apagadas',
  contatos: 'bc2_contatos',
  integracoes: 'bc2_integracoes',
  propostas: 'bc2_propostas',
} as const;

const DEFAULT_SETTINGS: Settings = { webhookUrl: '', triggerChar: '/', tema: 'auto' };

function get<T>(key: string, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (res) => resolve(res[key] !== undefined ? (res[key] as T) : fallback));
  });
}
function set(key: string, value: unknown): Promise<void> {
  return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, () => resolve()));
}

// ───────────────────────── Mensagens rápidas ─────────────────────────

export async function carregarMensagensRapidas(): Promise<MensagensRapidasData> {
  const [categorias, respostas, tags] = await Promise.all([
    get<CategoriaDC[]>(K.categorias, []),
    get<RespostaDC[]>(K.respostas, []),
    get<TagOpt[]>(K.tags, []),
  ]);
  return { categorias, respostas, tags };
}

export async function criarCategoria(nome: string, cor: CorCategoria): Promise<CategoriaDC> {
  const lista = await get<CategoriaDC[]>(K.categorias, []);
  const nova: CategoriaDC = { id: crypto.randomUUID(), nome, cor, ordem: lista.length, padrao: false };
  await set(K.categorias, [...lista, nova]);
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'categoria.upsert', id: nova.id });
  return nova;
}

export async function editarCategoria(id: string, nome: string, cor: CorCategoria): Promise<void> {
  const lista = await get<CategoriaDC[]>(K.categorias, []);
  await set(K.categorias, lista.map((c) => (c.id === id ? { ...c, nome, cor } : c)));
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'categoria.upsert', id });
}

export async function removerCategoria(id: string): Promise<void> {
  const [cats, resps] = await Promise.all([
    get<CategoriaDC[]>(K.categorias, []),
    get<RespostaDC[]>(K.respostas, []),
  ]);
  await Promise.all([
    set(K.categorias, cats.filter((c) => c.id !== id)),
    set(K.respostas, resps.map((r) => (r.categoriaId === id ? { ...r, categoriaId: null } : r))),
  ]);
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'categoria.delete', id });
}

export async function reordenarCategorias(idsNaOrdem: string[]): Promise<void> {
  const lista = await get<CategoriaDC[]>(K.categorias, []);
  const ordem = new Map(idsNaOrdem.map((id, i) => [id, i]));
  await set(K.categorias, lista.map((c) => (ordem.has(c.id) ? { ...c, ordem: ordem.get(c.id)! } : c)));
}

export type RespostaPayload = {
  categoriaId: string | null;
  titulo: string;
  atalho: string;
  tagId: string | null;
  acoes: RespostaDC['acoes'];
};

async function resolverTag(tagId: string | null): Promise<{ tagNome: string | null; tagCor: string | null }> {
  if (!tagId) return { tagNome: null, tagCor: null };
  const tags = await get<TagOpt[]>(K.tags, []);
  const t = tags.find((x) => x.id === tagId) ?? null;
  return { tagNome: t?.nome ?? null, tagCor: t?.cor ?? null };
}

export async function criarResposta(payload: RespostaPayload): Promise<RespostaDC> {
  const lista = await get<RespostaDC[]>(K.respostas, []);
  const { tagNome, tagCor } = await resolverTag(payload.tagId);
  const nova: RespostaDC = {
    id: crypto.randomUUID(),
    categoriaId: payload.categoriaId,
    titulo: payload.titulo,
    atalho: payload.atalho,
    usos: 0,
    ordem: lista.length,
    padrao: false,
    tagId: payload.tagId,
    tagNome,
    tagCor,
    acoes: payload.acoes,
  };
  await set(K.respostas, [...lista, nova]);
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'resposta.upsert', id: nova.id });
  return nova;
}

export async function editarResposta(id: string, payload: RespostaPayload): Promise<void> {
  const lista = await get<RespostaDC[]>(K.respostas, []);
  const { tagNome, tagCor } = await resolverTag(payload.tagId);
  await set(
    K.respostas,
    lista.map((r) => (r.id === id ? { ...r, ...payload, tagNome, tagCor } : r)),
  );
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'resposta.upsert', id });
}

export async function removerResposta(id: string): Promise<void> {
  const lista = await get<RespostaDC[]>(K.respostas, []);
  await set(K.respostas, lista.filter((r) => r.id !== id));
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'resposta.delete', id });
}

export async function reordenarRespostas(idsNaOrdem: string[]): Promise<void> {
  const lista = await get<RespostaDC[]>(K.respostas, []);
  const ordem = new Map(idsNaOrdem.map((id, i) => [id, i]));
  await set(K.respostas, lista.map((r) => (ordem.has(r.id) ? { ...r, ordem: ordem.get(r.id)! } : r)));
}

export async function registrarUso(id: string): Promise<void> {
  const lista = await get<RespostaDC[]>(K.respostas, []);
  await set(K.respostas, lista.map((r) => (r.id === id ? { ...r, usos: r.usos + 1 } : r)));
}

// ───────────────────────── Etiquetas (tags) ─────────────────────────

export async function listarTags(): Promise<TagOpt[]> {
  return get<TagOpt[]>(K.tags, []);
}

export async function criarTag(nome: string, cor: string): Promise<TagOpt> {
  const lista = await get<TagOpt[]>(K.tags, []);
  // uuid: o servidor usa uuid como chave; gerar aqui evita remapear depois.
  const nova: TagOpt = { id: crypto.randomUUID(), nome, cor };
  await set(K.tags, [...lista, nova]);
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'pasta.upsert', id: nova.id, nome, cor, ordem: lista.length });
  return nova;
}

/** Mapa completo chatId -> etiquetas (para a barra de pastas/filtros). */
export async function mapaTagsContatos(): Promise<Record<string, string[]>> {
  return get<Record<string, string[]>>(K.contactTags, {});
}

export async function tagsDoContato(chatId: string): Promise<string[]> {
  const map = await get<Record<string, string[]>>(K.contactTags, {});
  return map[chatId] ?? [];
}

export async function alternarTagContato(chatId: string, tagId: string): Promise<string[]> {
  const map = await get<Record<string, string[]>>(K.contactTags, {});
  const atuais = new Set(map[chatId] ?? []);
  const ativo = !atuais.has(tagId);
  if (ativo) atuais.add(tagId);
  else atuais.delete(tagId);
  map[chatId] = [...atuais];
  await set(K.contactTags, map);
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'vinculo.set', pastaId: tagId, remoteJid: chatId, ativo });
  return map[chatId];
}

export async function aplicarTagContato(chatId: string, tagId: string): Promise<void> {
  const map = await get<Record<string, string[]>>(K.contactTags, {});
  map[chatId] = [...new Set([...(map[chatId] ?? []), tagId])];
  await set(K.contactTags, map);
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'vinculo.set', pastaId: tagId, remoteJid: chatId, ativo: true });
}

/**
 * Importa os vínculos pasta↔conversa extraídos do storage do Dental Chat
 * (seed/vinculos-dentalchat.json) — já keyed por número real (jid). Como essa
 * fonte é autoritativa, as chaves legadas "wa:<nome>" são descartadas.
 */
export async function autoSeedVinculos(): Promise<boolean> {
  const VERSAO = 1;
  const feito = await get<number>('bc2_seeded_vinculos', 0);
  if (feito >= VERSAO) return false;
  try {
    const res = await fetch(chrome.runtime.getURL('seed/vinculos-dentalchat.json'));
    if (!res.ok) return false;
    const dados = (await res.json()) as {
      tags: { id: string; nome: string; cor: string | null }[];
      vinculos: Record<string, string[]>;
    };

    const tags = await get<TagOpt[]>(K.tags, []);
    const porId = new Set(tags.map((t) => t.id));
    let i = tags.length;
    for (const t of dados.tags) {
      if (porId.has(t.id)) continue;
      tags.push({ id: t.id, nome: t.nome, cor: t.cor ?? CORES_CATEGORIA[i++ % CORES_CATEGORIA.length] });
      porId.add(t.id);
    }

    const mapa = await get<Record<string, string[]>>(K.contactTags, {});
    // As chaves por nome vieram da mesma origem (Dental Chat) — redundantes
    // e sem número; removê-las evita contagem duplicada.
    for (const k of Object.keys(mapa)) if (k.startsWith('wa:')) delete mapa[k];
    for (const [jid, ids] of Object.entries(dados.vinculos)) {
      mapa[jid] = [...new Set([...(mapa[jid] ?? []), ...ids])];
    }

    await Promise.all([set(K.tags, tags), set(K.contactTags, mapa), set('bc2_seeded_vinculos', VERSAO)]);
    console.info(
      `[BuildChat] vínculos do Dental Chat importados: ${Object.keys(dados.vinculos).length} conversas em ${dados.tags.length} pastas.`,
    );
    return true;
  } catch (e) {
    console.warn('[BuildChat] import de vínculos falhou:', e);
    return false;
  }
}

/**
 * Migra chaves antigas "wa:<nome>" / "wa:<telefone>" (herdadas do seed) para
 * os ids reais do WhatsApp, casando por nome normalizado e por dígitos.
 * Retorna quantas chaves foram convertidas.
 */
export async function migrarChavesWa(
  chats: { chatId: string; nome: string; telefone: string | null }[],
): Promise<number> {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const soDigitos = (s: string) => s.replace(/\D/g, '');

  const porNome = new Map<string, string>();
  const porDigitos = new Map<string, string>();
  for (const c of chats) {
    const n = norm(c.nome);
    if (n && !porNome.has(n)) porNome.set(n, c.chatId);
    const dId = soDigitos(c.chatId.split('@')[0] ?? '');
    if (dId.length >= 8) porDigitos.set(dId, c.chatId);
    const dTel = c.telefone ? soDigitos(c.telefone) : '';
    if (dTel.length >= 8 && !porDigitos.has(dTel)) porDigitos.set(dTel, c.chatId);
  }

  const mapa = await get<Record<string, string[]>>(K.contactTags, {});
  let convertidas = 0;
  for (const chave of Object.keys(mapa)) {
    if (!chave.startsWith('wa:')) continue;
    const bruto = chave.slice(3).trim();
    const dig = soDigitos(bruto);
    const alvo = porNome.get(norm(bruto)) ?? (dig.length >= 8 ? porDigitos.get(dig) : undefined);
    if (!alvo) continue;
    mapa[alvo] = [...new Set([...(mapa[alvo] ?? []), ...mapa[chave]])];
    delete mapa[chave];
    convertidas++;
  }
  if (convertidas > 0) await set(K.contactTags, mapa);
  return convertidas;
}

// ───────────────────────── Ficha do contato ─────────────────────────
// Uma entrada por conversa. O `nome` daqui tem prioridade sobre o nome do
// WhatsApp nas variáveis das mensagens rápidas.

const FICHA_VAZIA: FichaContato = { nome: null, nomeWhatsapp: null, telefone: null, interesses: null, ultimoContato: null };

export async function mapaFichas(): Promise<Record<string, FichaContato>> {
  return get<Record<string, FichaContato>>(K.contatos, {});
}

export async function obterFicha(chatId: string): Promise<FichaContato> {
  const mapa = await get<Record<string, FichaContato>>(K.contatos, {});
  return { ...FICHA_VAZIA, ...(mapa[chatId] ?? {}) };
}

export async function salvarFicha(chatId: string, patch: Partial<FichaContato>): Promise<FichaContato> {
  const mapa = await get<Record<string, FichaContato>>(K.contatos, {});
  const nova = { ...FICHA_VAZIA, ...(mapa[chatId] ?? {}), ...patch };
  mapa[chatId] = nova;
  await set(K.contatos, mapa);
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'contato.upsert', remoteJid: chatId });
  return nova;
}

/**
 * Garante que o contato exista no CRM (painel) assim que a equipe interage com
 * ele — etiqueta, anota, gera proposta — e não só quando envia algo. Guarda o
 * nome do WhatsApp para a planilha ter como chamá-lo. Se a ficha já está
 * completa, não enfileira nada (a fila não precisa de ruído).
 */
export async function registrarContato(
  chatId: string,
  nomeWhatsapp?: string | null,
  telefone?: string | null,
): Promise<void> {
  if (!chatId || chatId.startsWith('wa:')) return; // fallback de DOM: sem jid confiável
  const mapa = await get<Record<string, FichaContato>>(K.contatos, {});
  const atual = mapa[chatId];
  const digitos = (telefone ?? '').replace(/\D/g, '') || null;
  const faltaNome = !atual?.nomeWhatsapp && !!nomeWhatsapp;
  const faltaTelefone = !atual?.telefone && !!digitos;
  if (atual && !faltaNome && !faltaTelefone) return;
  await salvarFicha(chatId, {
    nomeWhatsapp: nomeWhatsapp?.trim() || atual?.nomeWhatsapp || null,
    telefone: digitos ?? atual?.telefone ?? null,
  });
}

/**
 * A conversa aberta já é conhecida e agora temos o telefone dela: completa a
 * ficha sem criar uma nova (quem só foi visto não vira contato).
 */
export async function completarTelefone(chatId: string, telefone: string | null): Promise<void> {
  const digitos = (telefone ?? '').replace(/\D/g, '');
  if (!digitos) return;
  const mapa = await get<Record<string, FichaContato>>(K.contatos, {});
  const atual = mapa[chatId];
  if (!atual || atual.telefone === digitos) return;
  await salvarFicha(chatId, { telefone: digitos });
}

/**
 * Nome de tratamento de cada conversa que tem um. É a fonte única para TODA
 * tela que mostra o nome de um contato (lista da pasta, anotações, apagadas,
 * proposta, {{nome}}): mudou na ficha, muda em todas — o nome do WhatsApp
 * fica só como reserva. A lista e o cabeçalho do próprio WhatsApp são dele;
 * ali não dá para mexer.
 */
export async function nomesDasFichas(): Promise<Record<string, string>> {
  const mapa = await get<Record<string, FichaContato>>(K.contatos, {});
  const nomes: Record<string, string> = {};
  for (const [chatId, f] of Object.entries(mapa)) {
    const n = f.nome?.trim();
    if (n) nomes[chatId] = n;
  }
  return nomes;
}

/** Grava o mapa completo (usado pela sincronização). */
export async function salvarMapaFichas(mapa: Record<string, FichaContato>): Promise<void> {
  await set(K.contatos, mapa);
}

/** Marca o momento do último envio — alimenta o CRM do painel. */
export async function registrarUltimoContato(
  chatId: string,
  nomeWhatsapp?: string | null,
  telefone?: string | null,
): Promise<void> {
  const patch: Partial<FichaContato> = { ultimoContato: new Date().toISOString() };
  if (nomeWhatsapp) patch.nomeWhatsapp = nomeWhatsapp;
  const digitos = (telefone ?? '').replace(/\D/g, '');
  if (digitos) patch.telefone = digitos;
  await salvarFicha(chatId, patch);
}

// ───────────────────────── Notas por contato ─────────────────────────

export async function listarNotas(chatId: string): Promise<NotaContato[]> {
  const map = await get<Record<string, NotaContato[]>>(K.notes, {});
  return map[chatId] ?? [];
}

export async function criarNota(chatId: string, conteudo: string): Promise<NotaContato> {
  const map = await get<Record<string, NotaContato[]>>(K.notes, {});
  const nota: NotaContato = { id: crypto.randomUUID(), conteudo, criadoEm: new Date().toISOString() };
  map[chatId] = [nota, ...(map[chatId] ?? [])];
  await set(K.notes, map);
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'anotacao.upsert', id: nota.id, remoteJid: chatId });
  return nota;
}

export async function editarNota(chatId: string, notaId: string, conteudo: string): Promise<void> {
  const map = await get<Record<string, NotaContato[]>>(K.notes, {});
  map[chatId] = (map[chatId] ?? []).map((n) => (n.id === notaId ? { ...n, conteudo } : n));
  await set(K.notes, map);
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'anotacao.upsert', id: notaId, remoteJid: chatId });
}

export async function removerNota(chatId: string, notaId: string): Promise<void> {
  const map = await get<Record<string, NotaContato[]>>(K.notes, {});
  map[chatId] = (map[chatId] ?? []).filter((n) => n.id !== notaId);
  await set(K.notes, map);
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'anotacao.delete', id: notaId });
}

// ───────────────────────── Integrações (APIs) ─────────────────────────
// Configuradas pelo gestor no painel; a extensão só lê o que vale para ela.

export type Integracao = { chave: string; nome: string; url: string | null; token: string | null };

export async function salvarIntegracoes(lista: Integracao[]): Promise<void> {
  await set(K.integracoes, lista);
}

export async function obterIntegracao(chave: string): Promise<Integracao | null> {
  const lista = await get<Integracao[]>(K.integracoes, []);
  return lista.find((i) => i.chave === chave) ?? null;
}

/**
 * A integração está pronta para uso? O sync só traz as ativas que valem para a
 * empresa, então isto responde "esta clínica contratou o recurso" — a interface
 * usa para NÃO mostrar o botão de quem não tem (ex.: "Gerar proposta").
 */
export async function integracaoDisponivel(chave: string): Promise<boolean> {
  const i = await obterIntegracao(chave);
  return !!i?.token?.trim();
}


// ───────────────────────── Propostas geradas ─────────────────────────
// Metadados em bc2_propostas (mapa por id). O PDF recém-gerado fica em
// media:proposta:<id> até o sync subir para o Storage; depois o registro passa
// a apontar para `storage:<caminho>` e o local é solto (`obterMediaDataUrl`
// baixa e guarda em cache como faz com as mídias das respostas).

const chavePdf = (id: string) => `media:proposta:${id}`;

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

const dataUrlParaBlob = (dataUrl: string) => fetch(dataUrl).then((r) => r.blob());

async function mapaPropostas(): Promise<Record<string, PropostaSalva>> {
  return get<Record<string, PropostaSalva>>(K.propostas, {});
}

function avisarPropostas() {
  propostasMudaram.set(propostasMudaram.get() + 1);
}

/** Propostas do contato, da mais recente para a mais antiga. */
export async function listarPropostas(remoteJid: string): Promise<PropostaSalva[]> {
  const mapa = await mapaPropostas();
  return Object.values(mapa)
    .filter((p) => p.remoteJid === remoteJid)
    .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

export async function obterProposta(id: string): Promise<PropostaSalva | null> {
  return (await mapaPropostas())[id] ?? null;
}

/** Guarda a proposta recém-gerada (PDF local) e enfileira o envio ao servidor. */
export async function registrarProposta(
  dados: Pick<PropostaSalva, 'remoteJid' | 'contatoNome' | 'tipo' | 'valorCentavos'>,
  pdf: Blob,
): Promise<PropostaSalva> {
  const id = crypto.randomUUID();
  await set(chavePdf(id), { dataUrl: await blobParaDataUrl(pdf), mime: 'application/pdf', nome: `proposta-${id}.pdf` });
  const proposta: PropostaSalva = {
    ...dados,
    id,
    arquivoPath: null,
    criadoEm: new Date().toISOString(),
    enviadaEm: null,
  };
  const mapa = await mapaPropostas();
  mapa[id] = proposta;
  await set(K.propostas, mapa);
  avisarPropostas();
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'proposta.criar', id });
  return proposta;
}

/** Anexada na conversa: registra localmente e avisa o servidor. */
export async function marcarPropostaEnviada(id: string): Promise<void> {
  const mapa = await mapaPropostas();
  if (!mapa[id]) return;
  mapa[id] = { ...mapa[id], enviadaEm: new Date().toISOString() };
  await set(K.propostas, mapa);
  avisarPropostas();
  const { enfileirar } = await import('./sync');
  await enfileirar({ op: 'proposta.enviada', id });
}

/** O PDF, venha do local (ainda não subiu) ou do Storage (com cache). */
export async function obterPropostaBlob(p: PropostaSalva): Promise<Blob | null> {
  const local = await get<MediaSalva | null>(chavePdf(p.id), null);
  if (local) return dataUrlParaBlob(local.dataUrl);
  if (p.arquivoPath) {
    const dataUrl = await obterMediaDataUrl(p.arquivoPath, 'application/pdf');
    if (dataUrl) return dataUrlParaBlob(dataUrl);
  }
  return null;
}

/** Sync: o PDF local que ainda precisa subir. */
export async function obterPdfPropostaLocal(id: string): Promise<Blob | null> {
  const local = await get<MediaSalva | null>(chavePdf(id), null);
  return local ? dataUrlParaBlob(local.dataUrl) : null;
}

/** Sync: subiu — passa a apontar para o Storage e solta o PDF local. */
export async function concluirEnvioProposta(id: string, arquivoPath: string): Promise<void> {
  const mapa = await mapaPropostas();
  if (!mapa[id]) return;
  mapa[id] = { ...mapa[id], arquivoPath };
  await set(K.propostas, mapa);
  await new Promise<void>((r) => chrome.storage.local.remove(chavePdf(id), () => r()));
}

/** Sync: mescla o que veio do servidor. Apagadas saem; as pendentes locais ficam. */
export async function mesclarPropostasDoServidor(
  vindas: (PropostaSalva & { apagada: boolean })[],
): Promise<void> {
  const mapa = await mapaPropostas();
  for (const v of vindas) {
    if (v.apagada) {
      delete mapa[v.id];
      continue;
    }
    const local = mapa[v.id];
    // Um envio marcado aqui e ainda não sincronizado não pode ser desfeito.
    const enviadaEm = local?.enviadaEm && !v.enviadaEm ? local.enviadaEm : v.enviadaEm;
    mapa[v.id] = { ...v, enviadaEm, arquivoPath: v.arquivoPath ?? local?.arquivoPath ?? null };
  }
  await set(K.propostas, mapa);
  avisarPropostas();
}

// ───────────────────────── Apoio à sincronização ─────────────────────────

export async function salvarCategorias(cats: CategoriaDC[]): Promise<void> {
  await set(K.categorias, cats);
}
export async function salvarRespostas(resps: RespostaDC[]): Promise<void> {
  await set(K.respostas, resps);
}
export async function listarCategorias(): Promise<CategoriaDC[]> {
  return get<CategoriaDC[]>(K.categorias, []);
}
export async function listarRespostas(): Promise<RespostaDC[]> {
  return get<RespostaDC[]>(K.respostas, []);
}
export async function mapaNotas(): Promise<Record<string, NotaContato[]>> {
  return get<Record<string, NotaContato[]>>(K.notes, {});
}
export async function salvarMapaNotas(mapa: Record<string, NotaContato[]>): Promise<void> {
  await set(K.notes, mapa);
}

/** Troca ids locais de categorias/respostas pelos uuid do servidor. */
export async function remapearIds(
  catsDePara: Record<string, string>,
  respsDePara: Record<string, string>,
): Promise<void> {
  const [cats, resps] = await Promise.all([listarCategorias(), listarRespostas()]);
  await Promise.all([
    set(K.categorias, cats.map((c) => ({ ...c, id: catsDePara[c.id] ?? c.id }))),
    set(
      K.respostas,
      resps.map((r) => ({
        ...r,
        id: respsDePara[r.id] ?? r.id,
        categoriaId: r.categoriaId ? catsDePara[r.categoriaId] ?? r.categoriaId : null,
      })),
    ),
  ]);
}

/** Grava as pastas vindas do servidor (fonte da verdade quando há conta). */
export async function salvarTags(tags: TagOpt[]): Promise<void> {
  await set(K.tags, tags);
}

/** Substitui o mapa completo de vínculos conversa → pastas. */
export async function salvarMapaTagsContatos(mapa: Record<string, string[]>): Promise<void> {
  await set(K.contactTags, mapa);
}

/**
 * Troca os ids locais das pastas pelos ids do servidor (uuid), atualizando
 * também os vínculos e a etiqueta das respostas rápidas. Roda uma única vez,
 * na adoção do acervo local pela conta.
 */
export async function remapearTagIds(de_para: Record<string, string>): Promise<void> {
  const [tags, vinculos, respostas] = await Promise.all([
    get<TagOpt[]>(K.tags, []),
    get<Record<string, string[]>>(K.contactTags, {}),
    get<RespostaDC[]>(K.respostas, []),
  ]);
  const novo = (id: string) => de_para[id] ?? id;

  await Promise.all([
    set(K.tags, tags.map((t) => ({ ...t, id: novo(t.id) }))),
    set(
      K.contactTags,
      Object.fromEntries(
        Object.entries(vinculos).map(([chat, ids]) => [chat, [...new Set(ids.map(novo))]]),
      ),
    ),
    set(K.respostas, respostas.map((r) => (r.tagId ? { ...r, tagId: novo(r.tagId) } : r))),
  ]);
}

// ───────────────────────── Mensagens apagadas (anti-revoke) ─────────────────────────

export type MsgCapturada = {
  id: string;
  texto: string | null;
  tipo: string | null;
  autor: string | null;
  ts: number | null;
  deMim: boolean;
};
export type MsgApagada = Omit<MsgCapturada, 'id'> & { apagadaEm: number };

const MAX_CACHE_POR_CHAT = 200;
const MAX_APAGADAS_POR_CHAT = 100;

/** Guarda cada mensagem nova (texto/tipo) para poder recuperá-la se for apagada. */
export async function registrarMensagemCache(m: MsgCapturada & { chatId: string | null }): Promise<void> {
  if (!m.chatId || !m.id) return;
  const mapa = await get<Record<string, MsgCapturada[]>>(K.msgCache, {});
  const arr = mapa[m.chatId] ?? [];
  if (arr.some((x) => x.id === m.id)) return;
  arr.push({ id: m.id, texto: m.texto, tipo: m.tipo, autor: m.autor, ts: m.ts, deMim: m.deMim });
  mapa[m.chatId] = arr.slice(-MAX_CACHE_POR_CHAT);
  await set(K.msgCache, mapa);
}

/** Mensagem revogada: move do cache para a lista de apagadas da conversa. */
export async function registrarRevogada(m: {
  id: string | null;
  refId: string | null;
  chatId: string | null;
  autor: string | null;
}): Promise<void> {
  if (!m.chatId) return;
  const [cache, apag] = await Promise.all([
    get<Record<string, MsgCapturada[]>>(K.msgCache, {}),
    get<Record<string, MsgApagada[]>>(K.apagadas, {}),
  ]);
  const arr = cache[m.chatId] ?? [];
  const alvo = arr.find((x) => (m.refId && x.id === m.refId) || (m.id && x.id === m.id)) ?? null;
  const lista = apag[m.chatId] ?? [];
  lista.unshift({
    texto: alvo?.texto ?? null,
    tipo: alvo?.tipo ?? null,
    autor: m.autor ?? alvo?.autor ?? null,
    ts: alvo?.ts ?? null,
    deMim: alvo?.deMim ?? false,
    apagadaEm: Date.now(),
  });
  apag[m.chatId] = lista.slice(0, MAX_APAGADAS_POR_CHAT);
  await set(K.apagadas, apag);
}

export async function listarApagadas(chatId: string): Promise<MsgApagada[]> {
  const apag = await get<Record<string, MsgApagada[]>>(K.apagadas, {});
  return apag[chatId] ?? [];
}

// ───────────────────────── Mídia ─────────────────────────

type MediaSalva = { dataUrl: string; mime: string; nome: string };

export function arquivoParaDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

export async function salvarMedia(file: File): Promise<{ midiaPath: string; midiaMime: string; midiaNome: string }> {
  const dataUrl = await arquivoParaDataUrl(file);
  const id = uid('m');
  const media: MediaSalva = { dataUrl, mime: file.type || 'application/octet-stream', nome: file.name };
  await set(`media:${id}`, media);
  return { midiaPath: `media:${id}`, midiaMime: media.mime, midiaNome: media.nome };
}

/** Garante que o cabeçalho do data URL usa o mime informado (o Chrome serve
 *  .ogg como video/ogg, .bin como octet-stream etc., e isso confunde o WPP). */
function forcarMime(dataUrl: string, mime: string | null): string {
  if (!mime) return dataUrl;
  return dataUrl.replace(/^data:[^;,]*/, `data:${mime}`);
}

/** Resolve o midiaPath em uma dataURL pronta para envio. */
export async function obterMediaDataUrl(midiaPath: string, mime: string | null): Promise<string | null> {
  // Mídia no servidor: baixa uma vez por máquina e guarda em cache permanente.
  if (midiaPath.startsWith('storage:')) {
    const caminho = midiaPath.slice('storage:'.length);
    const chave = `midia_cache:${caminho}`;
    const cache = await get<MediaSalva | null>(chave, null);
    if (cache) return forcarMime(cache.dataUrl, mime ?? cache.mime);
    try {
      const { supabase } = await import('./auth');
      const sb = supabase();
      if (!sb) return null;
      const { data, error } = await sb.storage.from('midias').download(caminho);
      if (error || !data) {
        console.warn('[BuildChat] mídia não baixou:', caminho, error?.message);
        return null;
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(data);
      });
      await set(chave, { dataUrl, mime: mime ?? data.type, nome: caminho.split('/').pop() ?? '' });
      return forcarMime(dataUrl, mime ?? data.type);
    } catch (e) {
      console.warn('[BuildChat] falha ao baixar mídia:', caminho, e);
      return null;
    }
  }
  if (midiaPath.startsWith('media:')) {
    const m = await get<MediaSalva | null>(midiaPath, null);
    return m ? forcarMime(m.dataUrl, mime ?? m.mime) : null;
  }
  // arquivo empacotado na extensão (seed)
  try {
    const res = await fetch(chrome.runtime.getURL(midiaPath));
    if (!res.ok) {
      console.warn('[BuildChat] mídia do seed não encontrada:', midiaPath, res.status);
      return null;
    }
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    return forcarMime(dataUrl, mime);
  } catch (e) {
    console.warn('[BuildChat] falha ao ler mídia do seed:', midiaPath, e);
    return null;
  }
}

// ───────────────────────── Configurações ─────────────────────────

export async function getSettings(): Promise<Settings> {
  const s = await get<Partial<Settings>>(K.settings, {});
  return { ...DEFAULT_SETTINGS, ...s };
}
export async function saveSettings(s: Settings, sincronizar = true): Promise<void> {
  await set(K.settings, s);
  if (sincronizar) {
    const { enfileirar } = await import('./sync');
    await enfileirar({ op: 'config.upsert' });
  }
}

// ───────────────────────── Seed (importa dados do BuildChat v1) ─────────────────────────

type SeedStep = {
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'tag';
  text?: string;
  file?: string; // "media/xxx.ogg"
  mime?: string;
  name?: string;
  delay?: number;
  labelId?: string; // "lb_092e258f"
};
type SeedQuickReply = {
  id: string;
  shortcut: string;
  title: string;
  category?: string;
  message?: string;
  steps?: SeedStep[];
  uses?: number;
};
type SeedLabel = { id: string; name: string; color: string };
type Seed = {
  bc_quick_replies?: SeedQuickReply[];
  bc_labels?: SeedLabel[];
  bc_contact_labels?: Record<string, string[]>;
};

const SEED_VERSION = 1;

export async function autoSeed(): Promise<boolean> {
  const feito = await get<number>(K.seeded, 0);
  if (feito >= SEED_VERSION) return false;
  try {
    const res = await fetch(chrome.runtime.getURL('seed/dentalchat.json'));
    const seed = (await res.json()) as Seed;
    await importarSeed(seed);
    await set(K.seeded, SEED_VERSION);
    return true;
  } catch (e) {
    console.warn('[BuildChat] autoSeed falhou:', e);
    return false;
  }
}

export async function importarSeed(seed: Seed): Promise<void> {
  // Etiquetas
  const tags: TagOpt[] = (seed.bc_labels ?? []).map((l) => ({ id: l.id, nome: l.name, cor: l.color }));
  const tagPorId = new Map(tags.map((t) => [t.id, t]));

  // Categorias a partir dos nomes usados nas respostas
  const nomesCat = [...new Set((seed.bc_quick_replies ?? []).map((q) => (q.category ?? '').trim()).filter(Boolean))];
  const categorias: CategoriaDC[] = nomesCat.map((nome, i) => ({
    id: `cat_seed_${i}`,
    nome,
    cor: CORES_CATEGORIA[i % CORES_CATEGORIA.length],
    ordem: i,
    padrao: false,
  }));
  const catPorNome = new Map(categorias.map((c) => [c.nome, c.id]));

  const tipoDoStep = (t: SeedStep['type']): TipoResposta =>
    t === 'image' ? 'imagem' : t === 'document' ? 'documento' : t === 'text' ? 'texto' : (t as TipoResposta);

  const respostas: RespostaDC[] = (seed.bc_quick_replies ?? []).map((q, i) => {
    const steps = q.steps?.length ? q.steps : [{ type: 'text' as const, text: q.message ?? '', delay: 0 }];
    const primeiraTag = steps.find((s) => s.type === 'tag' && s.labelId);
    const tag = primeiraTag?.labelId ? tagPorId.get(primeiraTag.labelId) ?? null : null;
    const acoes = steps
      .filter((s) => s.type !== 'tag')
      .map((s) => ({
        tipo: tipoDoStep(s.type),
        texto: s.text ?? '',
        midiaPath: s.file ? `seed/${s.file}` : null,
        midiaMime: s.mime ?? null,
        midiaNome: s.name || (s.file ? s.file.split('/').pop()! : null),
        delaySegundos: s.delay ?? 0,
      }));
    return {
      id: q.id,
      categoriaId: q.category ? catPorNome.get(q.category.trim()) ?? null : null,
      titulo: q.title || q.shortcut,
      atalho: q.shortcut ?? '',
      usos: q.uses ?? 0,
      ordem: i,
      padrao: false,
      tagId: tag?.id ?? null,
      tagNome: tag?.nome ?? null,
      tagCor: tag?.cor ?? null,
      acoes,
    };
  });

  await Promise.all([
    set(K.categorias, categorias),
    set(K.respostas, respostas),
    set(K.tags, tags),
    set(K.contactTags, seed.bc_contact_labels ?? {}),
  ]);
}
