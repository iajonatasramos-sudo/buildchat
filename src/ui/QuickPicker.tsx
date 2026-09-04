// Seletor de respostas rápidas aberto ao digitar "/" no compose do WhatsApp.
// Visual seguindo o padrão do painel (surface/border/brand do Saleschat).

import { FileText, Film, Image as ImageIcon, Layers, Mic, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RespostaDC, TipoResposta } from '@/lib/types';

const TIPO_ICON: Record<TipoResposta, typeof FileText> = {
  texto: FileText,
  imagem: ImageIcon,
  audio: Mic,
  video: Film,
  documento: FileText,
};

export function QuickPicker({
  itens,
  ativo,
  pos,
  onEscolher,
  onHover,
}: {
  itens: RespostaDC[];
  ativo: number;
  pos: { left: number; bottom: number; width: number };
  onEscolher: (r: RespostaDC) => void;
  onHover: (i: number) => void;
}) {
  return (
    <div
      className="bc-anim-pop pointer-events-auto fixed z-[70] overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
      style={{ left: pos.left, bottom: pos.bottom, width: Math.min(pos.width, 520) }}
    >
      <div className="flex items-center gap-1.5 border-b border-border bg-surface-2 px-3 py-1.5 text-[11px] font-semibold text-text-2">
        <Zap size={12} className="text-brand" /> Respostas rápidas
        <span className="ml-auto font-normal text-muted">↑↓ navegar · Enter enviar · Tab inserir</span>
      </div>
      <div className="max-h-72 overflow-y-auto">
        {itens.length === 0 ? (
          <div className="px-3 py-3 text-[12px] text-muted">Nenhuma resposta encontrada.</div>
        ) : (
          itens.map((r, i) => {
            const multi = r.acoes.length > 1;
            const Icon = multi ? Layers : TIPO_ICON[r.acoes[0]?.tipo ?? 'texto'] ?? FileText;
            const preview = r.acoes.find((a) => a.texto.trim())?.texto ?? '';
            return (
              <button
                key={r.id}
                type="button"
                onMouseEnter={() => onHover(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onEscolher(r);
                }}
                className={cn(
                  'flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left transition last:border-b-0',
                  i === ativo ? 'bg-brand/10' : 'hover:bg-surface-2',
                )}
              >
                <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-md bg-brand/10 text-brand">
                  <Icon size={14} />
                </span>
                <span className="flex-shrink-0 font-mono text-[11px] font-bold text-brand">/{r.atalho}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{r.titulo}</span>
                <span className="max-w-[40%] flex-shrink-0 truncate text-[11px] text-muted">{preview.slice(0, 60)}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
