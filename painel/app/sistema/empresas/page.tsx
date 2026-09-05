'use client';

// Todas as clínicas: situação da assinatura, uso e as ações comerciais.

import { useCallback, useEffect, useState } from 'react';
import { formatarData, formatarDia, moeda, supabase } from '@/lib/supabase';
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
  valor_mensal_centavos: number;
  ciclo: 'mensal' | 'anual';
  proxima_cobranca: string | null;
  observacao: string | null;
  faturas_abertas: number;
  aberto_centavos: number;
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
                  {['CLÍNICA', 'SITUAÇÃO', 'ASSENTOS', 'MENSALIDADE', 'COBRANÇA', 'ÚLTIMO USO', ''].map((h) => (
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
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5">
                        {e.valor_mensal_centavos > 0 ? (
                          <>
                            <span className="font-medium">{moeda(e.valor_mensal_centavos)}</span>
                            <div className="text-[12px] text-tinta-4">{e.ciclo}</div>
                          </>
                        ) : (
                          <span className="text-tinta-4">sem valor</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-tinta-3">
                        {formatarDia(e.proxima_cobranca)}
                        {e.faturas_abertas > 0 && (
                          <div className="text-[12px] font-medium text-alerta">
                            {moeda(e.aberto_centavos)} em aberto
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-tinta-3">
                        {e.ultimo_acesso ? formatarData(e.ultimo_acesso) : <span className="text-tinta-4">nunca</span>}
                        <div className="text-[12px] text-tinta-4">
                          {e.mensagens} msg · {e.contatos} contatos
                        </div>
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
  const [valor, setValor] = useState(
    empresa.valor_mensal_centavos ? (empresa.valor_mensal_centavos / 100).toFixed(2).replace('.', ',') : '',
  );
  const [ciclo, setCiclo] = useState(empresa.ciclo);
  const [proxima, setProxima] = useState(empresa.proxima_cobranca ?? '');
  const [observacao, setObservacao] = useState(empresa.observacao ?? '');
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
    const centavos = valor.trim()
      ? Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100)
      : null;
    const { error: erroComercial } = await supabase.rpc('sistema_definir_comercial', {
      p_empresa: empresa.id,
      p_valor_centavos: centavos,
      p_ciclo: ciclo,
      p_proxima: proxima || null,
      p_observacao: observacao.trim() || null,
    });
    setSalvando(false);
    if (error || erroComercial) {
      setErro((error ?? erroComercial)!.message);
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

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 font-medium">
            Mensalidade (R$)
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="297,00"
              className="campo focus:campo-foco font-normal"
            />
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            Ciclo
            <select
              value={ciclo}
              onChange={(e) => setCiclo(e.target.value as 'mensal' | 'anual')}
              className="campo focus:campo-foco font-normal"
            >
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1.5 font-medium">
          Próxima cobrança
          <input
            type="date"
            value={proxima}
            onChange={(e) => setProxima(e.target.value)}
            className="campo focus:campo-foco font-normal"
          />
        </label>

        <label className="flex flex-col gap-1.5 font-medium">
          Observação comercial
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="Ex.: fechado com 10% de desconto, indicação da Dra. Kelly"
            className="campo focus:campo-foco resize-none font-normal"
          />
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
