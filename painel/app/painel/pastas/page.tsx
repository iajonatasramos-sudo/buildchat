'use client';

// Pastas (etiquetas). Mesma regra das mensagens rápidas:
//   * PADRÃO — do admin, pelo painel; ele escolhe para quem aparece.
//   * PESSOAL — de cada usuário (aqui ou na extensão); só ele vê e apaga.
// O admin não vê nem apaga as pessoais dos outros (a RLS nem as devolve).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { carregarPerfil, supabase, type Perfil } from '@/lib/supabase';
import { Botao, Cabecalho, CampoTexto, Cartao, Modal, Vazio } from '@/componentes/ui';

const CORES = ['#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#f59e0b', '#ef4444', '#14b8a6', '#6366f1'];

type Pasta = {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  escopo: 'empresa' | 'pessoal';
  owner_id: string | null;
  visivel_todos: boolean;
  visivel_equipes: string[];
  visivel_usuarios: string[];
};
type Equipe = { id: string; nome: string };
type Usuario = { id: string; nome: string };

export default function Pastas() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [pastas, setPastas] = useState<Pasta[]>([]);
  const [contagem, setContagem] = useState<Record<string, number>>({});
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [editando, setEditando] = useState<Pasta | 'nova' | null>(null);

  const carregar = useCallback(async () => {
    const [p, v, e, u] = await Promise.all([
      supabase
        .from('pastas')
        .select('id, nome, cor, ordem, escopo, owner_id, visivel_todos, visivel_equipes, visivel_usuarios')
        .is('deleted_at', null)
        .order('ordem'),
      supabase.from('pasta_conversas').select('pasta_id').is('deleted_at', null),
      supabase.from('equipes').select('id, nome').is('deleted_at', null).order('nome'),
      supabase.from('usuarios').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setPastas((p.data as Pasta[]) ?? []);
    setEquipes((e.data as Equipe[]) ?? []);
    setUsuarios((u.data as Usuario[]) ?? []);
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

  const padrao = useMemo(() => pastas.filter((p) => p.escopo === 'empresa'), [pastas]);
  const minhas = useMemo(() => pastas.filter((p) => p.escopo === 'pessoal' && p.owner_id === perfil?.id), [pastas, perfil]);

  if (!perfil) return null;
  const ehAdmin = perfil.papel === 'admin';

  async function mover(lista: Pasta[], p: Pasta, direcao: -1 | 1) {
    const i = lista.findIndex((x) => x.id === p.id);
    const j = i + direcao;
    if (j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    await Promise.all(nova.map((x, k) => supabase.from('pastas').update({ ordem: k }).eq('id', x.id)));
    carregar();
  }

  const nomeEquipe = (id: string) => equipes.find((e) => e.id === id)?.nome ?? 'departamento';
  const nomeUsuario = (id: string) => usuarios.find((u) => u.id === id)?.nome ?? 'pessoa';
  function paraQuem(p: Pasta): string {
    if (p.escopo === 'pessoal') return 'só você';
    if (p.visivel_todos) return 'todos';
    const partes = [...p.visivel_equipes.map(nomeEquipe), ...p.visivel_usuarios.map(nomeUsuario)];
    return partes.length ? partes.join(', ') : 'ninguém ainda';
  }

  const Lista = ({ itens, titulo, podeEditar }: { itens: Pasta[]; titulo: string; podeEditar: boolean }) => (
    <Cartao className="max-w-[820px] overflow-hidden">
      <div className="rotulo border-b border-borda bg-fundo px-[18px] py-3">{titulo}</div>
      {itens.length === 0 ? (
        <div className="px-[18px] py-4 text-tinta-4">Nenhuma.</div>
      ) : (
        itens.map((p, i) => (
          <div
            key={p.id}
            className={`flex items-center gap-3.5 px-[18px] py-3 ${i < itens.length - 1 ? 'border-b border-linha' : ''}`}
          >
            {podeEditar && (
              <span className="flex flex-col leading-none text-tinta-4">
                <button onClick={() => mover(itens, p, -1)} className="hover:text-marca" title="Subir">▴</button>
                <button onClick={() => mover(itens, p, 1)} className="hover:text-marca" title="Descer">▾</button>
              </span>
            )}
            <span className="w-4 text-[13px] text-tinta-4">{i + 1}</span>
            <span className="rounded-chip px-2.5 py-[3px] text-[12px] font-medium text-white" style={{ background: p.cor }}>
              {p.nome}
            </span>
            <span className="truncate text-[12.5px] text-tinta-4">aparece para: {paraQuem(p)}</span>
            <span className="ml-auto whitespace-nowrap text-tinta-3">
              {contagem[p.id] ?? 0} {contagem[p.id] === 1 ? 'conversa' : 'conversas'}
            </span>
            {podeEditar ? (
              <button onClick={() => setEditando(p)} className="w-[54px] text-right font-medium text-marca">Editar</button>
            ) : (
              <span className="w-[54px] text-right text-[12px] text-tinta-4">padrão</span>
            )}
          </div>
        ))
      )}
    </Cartao>
  );

  return (
    <div>
      <Cabecalho
        titulo={ehAdmin ? 'Pastas da empresa' : 'Minhas pastas'}
        subtitulo={
          ehAdmin
            ? 'As pastas padrão valem para quem você escolher. A ordem aqui é a ordem da extensão.'
            : 'Suas pastas só você vê. As padrão da clínica vêm do administrador.'
        }
        acao={<Botao onClick={() => setEditando('nova')}>{ehAdmin ? 'Nova pasta padrão' : 'Nova pasta'}</Botao>}
      />

      {pastas.length === 0 ? (
        <Vazio
          titulo="Nenhuma pasta ainda"
          texto={
            ehAdmin
              ? 'Crie as pastas da clínica — LEAD FACETA, CONSULTORIA AGENDADA — e escolha quem as recebe na extensão.'
              : 'Crie aqui ou direto na extensão; ela sincroniza sozinha e aparece só para você.'
          }
          acao={<Botao onClick={() => setEditando('nova')}>Criar primeira pasta</Botao>}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {ehAdmin ? (
            <>
              <Lista itens={padrao} titulo="PADRÃO DA EMPRESA" podeEditar />
              {minhas.length > 0 && <Lista itens={minhas} titulo="MINHAS (SÓ VOCÊ VÊ)" podeEditar />}
            </>
          ) : (
            <>
              <Lista itens={minhas} titulo="MINHAS" podeEditar />
              <Lista itens={padrao} titulo="PADRÃO DA CLÍNICA" podeEditar={false} />
            </>
          )}
        </div>
      )}

      {editando && (
        <PastaModal
          pasta={editando === 'nova' ? null : editando}
          perfil={perfil}
          equipes={equipes}
          usuarios={usuarios}
          ordem={(ehAdmin ? padrao : minhas).length}
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
  perfil,
  equipes,
  usuarios,
  ordem,
  onFechar,
  onPronto,
}: {
  pasta: Pasta | null;
  perfil: Perfil;
  equipes: Equipe[];
  usuarios: Usuario[];
  ordem: number;
  onFechar: () => void;
  onPronto: () => void;
}) {
  const ehAdmin = perfil.papel === 'admin';
  // Admin cria pasta padrão; atendente cria pessoal. Editando, o escopo é o da pasta.
  const padrao = pasta ? pasta.escopo === 'empresa' : ehAdmin;
  const [nome, setNome] = useState(pasta?.nome ?? '');
  const [cor, setCor] = useState(pasta?.cor ?? CORES[0]);
  const [todos, setTodos] = useState(pasta?.visivel_todos ?? true);
  const [vEquipes, setVEquipes] = useState<string[]>(pasta?.visivel_equipes ?? []);
  const [vUsuarios, setVUsuarios] = useState<string[]>(pasta?.visivel_usuarios ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const alternar = (lista: string[], id: string) => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const base = padrao
      ? { nome, cor, visivel_todos: todos, visivel_equipes: todos ? [] : vEquipes, visivel_usuarios: todos ? [] : vUsuarios }
      : { nome, cor };
    const { error } = pasta
      ? await supabase.from('pastas').update(base).eq('id', pasta.id)
      : await supabase.from('pastas').insert({
          ...base,
          empresa_id: perfil.empresa.id,
          ordem,
          escopo: padrao ? 'empresa' : 'pessoal',
          owner_id: padrao ? null : perfil.id,
        });
    setSalvando(false);
    if (error) return setErro(error.message);
    onPronto();
  }

  async function excluir() {
    if (!pasta || !confirm(`Excluir a pasta "${pasta.nome}"? As conversas continuam, só perdem a etiqueta.`)) return;
    setSalvando(true);
    const { error } = await supabase.from('pastas').update({ deleted_at: new Date().toISOString() }).eq('id', pasta.id);
    setSalvando(false);
    if (error) return setErro(error.message);
    onPronto();
  }

  return (
    <Modal titulo={pasta ? 'Editar pasta' : padrao ? 'Nova pasta padrão' : 'Nova pasta'} onFechar={onFechar}>
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

        {padrao ? (
          <div className="flex flex-col gap-2">
            <div className="font-medium">Aparece para</div>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
              Todos os usuários da clínica
            </label>
            {!todos && (
              <div className="grid gap-3 rounded-controle border border-borda bg-fundo p-3 sm:grid-cols-2">
                <div>
                  <div className="rotulo mb-1.5">EQUIPES</div>
                  {equipes.length === 0 && <div className="text-[12.5px] text-tinta-4">Nenhum departamento.</div>}
                  {equipes.map((e) => (
                    <label key={e.id} className="flex items-center gap-2 py-0.5 text-[13px]">
                      <input type="checkbox" checked={vEquipes.includes(e.id)} onChange={() => setVEquipes(alternar(vEquipes, e.id))} />
                      {e.nome}
                    </label>
                  ))}
                </div>
                <div>
                  <div className="rotulo mb-1.5">PESSOAS</div>
                  {usuarios.map((u) => (
                    <label key={u.id} className="flex items-center gap-2 py-0.5 text-[13px]">
                      <input type="checkbox" checked={vUsuarios.includes(u.id)} onChange={() => setVUsuarios(alternar(vUsuarios, u.id))} />
                      {u.nome}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {!todos && vEquipes.length + vUsuarios.length === 0 && (
              <p className="text-[12.5px] text-alerta">Ninguém marcado: a pasta fica invisível para o departamento até você escolher.</p>
            )}
          </div>
        ) : (
          <p className="text-[12.5px] text-tinta-4">Pasta pessoal: só você vê, aqui e na extensão.</p>
        )}

        {erro && <p className="text-[12.5px] text-perigo">{erro}</p>}

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
