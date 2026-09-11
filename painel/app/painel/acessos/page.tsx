'use client';

// Acessos: quem enxerga cada função da extensão.
//
// Mesma gramática das pastas e das mensagens (todos / equipes / pessoas). Sem
// linha para a função, ela vale para todo mundo — por isso a tela mostra
// "todos" por padrão e só grava quando o admin restringe.
//
// A extensão baixa esta tabela a cada sincronização e monta a barra lateral a
// partir dela.

import { useCallback, useEffect, useState } from 'react';
import { carregarPerfil, ehAdmin, supabase, type Perfil } from '@/lib/supabase';
import { Botao, Cabecalho, Cartao, Modal } from '@/componentes/ui';

/** O catálogo espelha `src/lib/acessos.ts` da extensão. */
const RECURSOS: { chave: string; nome: string; onde: string }[] = [
  { chave: 'contato', nome: 'Guia Contato', onde: 'dados, etiquetas, agenda e anotações do contato' },
  { chave: 'rapidas', nome: 'Mensagens rápidas', onde: 'barra lateral e ⚡ da caixa de mensagem' },
  { chave: 'automacoes', nome: 'Automações', onde: 'bots, campanhas e notificações' },
  { chave: 'agenda', nome: 'Agenda', onde: 'calendário na barra do topo' },
  { chave: 'webhooks', nome: 'WebHooks', onde: 'envio dos dados para outro sistema' },
  { chave: 'conta_whatsapp', nome: 'Conta de WhatsApp', onde: 'qual número está conectado' },
  { chave: 'meus_contatos', nome: 'Meus contatos no painel', onde: 'atalho da barra lateral para o painel' },
];

type Acesso = {
  recurso: string;
  visivel_todos: boolean;
  visivel_equipes: string[];
  visivel_usuarios: string[];
};
type Equipe = { id: string; nome: string };
type Usuario = { id: string; nome: string };

