'use client';

// Integrações externas. Aqui ficam as APIs que o BuildChat consome — hoje a de
// propostas do BuildClinic; as próximas entram na mesma lista.

import { useCallback, useEffect, useState } from 'react';
import { formatarData, supabase } from '@/lib/supabase';
import { Botao, Cabecalho, CampoTexto, Cartao, Modal, Vazio } from '@/componentes/ui';

type Integracao = {
  id: string;
  empresa_id: string | null;
  empresa: string | null;
  chave: string;
  nome: string;
  url: string | null;
  token: string | null;
  ativo: boolean;
  observacao: string | null;
  atualizado_em: string;
};
type EmpresaOpt = { id: string; nome: string };

/** Integrações que o produto já sabe consumir. */
const CONHECIDAS = [
  {
    chave: 'propostas',
    nome: 'Propostas BuildClinic',
    url: 'https://app.buildclinic.com.br/api/propostas/gerar',
    descricao: 'Gera o PDF da proposta a partir da guia Contato da extensão.',
  },
  {
    chave: 'transcricao',
    nome: 'Transcrição de áudio',
    url: 'https://app.buildclinic.com.br/api/transcrever',
    descricao:
      'Botão "Transcrever" nos áudios do WhatsApp. Sem cadastro próprio, a extensão usa o token de Propostas — é o mesmo da API.',
  },
];

const mascarar = (t: string | null) => (t ? `${'•'.repeat(Math.min(24, t.length))}` : '—');

