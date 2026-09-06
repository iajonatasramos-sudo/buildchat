// Cabeçalho do BuildChat no topo do WhatsApp Web (largura total, como na
// referência): marca, chips de pastas/etiquetas com contador e status do WPP.
// O #app do WhatsApp é empurrado para baixo via CSS injetado no main.tsx.

import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, ShieldAlert, Zap } from 'lucide-react';
import { cn, emPx } from '@/lib/utils';
import * as db from '@/lib/db';
import { estadoSync, gavetaAberta, pastaAtiva, type EstadoSync } from '@/lib/store';
import { bridgeDisponivel } from '@/lib/wa';
import { ContaBotao } from './Conta';
import type { TagOpt } from '@/lib/types';

/** Altura VISUAL da barra (px reais do viewport). Internamente o conteúdo
 *  mede ALTURA_TOPBAR/ZOOM, pois o .bc-root está ampliado em ZOOM. */
export const ALTURA_TOPBAR = 50;

export function TopBar() {
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [ativa, setAtiva] = useState<string | null>(pastaAtiva.get());
  const [wppOk, setWppOk] = useState(bridgeDisponivel());
  const [gaveta, setGaveta] = useState(gavetaAberta.get());
  const [sync, setSync] = useState<EstadoSync>(estadoSync.get());

  useEffect(() => estadoSync.subscribe(setSync), []);

  useEffect(() => gavetaAberta.subscribe(setGaveta), []);

  useEffect(() => {
    const carregar = async () => {
      const [t, mapa] = await Promise.all([db.listarTags(), db.mapaTagsContatos()]);
      setTags(t);
      const cont: Record<string, number> = {};
      for (const ids of Object.values(mapa)) {
        for (const id of ids) cont[id] = (cont[id] ?? 0) + 1;
      }
      setContagem(cont);
    };
    carregar();
    const onChange = (changes: Record<string, unknown>) => {
      if ('bc2_tags' in changes || 'bc2_contact_tags' in changes) carregar();
    };
    chrome.storage.onChanged.addListener(onChange as any);
    const unsub = pastaAtiva.subscribe(setAtiva);
    const intervalo = window.setInterval(() => setWppOk(bridgeDisponivel()), 2000);
    return () => {
      chrome.storage.onChanged.removeListener(onChange as any);
      unsub();
      window.clearInterval(intervalo);
    };
  }, []);

  return (
    <div
      className="flex items-center gap-2 border-b border-border bg-surface px-3"
      style={{ height: emPx(ALTURA_TOPBAR) }}
    >
      <span className="inline-flex flex-shrink-0 items-center gap-1.5 text-[13px] font-bold text-text">
        <img
          src={chrome.runtime.getURL('icons/icon48.png')}
          alt=""
          className="h-6 w-6 rounded-md bg-white object-contain"
        />
        BuildChat
      </span>

      <span className="h-5 w-px flex-shrink-0 bg-border" />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]">
        <Chip ativo={ativa === null} onClick={() => pastaAtiva.set(null)}>
          Todas
        </Chip>
        {tags.map((t) => (
          <Chip
            key={t.id}
            ativo={ativa === t.id}
            cor={t.cor}
            onClick={() => pastaAtiva.set(ativa === t.id ? null : t.id)}
          >
            {t.nome}
            {contagem[t.id] ? (
              <span className="rounded-full bg-black/25 px-1 text-[9px] font-bold">{contagem[t.id]}</span>
            ) : null}
          </Chip>
        ))}
      </div>

      <span
        className="inline-flex flex-shrink-0 items-center gap-1.5 text-[10.5px] font-semibold text-muted"
        title={wppOk ? 'Módulo WPP conectado — envio direto ativo' : 'WPP indisponível — envio em modo compatível (texto pela caixa de mensagem)'}
      >
        <span className={cn('h-2 w-2 rounded-full', wppOk ? 'bg-success' : 'bg-warning')} />
        {wppOk ? 'WPP' : 'compat.'}
      </span>

      <SyncStatus estado={sync} />

      <ContaBotao />

      <button
        type="button"
        onClick={() => gavetaAberta.set(!gaveta)}
        title={gaveta ? 'Fechar mensagens rápidas' : 'Abrir mensagens rápidas'}
        className={cn(
          'grid h-7 w-7 flex-shrink-0 place-items-center rounded-md transition',
          gaveta ? 'bg-brand text-white' : 'text-text-2 hover:bg-surface-2',
        )}
      >
        <Zap size={14} />
      </button>
    </div>
  );
}

function SyncStatus({ estado }: { estado: EstadoSync }) {
  if (estado === 'local') return null; // sem conta: nada a sincronizar
  const mapa: Record<Exclude<EstadoSync, 'local'>, { Icone: typeof Cloud; cor: string; titulo: string }> = {
    sincronizando: { Icone: Loader2, cor: 'text-muted', titulo: 'Sincronizando…' },
    ok: { Icone: Cloud, cor: 'text-success', titulo: 'Tudo sincronizado' },
    erro: { Icone: CloudOff, cor: 'text-warning', titulo: 'Não consegui sincronizar agora — vou tentar de novo' },
    bloqueado: { Icone: ShieldAlert, cor: 'text-danger', titulo: 'Assinatura pendente — sincronização pausada' },
  };
  const { Icone, cor, titulo } = mapa[estado];
  return (
    <span className={cn('flex-shrink-0', cor)} title={titulo}>
      <Icone size={14} className={estado === 'sincronizando' ? 'animate-spin' : undefined} />
    </span>
  );
}

function Chip({
  children,
  ativo,
  cor,
  onClick,
}: {
  children: React.ReactNode;
  ativo?: boolean;
  cor?: string;
  onClick?: () => void;
}) {
  // Todas as pastas com fundo sólido na própria cor e texto branco (como o
  // chip "Todas"); a ativa ganha um anel branco para se destacar.
  const estilo = cor ? { background: cor, borderColor: cor, color: '#fff' } : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-0.5 text-[11.5px] font-bold text-white transition',
        !cor && 'border-brand bg-brand',
        ativo ? 'ring-2 ring-white/70' : 'opacity-85 hover:opacity-100',
      )}
      style={estilo}
    >
      {children}
    </button>
  );
}