export default function Acessos() {
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [acessos, setAcessos] = useState<Acesso[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    const [a, e, u] = await Promise.all([
      supabase.from('recurso_acesso').select('recurso, visivel_todos, visivel_equipes, visivel_usuarios').is('deleted_at', null),
      supabase.from('equipes').select('id, nome').is('deleted_at', null).order('nome'),
      supabase.from('usuarios').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setAcessos((a.data as Acesso[]) ?? []);
    setEquipes((e.data as Equipe[]) ?? []);
    setUsuarios((u.data as Usuario[]) ?? []);
    setCarregando(false);
  }, []);

  useEffect(() => {
    carregarPerfil().then(setPerfil);
    carregar();
  }, [carregar]);

  const regraDe = (chave: string) => acessos.find((a) => a.recurso === chave);
  const nomeEquipe = (id: string) => equipes.find((e) => e.id === id)?.nome ?? 'equipe';
  const nomeUsuario = (id: string) => usuarios.find((u) => u.id === id)?.nome ?? 'pessoa';

  function paraQuem(chave: string): string {
    const r = regraDe(chave);
    if (!r || r.visivel_todos) return 'todos';
    const partes = [...r.visivel_equipes.map(nomeEquipe), ...r.visivel_usuarios.map(nomeUsuario)];
    return partes.length ? partes.join(', ') : 'ninguém';
  }

  if (carregando) return null;
  const admin = perfil && ehAdmin(perfil);

  return (
    <div>
      <Cabecalho
        titulo="Acessos"
        subtitulo="Quem enxerga cada função da extensão. Sem restrição, a função aparece para toda a equipe."
      />

      {erro && <div className="mb-4 rounded-controle bg-alerta-fundo px-4 py-3 text-alerta">{erro}</div>}
      {!admin && (
        <div className="mb-4 rounded-controle bg-fundo px-4 py-3 text-tinta-3">
          Só o administrador da clínica altera os acessos.
        </div>
      )}

      <Cartao className="max-w-[820px] overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-fundo text-left">
              {['FUNÇÃO', 'QUEM VÊ', ''].map((h) => (
                <th key={h} className="rotulo border-b border-borda px-[18px] py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RECURSOS.map((r) => (
              <tr key={r.chave}>
                <td className="border-b border-linha px-[18px] py-3.5">
                  <div className="font-medium">{r.nome}</div>
                  <div className="text-[12.5px] text-tinta-4">{r.onde}</div>
                </td>
                <td className="border-b border-linha px-[18px] py-3.5">
                  <span
                    className={`rounded-chip px-2.5 py-[3px] text-[12.5px] font-medium ${
                      paraQuem(r.chave) === 'todos' ? 'bg-fundo text-tinta-2' : 'bg-marca-suave text-marca-hover'
                    }`}
                  >
                    {paraQuem(r.chave)}
                  </span>
                </td>
                <td className="border-b border-linha px-[18px] py-3.5 text-right">
                  {admin && (
                    <button onClick={() => setEditando(r.chave)} className="text-[13px] font-medium text-marca hover:underline">
                      alterar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Cartao>

      {editando && perfil && (
        <EditorAcesso
          recurso={RECURSOS.find((r) => r.chave === editando)!}
          atual={regraDe(editando)}
          equipes={equipes}
          usuarios={usuarios}
          empresaId={perfil.empresa.id}
          onFechar={() => setEditando(null)}
          onErro={setErro}
          onSalvo={() => {
            setEditando(null);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function EditorAcesso({
  recurso, atual, equipes, usuarios, empresaId, onFechar, onSalvo, onErro,
}: {
  recurso: { chave: string; nome: string };
  atual?: Acesso;
  equipes: Equipe[];
  usuarios: Usuario[];
  empresaId: string;
  onFechar: () => void;
  onSalvo: () => void;
  onErro: (e: string | null) => void;
}) {
  const [todos, setTodos] = useState(atual?.visivel_todos ?? true);
  const [eqs, setEqs] = useState<string[]>(atual?.visivel_equipes ?? []);
  const [us, setUs] = useState<string[]>(atual?.visivel_usuarios ?? []);
  const [salvando, setSalvando] = useState(false);

  const alternar = (lista: string[], set: (v: string[]) => void, id: string) =>
    set(lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  async function salvar() {
    setSalvando(true);
    onErro(null);
    const { error } = await supabase.from('recurso_acesso').upsert(
      {
        empresa_id: empresaId,
        recurso: recurso.chave,
        visivel_todos: todos,
        visivel_equipes: todos ? [] : eqs,
        visivel_usuarios: todos ? [] : us,
        deleted_at: null,
      },
      { onConflict: 'empresa_id,recurso' },
    );
    setSalvando(false);
    if (error) return onErro(error.message);
    onSalvo();
  }

  const Pilula = ({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={`rounded-chip border px-3 py-1 text-[12.5px] font-medium transition ${
        ativa ? 'border-marca bg-marca text-white' : 'border-borda bg-white text-tinta-3 hover:border-marca'
      }`}
    >
      {children}
    </button>
  );

  return (
    <Modal titulo={recurso.nome} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-tinta-3">Quem enxerga esta função na extensão.</p>

        <div className="flex flex-wrap gap-2">
          <Pilula ativa={todos} onClick={() => setTodos(true)}>Todos da clínica</Pilula>
          <Pilula ativa={!todos} onClick={() => setTodos(false)}>Só quem eu escolher</Pilula>
        </div>

        {!todos && (
          <>
            <div>
              <div className="rotulo mb-1.5">EQUIPES</div>
              <div className="flex flex-wrap gap-2">
                {equipes.length === 0 ? (
                  <span className="text-[13px] text-tinta-4">Nenhuma equipe criada ainda.</span>
                ) : (
                  equipes.map((e) => (
                    <Pilula key={e.id} ativa={eqs.includes(e.id)} onClick={() => alternar(eqs, setEqs, e.id)}>
                      {e.nome}
                    </Pilula>
                  ))
                )}
              </div>
            </div>
            <div>
              <div className="rotulo mb-1.5">PESSOAS</div>
              <div className="flex flex-wrap gap-2">
                {usuarios.map((u) => (
                  <Pilula key={u.id} ativa={us.includes(u.id)} onClick={() => alternar(us, setUs, u.id)}>
                    {u.nome}
                  </Pilula>
                ))}
              </div>
            </div>
            <p className="text-[12.5px] text-tinta-4">
              O administrador sempre enxerga tudo — é ele quem configura.
            </p>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Botao variante="secundario" onClick={onFechar}>Cancelar</Botao>
          <Botao onClick={salvar} desabilitado={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Botao>
        </div>
      </div>
    </Modal>
  );
}
