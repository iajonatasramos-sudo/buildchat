// Motor de sincronização (Fase 2: pastas e vínculos conversa↔pasta).
//
// Princípio: a extensão NUNCA espera a rede. Toda alteração é aplicada no
// chrome.storage na hora e entra numa fila (outbox); o envio acontece depois,
// com repetição automática. A leitura é incremental (`atualizado_em`), e a
// exclusão é lógica (`deleted_at`) para propagar entre dispositivos.

import * as db from './db';
import { supabase } from './auth';
import { avaliarLicenca, carregarPerfil, type Perfil } from './auth';
import { getInfoConta } from './wa';
import { estadoSync } from './store';
import type { AcaoDC, CategoriaDC, RespostaDC, TagOpt } from './types';

type Op =
  | { op: 'pasta.upsert'; id: string; nome: string; cor: string; ordem: number }
  | { op: 'pasta.delete'; id: string }
  | { op: 'vinculo.set'; pastaId: string; remoteJid: string; ativo: boolean }
  // Para categorias/respostas guardamos só o id: o estado atual é lido do
  // armazenamento na hora do envio (várias edições seguidas viram uma só).
  | { op: 'categoria.upsert'; id: string }
  | { op: 'categoria.delete'; id: string }
  | { op: 'resposta.upsert'; id: string }
  | { op: 'resposta.delete'; id: string }
  | { op: 'anotacao.upsert'; id: string; remoteJid: string }
  | { op: 'anotacao.delete'; id: string }
  | { op: 'config.upsert' };

type Estado = {
  /** ISO do último pull bem-sucedido. */
  ultimoSync: string | null;
  /** Acervo local já foi adotado pela conta? */
  adotado: boolean;
  /** Empresa a que o cache local pertence (troca de conta limpa o estado). */
  empresaId: string | null;
};

const K_OUTBOX = 'bc2_outbox';
const K_ESTADO = 'bc2_sync_estado';
const ESTADO_INICIAL: Estado = { ultimoSync: null, adotado: false, empresaId: null };

const ler = <T>(k: string, padrao: T) =>
  new Promise<T>((r) => chrome.storage.local.get(k, (res) => r(res[k] ?? padrao)));
const gravar = (k: string, v: unknown) =>
  new Promise<void>((r) => chrome.storage.local.set({ [k]: v }, () => r()));

// ───────────────────────────── Fila de saída ─────────────────────────────

export async function enfileirar(op: Op): Promise<void> {
  const fila = await ler<Op[]>(K_OUTBOX, []);
  fila.push(op);
  await gravar(K_OUTBOX, fila);
  agendar();
}

/** Número do WhatsApp conectado, só dígitos — é a chave dos vínculos. */
async function numeroConectado(): Promise<string | null> {
  const info = await getInfoConta();
  const digitos = (info.numero ?? '').replace(/\D/g, '');
  return digitos.length >= 8 ? digitos : null;
}

// ───────────────────────────── Sincronização ─────────────────────────────

let rodando = false;
let agendado: number | null = null;

/** Agenda uma sincronização curta (junta várias alterações seguidas). */
export function agendar(atrasoMs = 1500): void {
  if (agendado) window.clearTimeout(agendado);
  agendado = window.setTimeout(() => {
    agendado = null;
    sincronizar().catch((e) => console.warn('[BuildChat] sync falhou:', e));
  }, atrasoMs);
}

