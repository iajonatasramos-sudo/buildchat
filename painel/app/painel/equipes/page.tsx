'use client';

// Equipes da clínica: agrupam usuários para restringir mensagens padrão
// ("visível só para a equipe de Vendas", por exemplo).

import { useCallback, useEffect, useState } from 'react';
import { carregarPerfil, supabase, type Perfil } from '@/lib/supabase';
import { Botao, Cabecalho, CampoTexto, Cartao, Modal, Vazio } from '@/componentes/ui';

type Equipe = { id: string; nome: string; cor: string };
type Usuario = { id: string; nome: string; email: string; ativo: boolean };
type Membro = { equipe_id: string; usuario_id: string };

const CORES = ['#6366f1', '#22c55e', '#ec4899', '#f59e0b', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6'];

export default function Equipes() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [membros, setMembros] = useState<Membro[]>([]);
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    const [eq, us, mb] = await Promise.all([
      supabase.from('equipes').select('id, nome, cor').is('deleted_at', null).order('nome'),
      supabase.from('usuarios').select('id, nome, email, ativo').order('nome'),
      supabase.from('equipe_usuarios').select('equipe_id, usuario_id'),
    ]);
    setEquipes((eq.data as Equipe[]) ?? []);
    setUsuarios((us.data as Usuario[]) ?? []);
    setMembros((mb.data as Membro[]) ?? []);
  }, []);

  useEffect(() => {
    carregarPerfil().then(setPerfil);
    carregar();
  }, [carregar]);

  if (!perfil) return null;
  const ehAdmin = perfil.papel === 'admin';

  async function alternarMembro(equipeId: string, usuarioId: string, dentro: boolean) {
    if (dentro) {
      await supabase.from('equipe_usuarios').delete().eq('equipe_id', equipeId).eq('usuario_id', usuarioId);
    } else {
      await supabase.from('equipe_usuarios').insert({ equipe_id: equipeId, usuario_id: usuarioId });
    }
    carregar();
  }

  async function apagar(id: string) {
    if (!confirm('Apagar esta equipe? As mensagens restritas a ela deixam de ser vistas por esses usuários.')) return;
    await supabase.from('equipes').update({ deleted_at: new Date().toISOString() }).eq('id', id);
    carregar();
  }

  return (
    <div>
      <Cabecalho
        titulo="Equipes"
        subtitulo="Agrupe usuários para publicar mensagens só para eles."
        acao={ehAdmin && <Botao onClick={() => setCriando(true)}>Nova equipe</Botao>}
      />

      {equipes.length === 0 ? (
        <Vazio
          titulo="Nenhuma equipe ainda"
          texto="Crie equipes como “Recepção” ou “Vendas” e depois restrinja as mensagens padrão a elas."
          acao={ehAdmin && <Botao onClick={() => setCriando(true)}>Criar a primeira</Botao>}
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          {equipes.map((e) => {
            const daEquipe = membros.filter((m) => m.equipe_id === e.id).map((m) => m.usuario_id);
            return (
              <Cartao key={e.id} className="px-[18px] py-4">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: e.cor }} />
                  <span className="text-[15px] font-extrabold">{e.nome}</span>
                  <span className="text-[13px] text-tinta-3">
                    {daEquipe.length} {daEquipe.length === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                  {ehAdmin && (
                    <button onClick={() => apagar(e.id)} className="ml-auto text-[13px] font-medium text-perigo">
                      Apagar
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {usuarios
                    .filter((u) => u.ativo)
                    .map((u) => {
                      const dentro = daEquipe.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          disabled={!ehAdmin}
                          onClick={() => alternarMembro(e.id, u.id, dentro)}
                          className={`rounded-chip border px-3 py-1.5 text-[13px] font-medium transition ${
                            dentro
                              ? 'border-transparent text-white'
                              : 'border-borda bg-white text-tinta-3 hover:border-marca hover:text-marca'
                          } ${ehAdmin ? '' : 'cursor-default'}`}
                          style={dentro ? { background: e.cor } : undefined}
                        >
                          {u.nome}
                        </button>
                      );
                    })}
                </div>
              </Cartao>
            );
          })}
        </div>
      )}

      {criando && (
        <NovaEquipeModal
          empresaId={perfil.empresa.id}
          onFechar={() => setCriando(false)}
          onPronto={() => {
            setCriando(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function NovaEquipeModal({
  empresaId,
  onFechar,
  onPronto,
}: {
  empresaId: string;
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState(CORES[0]);
  const [salvando, setSalvando] = useState(false);

  async function criar() {
    if (!nome.trim()) return;
    setSalvando(true);
    await supabase.from('equipes').insert({ empresa_id: empresaId, nome: nome.trim(), cor });
    setSalvando(false);
    onPronto();
  }

  return (
    <Modal titulo="Nova equipe" onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <CampoTexto rotulo="Nome" valor={nome} onChange={setNome} placeholder="Ex.: Recepção" />
        <div>
          <div className="rotulo mb-2">Cor</div>
          <div className="flex gap-2">
            {CORES.map((c) => (
              <button
                key={c}
                onClick={() => setCor(c)}
                className={`h-7 w-7 rounded-full transition ${cor === c ? 'ring-2 ring-tinta ring-offset-2' : ''}`}
                style={{ background: c }}
                aria-label={`Cor ${c}`}
              />
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2.5">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao onClick={criar} desabilitado={salvando || !nome.trim()}>
            Criar equipe
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
