// Modal de Anotações da conversa (padrão Dental Chat): lista com data/hora,
// ações Copiar/Editar/Deletar por nota e o botão "Criar anotação" no rodapé.
// As notas são locais (chrome.storage), por conversa.

import { useCallback, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as db from '@/lib/db';
import { modalAnotacoes } from '@/lib/store';
import type { ContatoAtivo, NotaContato } from '@/lib/types';
import { toast } from './toast';

function dataHora(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`;
}

export function AnotacoesModal({ contato }: { contato: ContatoAtivo | null }) {
  const [notas, setNotas] = useState<NotaContato[] | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [criando, setCriando] = useState(false);
  const [nova, setNova] = useState('');

  const fechar = () => modalAnotacoes.set(false);

  const carregar = useCallback(async () => {
    setNotas(contato ? await db.listarNotas(contato.chatId) : []);
  }, [contato?.chatId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Esc fecha o modal (mesmo com o foco no textarea)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fechar();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);

  async function salvarNova() {
    if (!contato || !nova.trim()) return;
    await db.criarNota(contato.chatId, nova.trim());
    setNova('');
    setCriando(false);
    carregar();
    toast.success('Anotação criada.');
  }

  async function salvarEdicao(id: string) {
    if (!contato || !rascunho.trim()) return;
    await db.editarNota(contato.chatId, id, rascunho.trim());
    setEditando(null);
    carregar();
    toast.success('Anotação atualizada.');
  }

  async function deletar(id: string) {
    if (!contato) return;
    await db.removerNota(contato.chatId, id);
    carregar();
    toast.success('Anotação removida.');
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Copiado.');
    } catch {
      toast.error('Não consegui copiar.');
    }
  }

  return (
    <div className="pointer-events-auto fixed inset-0 z-[66] flex items-center justify-center bg-text/40 p-4" onClick={fechar}>
      <div
        className="bc-anim-pop flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-[15px] font-bold">Anotações</h3>
          <button type="button" onClick={fechar} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2">
            <X size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {!contato ? (
            <p className="py-8 text-center text-[12.5px] text-muted">Abra uma conversa para anotar.</p>
          ) : notas === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted">
              <Loader2 size={14} className="animate-spin" /> Carregando…
            </div>
          ) : (
            <>
              {criando && (
                <div className="mb-4 rounded-md border border-brand/50 bg-surface-2 p-2.5">
                  <textarea
                    autoFocus
                    value={nova}
                    onChange={(e) => setNova(e.target.value)}
                    rows={3}
                    placeholder="Escreva a anotação…"
                    className="w-full resize-none rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <BotaoAcao cor="muted" onClick={() => { setCriando(false); setNova(''); }}>Cancelar</BotaoAcao>
                    <button
                      type="button"
                      onClick={salvarNova}
                      disabled={!nova.trim()}
                      className="rounded-md bg-brand px-3 py-1 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  </div>
                </div>
              )}

              {notas.length === 0 && !criando ? (
                <p className="py-8 text-center text-[12.5px] text-muted">Nenhuma anotação nesta conversa.</p>
              ) : (
                <div className="space-y-4">
                  {notas.map((n) => (
                    <div key={n.id} className="border-b border-border pb-3 last:border-b-0">
                      <div className="text-[12.5px] font-bold text-text">{dataHora(n.criadoEm)}</div>
                      {editando === n.id ? (
                        <>
                          <textarea
                            autoFocus
                            value={rascunho}
                            onChange={(e) => setRascunho(e.target.value)}
                            rows={3}
                            className="mt-1 w-full resize-none rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-brand"
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            <BotaoAcao cor="muted" onClick={() => setEditando(null)}>Cancelar</BotaoAcao>
                            <button
                              type="button"
                              onClick={() => salvarEdicao(n.id)}
                              disabled={!rascunho.trim()}
                              className="rounded-md bg-brand px-3 py-1 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                            >
                              Salvar
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-[13px] text-text-2">{n.conteudo}</p>
                          <div className="mt-2 flex justify-end gap-2">
                            <BotaoAcao cor="success" onClick={() => copiar(n.conteudo)}>Copiar</BotaoAcao>
                            <BotaoAcao cor="warning" onClick={() => { setEditando(n.id); setRascunho(n.conteudo); }}>Editar</BotaoAcao>
                            <BotaoAcao cor="danger" onClick={() => deletar(n.id)}>Deletar</BotaoAcao>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-shrink-0 justify-center border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setCriando(true)}
            disabled={!contato || criando}
            className="rounded-md bg-brand px-4 py-1.5 text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Criar anotação
          </button>
        </div>
      </div>
    </div>
  );
}

function BotaoAcao({
  cor,
  onClick,
  children,
}: {
  cor: 'success' | 'warning' | 'danger' | 'muted';
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2.5 py-0.5 text-[11.5px] font-semibold transition hover:opacity-80',
        cor === 'success' && 'border-success/60 text-success',
        cor === 'warning' && 'border-warning/60 text-warning',
        cor === 'danger' && 'border-danger/60 text-danger',
        cor === 'muted' && 'border-border-strong text-text-2',
      )}
    >
      {children}
    </button>
  );
}
