// Cabeçalho do BuildChat no topo do WhatsApp Web (largura total, como na
// referência): marca, chips de pastas/etiquetas com contador, conta e a
// engrenagem das configurações. Clicar em qualquer ponto livre da barra abre
// as mensagens rápidas. O #app do WhatsApp é empurrado para baixo via CSS
// injetado no main.tsx. O estado do WPP e da nuvem mora em `IndicadoresEstado`,
// que a barra lateral e o rodapé da gaveta mostram.

import { useEffect, useState } from 'react';
import { Cloud, CloudOff, Loader2, Plus, Settings as SettingsIcon, ShieldAlert } from 'lucide-react';
import { cn, emPx } from '@/lib/utils';
import * as db from '@/lib/db';
import { servidorConfigurado } from '@/lib/config';
import {
  abaGaveta,
  alternarPastaAtiva,
  estadoSync,
  gavetaAberta,
  modalConfiguracoes,
  modalConta,
  modalPastas,
  pastasAtivas,
  perfilAtual,
  type EstadoSync,
} from '@/lib/store';
import { bridgeDisponivel } from '@/lib/wa';
import { MARCA } from '@/lib/marca';
import { ContaBotao } from './Conta';
import type { TagOpt } from '@/lib/types';

/** Altura VISUAL da barra (px reais do viewport). Internamente o conteúdo
 *  mede ALTURA_TOPBAR/ZOOM, pois o .bc-root está ampliado em ZOOM. */
export const ALTURA_TOPBAR = 50;

/** Sem conta, qualquer recurso leva ao login. Devolve se pode seguir. */
function exigirLogin(): boolean {
  if (servidorConfigurado() && !perfilAtual.get()) {
    modalConta.set(true);
    return false;
  }
  return true;
}

export function TopBar() {
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [ativas, setAtivas] = useState<string[]>(pastasAtivas.get());
  const [gaveta, setGaveta] = useState(gavetaAberta.get());
  const [configAberta, setConfigAberta] = useState(modalConfiguracoes.get());

  useEffect(() => gavetaAberta.subscribe(setGaveta), []);
  useEffect(() => modalConfiguracoes.subscribe(setConfigAberta), []);

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
    const unsub = pastasAtivas.subscribe(setAtivas);
    return () => {
      chrome.storage.onChanged.removeListener(onChange as any);
      unsub();
    };
  }, []);

  // Clique em área livre da barra (fora de botões) = abrir as mensagens rápidas.
  const abrirRapidas = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input')) return;
    if (!exigirLogin()) return;
    abaGaveta.set('rapidas');
    gavetaAberta.set(true);
  };

  return (
    <div
      className="flex cursor-pointer items-center gap-2 border-b border-border bg-surface px-3"
      style={{ height: emPx(ALTURA_TOPBAR) }}
      onClick={abrirRapidas}
      title="Abrir mensagens rápidas"
    >
      <span className="inline-flex flex-shrink-0 items-center gap-1.5 text-[13px] font-bold text-text">
        <img
          src={chrome.runtime.getURL('icons/icon48.png')}
          alt=""
          className="h-6 w-6 rounded-md bg-white object-contain"
        />
        {MARCA.nome}
      </span>

      <span className="h-5 w-px flex-shrink-0 bg-border" />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1 [scrollbar-width:none]">
        <Chip ativo={ativas.length === 0} onClick={() => exigirLogin() && pastasAtivas.set([])}>
          Todas
        </Chip>
        {/* Mais de uma pasta marcada = só as conversas que estão em todas elas. */}
        {tags.map((t) => (
          <Chip
            key={t.id}
            ativo={ativas.includes(t.id)}
            cor={t.cor}
            onClick={() => exigirLogin() && alternarPastaAtiva(t.id)}
            titulo={ativas.includes(t.id) ? 'Tirar do filtro' : 'Filtrar por esta pasta (combine com outras)'}
          >
            {t.nome}
            {contagem[t.id] ? (
              <span className="rounded-full bg-black/25 px-1 text-[9px] font-bold">{contagem[t.id]}</span>
            ) : null}
          </Chip>
        ))}
        <button
          type="button"
          onClick={() => exigirLogin() && modalPastas.set(true)}
          title="Minhas pastas — criar ou apagar"
          className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md border border-dashed border-border-strong text-muted transition hover:border-brand hover:text-brand"
        >
          <Plus size={13} />
        </button>
      </div>

      <ContaBotao />

      <button
        type="button"
        onClick={() => exigirLogin() && modalConfiguracoes.set(!configAberta)}
        title="Configurações"
        className={cn(
          'grid h-7 w-7 flex-shrink-0 place-items-center rounded-md transition',
          configAberta ? 'bg-brand text-white' : 'text-text-2 hover:bg-surface-2',
          gaveta && 'opacity-90',
        )}
      >
        <SettingsIcon size={15} />
      </button>
    </div>
  );
}

/**
 * Bolinha do WPP e nuvem da sincronização. Ficam na barra lateral (empilhadas,
 * no rodapé) e no rodapé da gaveta quando ela está aberta.
 */
export function IndicadoresEstado({ vertical = false }: { vertical?: boolean }) {
  const [wppOk, setWppOk] = useState(bridgeDisponivel());
  const [sync, setSync] = useState<EstadoSync>(estadoSync.get());
  useEffect(() => estadoSync.subscribe(setSync), []);
  useEffect(() => {
    const intervalo = window.setInterval(() => setWppOk(bridgeDisponivel()), 2000);
    return () => window.clearInterval(intervalo);
  }, []);

  return (
    <div className={cn('flex items-center', vertical ? 'flex-col gap-2' : 'gap-2.5')}>
      <span
        className={cn('inline-flex items-center gap-1 font-semibold text-muted', vertical ? 'flex-col gap-0.5 text-[8.5px]' : 'text-[10px]')}
        title={wppOk ? 'Módulo WPP conectado — envio direto ativo' : 'WPP indisponível — envio em modo compatível (texto pela caixa de mensagem)'}
      >
        <span className={cn('h-2 w-2 rounded-full', wppOk ? 'bg-success' : 'bg-warning')} />
        {wppOk ? 'WPP' : 'compat.'}
      </span>
      <SyncStatus estado={sync} />
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
      <Icone size={15} className={estado === 'sincronizando' ? 'animate-spin' : undefined} />
    </span>
  );
}

function Chip({
  children,
  ativo,
  cor,
  onClick,
  titulo,
}: {
  children: React.ReactNode;
  ativo?: boolean;
  cor?: string;
  onClick?: () => void;
  titulo?: string;
}) {
  // Todas as pastas com fundo sólido na própria cor e texto branco (como o
  // chip "Todas"); a ativa ganha um anel branco para se destacar.
  const estilo = cor ? { background: cor, borderColor: cor, color: '#fff' } : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
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
