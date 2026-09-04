// Barra de funções no cabeçalho da conversa (como na referência):
// etiquetas da conversa, filtros (pastas), mensagens apagadas e fixar.
// Renderizada em um shadow root próprio inserido no <header> do #main;
// os menus suspensos abrem no overlay principal (via store.menuHeader).

import { useEffect, useState } from 'react';
import { FolderInput, History, NotebookPen, Pin, Tag } from 'lucide-react';
import { cn, ZOOM } from '@/lib/utils';
import * as db from '@/lib/db';
import { menuHeader, modalAnotacoes, type MenuHeader } from '@/lib/store';
import { alternarFixado, getContatoAtivo, observarConversa } from '@/lib/wa';
import { toast } from './toast';

const LARGURA_MENU = 320;

function abrir(tipo: NonNullable<MenuHeader>['tipo'], e: React.MouseEvent) {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = Math.min(r.left, window.innerWidth - LARGURA_MENU * ZOOM - 8);
  const atual = menuHeader.get();
  menuHeader.set(atual?.tipo === tipo ? null : { tipo, x, y: r.bottom + 6 });
}

export function HeaderBar() {
  const [fixando, setFixando] = useState(false);
  // Quantas pastas/etiquetas a conversa aberta tem — badge no ícone de pasta.
  const [qtde, setQtde] = useState(0);
  // Quantas anotações a conversa tem — badge no ícone de anotações.
  const [notas, setNotas] = useState(0);

  useEffect(() => {
    let chatId: string | null = null;
    const atualizar = async () => {
      if (!chatId) {
        setQtde(0);
        setNotas(0);
        return;
      }
      const [tags, anot] = await Promise.all([db.tagsDoContato(chatId), db.listarNotas(chatId)]);
      setQtde(tags.length);
      setNotas(anot.length);
    };
    getContatoAtivo().then((c) => {
      chatId = c?.chatId ?? null;
      atualizar();
    });
    const parar = observarConversa((c) => {
      chatId = c?.chatId ?? null;
      atualizar();
    });
    const onChange = (changes: Record<string, unknown>) => {
      if ('bc2_contact_tags' in changes || 'bc2_notes' in changes) atualizar();
    };
    chrome.storage.onChanged.addListener(onChange as any);
    return () => {
      parar();
      chrome.storage.onChanged.removeListener(onChange as any);
    };
  }, []);

  async function fixar() {
    if (fixando) return;
    setFixando(true);
    const novo = await alternarFixado();
    setFixando(false);
    if (novo === null) toast.error('Fixar precisa do módulo WPP (bolinha verde na barra do topo).');
    else toast.success(novo ? 'Conversa fixada.' : 'Conversa desafixada.');
  }

  return (
    <div className="flex items-center gap-0.5 pr-1">
      <Botao titulo="Pastas desta conversa" onClick={(e) => abrir('etiquetas', e)}>
        <span className="relative">
          <FolderInput size={18} />
          {qtde > 0 && (
            <span className="absolute -right-2.5 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9.5px] font-bold leading-none text-white">
              {qtde}
            </span>
          )}
        </span>
      </Botao>
      <Botao titulo="Filtrar conversas por pasta" onClick={(e) => abrir('filtros', e)}>
        <Tag size={18} />
      </Botao>
      <Botao titulo="Anotações desta conversa" onClick={() => modalAnotacoes.set(true)}>
        <span className="relative">
          <NotebookPen size={18} />
          {notas > 0 && (
            <span className="absolute -right-2.5 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[9.5px] font-bold leading-none text-white">
              {notas}
            </span>
          )}
        </span>
      </Botao>
      <Botao titulo="Mensagens apagadas desta conversa" onClick={(e) => abrir('apagadas', e)}>
        <History size={18} />
      </Botao>
      <Botao titulo="Fixar/desafixar conversa" onClick={fixar}>
        <Pin size={18} className={cn(fixando && 'animate-pulse')} />
      </Botao>
    </div>
  );
}

function Botao({
  titulo,
  onClick,
  children,
}: {
  titulo: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-md text-muted transition hover:bg-black/10 hover:text-text-2"
    >
      {children}
    </button>
  );
}
