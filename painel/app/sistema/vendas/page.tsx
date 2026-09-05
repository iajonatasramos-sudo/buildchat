'use client';

// Vendas: receita recorrente, o que entrou no mês e as faturas em aberto.

import { useCallback, useEffect, useState } from 'react';
import { formatarDia, moeda, supabase } from '@/lib/supabase';
import { Botao, Cabecalho, Cartao, Modal, Vazio } from '@/componentes/ui';

type Vendas = {
  mrr_centavos: number;
  clientes_pagantes: number;
  ticket_medio_centavos: number;
  recebido_mes_centavos: number;
  aberto_centavos: number;
  vencidas: number;
  vencidas_centavos: number;
  novas_no_mes: number;
  trials_vencendo: number;
};
type Fatura = {
  id: string;
  empresa_id: string;
  empresa: string;
  competencia: string;
  valor_centavos: number;
  vencimento: string;
  pago_em: string | null;
  forma: string | null;
  observacao: string | null;
};
type EmpresaOpt = { id: string; nome: string; valor_mensal_centavos: number };

export default function Vendas() {
  const [v, setV] = useState<Vendas | null>(null);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpt[]>([]);
  const [filtro, setFiltro] = useState<'todas' | 'abertas' | 'pagas'>('abertas');
  const [lancando, setLancando] = useState(false);

  const carregar = useCallback(async () => {
    const [rv, rf, re] = await Promise.all([
      supabase.rpc('sistema_vendas'),
      supabase.rpc('sistema_faturas', { p_empresa: null }),
      supabase.rpc('sistema_empresas'),
    ]);
    setV(rv.data as Vendas);
    setFaturas((rf.data as Fatura[]) ?? []);
    setEmpresas((re.data as EmpresaOpt[]) ?? []);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!v) return null;

  const lista = faturas.filter((f) =>
    filtro === 'todas' ? true : filtro === 'abertas' ? !f.pago_em : !!f.pago_em,
  );

  async function baixar(f: Fatura, forma: string) {
    await supabase.rpc('sistema_baixar_fatura', { p_fatura: f.id, p_forma: forma, p_pago_em: new Date().toISOString() });
    carregar();
  }

  async function apagar(f: Fatura) {
    if (!confirm(`Apagar a fatura de ${f.empresa} (${moeda(f.valor_centavos)})?`)) return;
    await supabase.rpc('sistema_apagar_fatura', { p_fatura: f.id });
    carregar();
  }

  return (
    <div>
      <Cabecalho
        titulo="Vendas"
        subtitulo="Receita recorrente, recebimentos e cobranças em aberto."
        acao={<Botao onClick={() => setLancando(true)}>Lançar fatura</Botao>}
      />

      <div className="mb-4 grid grid-cols-4 gap-3.5">
        <Metrica titulo="Receita recorrente (MRR)" valor={moeda(v.mrr_centavos)} detalhe={`${v.clientes_pagantes} cliente(s) pagante(s)`} destaque />
        <Metrica titulo="Recebido neste mês" valor={moeda(v.recebido_mes_centavos)} detalhe="faturas quitadas" />
        <Metrica titulo="Em aberto" valor={moeda(v.aberto_centavos)} detalhe="ainda não pagas" />
        <Metrica
          titulo="Vencidas"
          valor={moeda(v.vencidas_centavos)}
          detalhe={`${v.vencidas} fatura(s) atrasada(s)`}
          alerta={v.vencidas > 0}
        />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3.5">
        <Metrica titulo="Ticket médio" valor={moeda(v.ticket_medio_centavos)} detalhe="por clínica ativa" />
        <Metrica titulo="Novas clínicas no mês" valor={String(v.novas_no_mes)} detalhe="cadastros recentes" />
        <Metrica
          titulo="Testes vencendo"
          valor={String(v.trials_vencendo)}
          detalhe="acabam nos próximos 7 dias"
          alerta={v.trials_vencendo > 0}
        />
      </div>

      <div className="mb-3.5 flex items-center gap-2">
        {(['abertas', 'pagas', 'todas'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`rounded-chip border px-3 py-1.5 text-[13px] font-medium capitalize transition ${
              filtro === f ? 'border-transparent bg-marca text-white' : 'border-borda bg-white text-tinta-3 hover:border-marca'
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-[13px] text-tinta-3">{lista.length} fatura(s)</span>
      </div>

      {lista.length === 0 ? (
        <Vazio
          titulo="Nenhuma fatura por aqui"
          texto="Lance a cobrança de uma clínica para começar a acompanhar os recebimentos."
          acao={<Botao onClick={() => setLancando(true)}>Lançar fatura</Botao>}
        />
      ) : (
        <Cartao className="overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-fundo text-left">
                {['CLÍNICA', 'COMPETÊNCIA', 'VALOR', 'VENCIMENTO', 'SITUAÇÃO', ''].map((h) => (
                  <th key={h} className="rotulo border-b border-borda px-[18px] py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((f) => {
                const atrasada = !f.pago_em && new Date(f.vencimento) < new Date(new Date().toDateString());
                return (
                  <tr key={f.id}>
                    <td className="border-b border-linha px-[18px] py-3.5 font-medium">{f.empresa}</td>
                    <td className="border-b border-linha px-[18px] py-3.5 text-tinta-3">
                      {f.competencia.slice(5, 7)}/{f.competencia.slice(0, 4)}
                      {f.observacao && <div className="text-[12px] text-tinta-4">{f.observacao}</div>}
                    </td>
                    <td className="border-b border-linha px-[18px] py-3.5 font-medium">{moeda(f.valor_centavos)}</td>
                    <td className={`border-b border-linha px-[18px] py-3.5 ${atrasada ? 'font-medium text-perigo' : 'text-tinta-3'}`}>
                      {formatarDia(f.vencimento)}
                    </td>
                    <td className="border-b border-linha px-[18px] py-3.5">
                      {f.pago_em ? (
                        <span className="rounded-chip bg-sucesso-fundo px-2 py-[3px] text-[12px] font-medium text-sucesso">
                          Paga{f.forma ? ` · ${f.forma}` : ''}
                        </span>
                      ) : atrasada ? (
                        <span className="rounded-chip bg-perigo-fundo px-2 py-[3px] text-[12px] font-medium text-perigo">
                          Vencida
                        </span>
                      ) : (
                        <span className="rounded-chip bg-alerta-fundo px-2 py-[3px] text-[12px] font-medium text-alerta">
                          Em aberto
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-right">
                      {!f.pago_em && (
                        <select
                          defaultValue=""
                          onChange={(e) => e.target.value && baixar(f, e.target.value)}
                          className="mr-2 rounded-controle border border-borda bg-white px-2 py-1 text-[12.5px] text-marca outline-none"
                        >
                          <option value="">Dar baixa…</option>
                          <option value="pix">Pix</option>
                          <option value="boleto">Boleto</option>
                          <option value="cartao">Cartão</option>
                          <option value="transferencia">Transferência</option>
                        </select>
                      )}
                      <button onClick={() => apagar(f)} className="text-[12.5px] font-medium text-tinta-4 hover:text-perigo">
                        Apagar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Cartao>
      )}

      {lancando && (
        <LancarFaturaModal
          empresas={empresas}
          onFechar={() => setLancando(false)}
          onPronto={() => {
            setLancando(false);
            carregar();
          }}
        />
      )}
    </div>
  );
}

function Metrica({
  titulo,
  valor,
  detalhe,
  destaque,
  alerta,
}: {
  titulo: string;
  valor: string;
  detalhe: string;
  destaque?: boolean;
  alerta?: boolean;
}) {
  return (
    <Cartao className="px-[18px] py-4">
      <div className="rotulo mb-2">{titulo}</div>
      <div className={`text-[24px] font-extrabold leading-none ${alerta ? 'text-perigo' : destaque ? 'text-marca' : ''}`}>
        {valor}
      </div>
      <div className="mt-1.5 text-[12.5px] text-tinta-4">{detalhe}</div>
    </Cartao>
  );
}

function LancarFaturaModal({
  empresas,
  onFechar,
  onPronto,
}: {
  empresas: EmpresaOpt[];
  onFechar: () => void;
  onPronto: () => void;
}) {
  const hoje = new Date();
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? '');
  const [valor, setValor] = useState('');
  const [competencia, setCompetencia] = useState(hoje.toISOString().slice(0, 7));
  const [vencimento, setVencimento] = useState(
    new Date(hoje.getTime() + 5 * 86400000).toISOString().slice(0, 10),
  );
  const [observacao, setObservacao] = useState('Mensalidade');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Sugere o valor combinado com a clínica ao trocar de empresa.
  useEffect(() => {
    const e = empresas.find((x) => x.id === empresaId);
    if (e && e.valor_mensal_centavos > 0) setValor((e.valor_mensal_centavos / 100).toFixed(2).replace('.', ','));
  }, [empresaId, empresas]);

  async function lancar() {
    const centavos = Math.round(Number(valor.replace(/\./g, '').replace(',', '.')) * 100);
    if (!empresaId || !centavos) {
      setErro('Escolha a clínica e informe o valor.');
      return;
    }
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc('sistema_lancar_fatura', {
      p_empresa: empresaId,
      p_competencia: `${competencia}-01`,
      p_valor_centavos: centavos,
      p_vencimento: vencimento,
      p_observacao: observacao.trim() || null,
    });
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    onPronto();
  }

  return (
    <Modal titulo="Lançar fatura" onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 font-medium">
          Clínica
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            className="campo focus:campo-foco font-normal"
          >
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 font-medium">
            Valor (R$)
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="297,00"
              className="campo focus:campo-foco font-normal"
            />
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            Competência
            <input
              type="month"
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="campo focus:campo-foco font-normal"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 font-medium">
            Vencimento
            <input
              type="date"
              value={vencimento}
              onChange={(e) => setVencimento(e.target.value)}
              className="campo focus:campo-foco font-normal"
            />
          </label>
          <label className="flex flex-col gap-1.5 font-medium">
            Observação
            <input
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              className="campo focus:campo-foco font-normal"
            />
          </label>
        </div>

        {erro && (
          <p className="rounded-controle border border-perigo-borda bg-perigo-fundo px-3 py-2 text-[12.5px] text-perigo">
            {erro}
          </p>
        )}

        <div className="flex justify-end gap-2.5">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao onClick={lancar} desabilitado={salvando}>
            Lançar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}