export async function sincronizar(): Promise<void> {
  const sb = supabase();
  if (!sb || rodando) return;

  const perfil = await carregarPerfil();
  if (!perfil || !avaliarLicenca(perfil).ativa) {
    estadoSync.set(perfil ? 'bloqueado' : 'local');
    return;
  }

  rodando = true;
  estadoSync.set('sincronizando');
  try {
    let estado = await ler<Estado>(K_ESTADO, ESTADO_INICIAL);

    // Trocou de empresa? O cache local não vale mais.
    if (estado.empresaId && estado.empresaId !== perfil.empresa.id) {
      estado = { ...ESTADO_INICIAL };
    }
    estado.empresaId = perfil.empresa.id;

    if (!estado.adotado) {
      await adotarAcervoLocal(perfil);
      estado.adotado = true;
    }

    await enviarFila(perfil);
    estado.ultimoSync = await puxar(perfil, estado.ultimoSync);

    await gravar(K_ESTADO, estado);
    estadoSync.set('ok');
  } catch (e) {
    console.warn('[BuildChat] sync:', e);
    estadoSync.set('erro');
  } finally {
    rodando = false;
  }
}

// ───────────────────────────── Envio (push) ─────────────────────────────

async function enviarFila(perfil: Perfil): Promise<void> {
  const sb = supabase()!;
  const fila = await ler<Op[]>(K_OUTBOX, []);
  if (fila.length === 0) return;

  const wa = await numeroConectado();
  const restantes: Op[] = [];

  for (const op of fila) {
    try {
      if (op.op === 'pasta.upsert') {
        const { error } = await sb.from('pastas').upsert({
          id: op.id,
          empresa_id: perfil.empresa.id,
          nome: op.nome,
          cor: op.cor,
          ordem: op.ordem,
          deleted_at: null,
        });
        if (error) throw error;
      } else if (op.op === 'pasta.delete') {
        const { error } = await sb
          .from('pastas')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', op.id);
        if (error) throw error;
      } else if (op.op === 'categoria.upsert') {
        const cat = (await db.listarCategorias()).find((c) => c.id === op.id);
        if (cat) {
          const { error } = await sb.from('categorias').upsert({
            id: cat.id,
            empresa_id: perfil.empresa.id,
            nome: cat.nome,
            cor: cat.cor,
            ordem: cat.ordem,
            ...escopoDe(perfil),
            deleted_at: null,
          });
          if (error) throw error;
        }
      } else if (op.op === 'categoria.delete') {
        const { error } = await sb.from('categorias')
          .update({ deleted_at: new Date().toISOString() }).eq('id', op.id);
        if (error) throw error;
      } else if (op.op === 'resposta.upsert') {
        const resp = (await db.listarRespostas()).find((r) => r.id === op.id);
        if (resp) await enviarResposta(perfil, resp);
      } else if (op.op === 'resposta.delete') {
        const { error } = await sb.from('respostas')
          .update({ deleted_at: new Date().toISOString() }).eq('id', op.id);
        if (error) throw error;
      } else if (op.op === 'anotacao.upsert') {
        if (!wa) { restantes.push(op); continue; }
        const notas = (await db.mapaNotas())[op.remoteJid] ?? [];
        const nota = notas.find((n) => n.id === op.id);
        if (nota) {
          const { error } = await sb.from('anotacoes').upsert({
            id: nota.id,
            empresa_id: perfil.empresa.id,
            wa_number: wa,
            remote_jid: op.remoteJid,
            texto: nota.conteudo,
            autor_id: perfil.id,
            deleted_at: null,
          });
          if (error) throw error;
        }
      } else if (op.op === 'anotacao.delete') {
        const { error } = await sb.from('anotacoes')
          .update({ deleted_at: new Date().toISOString() }).eq('id', op.id);
        if (error) throw error;
      } else if (op.op === 'config.upsert') {
        const cfg = await db.getSettings();
        const { error } = await sb.from('config_usuario').upsert({
          usuario_id: perfil.id,
          empresa_id: perfil.empresa.id,
          tema: cfg.tema,
          atalho: cfg.triggerChar,
          webhook_url: cfg.webhookUrl,
        });
        if (error) throw error;
      } else if (op.op === 'vinculo.set') {
        if (!wa) {
          restantes.push(op); // sem número conectado ainda — tenta depois
          continue;
        }
        const linha = {
          empresa_id: perfil.empresa.id,
          pasta_id: op.pastaId,
          wa_number: wa,
          remote_jid: op.remoteJid,
          criado_por: perfil.id,
          deleted_at: op.ativo ? null : new Date().toISOString(),
        };
        const { error } = await sb
          .from('pasta_conversas')
          .upsert(linha, { onConflict: 'pasta_id,wa_number,remote_jid' });
        if (error) throw error;
      }
    } catch (e: any) {
      // Erro de permissão/validação: descartar (não adianta repetir).
      // Erro de rede: manter na fila.
      const rede = /fetch|network|timeout/i.test(e?.message ?? '');
      if (rede) restantes.push(op);
      else console.warn('[BuildChat] operação descartada:', op, e?.message);
    }
  }
  await gravar(K_OUTBOX, restantes);
}

