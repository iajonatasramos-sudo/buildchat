'use client';

// Todas as clínicas: situação da assinatura, uso e as ações comerciais.

import { useCallback, useEffect, useState } from 'react';
import { formatarData, supabase } from '@/lib/supabase';
import { Botao, Cabecalho, Cartao, Modal, Vazio } from '@/componentes/ui';

type Empresa = {
  id: string;
  nome: string;
  plano: string;
  status: 'trial' | 'ativa' | 'inadimplente' | 'cancelada';
  trial_ate: string | null;
  assentos: number;
  usuarios_ativos: number;
  admin_email: string | null;
  mensagens: number;
  pastas: number;
  contatos: number;
  ultimo_acesso: string | null;
  criado_em: string;
};

const CORES: Record<Empresa['status'], string> = {
  ativa: 'bg-sucesso-fundo text-sucesso',
  trial: 'bg-marca-suave text-marca-hover',
  inadimplente: 'bg-alerta-fundo text-alerta',
  cancelada: 'bg-linha text-tinta-3',
};
const ROTULOS: Record<Empresa['status'], string> = {
  ativa: 'Ativa',
  trial: 'Teste',
  inadimplente: 'Inadimplente',
  cancelada: 'Cancelada',
};

export default function EmpresasSistema() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [editando, setEditando] = useState<Empresa | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc('sistema_empresas');
    setEmpresas((data as Empresa[]) ?? []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const lista = empresas.filter((e) => {
    const q = busca.trim().toLowerCase();
    return !q || e.nome.toLowerCase().includes(q) || (e.admin_email ?? '').toLowerCase().includes(q);
  });

  return (
    <div>
      <Cabecalho titulo="Empresas" subtitulo={`${empresas.length} clínica(s) usando o BuildChat.`} />

      {empresas.length === 0 ? (
        <Vazio titulo="Nenhuma clínica ainda" texto="As empresas aparecem aqui assim que alguém cria a conta." />
      ) : (
        <>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail do administrador"
            className="mb-3.5 h-10 w-full max-w-[420px] rounded-controle border border-borda bg-white px-3.5 text-[13.5px] outline-none focus:border-marca"
          />

          <Cartao className="overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-fundo text-left">
                  {['CLÍNICA', 'SITUAÇÃO', 'ASSENTOS', 'ACERVO', 'ÚLTIMO USO', 'DESDE', ''].map((h) => (
                    <th key={h} className="rotulo border-b border-borda px-[18px] py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => {
                  const dias = e.trial_ate
                    ? Math.ceil((new Date(e.trial_ate).getTime() - Date.now()) / 86400000)
                    : null;
                  return (
                    <tr key={e.id}>
                      <td className="border-b border-linha px-[18px] py-3.5">
                        <div className="font-medium">{e.nome}</div>
                        <div className="text-[12px] text-tinta-4">{e.admin_email ?? 'sem admin'}</div>
                      </td>
                      <td className="border-b border-linha px-[18px] py-3.5">
                        <span className={`rounded-chip px-2 py-[3px] text-[12px] font-medium ${CORES[e.status]}`}>
                          {ROTULOS[e.status]}
                        </span>
                        {e.status === 'trial' && dias !== null && (
                          <div className="mt-1 text-[12px] text-tinta-4">
                            {dias > 0 ? `${dias} dia(s)` : 'expirado'}
                          </div>
                        )}
                        <div className="mt-0.5 text-[12px] text-tinta-4">{e.plano}</div>
                      </td>
                      <td className="border-b border-linha px-[18px] py-3.5">
                        <span className="font-medium">{e.usuarios_ativos}</span>
                        <span className="text-tinta-4"> / {e.assentos}</span>
                      </td>
                      <td className="border-b border-linha px-[18px] py-3.5 text-[12.5px] text-tinta-3">
                        {e.mensagens} msg · {e.pastas} pastas · {e.contatos} contatos
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-tinta-3">
                        {e.ultimo_acesso ? formatarData(e.ultimo_acesso) : <span className="text-tinta-4">nunca</span>}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-tinta-3">
                        {formatarData(e.criado_em)}
                      </td>
                      <td className="border-b border-linha px-[18px] py-3.5 text-right">
                        <button onClick={() => setEditando(e)} className="font-medium text-marca">
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Cartao>
        </>
      )}

      {editando && (
        <GerenciarModal
          empresa={editando}
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

function GerenciarModal({
  empresa,
  onFechar,
  onPronto,
}: {
  empresa: Empresa;
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [status, setStatus] = useState(empresa.status);
  const [plano, setPlano] = useState(empresa.plano);
  const [assentos, setAssentos] = useState(String(empresa.assentos));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const menosQueUsados = Number(assentos) < empresa.usuarios_ativos;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc('sistema_atualizar_empresa', {
      p_empresa: empresa.id,
      p_status: status,
      p_plano: plano.trim() || null,
      p_assentos: Number(assentos) || null,
      p_trial_ate: null,
    });
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    onPronto();
  }

  return (
    <Modal titulo={empresa.nome} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 font-medium">
          Situação da assinatura
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Empresa['status'])}
            className="campo focus:campo-foco font-normal"
          >
            <option value="trial">Teste grátis</option>
            <option value="ativa">Ativa (pagante)</option>
            <option value="inadimplente">Inadimplente</option>
            <option value="cancelada">Cancelada</option>
          </select>
        </label>

        <label className="flex flex-col gap-1.5 font-medium">
          Plano
          <input
            value={plano}
            onChange={(e) => setPlano(e.target.value)}
            placeholder="Ex.: profissional"
            className="campo focus:campo-foco font-normal"
          />
        </label>

        <label className="flex flex-col gap-1.5 font-medium">
          Assentos contratados
          <input
            type="number"
            min={1}
            value={assentos}
            onChange={(e) => setAssentos(e.target.value)}
            className="campo focus:campo-foco font-normal"
          />
          <span className="text-[12.5px] font-normal text-tinta-4">
            {empresa.usuarios_ativos} usuário(s) ativo(s) hoje.
          </span>
        </label>

        {menosQueUsados && (
          <p className="rounded-controle border border-alerta-borda bg-alerta-fundo px-3 py-2 text-[12.5px] leading-relaxed text-alerta">
            A clínica tem mais usuários ativos do que assentos. Ninguém é desativado automaticamente —
            só não conseguirão cadastrar novas pessoas.
          </p>
        )}

        {erro && (
          <p className="rounded-controle border border-perigo-borda bg-perigo-fundo px-3 py-2 text-[12.5px] text-perigo">
            {erro}
          </p>
        )}

        <div className="flex justify-end gap-2.5">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao onClick={salvar} desabilitado={salvando}>
            Salvar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
