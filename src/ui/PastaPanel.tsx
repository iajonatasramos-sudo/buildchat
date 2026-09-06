// Painel de conversas da pasta/etiqueta selecionada. Cobre a área da lista
// nativa (#pane-side) — a lista do WhatsApp é virtualizada, então filtrá-la
// diretamente quebraria o scroll; em vez disso mostramos nossa própria lista
// (via WPP) e abrimos a conversa ao clicar, como a extensão de referência.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, X } from 'lucide-react';
import { cn, emPx } from '@/lib/utils';
import * as db from '@/lib/db';
import { pastaAtiva } from '@/lib/store';
import { abrirChat, bridgeDisponivel, listarChats, type ChatResumo } from '@/lib/wa';
import type { TagOpt } from '@/lib/types';

function formatarHora(ts: number | null): string {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
}

export function PastaPanel({ tagId }: { tagId: string }) {
  const [tag, setTag] = useState<TagOpt | null>(null);
  const [chats, setChats] = useState<ChatResumo[] | null>(null);
  const [rect, setRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const medir = useCallback(() => {
    const pane = document.querySelector('#pane-side');
    if (!pane) return;
    const r = pane.getBoundingClientRect();
    setRect({ left: emPx(r.left), top: emPx(r.top), width: emPx(r.width), height: emPx(r.height) });
  }, []);

  useEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    const intervalo = window.setInterval(medir, 1500); // layout do WhatsApp muda sem eventos
    return () => {
      window.removeEventListener('resize', medir);
      window.clearInterval(intervalo);
    };
  }, [medir]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      // O filtro depende do WPP para listar as conversas — espera ele conectar.
      let espera = 0;
      while (vivo && !bridgeDisponivel() && espera < 20) {
        await new Promise((r) => setTimeout(r, 1000));
        espera++;
      }
      const [tags, mapa, todos] = await Promise.all([db.listarTags(), db.mapaTagsContatos(), listarChats()]);
      if (!vivo) return;
      setTag(tags.find((t) => t.id === tagId) ?? null);
      // O contato pode estar registrado pelo id do WPP ("...@c.us") ou por
      // chaves legadas "wa:<nome>" / "wa:<telefone em vários formatos>".
      const soDigitos = (s: string) => s.replace(/\D/g, '');
      const chavesDaTag: { texto: string; digitos: string }[] = [];
      for (const [chave, ids] of Object.entries(mapa)) {
        if (!ids.includes(tagId)) continue;
        const texto = chave.replace(/^wa:/, '').trim();
        chavesDaTag.push({ texto, digitos: soDigitos(texto) });
      }
      const temTag = (c: ChatResumo) => {
        const usuario = c.chatId.split('@')[0] ?? '';
        const candidatos = new Set([c.chatId, c.nome.trim(), (c.telefone ?? '').trim()]);
        const candidatosDigitos = new Set([soDigitos(c.telefone ?? ''), soDigitos(usuario)].filter((d) => d.length >= 8));
        return chavesDaTag.some(
          (k) => candidatos.has(k.texto) || (k.digitos.length >= 8 && candidatosDigitos.has(k.digitos)),
        );
      };
      const filtrados = todos.filter(temTag).sort((a, b) => (b.ultimaTs ?? 0) - (a.ultimaTs ?? 0));
      // O vínculo é casado pelo nome do WhatsApp (acima); a EXIBIÇÃO usa o nome
      // de tratamento da ficha, quando existe.
      const nomes = await db.nomesDasFichas();
      setChats(filtrados.map((c) => ({ ...c, nome: nomes[c.chatId] ?? c.nome })));
    })();
    return () => {
      vivo = false;
    };
  }, [tagId]);

  if (!rect) return null;

  return (
    <div
      className="bc-anim-fade pointer-events-auto fixed z-[45] flex flex-col overflow-hidden border-r border-border bg-surface"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      <div className="flex flex-shrink-0 items-center gap-2 border-b border-border bg-surface-2 px-3 py-2">
        {tag && <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: tag.cor }} />}
        <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{tag?.nome ?? 'Pasta'}</span>
        <span className="text-[11px] text-muted">{chats?.length ?? '…'} conversa(s)</span>
        <button
          type="button"
          onClick={() => pastaAtiva.set(null)}
          className="grid h-7 w-7 place-items-center rounded-md text-muted transition hover:bg-surface"
          title="Fechar filtro"
        >
          <X size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {chats === null ? (
          <div className="flex items-center justify-center gap-2 py-10 text-[12px] text-muted">
            <Loader2 size={14} className="animate-spin" /> Carregando…
          </div>
        ) : chats.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-[12px] text-muted">
            <MessageSquare size={20} />
            {bridgeDisponivel() ? (
              <>
                Nenhuma conversa com esta etiqueta.
                <span className="max-w-[240px] text-[11px]">
                  Aplique etiquetas pela guia Contato ou por respostas rápidas com etiqueta.
                </span>
              </>
            ) : (
              <>
                Módulo WPP ainda não conectou.
                <span className="max-w-[240px] text-[11px]">
                  O filtro de pastas usa o WPP para listar as conversas — aguarde a bolinha verde na barra do topo e
                  clique na pasta de novo.
                </span>
              </>
            )}
          </div>
        ) : (
          chats.map((c) => (
            <button
              key={c.chatId}
              type="button"
              onClick={() => abrirChat(c.chatId)}
              className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left transition last:border-b-0 hover:bg-surface-2"
            >
              <span
                className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
                style={{ background: tag?.cor ?? 'var(--brand)' }}
              >
                {iniciais(c.nome)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{c.nome}</span>
                <span className="block truncate text-[11px] text-muted">
                  {c.ehGrupo ? 'Grupo' : c.telefone ?? ''}
                </span>
              </span>
              <span className="flex flex-shrink-0 flex-col items-end gap-1">
                <span className={cn('text-[10.5px]', c.naoLidas > 0 ? 'font-bold text-success' : 'text-muted')}>
                  {formatarHora(c.ultimaTs)}
                </span>
                {c.naoLidas > 0 && (
                  <span className="grid h-4 min-w-4 place-items-center rounded-full bg-success px-1 text-[9.5px] font-bold text-white">
                    {c.naoLidas}
                  </span>
                )}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
