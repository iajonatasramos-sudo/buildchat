'use client';

// Pastas da empresa: nome, cor, ordem e quantas conversas cada uma organiza.

import { useCallback, useEffect, useState } from 'react';
import { carregarPerfil, supabase, type Perfil } from '@/lib/supabase';
import { Botao, Cabecalho, CampoTexto, Cartao, Modal, Vazio } from '@/componentes/ui';

const CORES = ['#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f59e0b', '#ef4444', '#14b8a6', '#6366f1'];

type Pasta = { id: string; nome: string; cor: string; ordem: number };

export default function Pastas() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [editando, setEditando] = useState<Pasta | 'nova' | null>(null);

  const carregar = useCallback(async () => {
    const [p, v] = await Promise.all([
      supabase.from('pastas').select('id, nome, cor, ordem').is('deleted_at', null).order('ordem'),
      supabase.from('pasta_conversas').select('pasta_id').is('deleted_at', null),
    ]);
    setPastas((p.data as Pasta[]) ?? []);
    const cont: Record<string, number> = {};
    for (const linha of (v.data as { pasta_id: string }[]) ?? []) {
      cont[linha.pasta_id] = (cont[linha.pasta_id] ?? 0) + 1;
    }
    setContagem(cont);
  }, []);

  useEffect(() => {
    carregarPerfil().then(setPerfil);
    carregar();
  }, [carregar]);

  if (!perfil) return null;
  const ehAdmin = perfil.papel === 'admin';

  async function mover(p: Pasta, direcao: -1 | 1) {
    const i = pastas.findIndex((x) => x.id === p.id);
    const j = i + direcao;
    if (j < 0 || j >= pastas.length) return;
    const nova = [...pastas];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setPastas(nova);
    await Promise.all(nova.map((x, k) => supabase.from('pastas').update({ ordem: k }).eq('id', x.id)));
  }

  return (
    <div>
      <Cabecalho
        titulo="Pastas da empresa"
        subtitulo="A ordem aqui é a ordem que aparece na extensão."
        acao={ehAdmin && <Botao onClick={() => setEditando('nova')}>Nova pasta</Botao>}
      />

      {pastas.length === 0 ? (
        <Vazio
          titulo="Nenhuma pasta ainda"
          texto="Crie as pastas da clínica — LEAD FACETA, CONSULTORIA AGENDADA — e a equipe passa a organizar as conversas por elas na extensão."
          acao={ehAdmin && <Botao onClick={() => setEditando('nova')}>Criar primeira pasta</Botao>}
        />
      ) : (
        <Cartao className="max-w-[760px] overflow-hidden">
          {pastas.map((p, i) => (
            <div
              key={p.id}
              className={`flex items-center gap-3.5 px-[18px] py-3 ${i < pastas.length - 1 ? 'border-b border-linha' : ''}`}
            >
              {ehAdmin && (
                <span className="flex flex-col leading-none text-tinta-4">
                  <button onClick={() => mover(p, -1)} className="hover:text-marca" title="Subir">
                    ▴
                  </button>
                  <button onClick={() => mover(p, 1)} className="hover:text-marca" title="Descer">
                    ▾
                  </button>
                </span>
              )}
              <span className="w-4 text-[13px] text-tinta-4">{i + 1}</span>
              <span className="rounded-chip px-2.5 py-[3px] text-[12px] font-medium text-white" style={{ background: p.cor }}>
                {p.nome}
              </span>
              <span className="ml-auto text-tinta-3">
                {contagem[p.id] ?? 0} {contagem[p.id] === 1 ? 'conversa' : 'conversas'}
              </span>
              {ehAdmin && (
                <button onClick={() => setEditando(p)} className="w-[54px] text-right font-medium text-marca">
                  Editar
                </button>
              )}
            </div>
          ))}
        </Cartao>
      )}

      {editando && (
        <PastaModal
          pasta={editando === 'nova' ? null : editando}
          empresaId={perfil.empresa.id}
          ordem={pastas.length}
          onFechar={() => setEditando(null)}
          onPronto={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function PastaModal({
  pasta,
  empresaId,
  ordem,
  onFechar,
  onPronto,
}: {
  pasta: Pasta | null;
  empresaId: string;
  ordem: number;
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [nome, setNome] = useState(pasta?.nome ?? '');
  const [cor, setCor] = useState(pasta?.cor ?? CORES[0]);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    if (pasta) await supabase.from('pastas').update({ nome, cor }).eq('id', pasta.id);
    else await supabase.from('pastas').insert({ empresa_id: empresaId, nome, cor, ordem, escopo: 'empresa' });
    onPronto();
  }

  async function excluir() {
    if (!pasta) return;
    setSalvando(true);
    await supabase.from('pastas').update({ deleted_at: new Date().toISOString() }).eq('id', pasta.id);
    onPronto();
  }

  return (
    <Modal titulo={pasta ? 'Editar pasta' : 'Nova pasta'} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <CampoTexto rotulo="Nome" valor={nome} onChange={setNome} placeholder="LEAD FACETA" />
        <div className="flex flex-col gap-2 font-medium">
          Cor
          <div className="flex flex-wrap gap-2">
            {CORES.map((c) => (
              <button
                key={c}
                onClick={() => setCor(c)}
                className={`h-8 w-8 rounded-controle transition ${cor === c ? 'ring-2 ring-tinta ring-offset-2' : ''}`}
                style={{ background: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </div>
        <div className="rounded-controle border border-borda bg-fundo px-3 py-2.5">
          <span className="mr-2 text-[12.5px] text-tinta-4">Prévia:</span>
          <span className="rounded-chip px-2.5 py-[3px] text-[12px] font-medium text-white" style={{ background: cor }}>
            {nome || 'NOME DA PASTA'}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          {pasta && (
            <Botao variante="perigo" onClick={excluir} desabilitado={salvando}>
              Excluir
            </Botao>
          )}
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao onClick={salvar} desabilitado={salvando || nome.trim().length < 2}>
            Salvar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