export default function Api() {
  const [itens, setItens] = useState<Integracao[]>([]);
  const [empresas, setEmpresas] = useState<EmpresaOpt[]>([]);
  const [editando, setEditando] = useState<Partial<Integracao> | null>(null);
  const [revelados, setRevelados] = useState<Set<string>>(new Set());
  const [copiado, setCopiado] = useState<string | null>(null);

  const alternarOlho = (id: string) =>
    setRevelados((r) => {
      const n = new Set(r);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const carregar = useCallback(async () => {
    const [ri, re] = await Promise.all([
      supabase.rpc('sistema_integracoes'),
      supabase.rpc('sistema_empresas'),
    ]);
    setItens((ri.data as Integracao[]) ?? []);
    setEmpresas(((re.data as EmpresaOpt[]) ?? []).map((e) => ({ id: e.id, nome: e.nome })));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function apagar(i: Integracao) {
    if (!confirm(`Apagar a integração "${i.nome}"${i.empresa ? ` de ${i.empresa}` : ' (global)'}?`)) return;
    await supabase.rpc('sistema_apagar_integracao', { p_id: i.id });
    carregar();
  }

  // A transcrição funciona com o token de Propostas, então só cobramos cadastro
  // próprio quando nem esse existe.
  const temPropostas = itens.some((i) => i.chave === 'propostas');
  const naoConfiguradas = CONHECIDAS.filter(
    (c) =>
      !itens.some((i) => i.chave === c.chave && !i.empresa_id) &&
      !(c.chave === 'transcricao' && temPropostas),
  );

  return (
    <div>
      <Cabecalho
        titulo="API"
        subtitulo="Integrações que a extensão consome. Sem empresa, a configuração vale para todas."
        acao={<Botao onClick={() => setEditando({ chave: '', nome: '', ativo: true })}>Nova integração</Botao>}
      />

      {naoConfiguradas.length > 0 && (
        <div className="mb-3.5 flex flex-col gap-2">
          {naoConfiguradas.map((c) => (
            <div
              key={c.chave}
              className="flex items-center gap-3 rounded-cartao border border-alerta-borda bg-alerta-fundo px-4 py-3.5"
            >
              <div className="min-w-0">
                <div className="font-extrabold text-alerta">{c.nome} ainda não configurada</div>
                <div className="text-[12.5px] leading-relaxed text-[#7A5A1E]">{c.descricao}</div>
              </div>
              <button
                onClick={() => setEditando({ chave: c.chave, nome: c.nome, url: c.url, ativo: true })}
                className="ml-auto whitespace-nowrap rounded-controle border border-alerta-borda bg-white px-3 py-1.5 text-[13px] font-medium text-alerta"
              >
                Configurar
              </button>
            </div>
          ))}
        </div>
      )}

      {itens.length === 0 ? (
        <Vazio
          titulo="Nenhuma integração configurada"
          texto="Configure a API de propostas para liberar o botão “Gerar proposta” na extensão."
        />
      ) : (
        <Cartao className="overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-fundo text-left">
                {['INTEGRAÇÃO', 'ESCOPO', 'ENDEREÇO', 'TOKEN', 'SITUAÇÃO', 'ATUALIZADA', ''].map((h) => (
                  <th key={h} className="rotulo border-b border-borda px-[18px] py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td className="border-b border-linha px-[18px] py-3.5">
                    <div className="font-medium">{i.nome}</div>
                    <div className="font-mono text-[12px] text-tinta-4">{i.chave}</div>
                  </td>
                  <td className="border-b border-linha px-[18px] py-3.5">
                    {i.empresa ? (
                      <span className="rounded-chip bg-marca-suave px-2 py-[3px] text-[12px] font-medium text-marca-hover">
                        {i.empresa}
                      </span>
                    ) : (
                      <span className="rounded-chip bg-linha px-2 py-[3px] text-[12px] font-medium text-tinta-2">
                        Todas as clínicas
                      </span>
                    )}
                  </td>
                  <td className="max-w-[260px] truncate border-b border-linha px-[18px] py-3.5 font-mono text-[12px] text-tinta-3">
                    {i.url ?? '—'}
                  </td>
                  <td className="border-b border-linha px-[18px] py-3.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-[12px] text-tinta-3 ${
                          revelados.has(i.id) ? 'max-w-[220px] break-all' : ''
                        }`}
                      >
                        {revelados.has(i.id) ? i.token || '—' : mascarar(i.token)}
                      </span>
                      {i.token && (
                        <>
                          <button
                            onClick={() => alternarOlho(i.id)}
                            title={revelados.has(i.id) ? 'Ocultar token' : 'Mostrar token'}
                            className="text-tinta-4 hover:text-marca"
                          >
                            {revelados.has(i.id) ? <IconeOlhoFechado /> : <IconeOlho />}
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(i.token!);
                              setCopiado(i.id);
                              setTimeout(() => setCopiado(null), 1500);
                            }}
                            title="Copiar token"
                            className="text-[12px] font-medium text-tinta-4 hover:text-marca"
                          >
                            {copiado === i.id ? 'copiado' : 'copiar'}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="border-b border-linha px-[18px] py-3.5">
                    <span className={`font-medium ${i.ativo ? 'text-sucesso' : 'text-tinta-4'}`}>
                      {i.ativo ? 'Ativa' : 'Desativada'}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-tinta-3">
                    {formatarData(i.atualizado_em)}
                  </td>
                  <td className="whitespace-nowrap border-b border-linha px-[18px] py-3.5 text-right">
                    <button onClick={() => setEditando(i)} className="mr-3 font-medium text-marca">
                      Editar
                    </button>
                    <button onClick={() => apagar(i)} className="text-[12.5px] font-medium text-tinta-4 hover:text-perigo">
                      Apagar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Cartao>
      )}

      <p className="mt-4 max-w-[680px] text-[12.5px] leading-relaxed text-tinta-4">
        O token chega ao navegador de quem usa o recurso — é assim que a extensão chama a API. Para
        clínicas de terceiros, prefira cadastrar um token por empresa em vez de usar o global.
        Trocar o endereço para outro domínio exige liberá-lo em <code className="font-mono">host_permissions</code>{' '}
        no manifesto da extensão (hoje só <code className="font-mono">app.buildclinic.com.br</code>).
      </p>

      {editando && (
        <IntegracaoModal
          inicial={editando}
          empresas={empresas}
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

function IntegracaoModal({
  inicial,
  empresas,
  onFechar,
  onPronto,
}: {
  inicial: Partial<Integracao>;
  empresas: EmpresaOpt[];
  onFechar: () => void;
  onPronto: () => void;
}) {
  const [chave, setChave] = useState(inicial.chave ?? '');
  const [nome, setNome] = useState(inicial.nome ?? '');
  const [url, setUrl] = useState(inicial.url ?? '');
  const [token, setToken] = useState(inicial.token ?? '');
  const [verToken, setVerToken] = useState(false);
  const [empresaId, setEmpresaId] = useState(inicial.empresa_id ?? '');
  const [ativo, setAtivo] = useState(inicial.ativo ?? true);
  const [observacao, setObservacao] = useState(inicial.observacao ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const editandoExistente = !!inicial.id;

  async function salvar() {
    setSalvando(true);
    setErro(null);
    const { error } = await supabase.rpc('sistema_salvar_integracao', {
      p_chave: chave.trim(),
      p_nome: nome.trim(),
      p_url: url.trim() || null,
      p_token: token.trim(), // vazio mantém o token atual
      p_empresa: empresaId || null,
      p_ativo: ativo,
      p_observacao: observacao.trim() || null,
      p_id: inicial.id ?? null, // com o id, mudar a clínica MOVE a integração
    });
    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    onPronto();
  }

  return (
    <Modal titulo={editandoExistente ? 'Editar integração' : 'Nova integração'} onFechar={onFechar}>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto rotulo="Nome" valor={nome} onChange={setNome} placeholder="Propostas BuildClinic" />
          <CampoTexto
            rotulo="Chave"
            valor={chave}
            onChange={setChave}
            placeholder="propostas"
            dica="Identificador usado pela extensão."
          />
        </div>

        <CampoTexto rotulo="Endereço (URL)" valor={url} onChange={setUrl} placeholder="https://…" />

        <label className="flex flex-col gap-1.5 font-medium">
          Token
          <span className="relative block">
            <input
              type={verToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={editandoExistente ? 'deixe vazio para manter o atual' : 'cole o token'}
              className="campo focus:campo-foco w-full pr-11 font-normal"
            />
            <button
              type="button"
              onClick={() => setVerToken((v) => !v)}
              title={verToken ? 'Ocultar' : 'Mostrar'}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-controle p-1.5 text-tinta-4 hover:text-marca"
            >
              {verToken ? <IconeOlhoFechado /> : <IconeOlho />}
            </button>
          </span>
        </label>

        <label className="flex flex-col gap-1.5 font-medium">
          Vale para
          <select
            value={empresaId}
            onChange={(e) => setEmpresaId(e.target.value)}
            className="campo focus:campo-foco font-normal"
          >
            <option value="">Todas as clínicas (padrão)</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
          <span className="text-[12.5px] font-normal text-tinta-4">
            {empresaId
              ? 'Só esta clínica vê o recurso; para as outras o botão nem aparece na extensão.'
              : 'Todas as clínicas passam a ver o recurso na extensão.'}
          </span>
        </label>

        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Ativa
        </label>

        <CampoTexto rotulo="Observação" valor={observacao} onChange={setObservacao} placeholder="opcional" />

        {erro && (
          <p className="rounded-controle border border-perigo-borda bg-perigo-fundo px-3 py-2 text-[12.5px] text-perigo">
            {erro}
          </p>
        )}

        <div className="flex justify-end gap-2.5">
          <Botao variante="secundario" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao onClick={salvar} desabilitado={salvando || !chave.trim() || !nome.trim()}>
            Salvar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

/* Ícones de olho — SVG inline para não trazer uma biblioteca só por isso. */
function IconeOlho() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconeOlhoFechado() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.16M6.6 6.6A17.6 17.6 0 0 0 2 11s3.5 7 10 7a9.1 9.1 0 0 0 4-.9" />
      <path d="M14.1 14.1a3 3 0 1 1-4.2-4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
