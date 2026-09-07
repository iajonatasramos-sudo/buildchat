// Modal "Minhas pastas": criar e apagar pastas direto na extensão, sem passar
// pelo painel. A pasta criada aqui é pessoal (só quem criou vê) e sobe pelo
// sync. Apagar: a pessoal é do dono; a padrão da clínica só o admin apaga —
// para o usuário comum ela aparece sem o ✕ (e a RLS recusaria de todo jeito).

import { useEffect, useState } from 'react';
import { Folder, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import * as db from '@/lib/db';
import { modalPastas, perfilAtual } from '@/lib/store';
import { CORES_CATEGORIA, type TagOpt } from '@/lib/types';
import { toast } from './toast';

export function PastasModal() {
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [perfil, setPerfil] = useState(perfilAtual.get());
  useEffect(() => perfilAtual.subscribe(setPerfil), []);

  const fechar = () => modalPastas.set(false);

  const carregar = async () => {
    const [t, mapa] = await Promise.all([db.listarTags(), db.mapaTagsContatos()]);
    setTags([...t].sort((a, b) => Number(!!b.padrao) - Number(!!a.padrao) || a.nome.localeCompare(b.nome, 'pt-BR')));
    const cont: Record<string, number> = {};
    for (const ids of Object.values(mapa)) for (const id of ids) cont[id] = (cont[id] ?? 0) + 1;
    setContagem(cont);
  };

  useEffect(() => {
    carregar();
    const onChange = (changes: Record<string, unknown>) => {
      if ('bc2_tags' in changes || 'bc2_contact_tags' in changes) carregar();
    };
    chrome.storage.onChanged.addListener(onChange as any);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        fechar();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      chrome.storage.onChanged.removeListener(onChange as any);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  // Cor sugerida: a próxima da paleta, para as pastas não nascerem iguais.
  const corSugerida = CORES_CATEGORIA[tags.length % CORES_CATEGORIA.length];
  const corEscolhida = cor ?? corSugerida;
  const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const repetida = tags.some((t) => semAcento(t.nome) === semAcento(nome.trim()));

  async function criar() {
    const limpo = nome.trim();
    if (!limpo || repetida || salvando) return;
    setSalvando(true);
    try {
      await db.criarTag(limpo, corEscolhida);
      setNome('');
      setCor(null);
      toast.success(`Pasta "${limpo}" criada.`);
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(t: TagOpt) {
    const aviso = t.padrao
      ? `Apagar a pasta padrão "${t.nome}" para toda a clínica? As conversas continuam, só perdem a etiqueta.`
      : `Apagar a pasta "${t.nome}"? As conversas continuam, só perdem a etiqueta.`;
    if (!window.confirm(aviso)) return;
    await db.removerTag(t.id);
    toast.success('Pasta apagada.');
  }

  const admin = perfil?.papel === 'admin';

  return (
    <div className="pointer-events-auto fixed inset-0 z-[66] flex items-center justify-center bg-text/40 p-4" onClick={fechar}>
      <div
        className="bc-anim-pop flex max-h-[75vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h3 className="inline-flex items-center gap-2 text-[15px] font-bold">
            <Folder size={16} className="text-brand" /> Minhas pastas
          </h3>
          <button type="button" onClick={fechar} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2">
            <X size={16} />
          </button>
        </div>

        {/* Criar */}
        <div className="flex-shrink-0 border-b border-border bg-surface-2 px-4 py-3">
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && criar()}
              placeholder="Nome da nova pasta…"
              className="h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2.5 text-[12.5px] outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={criar}
              disabled={!nome.trim() || repetida || salvando}
              className="rounded-md bg-brand px-3 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Criar
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {CORES_CATEGORIA.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCor(c)}
                title="Cor da pasta"
                className={cn('h-5 w-5 rounded-full transition', corEscolhida === c ? 'ring-2 ring-offset-1 ring-brand' : 'opacity-80 hover:opacity-100')}
                style={{ background: c }}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted">
            {repetida && nome.trim()
              ? 'Já existe uma pasta com esse nome.'
              : admin
                ? 'A pasta criada aqui é sua. As pastas padrão da clínica são criadas no painel.'
                : 'A pasta criada aqui só você vê. As pastas padrão vêm da clínica.'}
          </p>
        </div>

        {/* Lista */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {tags.length === 0 ? (
            <p className="py-6 text-center text-[12px] text-muted">Nenhuma pasta ainda.</p>
          ) : (
            tags.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2">
                <span className="h-3 w-3 flex-shrink-0 rounded-full" style={{ background: t.cor }} />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">{t.nome}</span>
                {t.padrao && (
                  <span className="rounded-md border border-border-strong px-1.5 text-[9.5px] font-bold uppercase text-muted" title="Pasta padrão da clínica">
                    padrão
                  </span>
                )}
                {contagem[t.id] ? (
                  <span className="rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: t.cor }}>
                    {contagem[t.id]}
                  </span>
                ) : null}
                {db.podeApagarTag(t) ? (
                  <button
                    type="button"
                    onClick={() => apagar(t)}
                    title={t.padrao ? 'Apagar pasta padrão (você é admin)' : 'Apagar esta pasta'}
                    className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-muted transition hover:bg-red-bg hover:text-danger"
                  >
                    <Trash2 size={13} />
                  </button>
                ) : (
                  <span className="w-6 flex-shrink-0" title="Pasta padrão: só o admin apaga, pelo painel" />
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
