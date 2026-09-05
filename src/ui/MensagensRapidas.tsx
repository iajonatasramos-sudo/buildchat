// Porte do painel de Mensagens Rápidas do Saleschat (BuildClinic
// src/app/(app)/dental-chat/mensagens-rapidas.tsx) para a extensão:
// mesmas classes/visual, dados locais (chrome.storage) no lugar das server actions.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Film,
  GripVertical,
  Image as ImageIcon,
  Layers,
  Loader2,
  Mic,
  NotebookPen,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  Send,
  Shapes,
  Smartphone,
  Sparkles,
  Tag,
  Trash2,
  User,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { toast } from './toast';
import * as db from '@/lib/db';
import { getInfoConta } from '@/lib/wa';
import { minhasEquipes } from '@/lib/sync';
import { carregarPerfil } from '@/lib/auth';
import {
  CORES_CATEGORIA,
  TIPOS_RESPOSTA,
  TIPOS_MIDIA,
  VARIAVEIS_DISPONIVEIS,
  type AcaoDC,
  type CategoriaDC,
  type ContatoAtivo,
  type CorCategoria,
  type FichaContato,
  type MensagensRapidasData,
  type NotaContato,
  type RespostaDC,
  type TagOpt,
  type TipoResposta,
} from '@/lib/types';

const TIPO_ICON: Record<TipoResposta, typeof FileText> = {
  texto: FileText,
  imagem: ImageIcon,
  audio: Mic,
  video: Film,
  documento: FileText,
};
const TIPO_LABEL: Record<TipoResposta, string> = {
  texto: 'Texto',
  imagem: 'Imagem',
  audio: 'Áudio',
  video: 'Vídeo',
  documento: 'Documento',
};
// Cor da categoria: hex livre. Mapeia os nomes antigos pra hex.
function corHex(cor: string): string {
  const legado: Record<string, string> = { verde: '#22c55e', rosa: '#ec4899', azul: '#6366f1' };
  return legado[cor] ?? cor;
}

type Filtro = 'tudo' | 'por-tipo' | 'sem-categoria' | 'mais-usadas';
// Rótulos curtos: o painel é estreito e o controle não pode cortar texto.
const FILTROS: [Filtro, string][] = [
  ['tudo', 'Tudo'],
  ['por-tipo', 'Tipo'],
  ['sem-categoria', 'Avulsas'],
  ['mais-usadas', 'Usadas'],
];
type Grupo = { chave: string; nome: string; cor: CorCategoria; padrao: boolean; itens: RespostaDC[] };

function tipoPrincipal(r: RespostaDC): TipoResposta {
  return r.acoes[0]?.tipo ?? 'texto';
}

function cmpOrdem(a: { ordem: number }, b: { ordem: number }) {
  return a.ordem - b.ordem;
}