/** Registros novos nascem da empresa quando quem cria é admin; senão, pessoais. */
function escopoDe(perfil: Perfil) {
  return perfil.papel === 'admin'
    ? { escopo: 'empresa', owner_id: null }
    : { escopo: 'pessoal', owner_id: perfil.id };
}

/**
 * Sobe a mídia da ação para o Storage (uma vez) e devolve o caminho
 * `storage:<empresa>/<arquivo>`. A mídia das CONVERSAS nunca passa por aqui.
 */
async function garantirMidiaNoServidor(perfil: Perfil, acao: AcaoDC): Promise<string | null> {
  const sb = supabase()!;
  if (!acao.midiaPath) return null;
  if (acao.midiaPath.startsWith('storage:')) return acao.midiaPath;

  const dataUrl = await db.obterMediaDataUrl(acao.midiaPath, acao.midiaMime);
  if (!dataUrl) return null;

  const [cabecalho, base64] = dataUrl.split(',');
  const mime = acao.midiaMime ?? cabecalho.match(/^data:([^;]*)/)?.[1] ?? 'application/octet-stream';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const ext = (acao.midiaNome?.split('.').pop() ?? mime.split('/')[1] ?? 'bin').slice(0, 8);
  const caminho = `${perfil.empresa.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage
    .from('midias')
    .upload(caminho, new Blob([bytes], { type: mime }), { contentType: mime, upsert: false });
  if (error) throw error;
  return `storage:${caminho}`;
}

/** Envia a resposta e a sequência de ações (mídia sobe antes). */
async function enviarResposta(perfil: Perfil, resp: RespostaDC): Promise<void> {
  const sb = supabase()!;

  // 1) mídias — grava o caminho novo no armazenamento local para não repetir
  let mudouLocal = false;
  const acoes: AcaoDC[] = [];
  for (const a of resp.acoes) {
    const caminho = await garantirMidiaNoServidor(perfil, a);
    if (caminho && caminho !== a.midiaPath) mudouLocal = true;
    acoes.push(caminho ? { ...a, midiaPath: caminho } : a);
  }
  if (mudouLocal) {
    const todas = await db.listarRespostas();
    await db.salvarRespostas(todas.map((r) => (r.id === resp.id ? { ...r, acoes } : r)));
  }

  // 2) resposta
  const { error } = await sb.from('respostas').upsert({
    id: resp.id,
    empresa_id: perfil.empresa.id,
    categoria_id: resp.categoriaId,
    titulo: resp.titulo,
    atalho: resp.atalho,
    pasta_id: resp.tagId,
    usos: resp.usos,
    ordem: resp.ordem,
    ...escopoDe(perfil),
    deleted_at: null,
  });
  if (error) throw error;

  // 3) ações (substitui a sequência inteira — é pequena e evita divergência)
  await sb.from('resposta_acoes').delete().eq('resposta_id', resp.id);
  if (acoes.length) {
    const { error: erroAcoes } = await sb.from('resposta_acoes').insert(
      acoes.map((a, i) => ({
        resposta_id: resp.id,
        ordem: i,
        tipo: a.tipo,
        texto: a.texto,
        midia_path: a.midiaPath,
        midia_mime: a.midiaMime,
        midia_nome: a.midiaNome,
        delay_segundos: a.delaySegundos,
      })),
    );
    if (erroAcoes) throw erroAcoes;
  }
}

// ───────────────────────────── Leitura (pull) ─────────────────────────────

async function puxar(perfil: Perfil, desde: string | null): Promise<string> {
  const sb = supabase()!;
  const agora = new Date().toISOString();
  const wa = await numeroConectado();

  // Pastas da empresa
  let q = sb.from('pastas').select('id, nome, cor, ordem, deleted_at, atualizado_em');
  if (desde) q = q.gt('atualizado_em', desde);
  const { data: pastas, error: erroPastas } = await q;
  if (erroPastas) throw erroPastas;

  if (pastas?.length) {
    const locais = await db.listarTags();
    const porId = new Map(locais.map((t) => [t.id, t]));
    for (const p of pastas as any[]) {
      if (p.deleted_at) porId.delete(p.id);
      else porId.set(p.id, { id: p.id, nome: p.nome, cor: p.cor });
    }
    await db.salvarTags([...porId.values()]);
  }

  // Vínculos do número conectado
  if (wa) {
    let qv = sb
      .from('pasta_conversas')
      .select('pasta_id, remote_jid, deleted_at, atualizado_em')
      .eq('wa_number', wa);
    if (desde) qv = qv.gt('atualizado_em', desde);
    const { data: vinculos, error: erroVinc } = await qv;
    if (erroVinc) throw erroVinc;

    if (vinculos?.length) {
      const mapa = await db.mapaTagsContatos();
      for (const v of vinculos as any[]) {
        const atuais = new Set(mapa[v.remote_jid] ?? []);
        if (v.deleted_at) atuais.delete(v.pasta_id);
        else atuais.add(v.pasta_id);
        if (atuais.size) mapa[v.remote_jid] = [...atuais];
        else delete mapa[v.remote_jid];
      }
      await db.salvarMapaTagsContatos(mapa);
    }
  }

  // Categorias
  let qc = sb.from('categorias').select('id, nome, cor, ordem, escopo, deleted_at');
  if (desde) qc = qc.gt('atualizado_em', desde);
  const { data: cats, error: erroCats } = await qc;
  if (erroCats) throw erroCats;
  if (cats?.length) {
    const locais = new Map((await db.listarCategorias()).map((c) => [c.id, c]));
    for (const c of cats as any[]) {
      if (c.deleted_at) locais.delete(c.id);
      else locais.set(c.id, { id: c.id, nome: c.nome, cor: c.cor, ordem: c.ordem, padrao: c.escopo === 'empresa' });
    }
    await db.salvarCategorias([...locais.values()]);
  }

  // Respostas com a sequência de ações
  let qr = sb
    .from('respostas')
    .select('id, categoria_id, titulo, atalho, pasta_id, usos, ordem, escopo, deleted_at, resposta_acoes(ordem, tipo, texto, midia_path, midia_mime, midia_nome, delay_segundos)');
  if (desde) qr = qr.gt('atualizado_em', desde);
  const { data: resps, error: erroResps } = await qr;
  if (erroResps) throw erroResps;
  if (resps?.length) {
    const tags = await db.listarTags();
    const porTag = new Map(tags.map((t) => [t.id, t]));
    const locais = new Map((await db.listarRespostas()).map((r) => [r.id, r]));
    for (const r of resps as any[]) {
      if (r.deleted_at) {
        locais.delete(r.id);
        continue;
      }
      const tag = r.pasta_id ? porTag.get(r.pasta_id) ?? null : null;
      locais.set(r.id, {
        id: r.id,
        categoriaId: r.categoria_id,
        titulo: r.titulo,
        atalho: r.atalho ?? '',
        usos: r.usos ?? 0,
        ordem: r.ordem ?? 0,
        padrao: r.escopo === 'empresa',
        tagId: r.pasta_id,
        tagNome: tag?.nome ?? null,
        tagCor: tag?.cor ?? null,
        acoes: [...(r.resposta_acoes ?? [])]
          .sort((a: any, b: any) => a.ordem - b.ordem)
          .map((a: any) => ({
            tipo: a.tipo,
            texto: a.texto ?? '',
            midiaPath: a.midia_path,
            midiaMime: a.midia_mime,
            midiaNome: a.midia_nome,
            delaySegundos: a.delay_segundos ?? 0,
          })),
      } as RespostaDC);
    }
    await db.salvarRespostas([...locais.values()]);
  }

  // Anotações do número conectado
  if (wa) {
    let qa = sb
      .from('anotacoes')
      .select('id, remote_jid, texto, criado_em, deleted_at')
      .eq('wa_number', wa);
    if (desde) qa = qa.gt('atualizado_em', desde);
    const { data: notas, error: erroNotas } = await qa;
    if (erroNotas) throw erroNotas;
    if (notas?.length) {
      const mapa = await db.mapaNotas();
      for (const n of notas as any[]) {
        const lista = (mapa[n.remote_jid] ?? []).filter((x) => x.id !== n.id);
        if (!n.deleted_at) lista.unshift({ id: n.id, conteudo: n.texto, criadoEm: n.criado_em });
        if (lista.length) mapa[n.remote_jid] = lista;
        else delete mapa[n.remote_jid];
      }
      await db.salvarMapaNotas(mapa);
    }
  }

  // Preferências (só na primeira carga desta máquina — depois o local manda)
  if (!desde) {
    const { data: cfg } = await sb
      .from('config_usuario')
      .select('tema, atalho, webhook_url')
      .eq('usuario_id', perfil.id)
      .maybeSingle();
    if (cfg) {
      await db.saveSettings(
        {
          tema: (cfg as any).tema,
          triggerChar: (cfg as any).atalho,
          webhookUrl: (cfg as any).webhook_url,
        },
        false, // veio do servidor: não reenfileirar
      );
    }
  }

  return agora;
}

// ─────────────────────── Adoção do acervo local ───────────────────────────
// Primeira sincronização: o que já existe no aparelho passa a pertencer à
// conta. As pastas locais casam com as do servidor pelo NOME; o que não existe
// é criado, e os ids locais são trocados pelos uuid do servidor.

async function adotarAcervoLocal(perfil: Perfil): Promise<void> {
  const sb = supabase()!;
  const locais = await db.listarTags();
  if (locais.length === 0) return;

  const { data: remotas, error } = await sb.from('pastas').select('id, nome').is('deleted_at', null);
  if (error) throw error;

  const porNome = new Map((remotas ?? []).map((p: any) => [normalizar(p.nome), p.id as string]));
  const criar: { empresa_id: string; nome: string; cor: string; ordem: number }[] = [];
  const dePara: Record<string, string> = {};

  locais.forEach((t, i) => {
    const existente = porNome.get(normalizar(t.nome));
    if (existente) dePara[t.id] = existente;
    else criar.push({ empresa_id: perfil.empresa.id, nome: t.nome, cor: t.cor, ordem: i });
  });

  if (criar.length) {
    const { data: criadas, error: erroCriar } = await sb.from('pastas').insert(criar).select('id, nome');
    if (erroCriar) throw erroCriar;
    const novasPorNome = new Map((criadas ?? []).map((p: any) => [normalizar(p.nome), p.id as string]));
    for (const t of locais) {
      const id = novasPorNome.get(normalizar(t.nome));
      if (id) dePara[t.id] = id;
    }
  }

  await db.remapearTagIds(dePara);

  // Sobe os vínculos do número conectado (união — nunca apaga o do colega).
  const wa = await numeroConectado();
  if (!wa) return;
  const mapa = await db.mapaTagsContatos();
  const linhas = Object.entries(mapa).flatMap(([jid, pastas]) =>
    pastas.map((pastaId) => ({
      empresa_id: perfil.empresa.id,
      pasta_id: pastaId,
      wa_number: wa,
      remote_jid: jid,
      criado_por: perfil.id,
    })),
  );
  for (let i = 0; i < linhas.length; i += 500) {
    const { error: erroVinc } = await sb
      .from('pasta_conversas')
      .upsert(linhas.slice(i, i + 500), { onConflict: 'pasta_id,wa_number,remote_jid', ignoreDuplicates: true });
    if (erroVinc) throw erroVinc;
  }
  console.info(`[BuildChat] acervo adotado: ${locais.length} pasta(s), ${linhas.length} vínculo(s).`);
  await adotarMensagens(perfil);
}

/**
 * Sobe categorias e respostas locais que ainda não existem na conta,
 * casando por nome/título, e troca os ids locais pelos do servidor.
 */
async function adotarMensagens(perfil: Perfil): Promise<void> {
  const sb = supabase()!;
  const [cats, resps] = await Promise.all([db.listarCategorias(), db.listarRespostas()]);
  if (cats.length === 0 && resps.length === 0) return;

  const { data: catsRemotas } = await sb.from('categorias').select('id, nome').is('deleted_at', null);
  const catPorNome = new Map((catsRemotas ?? []).map((c: any) => [normalizar(c.nome), c.id as string]));
  const catsDePara: Record<string, string> = {};
  const criarCats = cats
    .filter((c) => !catPorNome.has(normalizar(c.nome)))
    .map((c, i) => ({ empresa_id: perfil.empresa.id, nome: c.nome, cor: c.cor, ordem: c.ordem ?? i, ...escopoDe(perfil) }));

  cats.forEach((c) => {
    const id = catPorNome.get(normalizar(c.nome));
    if (id) catsDePara[c.id] = id;
  });
  if (criarCats.length) {
    const { data: criadas, error } = await sb.from('categorias').insert(criarCats).select('id, nome');
    if (error) throw error;
    const novas = new Map((criadas ?? []).map((c: any) => [normalizar(c.nome), c.id as string]));
    cats.forEach((c) => {
      const id = novas.get(normalizar(c.nome));
      if (id) catsDePara[c.id] = id;
    });
  }

  const { data: respsRemotas } = await sb.from('respostas').select('id, titulo').is('deleted_at', null);
  const respPorTitulo = new Map((respsRemotas ?? []).map((r: any) => [normalizar(r.titulo), r.id as string]));
  const respsDePara: Record<string, string> = {};
  for (const r of resps) {
    respsDePara[r.id] = respPorTitulo.get(normalizar(r.titulo)) ?? crypto.randomUUID();
  }

  await db.remapearIds(catsDePara, respsDePara);

  // Envia uma a uma (a mídia sobe junto) para não estourar memória nem tempo.
  const atualizadas = await db.listarRespostas();
  let enviadas = 0;
  for (const r of atualizadas) {
    try {
      await enviarResposta(perfil, r);
      enviadas++;
    } catch (e: any) {
      console.warn('[BuildChat] resposta não subiu:', r.titulo, e?.message);
    }
  }
  console.info(`[BuildChat] mensagens adotadas: ${enviadas}/${atualizadas.length} (mídias no Storage).`);
}

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Liga o ciclo periódico enquanto o WhatsApp Web estiver aberto. */
export function iniciarSyncPeriodico(): () => void {
  agendar(4000);
  const i = window.setInterval(() => agendar(0), 5 * 60 * 1000);
  const aoFocar = () => agendar(500);
  window.addEventListener('focus', aoFocar);
  return () => {
    window.clearInterval(i);
    window.removeEventListener('focus', aoFocar);
  };
}

export type { TagOpt };
