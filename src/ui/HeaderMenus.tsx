// Menus suspensos da barra do cabeçalho, renderizados no overlay principal
// (posição fixa — não sofrem clipping do header do WhatsApp).

import { useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Search, Trash2 } from 'lucide-react';
import { cn, emPx } from '@/lib/utils';
import * as db from '@/lib/db';
import { menuHeader, pastaAtiva, type MenuHeader } from '@/lib/store';
import type { ContatoAtivo, TagOpt } from '@/lib/types';
import type { MsgApagada } from '@/lib/db';

export function HeaderMenuOverlay({ menu, contato }: { menu: NonNullable<MenuHeader>; contato: ContatoAtivo | null }) {
  const fechar = () => menuHeader.set(null);
  return (
    <div className="pointer-events-auto fixed inset-0 z-[65]" onClick={fechar}>
      <div
        className="bc-anim-pop fixed flex max-h-[440px] w-[320px] flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        style={{ left: emPx(menu.x), top: emPx(menu.y) }}
        onClick={(e) => e.stopPropagation()}
      >
        {menu.tipo === 'etiquetas' && <MenuEtiquetas contato={contato} />}
        {menu.tipo === 'filtros' && <MenuFiltros onEscolher={fechar} />}
        {menu.tipo === 'apagadas' && <MenuApagadas contato={contato} />}
      </div>
    </div>
  );
}

function Cabecalho({ titulo }: { titulo: string }) {
  return (
    <div className="flex-shrink-0 border-b border-border bg-surface-2 px-3 py-2 text-[12px] font-bold text-text-2">
      {titulo}
    </div>
  );
}

/** Atribuir a conversa às pastas/etiquetas (com busca, como na referência). */
function MenuEtiquetas({ contato }: { contato: ContatoAtivo | null }) {
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [doContato, setDoContato] = useState<Set<string>>(new Set());
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!contato) return;
    let vivo = true;
    (async () => {
      const [t, atuais, mapa] = await Promise.all([
        db.listarTags(),
        db.tagsDoContato(contato.chatId),
        db.mapaTagsContatos(),
      ]);
      if (!vivo) return;
      setTags([...t].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      setDoContato(new Set(atuais));
      const cont: Record<string, number> = {};
      for (const ids of Object.values(mapa)) for (const id of ids) cont[id] = (cont[id] ?? 0) + 1;
      setContagem(cont);
      setCarregando(false);
    })();
    return () => {
      vivo = false;
    };
  }, [contato?.chatId]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return q ? tags.filter((t) => t.nome.toLowerCase().includes(q)) : tags;
  }, [tags, busca]);

  if (!contato) {
    return <div className="p-4 text-center text-[12px] text-muted">Abra uma conversa para etiquetar.</div>;
  }

  async function alternar(tag: TagOpt) {
    const novo = await db.alternarTagContato(contato!.chatId, tag.id);
    const ativa = novo.includes(tag.id);
    setDoContato(new Set(novo));
    setContagem((c) => ({ ...c, [tag.id]: Math.max(0, (c[tag.id] ?? 0) + (ativa ? 1 : -1)) }));
  }

  return (
    <>
      <div className="flex-shrink-0 p-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar pastas"
            className="h-8 w-full rounded-md border border-border-strong bg-surface pl-8 pr-2 text-[12.5px] outline-none focus:border-brand"
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-1">
        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted">
            <Loader2 size={13} className="animate-spin" /> Carregando…
          </div>
        ) : filtradas.length === 0 ? (
          <div className="py-6 text-center text-[12px] text-muted">Nenhuma pasta encontrada.</div>
        ) : (
          filtradas.map((t) => {
            const ativa = doContato.has(t.id);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => alternar(t)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-surface-2"
              >
                <span
                  className={cn(
                    'grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border',
                    ativa ? 'text-white' : 'bg-surface',
                  )}
                  style={{ borderColor: t.cor, background: ativa ? t.cor : undefined }}
                >
                  {ativa && <Check size={11} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className="inline-block max-w-full truncate rounded-md px-2 py-0.5 align-middle text-[12px] font-bold text-white"
                    style={{ background: t.cor }}
                  >
                    {t.nome}
                  </span>
                </span>
                {contagem[t.id] ? (
                  <span
                    className="rounded-full px-1.5 text-[10px] font-bold text-white"
                    style={{ background: t.cor }}
                  >
                    {contagem[t.id]}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </>
  );
}

/** Atalho de filtro: escolhe uma pasta e ativa o filtro global (pastaAtiva). */
function MenuFiltros({ onEscolher }: { onEscolher: () => void }) {
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const ativa = pastaAtiva.get();

  useEffect(() => {
    (async () => {
      const [t, mapa] = await Promise.all([db.listarTags(), db.mapaTagsContatos()]);
      setTags([...t].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      const cont: Record<string, number> = {};
      for (const ids of Object.values(mapa)) for (const id of ids) cont[id] = (cont[id] ?? 0) + 1;
      setContagem(cont);
    })();
  }, []);

  function escolher(id: string | null) {
    pastaAtiva.set(id);
    onEscolher();
  }

  return (
    <>
      <Cabecalho titulo="Filtrar conversas" />
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        <button
          type="button"
          onClick={() => escolher(null)}
          className={cn(
            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px] font-semibold transition hover:bg-surface-2',
            ativa === null && 'text-brand',
          )}
        >
          Todas as conversas
        </button>
        {tags.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => escolher(t.id)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'inline-block max-w-full truncate rounded-md px-2 py-0.5 align-middle text-[12px] font-bold text-white',
                  ativa === t.id && 'ring-2 ring-white/70',
                )}
                style={{ background: t.cor }}
              >
                {t.nome}
              </span>
            </span>
            {contagem[t.id] ? (
              <span className="rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: t.cor }}>
                {contagem[t.id]}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </>
  );
}

/** Mensagens apagadas capturadas nesta conversa. */
function MenuApagadas({ contato }: { contato: ContatoAtivo | null }) {
  const [nomes, setNomes] = useState<Record<string, string>>({});
  useEffect(() => {
    db.nomesDasFichas().then(setNomes);
  }, []);
  const [lista, setLista] = useState<MsgApagada[] | null>(null);

  useEffect(() => {
    if (!contato) return;
    db.listarApagadas(contato.chatId).then(setLista);
  }, [contato?.chatId]);

  if (!contato) {
    return <div className="p-4 text-center text-[12px] text-muted">Abra uma conversa.</div>;
  }

  return (
    <>
      <Cabecalho titulo="Mensagens apagadas" />
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {lista === null ? (
          <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted">
            <Loader2 size={13} className="animate-spin" /> Carregando…
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center gap-1.5 py-6 text-center text-[12px] text-muted">
            <Trash2 size={18} />
            Nenhuma mensagem apagada capturada aqui.
            <span className="max-w-[240px] text-[11px]">
              A captura acontece enquanto o WhatsApp Web está aberto com o BuildChat ativo.
            </span>
          </div>
        ) : (
          lista.map((m, i) => (
            <div key={i} className="rounded-md border border-border bg-surface-2 p-2">
              <div className="whitespace-pre-wrap break-words text-[12px] text-text-2">
                {m.texto?.trim() || <em className="text-muted">({m.tipo && m.tipo !== 'chat' ? `mídia: ${m.tipo}` : 'conteúdo não capturado'})</em>}
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-muted">
                <span>
                  {m.deMim ? 'Você' : nomes[m.autor ?? ''] ?? ((m.autor ?? '').split('@')[0] || 'Contato')}
                </span>
                <span>
                  apagada {new Date(m.apagadaEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