export function MensagensRapidasPanel({
  onExecutar,
  onFechar,
  contato,
  viewInicial = 'rapidas',
}: {
  onExecutar: (resposta: RespostaDC) => void;
  onFechar?: () => void;
  /** Conversa aberta no WhatsApp — alimenta a guia "Contato". */
  contato: ContatoAtivo | null;
  viewInicial?: 'rapidas' | 'cliente';
}) {
  const [view, setView] = useState<'rapidas' | 'cliente'>(viewInicial);
  const [data, setData] = useState<MensagensRapidasData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('tudo');
  // Categorias começam FECHADAS; só abrem ao clicar (rastreia as abertas).
  const [abertas, setAbertas] = useState<Set<string>>(new Set());

  const [dlgResposta, setDlgResposta] = useState<RespostaDC | 'nova' | null>(null);
  const [dlgCategoria, setDlgCategoria] = useState<CategoriaDC | 'nova' | null>(null);
  const [dlgConta, setDlgConta] = useState(false);

  const sensores = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const carregar = useCallback(async () => {
    const [dados, equipes, perfil] = await Promise.all([
      db.carregarMensagensRapidas(),
      minhasEquipes(),
      carregarPerfil(),
    ]);
    // Mensagem da empresa restrita a equipes/pessoas só aparece para quem é
    // destino. O admin vê tudo no painel, mas aqui recebe apenas o que é dele.
    const paraMim = (r: RespostaDC) => {
      const eq = r.visivelEquipes ?? [];
      const us = r.visivelUsuarios ?? [];
      if (eq.length === 0 && us.length === 0) return true;
      if (perfil && us.includes(perfil.id)) return true;
      return eq.some((id) => equipes.includes(id));
    };
    setData({ ...dados, respostas: dados.respostas.filter(paraMim) });
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function toggle(chave: string) {
    setAbertas((prev) => {
      const n = new Set(prev);
      if (n.has(chave)) n.delete(chave);
      else n.add(chave);
      return n;
    });
  }

  const grupos = useMemo<Grupo[]>(() => {
    if (!data) return [];
    const q = busca.trim().toLowerCase();
    const filtrar = (r: RespostaDC) =>
      !q ||
      r.titulo.toLowerCase().includes(q) ||
      r.atalho.toLowerCase().includes(q) ||
      r.acoes.some((a) => a.texto.toLowerCase().includes(q));
    const resps = data.respostas.filter(filtrar);

    const ordenarItens = (arr: RespostaDC[]) => [...arr].sort(cmpOrdem);

    if (filtro === 'mais-usadas') {
      const top = [...resps].sort((a, b) => b.usos - a.usos).slice(0, 10);
      return [{ chave: 'mais', nome: 'MAIS USADAS', cor: 'rosa', padrao: false, itens: top }];
    }
    if (filtro === 'sem-categoria') {
      return [{ chave: 'sem', nome: 'SEM CATEGORIA', cor: 'azul', padrao: false, itens: ordenarItens(resps.filter((r) => !r.categoriaId)) }];
    }
    if (filtro === 'por-tipo') {
      return TIPOS_RESPOSTA.map((t) => ({
        chave: `tipo-${t}`,
        nome: TIPO_LABEL[t].toUpperCase(),
        cor: 'verde' as CorCategoria,
        padrao: false,
        itens: ordenarItens(resps.filter((r) => tipoPrincipal(r) === t)),
      })).filter((g) => g.itens.length > 0);
    }
    const out: Grupo[] = [...data.categorias].sort(cmpOrdem).map((c) => ({
      chave: c.id,
      nome: c.nome.toUpperCase(),
      cor: c.cor,
      padrao: c.padrao,
      itens: ordenarItens(resps.filter((r) => r.categoriaId === c.id)),
    }));
    const semCat = resps.filter((r) => !r.categoriaId);
    if (semCat.length > 0) out.push({ chave: 'sem', nome: 'SEM CATEGORIA', cor: 'azul', padrao: false, itens: ordenarItens(semCat) });
    return out.filter((g) => g.itens.length > 0);
  }, [data, busca, filtro]);

  const dragAtivo = filtro === 'tudo' && !busca.trim();

  // Reordena categorias (apenas as reais, não a pseudo "sem categoria").
  async function onDragCategorias(e: DragEndEvent) {
    if (!data || !e.over || e.active.id === e.over.id) return;
    const reais = [...data.categorias].sort(cmpOrdem);
    const ids = reais.map((c) => c.id);
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    const nova = arrayMove(reais, from, to);
    setData((d) => (d ? { ...d, categorias: nova.map((c, i) => ({ ...c, ordem: i })) } : d));
    await db.reordenarCategorias(nova.map((c) => c.id));
  }

  // Reordena respostas dentro de uma categoria.
  async function onDragRespostas(categoriaChave: string, e: DragEndEvent) {
    if (!data || !e.over || e.active.id === e.over.id) return;
    const doGrupo = data.respostas
      .filter((r) => (categoriaChave === 'sem' ? !r.categoriaId : r.categoriaId === categoriaChave))
      .sort(cmpOrdem);
    const ids = doGrupo.map((r) => r.id);
    const from = ids.indexOf(String(e.active.id));
    const to = ids.indexOf(String(e.over.id));
    if (from < 0 || to < 0) return;
    const nova = arrayMove(doGrupo, from, to);
    const novaOrdem = new Map(nova.map((r, i) => [r.id, i]));
    setData((d) =>
      d
        ? { ...d, respostas: d.respostas.map((r) => (novaOrdem.has(r.id) ? { ...r, ordem: novaOrdem.get(r.id)! } : r)) }
        : d,
    );
    await db.reordenarRespostas(nova.map((r) => r.id));
  }

  function usar(item: RespostaDC) {
    onExecutar(item);
    setData((d) =>
      d ? { ...d, respostas: d.respostas.map((r) => (r.id === item.id ? { ...r, usos: r.usos + 1 } : r)) } : d,
    );
  }

  return (
    <div className="flex h-full w-[266px] flex-shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border bg-surface-2 px-3 py-2.5">
        <div className="bc-seg flex-shrink-0">
          <button type="button" data-ativo={view === 'cliente' ? 1 : 0} onClick={() => setView('cliente')} title="Dados do contato">
            <User size={14} />
          </button>
          <button type="button" data-ativo={view === 'rapidas' ? 1 : 0} onClick={() => setView('rapidas')} title="Mensagens rápidas">
            <Zap size={14} />
          </button>
          <button type="button" data-ativo={0} onClick={() => setDlgConta(true)} title="Conta de WhatsApp em uso">
            <Smartphone size={14} />
          </button>
        </div>
        <div className="ml-auto min-w-0 truncate text-[12px] font-bold tracking-tight">
          {view === 'cliente' ? 'Contato' : 'Mensagens'}
        </div>
        {onFechar && (
          <button
            type="button"
            onClick={onFechar}
            className="grid h-8 w-8 place-items-center rounded-md text-muted transition hover:bg-surface"
            title="Fechar"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {view === 'cliente' && <ContatoGuia contato={contato} tags={data?.tags ?? []} />}

      {view === 'rapidas' && (
        <>
          <div className="flex items-center gap-2 px-3 pb-2 pt-3">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar resposta rápida"
                className="h-9 w-full rounded-md border border-border bg-surface-2 pl-8 pr-2 text-[13px] outline-none transition focus:border-brand focus:bg-surface focus:ring-2 focus:ring-brand/20"
              />
            </div>
            <button
              type="button"
              onClick={() => setDlgResposta('nova')}
              className="bc-elev grid h-9 w-9 flex-shrink-0 place-items-center rounded-md bg-brand text-white transition hover:brightness-110"
              title="Nova resposta rápida"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="px-3 pb-2.5">
            <div className="bc-seg w-full">
              {FILTROS.map(([valor, rotulo]) => (
                <button
                  key={valor}
                  type="button"
                  data-ativo={filtro === valor ? 1 : 0}
                  onClick={() => setFiltro(valor)}
                  className="flex-1"
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-3 pb-4">
            {carregando ? (
              <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted">
                <Loader2 size={14} className="animate-spin" /> Carregando…
              </div>
            ) : grupos.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[12px] text-muted">Nenhuma resposta rápida ainda.</p>
                <button
                  type="button"
                  onClick={() => setDlgResposta('nova')}
                  className="mt-2 text-[12px] font-semibold text-brand hover:underline"
                >
                  Criar a primeira
                </button>
              </div>
            ) : (
              <DndContext
                sensors={sensores}
                collisionDetection={closestCenter}
                onDragEnd={dragAtivo ? onDragCategorias : undefined}
              >
                <SortableContext items={grupos.map((g) => g.chave)} strategy={verticalListSortingStrategy}>
                  {grupos.map((g) => {
                    const cat = data?.categorias.find((c) => c.id === g.chave) ?? null;
                    const ehCategoriaReal = !!cat;
                    return (
                      <GrupoCard
                        key={g.chave}
                        g={g}
                        aberta={abertas.has(g.chave)}
                        onToggle={() => toggle(g.chave)}
                        dragCategoria={dragAtivo && ehCategoriaReal}
                        dragRespostas={dragAtivo}
                        sensores={sensores}
                        onEditarCat={cat ? () => setDlgCategoria(cat) : null}
                        onUsar={usar}
                        onEditarResp={(item) => setDlgResposta(item)}
                        onDragRespostas={(e) => onDragRespostas(g.chave, e)}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </>
      )}

      {dlgResposta && data && (
        <RespostaDialog
          resposta={dlgResposta === 'nova' ? null : dlgResposta}
          categorias={data.categorias}
          tags={data.tags}
          onCriarCategoria={() => setDlgCategoria('nova')}
          onClose={() => setDlgResposta(null)}
          onSalvo={() => {
            setDlgResposta(null);
            carregar();
          }}
          onEnviar={onExecutar}
        />
      )}
      {dlgCategoria && (
        <CategoriaDialog
          categoria={dlgCategoria === 'nova' ? null : dlgCategoria}
          onClose={() => setDlgCategoria(null)}
          onSalvo={() => {
            setDlgCategoria(null);
            carregar();
          }}
        />
      )}
      {dlgConta && <ContaWhatsappModal onClose={() => setDlgConta(false)} />}
    </div>
  );
}

function ContaWhatsappModal({ onClose }: { onClose: () => void }) {
  const [info, setInfo] = useState<{ numero: string | null; nome: string | null; conectado: boolean } | null>(null);

  useEffect(() => {
    getInfoConta().then(setInfo);
  }, []);

  return (
    <Modal titulo="Conta de WhatsApp" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">Número em uso</span>
          {info ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand/10 text-brand">
                <Smartphone size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold">{info.numero ?? '—'}</div>
                <div className="truncate text-[11px] text-muted">{info.nome ?? 'WhatsApp Web'}</div>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold',
                  info.conectado ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger',
                )}
              >
                {info.conectado ? <Wifi size={11} /> : <WifiOff size={11} />}
                {info.conectado ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 py-4 text-[12px] text-muted">
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted">
          A extensão usa a conta conectada neste WhatsApp Web.
        </p>
      </div>
    </Modal>
  );
}

function GrupoCard({
  g,
  aberta,
  onToggle,
  dragCategoria,
  dragRespostas,
  sensores,
  onEditarCat,
  onUsar,
  onEditarResp,
  onDragRespostas,
}: {
  g: Grupo;
  aberta: boolean;
  onToggle: () => void;
  dragCategoria: boolean;
  dragRespostas: boolean;
  sensores: ReturnType<typeof useSensors>;
  onEditarCat: (() => void) | null;
  onUsar: (r: RespostaDC) => void;
  onEditarResp: (r: RespostaDC) => void;
  onDragRespostas: (e: DragEndEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: g.chave,
    disabled: !dragCategoria,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div
      ref={setNodeRef}
      style={{ ...style, ['--cat' as string]: corHex(g.cor) } as React.CSSProperties}
      className="bc-cat-box bc-elev-hover overflow-hidden rounded-lg border"
    >
      {/* Cabeçalho + itens dentro de uma caixa translúcida na cor da categoria
          (padrão Dental Chat); o texto acompanha o tema (branco no escuro). */}
      <div className="bc-cat-head flex items-center gap-2 px-3 py-2 text-text">
        {dragCategoria && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none opacity-60 hover:opacity-100 active:cursor-grabbing"
            title="Arrastar categoria"
          >
            <GripVertical size={14} />
          </button>
        )}
        <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-2 text-left">
          <Shapes size={14} style={{ color: 'var(--cat)' }} />
          <span className="min-w-0 flex-1 truncate text-[11.5px] font-bold tracking-tight">{g.nome}</span>
          <span
            className="grid h-[18px] min-w-[18px] place-items-center rounded-md px-1 text-[10.5px] font-bold text-white"
            style={{ background: corHex(g.cor) }}
          >
            {g.itens.length}
          </span>
        </button>
        {onEditarCat && (
          <button type="button" onClick={onEditarCat} title="Editar categoria" className="opacity-70 hover:opacity-100">
            <Pencil size={13} />
          </button>
        )}
        <button type="button" onClick={onToggle}>
          <ChevronDown size={15} className={cn('transition', !aberta && '-rotate-90')} />
        </button>
      </div>
      {aberta && (
        <DndContext
          sensors={sensores}
          collisionDetection={closestCenter}
          onDragEnd={dragRespostas ? onDragRespostas : undefined}
        >
          <SortableContext items={g.itens.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            <div>
              {g.itens.map((item) => (
                <ItemResposta
                  key={item.id}
                  item={item}
                  arrastavel={dragRespostas}
                  onUsar={onUsar}
                  onEditar={() => onEditarResp(item)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

function ItemResposta({
  item,
  arrastavel,
  onUsar,
  onEditar,
}: {
  item: RespostaDC;
  arrastavel: boolean;
  onUsar: (r: RespostaDC) => void;
  onEditar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !arrastavel,
  });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const multi = item.acoes.length > 1;
  const Icon = multi ? Layers : TIPO_ICON[tipoPrincipal(item)] ?? FileText;
  return (
    <div ref={setNodeRef} style={style} className="bc-cat-item group flex items-center gap-1.5 px-3 py-2.5 transition">
      {arrastavel && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none text-muted opacity-50 hover:opacity-100 active:cursor-grabbing"
          title="Arrastar"
        >
          <GripVertical size={13} />
        </button>
      )}
      <span
        className="bc-cat-chip grid h-7 w-7 flex-shrink-0 place-items-center rounded-md"
        title={multi ? `${item.acoes.length} ações` : TIPO_LABEL[tipoPrincipal(item)]}
      >
        <Icon size={14} />
      </span>
      <button
        type="button"
        onClick={() => onUsar(item)}
        className="min-w-0 flex-1 truncate text-left text-[13px] font-medium text-text"
      >
        {item.titulo}
        {multi && <span className="ml-1 text-[10px] font-normal text-muted">· {item.acoes.length} ações</span>}
        {item.usos > 0 && <span className="ml-1.5 text-[10px] font-normal text-muted">· {item.usos}</span>}
        {item.tagNome && (
          <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-[10px]" style={{ color: item.tagCor ?? undefined }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.tagCor ?? undefined }} />
            {item.tagNome}
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onEditar}
        className="grid h-7 w-7 place-items-center rounded-md text-muted transition hover:bg-surface-2"
        title="Editar"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={() => onUsar(item)}
        className="grid h-7 w-7 place-items-center rounded-md text-brand transition hover:bg-brand hover:text-white"
        title="Enviar para a conversa"
      >
        <Send size={15} />
      </button>
    </div>
  );
}

// ───────────────────────── Diálogos ─────────────────────────

function Modal({ titulo, onClose, children }: { titulo: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-text/40 p-4" onClick={onClose}>
      <div
        className="bc-anim-pop flex max-h-[72vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[14px] font-bold">{titulo}</h3>
          <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2">
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

type AcaoForm = AcaoDC & { enviando?: boolean };

function RespostaDialog({
  resposta,
  categorias,
  tags,
  onCriarCategoria,
  onClose,
  onSalvo,
  onEnviar,
}: {
  resposta: RespostaDC | null;
  categorias: CategoriaDC[];
  tags: TagOpt[];
  onCriarCategoria: () => void;
  onClose: () => void;
  onSalvo: () => void;
  onEnviar: (resposta: RespostaDC) => void;
}) {
  const [titulo, setTitulo] = useState(resposta?.titulo ?? '');
  const [atalho, setAtalho] = useState(resposta?.atalho ?? '');
  const [categoriaId, setCategoriaId] = useState<string>(resposta?.categoriaId ?? '');
  const [tagId, setTagId] = useState<string>(resposta?.tagId ?? '');
  const [acoes, setAcoes] = useState<AcaoForm[]>(
    resposta?.acoes.length
      ? resposta.acoes.map((a) => ({ ...a }))
      : [{ tipo: 'texto', texto: '', midiaPath: null, midiaMime: null, midiaNome: null, delaySegundos: 0 }],
  );
  const [salvando, setSalvando] = useState(false);

  function patch(i: number, p: Partial<AcaoForm>) {
    setAcoes((arr) => arr.map((a, idx) => (idx === i ? { ...a, ...p } : a)));
  }
  function addAcao() {
    setAcoes((arr) => [...arr, { tipo: 'texto', texto: '', midiaPath: null, midiaMime: null, midiaNome: null, delaySegundos: 0 }]);
  }
  function removerAcao(i: number) {
    setAcoes((arr) => arr.filter((_, idx) => idx !== i));
  }
  function mover(i: number, dir: -1 | 1) {
    setAcoes((arr) => {
      const j = i + dir;
      if (j < 0 || j >= arr.length) return arr;
      const n = [...arr];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });
  }

  function montarPayload() {
    return {
      categoriaId: categoriaId || null,
      titulo,
      atalho: atalho.trim() || titulo.toLowerCase().replace(/\s+/g, '-').slice(0, 30),
      tagId: tagId || null,
      acoes: acoes.map((a) => ({
        tipo: a.tipo,
        texto: a.texto,
        midiaPath: a.midiaPath,
        midiaMime: a.midiaMime,
        midiaNome: a.midiaNome,
        delaySegundos: a.delaySegundos,
      })),
    };
  }

  async function salvar() {
    setSalvando(true);
    const payload = montarPayload();
    if (resposta) await db.editarResposta(resposta.id, payload);
    else await db.criarResposta(payload);
    setSalvando(false);
    toast.success(resposta ? 'Resposta atualizada.' : 'Resposta criada.');
    onSalvo();
  }

  function enviarEdicao() {
    const tag = tags.find((t) => t.id === tagId) ?? null;
    const payload = montarPayload();
    onEnviar({
      id: resposta?.id ?? '',
      categoriaId: payload.categoriaId,
      titulo: titulo || 'Mensagem',
      atalho: payload.atalho,
      usos: resposta?.usos ?? 0,
      ordem: resposta?.ordem ?? 0,
      padrao: resposta?.padrao ?? false,
      tagId: tagId || null,
      tagNome: tag?.nome ?? null,
      tagCor: tag?.cor ?? null,
      acoes: payload.acoes,
    });
    onClose();
  }

  async function excluir() {
    if (!resposta) return;
    setSalvando(true);
    await db.removerResposta(resposta.id);
    setSalvando(false);
    toast.success('Resposta removida.');
    onSalvo();
  }

  return (
    <Modal titulo={resposta ? 'Editar resposta' : 'Nova resposta rápida'} onClose={onClose}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Título">
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={inputCls} placeholder="Ex.: Saudação MCA" />
          </Campo>
          <Campo label='Atalho (após "/")'>
            <input value={atalho} onChange={(e) => setAtalho(e.target.value)} className={inputCls} placeholder="Ex.: saudacao" />
          </Campo>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Campo label="Categoria">
            <select
              value={categoriaId}
              onChange={(e) => {
                if (e.target.value === '__nova__') onCriarCategoria();
                else setCategoriaId(e.target.value);
              }}
              className={inputCls}
            >
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
              <option value="__nova__">+ Nova categoria…</option>
            </select>
          </Campo>
          <Campo label="Etiqueta (ao usar)">
            <select value={tagId} onChange={(e) => setTagId(e.target.value)} className={inputCls} title="Etiqueta aplicada ao contato ao enviar">
              <option value="">Nenhuma</option>
              {tags.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </Campo>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Ações (sequência)</span>
            <button type="button" onClick={addAcao} className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand hover:underline">
              <Plus size={13} /> Adicionar ação
            </button>
          </div>
          {acoes.map((a, i) => (
            <AcaoEditor
              key={i}
              acao={a}
              indice={i}
              total={acoes.length}
              onChange={(p) => patch(i, p)}
              onRemover={() => removerAcao(i)}
              onMover={(dir) => mover(i, dir)}
            />
          ))}
        </div>

        <div className="flex items-center justify-between pt-1">
          {resposta ? (
            <button type="button" onClick={excluir} disabled={salvando} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-danger hover:underline disabled:opacity-50">
              <Trash2 size={14} /> Excluir
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border-strong px-3 py-1.5 text-[13px] font-medium text-text-2 hover:bg-surface-2">
              Cancelar
            </button>
            <button
              type="button"
              onClick={enviarEdicao}
              disabled={salvando || acoes.every((a) => !a.texto.trim() && !a.midiaPath)}
              title="Enviar esta versão sem salvar"
              className="inline-flex items-center gap-1.5 rounded-md border border-brand px-3 py-1.5 text-[13px] font-semibold text-brand hover:bg-brand/5 disabled:opacity-50"
            >
              <Send size={14} /> Enviar
            </button>
            <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function AcaoEditor({
  acao,
  indice,
  total,
  onChange,
  onRemover,
  onMover,
}: {
  acao: AcaoForm;
  indice: number;
  total: number;
  onChange: (p: Partial<AcaoForm>) => void;
  onRemover: () => void;
  onMover: (dir: -1 | 1) => void;
}) {
  const ehMidia = TIPOS_MIDIA.includes(acao.tipo);
  const aceita =
    acao.tipo === 'imagem' ? 'image/*' : acao.tipo === 'audio' ? 'audio/*' : acao.tipo === 'video' ? 'video/*' : undefined;

  async function escolherArquivo(file: File) {
    onChange({ enviando: true });
    try {
      const m = await db.salvarMedia(file);
      onChange({ midiaPath: m.midiaPath, midiaMime: m.midiaMime, midiaNome: m.midiaNome });
    } catch {
      toast.error('Falha ao guardar o arquivo.');
    } finally {
      onChange({ enviando: false });
    }
  }

  return (
    <div className="rounded-lg border border-border-strong bg-surface-2 p-2.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded bg-brand/10 text-[10px] font-bold text-brand">{indice + 1}</span>
        <select
          value={acao.tipo}
          onChange={(e) => onChange({ tipo: e.target.value as TipoResposta, midiaPath: null, midiaMime: null, midiaNome: null })}
          className="h-7 flex-1 rounded-md border border-border-strong bg-surface px-1.5 text-[12px] outline-none focus:border-brand"
        >
          {TIPOS_RESPOSTA.map((t) => (
            <option key={t} value={t}>{TIPO_LABEL[t]}</option>
          ))}
        </select>
        <button type="button" onClick={() => onMover(-1)} disabled={indice === 0} className="grid h-7 w-6 place-items-center rounded text-muted hover:bg-surface disabled:opacity-30" title="Subir">
          <ChevronUp size={14} />
        </button>
        <button type="button" onClick={() => onMover(1)} disabled={indice === total - 1} className="grid h-7 w-6 place-items-center rounded text-muted hover:bg-surface disabled:opacity-30" title="Descer">
          <ChevronDown size={14} />
        </button>
        <button type="button" onClick={onRemover} disabled={total === 1} className="grid h-7 w-6 place-items-center rounded text-muted hover:bg-surface disabled:opacity-30" title="Remover">
          <X size={14} />
        </button>
      </div>

      {ehMidia && (
        <div className="mb-2 flex items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[12px] font-medium text-text-2 hover:bg-surface-2">
            {acao.enviando ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
            {acao.midiaPath ? 'Trocar' : 'Escolher arquivo'}
            <input
              type="file"
              accept={aceita}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) escolherArquivo(f);
                e.target.value = '';
              }}
            />
          </label>
          {acao.midiaNome && <span className="min-w-0 flex-1 truncate text-[11px] text-text-2">{acao.midiaNome}</span>}
        </div>
      )}

      <textarea
        value={acao.texto}
        onChange={(e) => onChange({ texto: e.target.value })}
        rows={ehMidia ? 2 : 3}
        placeholder={ehMidia ? 'Legenda (opcional)…' : 'Texto da mensagem…'}
        className="w-full resize-none rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-brand"
      />
      {!ehMidia && (
        <div className="mt-1 flex flex-wrap gap-1">
          {VARIAVEIS_DISPONIVEIS.map((v) => (
            <button
              key={v.chave}
              type="button"
              onClick={() => onChange({ texto: `${acao.texto}${v.chave}` })}
              title={v.descricao}
              className="rounded border border-border-strong bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-2 hover:border-brand hover:text-brand"
            >
              {v.chave}
            </button>
          ))}
        </div>
      )}

      {indice > 0 && (
        <label className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          Aguardar antes
          <input
            type="number"
            min={0}
            value={acao.delaySegundos}
            onChange={(e) => onChange({ delaySegundos: Math.max(0, Number(e.target.value) || 0) })}
            className="h-7 w-16 rounded-md border border-border-strong bg-surface px-1.5 text-[12px] outline-none focus:border-brand"
          />
          segundos
        </label>
      )}
    </div>
  );
}

function CategoriaDialog({
  categoria,
  onClose,
  onSalvo,
}: {
  categoria: CategoriaDC | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(categoria?.nome ?? '');
  const [cor, setCor] = useState<CorCategoria>(categoria?.cor ?? '#22c55e');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) {
      toast.error('Dê um nome à categoria.');
      return;
    }
    setSalvando(true);
    if (categoria) await db.editarCategoria(categoria.id, nome, cor);
    else await db.criarCategoria(nome, cor);
    setSalvando(false);
    toast.success(categoria ? 'Categoria atualizada.' : 'Categoria criada.');
    onSalvo();
  }

  async function excluir() {
    if (!categoria) return;
    setSalvando(true);
    await db.removerCategoria(categoria.id);
    setSalvando(false);
    toast.success('Categoria removida (respostas ficaram sem categoria).');
    onSalvo();
  }

  return (
    <Modal titulo={categoria ? 'Editar categoria' : 'Nova categoria'} onClose={onClose}>
      <div className="space-y-3">
        <Campo label="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} placeholder="Ex.: Saudação MCA" />
        </Campo>
        <Campo label="Cor">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="color"
              value={corHex(cor)}
              onChange={(e) => setCor(e.target.value)}
              className="h-8 w-10 cursor-pointer rounded-md border border-border-strong bg-surface p-0.5"
              title="Escolher cor"
            />
            {CORES_CATEGORIA.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                className={cn(
                  'h-6 w-6 rounded-full ring-2 transition',
                  corHex(cor).toLowerCase() === c.toLowerCase() ? 'ring-text' : 'ring-transparent',
                )}
                style={{ background: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </Campo>
        <div className="flex items-center justify-between pt-1">
          {categoria ? (
            <button type="button" onClick={excluir} disabled={salvando} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-danger hover:underline disabled:opacity-50">
              <Trash2 size={14} /> Excluir
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-md border border-border-strong px-3 py-1.5 text-[13px] font-medium text-text-2 hover:bg-surface-2">
              Cancelar
            </button>
            <button type="button" onClick={salvar} disabled={salvando} className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
              {salvando && <Loader2 size={14} className="animate-spin" />} Salvar
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

const inputCls =
  'h-9 w-full rounded-md border border-border-strong bg-surface px-2.5 text-[13px] outline-none focus:border-brand';

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {children}
    </label>
  );
}

function GuiaSecao({ titulo, Icon, children }: { titulo: string; Icon: typeof Tag; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <Icon size={13} /> {titulo}
      </div>
      {children}
    </div>
  );
}

/** Guia "Contato": dados da conversa aberta, etiquetas e notas locais. */
function ContatoGuia({ contato, tags }: { contato: ContatoAtivo | null; tags: TagOpt[] }) {
  const [tagsContato, setTagsContato] = useState<string[]>([]);
  const [notas, setNotas] = useState<NotaContato[]>([]);
  const [novaNota, setNovaNota] = useState('');
  const [ficha, setFicha] = useState<FichaContato | null>(null);
  const [editandoNome, setEditandoNome] = useState(false);
  const [nomeRascunho, setNomeRascunho] = useState('');
  const [interesses, setInteresses] = useState('');
  const [addEtiqueta, setAddEtiqueta] = useState(false);

  useEffect(() => {
    if (!contato) {
      setTagsContato([]);
      setNotas([]);
      setFicha(null);
      return;
    }
    let vivo = true;
    Promise.all([
      db.tagsDoContato(contato.chatId),
      db.listarNotas(contato.chatId),
      db.obterFicha(contato.chatId),
    ]).then(([t, n, f]) => {
      if (!vivo) return;
      setTagsContato(t);
      setNotas(n);
      setFicha(f);
      setInteresses(f.interesses ?? '');
      setEditandoNome(false);
      setAddEtiqueta(false);
    });
    return () => {
      vivo = false;
    };
  }, [contato?.chatId]);

  if (!contato) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-center text-[12px] text-muted">
        Abra uma conversa para ver os dados do contato.
      </div>
    );
  }

  async function alternarTag(tagId: string) {
    const novo = await db.alternarTagContato(contato!.chatId, tagId);
    setTagsContato(novo);
  }

  async function addNota() {
    if (!novaNota.trim()) return;
    const nota = await db.criarNota(contato!.chatId, novaNota.trim());
    setNotas((arr) => [nota, ...arr]);
    setNovaNota('');
  }

  async function salvarNome() {
    const nome = nomeRascunho.trim();
    setFicha(await db.salvarFicha(contato!.chatId, { nome: nome || null }));
    setEditandoNome(false);
    toast.success('Nome atualizado.');
  }

  async function salvarInteresses() {
    const texto = interesses.trim();
    if ((ficha?.interesses ?? '') === texto) return;
    setFicha(await db.salvarFicha(contato!.chatId, { interesses: texto || null }));
  }

  /** Nome usado nas mensagens: o cadastrado tem prioridade sobre o do WhatsApp. */
  const nomeExibido = ficha?.nome?.trim() || contato.nome;

  return (
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
          <User size={18} />
        </span>
        <div className="min-w-0 flex-1">
          {editandoNome ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                value={nomeRascunho}
                onChange={(e) => setNomeRascunho(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') salvarNome();
                  if (e.key === 'Escape') setEditandoNome(false);
                }}
                placeholder={contato.nome}
                className="h-7 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 text-[13px] outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={salvarNome}
                className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-brand text-white"
                title="Salvar nome"
              >
                <Check size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setNomeRascunho(ficha?.nome ?? '');
                setEditandoNome(true);
              }}
              className="group flex w-full items-center gap-1.5 text-left"
              title="Editar o nome usado nas mensagens"
            >
              <span className="truncate text-[14px] font-bold">{nomeExibido}</span>
              <Pencil size={11} className="flex-shrink-0 text-muted opacity-0 transition group-hover:opacity-100" />
            </button>
          )}
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <Phone size={11} />
            {contato.telefone ?? (contato.ehGrupo ? 'Grupo' : '—')}
          </div>
        </div>
      </div>

      {/* O nome acima é o que entra em {{nome}} nas mensagens rápidas. */}
      {ficha?.nome && ficha.nome.trim() !== contato.nome && (
        <p className="-mt-1 px-1 text-[10.5px] text-muted">
          No WhatsApp aparece como “{contato.nome}”.
        </p>
      )}

      <GuiaSecao titulo="Etiquetas" Icon={Tag}>
        {/* Mostra apenas as pastas em que o contato está; o + abre a lista. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {tags
            .filter((t) => tagsContato.includes(t.id))
            .map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => alternarTag(t.id)}
                title="Remover desta pasta"
                className="group inline-flex items-center gap-1 rounded-md border px-2.5 py-0.5 text-[11.5px] font-semibold text-white transition"
                style={{ background: t.cor, borderColor: t.cor }}
              >
                {t.nome}
                <X size={11} className="opacity-0 transition group-hover:opacity-100" />
              </button>
            ))}

          {tagsContato.length === 0 && !addEtiqueta && (
            <span className="text-[12px] text-muted">Nenhuma etiqueta neste contato.</span>
          )}

          <button
            type="button"
            onClick={() => setAddEtiqueta((v) => !v)}
            title="Adicionar a uma pasta"
            className={cn(
              'grid h-6 w-6 place-items-center rounded-md border border-dashed border-border-strong text-muted transition hover:border-brand hover:text-brand',
              addEtiqueta && 'border-brand text-brand',
            )}
          >
            <Plus size={13} />
          </button>
        </div>

        {addEtiqueta && (
          <div className="mt-2 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto border-t border-border pt-2">
            {tags.filter((t) => !tagsContato.includes(t.id)).length === 0 ? (
              <span className="text-[12px] text-muted">O contato já está em todas as pastas.</span>
            ) : (
              tags
                .filter((t) => !tagsContato.includes(t.id))
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => alternarTag(t.id)}
                    className="rounded-md border bg-surface px-2.5 py-0.5 text-[11.5px] font-semibold transition hover:text-white"
                    style={{ borderColor: t.cor, color: t.cor }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = t.cor)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                  >
                    {t.nome}
                  </button>
                ))
            )}
          </div>
        )}
      </GuiaSecao>

      <GuiaSecao titulo="Interesses" Icon={Sparkles}>
        <textarea
          value={interesses}
          onChange={(e) => setInteresses(e.target.value)}
          onBlur={salvarInteresses}
          rows={3}
          placeholder="Ex.: lentes de contato, clareamento — orçamento enviado em 12/08"
          className="w-full resize-none rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-brand"
        />
        {ficha?.ultimoContato && (
          <p className="mt-1 text-[10.5px] text-muted">
            Último envio: {new Date(ficha.ultimoContato).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          </p>
        )}
      </GuiaSecao>

      <GuiaSecao titulo="Notas" Icon={NotebookPen}>
        <div className="mb-2 flex gap-1.5">
          <input
            value={novaNota}
            onChange={(e) => setNovaNota(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addNota()}
            placeholder="Nova nota sobre o contato…"
            className="h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2.5 text-[12px] outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={addNota}
            className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-md bg-brand text-white hover:opacity-90"
            title="Adicionar nota"
          >
            <Plus size={14} />
          </button>
        </div>
        {notas.length === 0 ? (
          <span className="text-[12px] text-muted">Nenhuma nota ainda.</span>
        ) : (
          <div className="space-y-2">
            {notas.map((n) => (
              <div key={n.id} className="group rounded-md border border-border bg-surface-2 p-2">
                <div className="whitespace-pre-wrap break-words text-[12px] text-text-2">{n.conteudo}</div>
                <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                  {new Date(n.criadoEm).toLocaleDateString('pt-BR')}
                  <button
                    type="button"
                    onClick={() => {
                      db.removerNota(contato!.chatId, n.id);
                      setNotas((arr) => arr.filter((x) => x.id !== n.id));
                    }}
                    className="opacity-0 transition group-hover:opacity-100 hover:text-danger"
                    title="Remover nota"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GuiaSecao>
    </div>
  );
}

function Pill({ children, ativo, onClick }: { children: React.ReactNode; ativo?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-3 py-1 text-[11px] font-semibold transition',
        ativo ? 'border-brand bg-brand text-white' : 'border-border-strong bg-surface text-text-2 hover:bg-surface-2',
      )}
    >
      {children}
    </button>
  );
}
